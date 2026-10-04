/**
 * Opérateurs Mobile Money proposés à l'acheteur, et leur traduction en « mode »
 * FedaPay. Module partagé (aucun secret) : le front affiche la liste, seul le
 * serveur résout le mode réellement envoyé (resolveFedaPayMode).
 *
 * Modes vérifiés dans les SDK/documentation FedaPay (POST /v1/{mode}, cf.
 * fedapay-php Transaction::sendNowWithToken) :
 *   - `mtn`      MTN Mobile Money Bénin
 *   - `moov`     Moov Money (Flooz) Bénin
 *   - `moov_tg`  Moov Money (Flooz) Togo
 *   - `momo_test` moyen de simulation du Sandbox (seul proposé en Sandbox)
 * Celtiis et Togocel (T-Money) : aucun identifiant de mode confirmé par une
 * source officielle → `live: null`, refusés en production tant que non vérifiés.
 */

export type FedaPayEnv = 'sandbox' | 'live'

export const FEDAPAY_PROVIDERS = [
  { id: 'mtn_bj', label: 'MTN Mobile Money', country: 'bj', live: 'mtn' },
  { id: 'moov_bj', label: 'Moov Money (Flooz)', country: 'bj', live: 'moov' },
  { id: 'celtiis_bj', label: 'Celtiis Cash', country: 'bj', live: null },
  { id: 'moov_tg', label: 'Moov Money (Flooz)', country: 'tg', live: 'moov_tg' },
  { id: 'togocel_tg', label: 'T-Money (Togocel)', country: 'tg', live: null },
] as const

export type FedaPayProviderId = (typeof FEDAPAY_PROVIDERS)[number]['id']

export const FEDAPAY_PROVIDER_IDS = FEDAPAY_PROVIDERS.map((p) => p.id) as [
  FedaPayProviderId,
  ...FedaPayProviderId[],
]

/** Méthode de simulation du Sandbox FedaPay. Ne doit JAMAIS partir en live. */
export const SANDBOX_MODE = 'momo_test'

export class FedaPayConfigError extends Error {}

/**
 * Traduit le choix de l'acheteur en mode FedaPay selon l'environnement.
 * Sandbox → toujours `momo_test` ; live → le vrai mode de l'opérateur.
 * Toute combinaison invalide lève une erreur explicite (jamais de repli muet).
 */
export function resolveFedaPayMode(input: {
  environment: FedaPayEnv
  selectedProvider: string
  country: 'tg' | 'bj'
}): string {
  const provider = FEDAPAY_PROVIDERS.find((p) => p.id === input.selectedProvider)
  if (!provider) throw new FedaPayConfigError(`Opérateur inconnu : ${input.selectedProvider}`)
  if (provider.country !== input.country)
    throw new FedaPayConfigError(`${provider.label} n'est pas disponible pour ce pays`)
  if (input.environment === 'sandbox') return SANDBOX_MODE
  if (!provider.live)
    throw new FedaPayConfigError(`${provider.label} n'est pas encore disponible en paiement direct`)
  // Garde absolue : le mode de simulation ne part jamais en production.
  const mode: string = provider.live
  if (mode === SANDBOX_MODE) throw new FedaPayConfigError('momo_test interdit en live')
  return mode
}
