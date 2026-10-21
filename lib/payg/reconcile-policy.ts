/**
 * Relecture automatique des paiements PAYG (FedaPay), règle pure testée dans
 * tests/payg-model.test.ts. La notification FedaPay et le retour du navigateur règlent
 * d'ordinaire un paiement en quelques secondes ; la relecture quotidienne rattrape ceux dont
 * la notification s'est perdue, et termine un effet interrompu (crédits, tranche, impression).
 */

const MINUTE = 60_000
const HOUR = 60 * MINUTE

/** Laisse au webhook et au retour navigateur le temps d'agir. */
export const RECONCILE_MIN_AGE_MS = 10 * MINUTE
/** Au-delà, une intention en attente n'est plus relue (FedaPay l'a expirée depuis longtemps). */
export const RECONCILE_MAX_AGE_MS = 7 * 24 * HOUR
/** Création interrompue avant la transaction FedaPay : abandon après ce délai. */
export const RECONCILE_ORPHAN_MS = HOUR
/** Paiements confirmés dont l'effet est rejoué (idempotent) pendant ce délai. */
export const RECONCILE_REAPPLY_MS = 48 * HOUR

export type ReconcileAction = 'settle' | 'reapply' | 'orphan' | 'skip'

export interface ReconcileCandidate {
  status: string
  provider_reference: string
  created_at: string
}

export function reconcileAction(intent: ReconcileCandidate, now: number): ReconcileAction {
  const age = now - new Date(intent.created_at).getTime()
  if (!Number.isFinite(age) || age < RECONCILE_MIN_AGE_MS) return 'skip'
  if (intent.status === 'success') return age <= RECONCILE_REAPPLY_MS ? 'reapply' : 'skip'
  if (intent.status !== 'pending' && intent.status !== 'processing') return 'skip'
  if (intent.provider_reference.startsWith('fedapay-pending-')) {
    return age >= RECONCILE_ORPHAN_MS ? 'orphan' : 'skip'
  }
  return age <= RECONCILE_MAX_AGE_MS ? 'settle' : 'skip'
}
