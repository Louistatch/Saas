import 'server-only'
import { emailAddress } from '@/lib/email/resend'
import { getTransaction } from '@/lib/payments/fedapay'
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

/**
 * Règle un achat d'après FedaPay. Idempotent : appelé par le retour navigateur,
 * le webhook et la page d'achat ; seul le premier passage « pending → completed »
 * modifie la ligne (garde sur payment_status).
 */
export async function settlePurchase(purchaseId: string): Promise<PurchaseRow | null> {
  const sb = createAdminClient()
  const { data: p } = await sb
    .from('purchases')
    .select(
      'id, fiche_id, amount, currency, payment_status, access_granted, provider, provider_transaction_id, paid_at',
    )
    .eq('id', purchaseId)
    .maybeSingle<PurchaseRow>()
  if (!p) return null
  if (p.payment_status !== 'pending' || p.provider !== 'fedapay' || !p.provider_transaction_id)
    return p

  let tx: Awaited<ReturnType<typeof getTransaction>>
  try {
    tx = await getTransaction(p.provider_transaction_id)
  } catch (e) {
    log.warn('FedaPay lookup failed', { purchaseId, error: (e as Error).message })
    return p
  }

  let next: Partial<PurchaseRow> | null = null
  if (tx.status === 'approved') {
    const amountOk = Number.isFinite(tx.amount) && tx.amount >= p.amount
    const currencyOk = !tx.currencyIso || tx.currencyIso === 'XOF'
    if (!amountOk || !currencyOk) {
      log.error('FedaPay amount/currency mismatch', {
        purchaseId,
        txAmount: tx.amount,
        expected: p.amount,
      })
      next = { payment_status: 'failed' }
    } else {
      next = {
        payment_status: 'completed',
        access_granted: true,
        paid_at: new Date().toISOString(),
      }
    }
  } else if (['declined', 'canceled', 'refunded'].includes(tx.status)) {
    next = { payment_status: tx.status === 'refunded' ? 'refunded' : 'failed' }
  }
  if (!next) return p

  const { data: updated } = await sb
    .from('purchases')
    .update({ ...next, updated_at: new Date().toISOString() })
    .eq('id', p.id)
    .eq('payment_status', 'pending')
    .select(
      'id, fiche_id, amount, currency, payment_status, access_granted, provider, provider_transaction_id, paid_at',
    )
    .maybeSingle<PurchaseRow>()

  // Reçu : uniquement pour l'appel qui a gagné la transition pending →
  // completed (garde ci-dessus), donc jamais deux fois.
  if (updated?.payment_status === 'completed') {
    after(async () => {
      const [{ data: buyer }, { data: fiche }] = await Promise.all([
        sb.from('purchases').select('buyer_email').eq('id', p.id).maybeSingle(),
        sb.from('fiches_techniques').select('title').eq('id', p.fiche_id).maybeSingle(),
      ])
      await emailAddress(buyer?.buyer_email, 'Reçu de paiement FaîtiereHub', {
        title: 'Paiement confirmé',
        lines: [
          'Bonjour,',
          `Nous confirmons la réception de votre paiement de ${p.amount.toLocaleString('fr-FR')} ${p.currency}.`,
          `Achat : fiche technique « ${fiche?.title ?? 'fiche technique'} »`,
          `Référence : ${p.provider_transaction_id}`,
          'Merci pour votre confiance.',
        ],
        cta: { label: 'Accéder à mon achat', path: `/marketplace/achat/${p.id}` },
      })
    })
  }

  return updated ?? { ...p, ...next }
}
