import 'server-only'
import { recordCertificationFeePaid } from '@/lib/partners/certification'
import { createCheckout, getTransaction } from '@/lib/payments/fedapay'
import { claimPartnerIntentForSettlement } from '@/lib/payments/settle-partner-intent'
import { createClient as createAdminClient } from '@/lib/supabase/admin'
import { createLogger } from '@/lib/utils/logger'

const log = createLogger('partners:certification-payment')

/**
 * Frais de certification Opérateur payés par FedaPay, sur sa page de paiement hébergée (Mobile
 * Money, dont Mixx by Yas et Moov au Togo, ou carte). Même règle que pour les comptes
 * d'exploitation (lib/fiches/purchases.ts) : ni l'URL de retour ni la notification ne sont crues ;
 * la transaction est relue auprès de FedaPay, son montant et sa devise contrôlés, et un seul
 * passage pending → success (claimPartnerIntentForSettlement) enregistre la certification.
 */

export type CertificationPaymentState = 'success' | 'failed' | 'pending' | 'unknown'

/**
 * Crée l'intention de paiement puis la transaction FedaPay. L'intention existe avant la
 * transaction (référence provisoire), pour que l'adresse de retour la désigne ; elle reçoit
 * ensuite l'identifiant FedaPay, qui sert à la relire.
 */
export async function startCertificationPayment(input: {
  partnerId: string
  userId: string
  amount: number
  phone: string
  customer: { name: string; email?: string | null }
  appUrl: string
}): Promise<{ ok: true; url: string; intentId: string } | { ok: false; error: string }> {
  const admin = createAdminClient()
  const intentId = crypto.randomUUID()
  const { error: insertError } = await admin.from('partner_payment_intents').insert({
    id: intentId,
    partner_id: input.partnerId,
    purpose: 'certification',
    amount_fcfa: input.amount,
    provider: 'fedapay',
    provider_reference: `fedapay-pending-${intentId}`,
    phone: input.phone,
    created_by: input.userId,
  })
  if (insertError) {
    log.error('Certification intent insert failed', insertError)
    return { ok: false, error: 'Création du paiement de certification impossible' }
  }
  try {
    const checkout = await createCheckout({
      amount: input.amount,
      description: 'Certification Opérateur FaîtiereHub',
      callbackUrl: `${input.appUrl}/api/payments/fedapay/return?certification=${intentId}`,
      customer: { name: input.customer.name, email: input.customer.email, phone: input.phone },
    })
    await admin
      .from('partner_payment_intents')
      .update({
        provider_reference: String(checkout.transactionId),
        updated_at: new Date().toISOString(),
      })
      .eq('id', intentId)
    return { ok: true, url: checkout.url, intentId }
  } catch (e) {
    log.error('FedaPay certification checkout failed', { intentId, error: (e as Error).message })
    await admin
      .from('partner_payment_intents')
      .update({ status: 'failed', updated_at: new Date().toISOString() })
      .eq('id', intentId)
    return { ok: false, error: 'Paiement indisponible pour le moment. Réessayez plus tard.' }
  }
}

/** Règle une intention d'après FedaPay. Idempotente : retour navigateur et notification. */
export async function settleCertificationIntent(
  intentId: string,
): Promise<CertificationPaymentState> {
  const admin = createAdminClient()
  const { data: intent } = await admin
    .from('partner_payment_intents')
    .select(
      'id, partner_id, purpose, amount_fcfa, provider, provider_reference, status, created_by',
    )
    .eq('id', intentId)
    .maybeSingle()
  if (!intent || intent.purpose !== 'certification' || intent.provider !== 'fedapay')
    return 'unknown'
  if (intent.status === 'success') return 'success'
  if (intent.status !== 'pending' && intent.status !== 'processing') return 'failed'
  if (intent.provider_reference.startsWith('fedapay-pending-')) return 'pending'

  let tx: Awaited<ReturnType<typeof getTransaction>>
  try {
    tx = await getTransaction(intent.provider_reference)
  } catch (e) {
    log.warn('FedaPay lookup failed', { intentId, error: (e as Error).message })
    return 'pending'
  }

  const now = new Date().toISOString()
  if (tx.status === 'approved') {
    const amountOk = Number.isFinite(tx.amount) && tx.amount >= intent.amount_fcfa
    const currencyOk = !tx.currencyIso || tx.currencyIso === 'XOF'
    if (!amountOk || !currencyOk) {
      log.error('FedaPay amount/currency mismatch on certification', {
        intentId,
        txAmount: tx.amount,
        expected: intent.amount_fcfa,
      })
      await claimPartnerIntentForSettlement(admin, intent.id, {
        status: 'failed',
        metadata: { reason: 'amount_mismatch', fedapay_status: tx.status },
        updated_at: now,
      })
      return 'failed'
    }
    const claim = await claimPartnerIntentForSettlement(admin, intent.id, {
      status: 'success',
      paid_at: now,
      metadata: { fedapay_status: tx.status },
      updated_at: now,
    })
    if (claim.claimed) {
      const recorded = await recordCertificationFeePaid(admin, {
        partnerId: intent.partner_id,
        validatorId: intent.created_by,
        method: 'fedapay',
        note: `Transaction FedaPay ${intent.provider_reference}`,
      })
      // Paiement encaissé mais dossier non mis à jour : visible en base (intention 'success',
      // certified_at vide), réparable par « marquer payé » ; jamais un second encaissement.
      if (!recorded.ok)
        log.error('Certification paid but not recorded', { intentId, error: recorded.error })
    }
    return claim.claimed || claim.reason === 'already_settled' ? 'success' : 'pending'
  }
  if (['declined', 'canceled', 'cancelled', 'expired', 'refunded'].includes(tx.status)) {
    await claimPartnerIntentForSettlement(admin, intent.id, {
      status: tx.status === 'expired' ? 'expired' : 'failed',
      metadata: { fedapay_status: tx.status },
      updated_at: now,
    })
    return 'failed'
  }
  return 'pending'
}

/** Intention de certification FedaPay correspondant à une transaction (notification). */
export async function certificationIntentForTransaction(txId: string): Promise<string | null> {
  const { data } = await createAdminClient()
    .from('partner_payment_intents')
    .select('id')
    .eq('provider', 'fedapay')
    .eq('purpose', 'certification')
    .eq('provider_reference', txId)
    .maybeSingle<{ id: string }>()
  return data?.id ?? null
}
