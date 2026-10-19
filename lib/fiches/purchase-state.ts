/**
 * Décision de règlement d'un achat de compte d'exploitation, d'après la
 * transaction FedaPay relue côté serveur. Fonctions PURES (ni base, ni réseau,
 * ni `server-only`) : settlePurchase, le cron de rapprochement, l'API d'état et
 * les tests partagent exactement les mêmes règles.
 *
 * Statuts FedaPay (lib/payments/fedapay.ts, FedaTransaction) :
 *   - `approved` : paiement accepté ;
 *   - `transferred` : paiement accepté PUIS reversé au marchand — c'est l'état
 *     final normal d'un paiement réussi, il vaut donc « payé » ;
 *   - `declined` / `canceled` / `expired` : échec ;
 *   - `refunded` : remboursé, y compris APRÈS un paiement réglé ;
 *   - `pending` : rien à faire tant que l'acheteur n'a pas validé.
 *
 * `declined` et `canceled` ne sont PAS définitifs chez FedaPay (documentation,
 * en/integration-api/collects-management.mdx : « The canceled and declined
 * statuses are not final statuses ») : une transaction peut être approuvée
 * APRÈS que l'achat a été marqué en échec. Ce paiement tardif est réglé
 * (failed → completed), une seule fois, si la transaction correspond bien à
 * l'achat (montant, devise, fiche) — sinon l'acheteur serait débité sans
 * recevoir ses fichiers.
 */

/** Statuts FedaPay qui valent paiement encaissé. */
export const PAID_TX_STATUSES: readonly string[] = ['approved', 'transferred']
/** Statuts FedaPay qui valent échec d'un achat en attente (pas forcément définitif). */
export const FAILED_TX_STATUSES: readonly string[] = [
  'declined',
  'canceled',
  'cancelled',
  'expired',
]

export interface SettleTx {
  status: string
  amount: number
  currencyIso: string | null
  /** custom_metadata relu chez FedaPay ({ purchase_id, fiche_id } pour nos transactions). */
  customMetadata?: Record<string, unknown> | null
}

export interface SettlePurchaseInput {
  amount: number
  payment_status: string
  id?: string
  fiche_id?: string
  /** Requis pour rouvrir un achat en échec : sans transaction, rien à relire. */
  provider_transaction_id?: string | null
}

export interface PurchaseUpdate {
  payment_status: 'completed' | 'failed' | 'refunded'
  access_granted?: boolean
  paid_at?: string
}

export type PurchaseTransition =
  /** Rien à écrire (déjà dans l'état voulu, ou transaction encore en attente). */
  | { action: 'none' }
  /** Statut FedaPay inattendu pour cet achat : à journaliser, sans rien écrire. */
  | { action: 'warn'; reason: string }
  /**
   * Écriture à faire, gardée par `.eq('payment_status', from)` : seul le
   * premier appel gagne la transition, les suivants ne modifient rien.
   */
  | {
      action: 'update'
      from: 'pending' | 'completed' | 'failed'
      next: PurchaseUpdate
      event: 'paid' | 'late_paid' | 'failed' | 'refunded' | 'mismatch'
    }

/**
 * La transaction correspond-elle à l'achat ? Montant et devise relus chez
 * FedaPay (jamais ceux du client) ; fiche et achat d'après le custom_metadata
 * que nous avons envoyé à la création. Une transaction plus ancienne, sans
 * custom_metadata (achats créés avant son ajout, page FedaPay), est rattachée
 * par son id seul (index unique purchases_provider_tx_uidx).
 */
export function txMatchesPurchase(tx: SettleTx, purchase: SettlePurchaseInput): boolean {
  const amountOk = Number.isFinite(tx.amount) && tx.amount >= purchase.amount
  const currencyOk = !tx.currencyIso || tx.currencyIso === 'XOF'
  const meta = tx.customMetadata
  const same = (key: 'purchase_id' | 'fiche_id', expected: string | undefined) =>
    meta?.[key] == null || expected === undefined || String(meta[key]) === expected
  return (
    amountOk &&
    currencyOk &&
    same('purchase_id', purchase.id) &&
    same('fiche_id', purchase.fiche_id)
  )
}

const paidUpdate = (now: Date): PurchaseUpdate => ({
  payment_status: 'completed',
  access_granted: true,
  paid_at: now.toISOString(),
})

export function decidePurchaseTransition(
  tx: SettleTx,
  purchase: SettlePurchaseInput,
  now: Date = new Date(),
): PurchaseTransition {
  const status = String(tx.status ?? '').toLowerCase()

  if (purchase.payment_status === 'pending') {
    if (PAID_TX_STATUSES.includes(status)) {
      if (!txMatchesPurchase(tx, purchase))
        return {
          action: 'update',
          from: 'pending',
          next: { payment_status: 'failed' },
          event: 'mismatch',
        }
      return { action: 'update', from: 'pending', next: paidUpdate(now), event: 'paid' }
    }
    if (FAILED_TX_STATUSES.includes(status))
      return {
        action: 'update',
        from: 'pending',
        next: { payment_status: 'failed' },
        event: 'failed',
      }
    if (status === 'refunded')
      return {
        action: 'update',
        from: 'pending',
        next: { payment_status: 'refunded', access_granted: false },
        event: 'refunded',
      }
    if (status === 'pending') return { action: 'none' }
    return { action: 'warn', reason: `Statut FedaPay inconnu : « ${status || '(vide)'} »` }
  }

  if (purchase.payment_status === 'completed') {
    // Remboursement après un paiement réglé : l'accès est retiré.
    if (status === 'refunded')
      return {
        action: 'update',
        from: 'completed',
        next: { payment_status: 'refunded', access_granted: false },
        event: 'refunded',
      }
    if (PAID_TX_STATUSES.includes(status)) return { action: 'none' }
    return {
      action: 'warn',
      reason: `Achat réglé mais transaction FedaPay « ${status || '(vide)'} »`,
    }
  }

  if (purchase.payment_status === 'failed') {
    // Paiement tardif : seul approved/transferred rouvre l'achat (jamais
    // refunded, jamais un achat sans transaction), et seulement si la
    // transaction correspond à l'achat.
    if (!purchase.provider_transaction_id || !PAID_TX_STATUSES.includes(status))
      return { action: 'none' }
    if (!txMatchesPurchase(tx, purchase))
      return {
        action: 'warn',
        reason: `Paiement FedaPay « ${status} » après échec, mais montant, devise ou fiche différents : achat laissé en échec`,
      }
    return { action: 'update', from: 'failed', next: paidUpdate(now), event: 'late_paid' }
  }

  // refunded : état terminal, jamais rouvert automatiquement.
  return { action: 'none' }
}

// ── État présenté à l'acheteur (GET /api/purchases/[id]) ─────────────────────

/** État affiché par l'écran d'attente : un seul parmi ces cinq. */
export type PurchaseState = 'pending' | 'completed' | 'failed' | 'expired' | 'refunded'

/**
 * État lisible d'un achat. `txStatus` : statut FedaPay relu par CETTE requête
 * (null si FedaPay n'a pas été relu). « expired » : FedaPay a expiré la
 * demande, ou elle est restée sans réponse jusqu'à l'abandon par le cron
 * (achat en échec, transaction encore « pending »). Statut inconnu → « pending »
 * (jamais un faux succès) ; réglé sans accès → « pending » aussi.
 */
export function purchaseStateOf(
  row: { payment_status: string; access_granted: boolean | null },
  txStatus: string | null,
): PurchaseState {
  const tx = String(txStatus ?? '').toLowerCase()
  switch (row.payment_status) {
    case 'completed':
      return row.access_granted === false ? 'pending' : 'completed'
    case 'refunded':
      return 'refunded'
    case 'failed':
      return tx === 'expired' || tx === 'pending' ? 'expired' : 'failed'
    default:
      return 'pending'
  }
}

/**
 * Un nouveau paiement peut-il être lancé pour cette fiche ? Oui après un échec
 * ou une expiration ; pour un achat en attente, seulement quand la route
 * d'achat l'accepterait (plus de `lockMs` : PENDING_LOCK_MS de
 * lib/fiches/pending-claim.ts). Jamais pour un achat réglé ou remboursé.
 */
export function canRetryPurchase(
  state: PurchaseState,
  createdAt: string | null,
  lockMs: number,
  now: number = Date.now(),
): boolean {
  if (state === 'failed' || state === 'expired') return true
  if (state !== 'pending') return false
  const created = Date.parse(String(createdAt ?? ''))
  return Number.isFinite(created) && now - created >= lockMs
}

/**
 * Bouton « Revérifier » de l'administration : un achat qui a une transaction
 * FedaPay et n'est pas réglé — en attente, ou en échec (FedaPay peut approuver
 * APRÈS un refus : l'acheteur a pu être débité sans recevoir ses fichiers).
 * Sans transaction, il n'y a rien à relire chez FedaPay.
 */
export function canReverifyPurchase(p: {
  payment_status: string
  provider_transaction_id: string | null
}): boolean {
  return (
    Boolean(p.provider_transaction_id) &&
    (p.payment_status === 'pending' || p.payment_status === 'failed')
  )
}
