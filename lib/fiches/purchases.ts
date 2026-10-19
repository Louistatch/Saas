import 'server-only'
import { deliverEmail, emailSuperAdmins, renderEmail } from '@/lib/email/resend'
import { decidePurchaseTransition } from '@/lib/fiches/purchase-state'
import { type FedaTransaction, getTransaction } from '@/lib/payments/fedapay'
import { createClient as createAdminClient } from '@/lib/supabase/admin'
import { createLogger } from '@/lib/utils/logger'
import { after } from 'next/server'

const log = createLogger('fiches:purchases')

export interface PurchaseRow {
  id: string
  fiche_id: string
  amount: number
  currency: string
  payment_status: string
  access_granted: boolean
  provider: string | null
  provider_transaction_id: string | null
  paid_at: string | null
}

const COLS =
  'id, fiche_id, amount, currency, payment_status, access_granted, provider, provider_transaction_id, paid_at'

export interface SettleOutcome {
  purchase: PurchaseRow | null
  /** Statut relu chez FedaPay ; null si la transaction n'a pas été relue. */
  txStatus: string | null
  /** Transaction relue par CET appel (montant débité, frais, motif d'échec), sinon null. */
  tx: FedaTransaction | null
  /** Transition réellement écrite par CET appel (garde gagnée), sinon null. */
  changed: { from: string; to: string } | null
}

/** Statuts d'achat relus chez FedaPay (failed : paiement tardif possible). */
const SETTLEABLE = ['pending', 'completed', 'failed']
/** Garde perdue → relecture de la ligne et nouvelle décision, au plus ce nombre de fois. */
const MAX_ATTEMPTS = 3

/**
 * Règle un achat d'après FedaPay. Idempotent : appelé par le retour navigateur,
 * le webhook, la page d'achat, le cron de rapprochement et la revérification
 * admin. La décision vient de decidePurchaseTransition (fonction pure) ;
 * chaque écriture est gardée par `.eq('payment_status', from)`, si bien que
 * seul le premier appel gagne une transition (pending → completed/failed/
 * refunded, completed → refunded en cas de remboursement après paiement, ou
 * failed → completed pour un paiement approuvé APRÈS un refus).
 *
 * Garde perdue (un autre appel vient d'écrire) : on relit la ligne et on
 * redécide avec la MÊME transaction. Ainsi, si un appel écrit « failed »
 * d'après un ancien « declined » pendant qu'un autre relit « approved », le
 * second règle quand même l'achat, sans attendre le passage suivant.
 */
export async function settlePurchaseDetailed(purchaseId: string): Promise<SettleOutcome> {
  const sb = createAdminClient()
  const { data: first } = await sb
    .from('purchases')
    .select(COLS)
    .eq('id', purchaseId)
    .maybeSingle<PurchaseRow>()
  if (!first) return { purchase: null, txStatus: null, tx: null, changed: null }
  if (
    !SETTLEABLE.includes(first.payment_status) ||
    first.provider !== 'fedapay' ||
    !first.provider_transaction_id
  )
    return { purchase: first, txStatus: null, tx: null, changed: null }

  let tx: FedaTransaction
  try {
    tx = await getTransaction(first.provider_transaction_id)
  } catch (e) {
    log.warn('FedaPay lookup failed', { purchaseId, error: (e as Error).message })
    return { purchase: first, txStatus: null, tx: null, changed: null }
  }

  let p = first
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const decision = decidePurchaseTransition(tx, p)
    if (decision.action === 'warn') {
      log.warn('FedaPay status not handled', {
        purchaseId,
        purchaseStatus: p.payment_status,
        reason: decision.reason,
      })
      return { purchase: p, txStatus: tx.status, tx, changed: null }
    }
    if (decision.action === 'none') return { purchase: p, txStatus: tx.status, tx, changed: null }

    if (decision.event === 'mismatch')
      log.error('FedaPay amount/currency/fiche mismatch', {
        purchaseId,
        txAmount: tx.amount,
        txCurrency: tx.currencyIso,
        expected: p.amount,
      })

    const { data: updated } = await sb
      .from('purchases')
      .update({ ...decision.next, updated_at: new Date().toISOString() })
      .eq('id', p.id)
      .eq('payment_status', decision.from)
      .select(COLS)
      .maybeSingle<PurchaseRow>()

    if (updated) {
      if (decision.event === 'refunded' && decision.from === 'completed')
        log.warn('Purchase refunded after payment: access revoked', { purchaseId })
      if (decision.event === 'late_paid')
        log.warn('Late FedaPay approval: failed purchase settled', {
          purchaseId,
          txStatus: tx.status,
        })

      // Reçu et alerte : uniquement pour l'appel qui a gagné la transition
      // vers « completed » (depuis pending, ou failed pour un paiement
      // tardif). Une ligne réglée ne repasse jamais par pending ni failed :
      // jamais deux reçus.
      if (updated.payment_status === 'completed')
        after(() => notifySale(updated, { late: decision.from === 'failed' }))

      return {
        purchase: updated,
        txStatus: tx.status,
        tx,
        changed: { from: decision.from, to: updated.payment_status },
      }
    }

    // Garde perdue : un autre appel vient d'écrire. On relit l'état réel.
    const { data: fresh } = await sb
      .from('purchases')
      .select(COLS)
      .eq('id', p.id)
      .maybeSingle<PurchaseRow>()
    if (!fresh) return { purchase: p, txStatus: tx.status, tx, changed: null }
    p = fresh
  }
  return { purchase: p, txStatus: tx.status, tx, changed: null }
}

/** Compatibilité : même règlement, sans le détail. */
export async function settlePurchase(purchaseId: string): Promise<PurchaseRow | null> {
  return (await settlePurchaseDetailed(purchaseId)).purchase
}

const fcfa = (n: number) => `${Number(n ?? 0).toLocaleString('fr-FR')} FCFA`

/**
 * Reçu à l'acheteur + alerte aux super_admin. Jamais bloquant ; un échec
 * d'envoi du reçu est JOURNALISÉ (deliverEmail renvoie le résultat, là où
 * emailAddress l'avalerait). `late` : paiement approuvé par FedaPay après que
 * l'achat a été marqué en échec — l'alerte le signale, car l'acheteur a pu
 * relancer et payer deux fois (remboursement à vérifier).
 */
export async function notifySale(p: PurchaseRow, opts: { late?: boolean } = {}): Promise<void> {
  try {
    const sb = createAdminClient()
    const [{ data: buyer }, { data: fiche }] = await Promise.all([
      sb
        .from('purchases')
        .select('buyer_email, buyer_name')
        .eq('id', p.id)
        .maybeSingle<{ buyer_email: string | null; buyer_name: string | null }>(),
      sb
        .from('fiches_techniques')
        .select('title, cooperative_id')
        .eq('id', p.fiche_id)
        .maybeSingle<{ title: string; cooperative_id: string | null }>(),
    ])
    let seller = 'FaîtiereHub'
    if (fiche?.cooperative_id) {
      const { data: coop } = await sb
        .from('cooperatives')
        .select('name')
        .eq('id', fiche.cooperative_id)
        .maybeSingle<{ name: string | null }>()
      seller = coop?.name || 'Faîtière'
    }
    const title = fiche?.title ?? 'Compte d’exploitation'
    const date = new Date(p.paid_at ?? Date.now()).toLocaleString('fr-FR', {
      dateStyle: 'long',
      timeStyle: 'short',
      timeZone: 'Africa/Lome',
    })
    const ref = p.provider_transaction_id ?? '—'
    const amount = fcfa(p.amount)

    const buyerName = buyer?.buyer_name?.trim() ?? ''
    const to = buyer?.buyer_email?.trim() ?? ''
    if (to.includes('@') && !to.endsWith('.internal')) {
      const result = await deliverEmail(
        to,
        'Reçu — compte d’exploitation FaîtiereHub',
        renderEmail({
          title: 'Paiement confirmé',
          lines: [
            buyerName ? `Bonjour ${buyerName},` : 'Bonjour,',
            `Nous confirmons la réception de votre paiement de ${amount}.`,
            `Achat : compte d’exploitation « ${title} »`,
            `Vendu par : ${seller}`,
            `Date : ${date}`,
            `Référence FedaPay : ${ref}`,
            'Gardez cet e-mail : le bouton ci-dessous rouvre vos fichiers à tout moment, sur n’importe quel appareil.',
            'Merci pour votre confiance.',
          ],
          cta: { label: 'Accéder à mon achat', path: `/marketplace/achat/${p.id}` },
        }),
      )
      if (!result.ok)
        log.error('Purchase receipt not delivered', { purchaseId: p.id, error: result.error })
    }

    await emailSuperAdmins(`Nouvelle vente : ${title}`, {
      title: 'Nouvelle vente d’un compte d’exploitation',
      lines: [
        `Compte : « ${title} » (vendeur : ${seller})`,
        `Montant : ${amount}`,
        `Acheteur : ${buyerName || '—'}`,
        `Date : ${date}`,
        `Référence FedaPay : ${ref}`,
        ...(opts.late
          ? [
              'Paiement confirmé par FedaPay APRÈS un échec : l’accès est ouvert. Vérifiez que l’acheteur n’a pas payé une seconde fois (remboursement éventuel).',
            ]
          : []),
      ],
      cta: { label: 'Voir les ventes', path: '/admin/comptes-exploitation' },
    })
  } catch (e) {
    log.error('Purchase notification failed', { purchaseId: p.id, error: (e as Error).message })
  }
}
