/**
 * Suivi d'un paiement de compte d'exploitation, côté navigateur : rythme des
 * interrogations, états affichés, lien à garder et contact. Fonctions pures,
 * sans accès réseau ni stockage : la fenêtre d'achat, la page d'achat et les
 * tests partagent les mêmes règles.
 *
 * L'état vient TOUJOURS du serveur (GET /api/purchases/[id], qui relit
 * FedaPay), jamais des paramètres d'URL. L'acheteur ne quitte jamais le site :
 * il valide sur son téléphone pendant que la page interroge NOTRE API.
 */

import { normalizeMobileMoneyPhone } from './phone'
import { formatFcfa } from './types'

/** Intervalle normal entre deux interrogations. */
export const POLL_BASE_MS = 4_000
/** Après une réponse 429 : 8 s, puis 15 s tant que le serveur limite. */
export const POLL_BACKOFF_MS = [8_000, 15_000] as const
/** Au-delà, le suivi s'arrête et l'acheteur garde la main (« Vérifier à nouveau »). */
export const POLL_WINDOW_MS = 5 * 60_000

export type PurchaseStatus = 'pending' | 'completed' | 'failed' | 'refunded'
/**
 * États affichés : ceux du serveur (`state` de GET /api/purchases/[id], dont
 * « expired » : demande restée sans réponse), plus « timeout » (suivi arrêté,
 * achat toujours en attente).
 */
export type PayState = PurchaseStatus | 'expired' | 'timeout'

/** Statut serveur → état affiché. Un statut inconnu reste « en attente » (jamais un faux succès). */
export function payStateOf(status: unknown, accessGranted?: unknown): PurchaseStatus {
  switch (status) {
    case 'completed':
      // Réglé mais sans accès : ne débloque rien, on attend la relecture.
      return accessGranted === false ? 'pending' : 'completed'
    case 'failed':
      return 'failed'
    case 'refunded':
      return 'refunded'
    default:
      return 'pending'
  }
}

/**
 * État affiché d'après la réponse de GET /api/purchases/[id] : le champ
 * `state` du serveur d'abord (il distingue « expired » de « failed »), sinon
 * le statut brut. Inconnu → « en attente », jamais un faux succès.
 */
export function payStateOfReply(json: {
  state?: unknown
  status?: unknown
  access_granted?: unknown
}): Exclude<PayState, 'timeout'> {
  if (json.state === 'expired') return 'expired'
  if (
    typeof json.state === 'string' &&
    ['pending', 'completed', 'failed', 'refunded'].includes(json.state)
  )
    return payStateOf(json.state, json.access_granted)
  return payStateOf(json.status, json.access_granted)
}

/** Délai avant la prochaine interrogation, selon le nombre de 429 consécutifs. */
export function nextPollDelay(consecutive429: number): number {
  if (consecutive429 <= 0) return POLL_BASE_MS
  return POLL_BACKOFF_MS[Math.min(consecutive429, POLL_BACKOFF_MS.length) - 1] ?? POLL_BASE_MS
}

export function pollExpired(startedAt: number, now: number = Date.now()): boolean {
  return now - startedAt >= POLL_WINDOW_MS
}

/**
 * Après un refus ou une expiration, FedaPay peut encore approuver la
 * transaction (« declined » et « canceled » ne sont pas définitifs) : l'achat
 * est encore relu en arrière-plan pendant LATE_WATCH_MS, toutes les
 * LATE_POLL_MS, et l'écran passe au succès si le paiement arrive.
 */
export const LATE_WATCH_MS = 10 * 60_000
export const LATE_POLL_MS = 15_000

export function lateWatchActive(since: number, now: number = Date.now()): boolean {
  return now - since >= 0 && now - since < LATE_WATCH_MS
}

/**
 * Numéro masqué pour l'écran d'attente : l'acheteur reconnaît son numéro sans
 * qu'il s'affiche en entier (« +228 90 •• •• 56 », « +229 01 97 •• •• 01 »).
 */
export function maskMobileMoneyPhone(country: 'tg' | 'bj', raw: string): string {
  const prefix = country === 'bj' ? '+229' : '+228'
  const national = normalizeMobileMoneyPhone(country, raw)
  if (!national) return `${prefix} ••••`
  const groups = national.match(/\d{2}/g) ?? [national]
  const keepStart = national.length === 10 ? 2 : 1
  const masked = groups.map((g, i) => (i < keepStart || i === groups.length - 1 ? g : '••'))
  return `${prefix} ${masked.join(' ')}`
}

/**
 * Montant et frais, d'après GET /api/purchases/[id] : `amount_debited` et
 * `fees` relus chez FedaPay (null tant qu'ils ne sont pas connus).
 */
export function feeNote(p: {
  amount: number
  amount_debited?: number | null
  fees?: number | null
}): string {
  const debited = p.amount_debited
  if (typeof debited === 'number' && Number.isFinite(debited) && debited >= p.amount) {
    const fees =
      typeof p.fees === 'number' && Number.isFinite(p.fees) && p.fees > 0
        ? p.fees
        : debited - p.amount
    return fees > 0
      ? `Montant débité : ${formatFcfa(debited)}, dont ${formatFcfa(fees)} de frais d’opérateur.`
      : `Montant débité : ${formatFcfa(debited)}, sans frais d’opérateur.`
  }
  return 'Des frais d’opérateur peuvent s’ajouter.'
}

/** Lien à garder : la page de l'achat, qui revérifie et rouvre le téléchargement. */
export function purchasePath(purchaseId: string): string {
  return `/marketplace/achat/${purchaseId}`
}

export function purchaseUrl(origin: string, purchaseId: string): string {
  return `${origin.replace(/\/$/, '')}${purchasePath(purchaseId)}`
}

/**
 * « Réessayer » / « Recevoir une nouvelle demande » depuis la page d'un achat :
 * la vitrine ouvre la fiche sur le FORMULAIRE (numéro et opérateur
 * modifiables), sans reprendre le paiement en cours gardé sur l'appareil.
 */
export function newPurchaseHref(ficheId: string): string {
  return `/marketplace?fiche=${encodeURIComponent(ficheId)}&nouvel_achat=1`
}

export const KEEP_LINK_TEXT = 'Gardez ce lien pour retélécharger votre compte d’exploitation'

/** Partage WhatsApp (wa.me) : l'acheteur s'envoie le lien à lui-même. */
export function whatsappShareUrl(title: string, url: string): string {
  const text = `${KEEP_LINK_TEXT} « ${title} » : ${url}`
  return `https://wa.me/?text=${encodeURIComponent(text)}`
}

/** Contact FaîtiereHub (mêmes coordonnées que la page Contact). */
export const SUPPORT_CONTACT = {
  email: 'support@faitierehub.com',
  phone: '+228 92 54 88 38',
  whatsapp: '22892548838',
} as const

/**
 * Référence à donner au support : celle de FedaPay quand on la connaît (elle
 * figure sur le reçu), sinon le début de l'id d'achat.
 */
export function purchaseReference(p: { id: string; reference?: string | null }): string {
  const ref = String(p.reference ?? '').trim()
  return ref || p.id.slice(0, 8).toUpperCase()
}

export function supportWhatsappUrl(reference: string, title?: string): string {
  const text = `Bonjour, j’ai un souci avec mon achat${title ? ` « ${title} »` : ''} (référence ${reference}).`
  return `https://wa.me/${SUPPORT_CONTACT.whatsapp}?text=${encodeURIComponent(text)}`
}

/** Achat impossible en ligne (aucun opérateur) : l'acheteur écrit au support. */
export function supportBuyWhatsappUrl(title: string): string {
  const text = `Bonjour, je souhaite acheter le compte d’exploitation « ${title} ».`
  return `https://wa.me/${SUPPORT_CONTACT.whatsapp}?text=${encodeURIComponent(text)}`
}
