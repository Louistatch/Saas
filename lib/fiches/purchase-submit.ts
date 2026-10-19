/**
 * Envoi du formulaire « Payer » de la fenêtre d'achat
 * (components/marketplace/fiche-access-dialog.tsx). Fonctions PURES,
 * partagées avec les tests.
 *
 * Paiement TOUJOURS direct : la demande part sur le téléphone de l'acheteur,
 * qui reste sur le site. Aucun lien, onglet ni cadre FedaPay n'est affiché.
 */

/**
 * Verrou d'envoi, par fiche. Pris de façon SYNCHRONE avant le premier
 * `await` : un double clic, un double appui ou Entrée répétée arrivent avant
 * que l'état React ne désactive le bouton — une seule requête part. Libéré
 * dans le `finally`, donc aussi après une erreur. Par fiche : la requête
 * encore en vol d'une fiche ne bloque pas l'achat d'une autre.
 */
export interface SubmitLock {
  /** true si le verrou de cette fiche était libre (et il est maintenant pris). */
  tryAcquire(key: string): boolean
  release(key: string): void
  isHeld(key: string): boolean
}

export function createSubmitLock(): SubmitLock {
  const held = new Set<string>()
  return {
    tryAcquire(key) {
      if (held.has(key)) return false
      held.add(key)
      return true
    },
    release(key) {
      held.delete(key)
    },
    isHeld(key) {
      return held.has(key)
    },
  }
}

/**
 * La réponse d'un achat ne s'affiche que dans la fenêtre de SA fiche, encore
 * ouverte. Une seule fenêtre sert toutes les fiches de la vitrine : une
 * réponse arrivée après la fermeture, ou alors qu'une autre fiche est
 * ouverte, ne doit pas remplacer l'écran (l'achat reste gardé sur l'appareil).
 */
export function replyStillShown(
  dialog: { open: boolean; ficheId: string | null | undefined },
  forFicheId: string,
): boolean {
  return dialog.open && dialog.ficheId === forFicheId
}

// ── Opérateurs (GET /api/payments/fedapay/providers) ─────────────────────────

export type BuyerCountry = 'tg' | 'bj'

/** Opérateur proposé à l'acheteur : toujours en paiement direct. */
export interface ProviderOption {
  id: string
  label: string
  country: BuyerCountry
}

export type ProvidersState =
  | { kind: 'loading' }
  | { kind: 'ready'; environment: 'sandbox' | 'live'; providers: ProviderOption[] }
  /** FedaPay mal configuré ou tous les opérateurs masqués : pas de formulaire. */
  | { kind: 'unavailable'; message: string }
  /** Lecture impossible (réseau, erreur passagère) : on propose de réessayer. */
  | { kind: 'error' }

export const PROVIDERS_UNAVAILABLE = 'Le paiement Mobile Money est momentanément indisponible.'

/**
 * Réponse de GET /api/payments/fedapay/providers → état du formulaire. Seuls
 * les opérateurs en mode `direct` sont gardés : un opérateur qui demanderait
 * une page FedaPay n'est jamais proposé. Jamais de liste de secours : un
 * opérateur masqué côté serveur ne doit pas réapparaître.
 */
export function providersFromReply(status: number, json: unknown): ProvidersState {
  const body = (json && typeof json === 'object' ? json : {}) as {
    environment?: unknown
    configured?: unknown
    providers?: unknown
    error?: unknown
  }
  const list = (Array.isArray(body.providers) ? body.providers : []).flatMap(
    (p: unknown): ProviderOption[] => {
      const o = (p ?? {}) as Record<string, unknown>
      if (o.mode !== 'direct') return []
      if (typeof o.id !== 'string' || !o.id || typeof o.label !== 'string' || !o.label) return []
      if (o.country !== 'tg' && o.country !== 'bj') return []
      return [{ id: o.id, label: o.label, country: o.country }]
    },
  )
  const message = typeof body.error === 'string' && body.error ? body.error : PROVIDERS_UNAVAILABLE
  if (status === 503) return { kind: 'unavailable', message }
  if (status < 200 || status >= 300) return { kind: 'error' }
  // FedaPay sans clé : jamais de formulaire, même si une liste accompagne la réponse.
  if (body.configured === false || list.length === 0) return { kind: 'unavailable', message }
  return {
    kind: 'ready',
    environment: body.environment === 'sandbox' ? 'sandbox' : 'live',
    providers: list,
  }
}

export function providersOf(list: readonly ProviderOption[], country: BuyerCountry) {
  return list.filter((p) => p.country === country)
}

/**
 * Opérateur gardé s'il existe dans ce pays ; sinon le seul opérateur du pays
 * s'il n'y en a qu'un ; sinon '' — l'acheteur choisit lui-même (« Payer »
 * reste inactif). Jamais de présélection parmi plusieurs : un numéro Mixx by
 * Yas envoyé en Moov Money par défaut finirait en refus.
 */
export function pickProvider(
  list: readonly ProviderOption[],
  country: BuyerCountry,
  current: string,
): string {
  const ofCountry = providersOf(list, country)
  if (ofCountry.some((p) => p.id === current)) return current
  return ofCountry.length === 1 ? (ofCountry[0] as ProviderOption).id : ''
}

/**
 * Exemple de numéro affiché dans le champ, avec un préfixe de l'opérateur
 * choisi (ex. 96 pour Moov Togo, 90 pour Mixx by Yas ; au Bénin, 10 chiffres
 * commençant par 01). Sans opérateur choisi, ou sans exemple sûr : un format
 * neutre, qui ne suggère aucun opérateur.
 */
export function phoneSample(country: BuyerCountry, provider: string): string {
  const samples: Record<string, string> = {
    moov_tg: '96 00 00 00',
    togocel_tg: '90 00 00 00',
    mtn_bj: '01 97 00 00 00',
    moov_bj: '01 95 00 00 00',
  }
  return samples[provider] ?? (country === 'bj' ? '01 00 00 00 00' : '00 00 00 00')
}

/**
 * Numéros du Sandbox FedaPay qui acceptent le paiement (tout autre numéro
 * simule un refus). Numéros du BÉNIN : la documentation FedaPay les donne
 * toujours avec le pays « bj ».
 */
export const SANDBOX_TEST_NUMBERS = ['64000001', '66000001'] as const
export const SANDBOX_TEST_COUNTRY: BuyerCountry = 'bj'

/**
 * Numéro de test choisi dans la note « Mode test » : pays Bénin, et un
 * opérateur du Bénin (celui choisi, sinon le premier — en Sandbox, tous
 * partent en momo_test).
 */
export function sandboxTestBuyer<
  B extends { phone: string; country: BuyerCountry; provider: string },
>(buyer: B, list: readonly ProviderOption[], number: string): B {
  const provider =
    pickProvider(list, SANDBOX_TEST_COUNTRY, buyer.provider) ||
    (providersOf(list, SANDBOX_TEST_COUNTRY)[0]?.id ?? '')
  return { ...buyer, phone: number, country: SANDBOX_TEST_COUNTRY, provider }
}

// ── Réponse de POST /api/fiches/[id]/purchase ───────────────────────────────

export type PurchaseTrackingMode = 'direct' | 'resumed'

/** Paiement repris (déjà lancé dans cette fenêtre ou un autre onglet). */
export const RESUMED_NOTE =
  'Ce paiement est déjà en cours : validez-le sur votre téléphone. Aucune nouvelle demande n’a été envoyée.'

/** Écran d'attente d'après une réponse réussie de POST /api/fiches/[id]/purchase. */
export function trackingFromReply(json: { resumed?: unknown }): {
  mode: PurchaseTrackingMode
  note: string | null
} {
  if (json.resumed) return { mode: 'resumed', note: RESUMED_NOTE }
  return { mode: 'direct', note: null }
}

export interface BuyError {
  text: string
  /** Champ à signaler (aria-invalid). */
  field: 'phone' | 'provider' | null
  /** L'opérateur n'a pas pu lancer la demande : proposer un autre opérateur. */
  tryOther: boolean
}

/** Erreur d'achat (réponse non 2xx, sans achat à suivre) → message et consigne. */
export function buyErrorOf(status: number, json: unknown): BuyError {
  const body = (json && typeof json === 'object' ? json : {}) as {
    error?: unknown
    details?: Record<string, unknown>
  }
  const first = (key: string): string | null => {
    const v = body.details?.[key]
    return Array.isArray(v) && typeof v[0] === 'string' ? v[0] : null
  }
  const phone = first('phone')
  if (phone) return { text: phone, field: 'phone', tryOther: false }
  const provider = first('provider')
  if (provider) return { text: provider, field: 'provider', tryOther: true }
  const error = typeof body.error === 'string' && body.error ? body.error : null
  if (status === 502)
    return {
      text: error ?? 'L’opérateur n’a pas pu lancer le paiement. Vérifiez le numéro et réessayez.',
      field: null,
      tryOther: true,
    }
  return {
    text: error ?? 'Paiement indisponible pour le moment. Réessayez dans quelques minutes.',
    field: null,
    tryOther: false,
  }
}
