/**
 * Opérateurs Mobile Money proposés à l'acheteur, et leur traduction en « mode »
 * FedaPay. Module partagé (aucun secret, aucune lecture de variable
 * d'environnement) : le front affiche la liste, seul le serveur résout le mode
 * réellement envoyé (resolveFedaPayMode) et lit FEDAPAY_DISABLED_PROVIDERS
 * (lib/payments/fedapay.ts).
 *
 * Paiement TOUJOURS « direct » : l'acheteur ne quitte jamais le site. Création
 * de la transaction → jeton → POST /v1/{mode} avec { token, phone_number:
 * { number, country } } → l'acheteur valide sur son téléphone pendant que notre
 * page interroge NOTRE API.
 *
 * Source des modes : documentation officielle FedaPay, section « Available
 * No-Redirect Payment Methods » de en/payment-methods.mdx
 * (https://docs.fedapay.com/en/payment-methods ; dépôt github.com/fedapay/docs,
 * commit 5e9d2f6 du 25/09/2026), cohérente avec les SDK officiels (url = '/' +
 * mode, Transaction::sendNowWithToken) :
 *   - Bénin : `mtn_open` (MTN — ni `mtn`, ni `mtn_benin`), `moov` (Moov),
 *     `sbin` (Celtiis) ;
 *   - Togo : `moov_tg` (Moov / Flooz), `togocel` (Togocel, devenu « Mixx by
 *     Yas », ex T-Money ; la page FR l'appelle « Mixx By Yas »).
 * ATTENTION : modes confirmés par la documentation, À CONFIRMER PAR UN PREMIER
 * PAIEMENT RÉEL par opérateur. Un opérateur qui pose problème en production se
 * masque sans changer le code (FEDAPAY_DISABLED_PROVIDERS, ci-dessous).
 *
 * Sandbox : `momo_test` est le SEUL mode Mobile Money depuis le 07/11/2025
 * (changelog FedaPay) ; numéros de test 64000001 et 66000001 (paiement
 * accepté), tout autre numéro simule un échec. Garde absolue : momo_test ne
 * part jamais en live, et le live n'envoie jamais un mode de test.
 *
 * FEDAPAY_DISABLED_PROVIDERS (serveur uniquement, facultatif) : opérateurs à
 * masquer, ex. `celtiis_bj,togocel_tg`. Chaque opérateur s'écrit par son id
 * (`togocel_tg`) ou par son mode FedaPay live (`togocel`, `mtn_open`, `moov`,
 * `sbin`, `moov_tg`), séparés par des virgules, espaces ou points-virgules ;
 * casse et guillemets ignorés. Absent ou vide → les cinq opérateurs sont
 * proposés. Une valeur non reconnue ne masque rien : elle est journalisée en
 * erreur et fait échouer npm run security:check. Pour l'appliquer : changer la
 * variable sur Vercel puis « Redeploy » (aucun changement de code). Un
 * opérateur masqué disparaît de GET /api/payments/fedapay/providers et tout
 * achat qui le vise est refusé (400, message qui dit de choisir un autre
 * opérateur).
 */

export type FedaPayEnv = 'sandbox' | 'live'

export const FEDAPAY_PROVIDERS = [
  { id: 'mtn_bj', label: 'MTN Mobile Money', country: 'bj', live: 'mtn_open' },
  { id: 'moov_bj', label: 'Moov Money (Flooz)', country: 'bj', live: 'moov' },
  { id: 'celtiis_bj', label: 'Celtiis Cash', country: 'bj', live: 'sbin' },
  { id: 'moov_tg', label: 'Moov Money (Flooz)', country: 'tg', live: 'moov_tg' },
  { id: 'togocel_tg', label: 'Mixx by Yas (T-Money)', country: 'tg', live: 'togocel' },
] as const

export type FedaPayProviderId = (typeof FEDAPAY_PROVIDERS)[number]['id']
export type FedaPayProvider = (typeof FEDAPAY_PROVIDERS)[number]

export const FEDAPAY_PROVIDER_IDS = FEDAPAY_PROVIDERS.map((p) => p.id) as [
  FedaPayProviderId,
  ...FedaPayProviderId[],
]

/** Méthode de simulation du Sandbox FedaPay. Ne doit JAMAIS partir en live. */
export const SANDBOX_MODE = 'momo_test'

export class FedaPayConfigError extends Error {}

/** Opérateur désigné par son id ou par son mode FedaPay live (`togocel`, `sbin`…). */
function providerOf(token: string): FedaPayProvider | undefined {
  return (
    FEDAPAY_PROVIDERS.find((p) => p.id === token) ?? FEDAPAY_PROVIDERS.find((p) => p.live === token)
  )
}

/**
 * Lit la valeur de FEDAPAY_DISABLED_PROVIDERS (passée par l'appelant serveur :
 * ce module ne lit aucune variable d'environnement). Séparateurs : virgules,
 * espaces, points-virgules ; casse et guillemets ignorés ; un mode live vaut
 * son opérateur. Les valeurs non reconnues sont renvoyées à part, pour être
 * signalées : elles ne masquent rien.
 */
export function parseDisabledProviders(raw: string | null | undefined): {
  disabled: ReadonlySet<FedaPayProviderId>
  unknown: string[]
} {
  const disabled = new Set<FedaPayProviderId>()
  const unknown: string[] = []
  for (const part of String(raw ?? '').split(/[\s,;]+/)) {
    const token = part.replace(/^["'`]+|["'`]+$/g, '').toLowerCase()
    if (!token) continue
    const provider = providerOf(token)
    if (provider) disabled.add(provider.id)
    else unknown.push(token)
  }
  return { disabled, unknown }
}

/** Opérateurs proposés à l'acheteur : tous, sauf ceux masqués. */
export function offeredProviders(
  disabled: ReadonlySet<string> = new Set(),
): readonly FedaPayProvider[] {
  return FEDAPAY_PROVIDERS.filter((p) => !disabled.has(p.id))
}

/**
 * Traduit le choix de l'acheteur en mode FedaPay selon l'environnement.
 * Sandbox → toujours `momo_test` ; live → le vrai mode de l'opérateur.
 * Toute combinaison invalide (opérateur inconnu, autre pays, opérateur masqué)
 * lève une erreur explicite, en français, qui dit quoi faire : jamais de repli
 * muet sur un autre opérateur.
 */
export function resolveFedaPayMode(input: {
  environment: FedaPayEnv
  selectedProvider: string
  country: 'tg' | 'bj'
  /** Opérateurs masqués (FEDAPAY_DISABLED_PROVIDERS, lu côté serveur). */
  disabled?: ReadonlySet<string>
}): string {
  const provider = FEDAPAY_PROVIDERS.find((p) => p.id === input.selectedProvider)
  if (!provider)
    throw new FedaPayConfigError(
      `Opérateur inconnu : ${input.selectedProvider}. Choisissez votre opérateur Mobile Money dans la liste.`,
    )
  if (provider.country !== input.country)
    throw new FedaPayConfigError(
      `${provider.label} n'est pas disponible pour ce pays : choisissez un opérateur du pays de votre numéro.`,
    )
  if (input.disabled?.has(provider.id))
    throw new FedaPayConfigError(
      `${provider.label} est momentanément indisponible : choisissez un autre opérateur.`,
    )
  if (input.environment === 'sandbox') return SANDBOX_MODE
  // Garde absolue : le mode de simulation ne part jamais en production.
  const mode: string = provider.live
  if (!mode || mode === SANDBOX_MODE) throw new FedaPayConfigError('momo_test interdit en live')
  return mode
}
