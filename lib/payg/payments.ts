/**
 * Paiements PAYG par FedaPay : packs de crédits, formation (en une fois ou par tranches) et
 * commandes FaîtièreHub Print. Même règle que la certification
 * (lib/partners/certification-payment.ts) : l'intention existe avant la transaction, ni l'URL
 * de retour ni la notification ne sont crues, la transaction est relue chez FedaPay (montant
 * et devise contrôlés), un seul passage pending → success applique l'effet. L'effet lui-même
 * est idempotent (clé `intent:<id>`), donc un règlement interrompu se termine au rejeu.
 */
import 'server-only'
import { recordCertificationFeePaid } from '@/lib/partners/certification'
import type { AdminClient } from '@/lib/payg/server'
import { createCheckout, getTransaction } from '@/lib/payments/fedapay'
import { claimPartnerIntentForSettlement } from '@/lib/payments/settle-partner-intent'
import { createLogger } from '@/lib/utils/logger'
import type { Json } from '@/types/supabase'

const log = createLogger('payg:payments')

export type PaygPurpose = 'credit_pack' | 'training_fee' | 'print_order'
export const PAYG_PURPOSES: readonly PaygPurpose[] = ['credit_pack', 'training_fee', 'print_order']
export type PaygPaymentState = 'success' | 'failed' | 'pending' | 'unknown'

export async function startPaygCheckout(
  admin: AdminClient,
  input: {
    purpose: PaygPurpose
    partnerId: string
    userId: string
    amountFcfa: number
    description: string
    metadata: Record<string, string | number>
    customer: { name: string; email?: string | null; phone?: string | null }
    appUrl: string
  },
): Promise<{ ok: true; url: string; intentId: string } | { ok: false; error: string }> {
  const intentId = crypto.randomUUID()
  const { error: insertError } = await admin.from('partner_payment_intents').insert({
    id: intentId,
    partner_id: input.partnerId,
    purpose: input.purpose,
    amount_fcfa: input.amountFcfa,
    provider: 'fedapay',
    provider_reference: `fedapay-pending-${intentId}`,
    phone: input.customer.phone ?? null,
    metadata: input.metadata as Json,
    created_by: input.userId,
  })
  if (insertError) {
    log.error('PAYG intent insert failed', { purpose: input.purpose, error: insertError.message })
    return { ok: false, error: 'Création du paiement impossible' }
  }
  try {
    const checkout = await createCheckout({
      amount: input.amountFcfa,
      description: input.description,
      callbackUrl: `${input.appUrl}/api/payg/payments/return?intent=${intentId}`,
      customer: input.customer,
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
    log.error('FedaPay PAYG checkout failed', { intentId, error: (e as Error).message })
    await admin
      .from('partner_payment_intents')
      .update({ status: 'failed', updated_at: new Date().toISOString() })
      .eq('id', intentId)
    return { ok: false, error: 'Paiement indisponible pour le moment. Réessayez plus tard.' }
  }
}

interface IntentRow {
  id: string
  partner_id: string
  purpose: string
  amount_fcfa: number
  provider: string
  provider_reference: string
  status: string
  metadata: Record<string, unknown> | null
  created_by: string | null
}

/** Applique l'effet d'un paiement confirmé. Idempotent : rejouer ne crédite jamais deux fois. */
async function applyIntent(admin: AdminClient, intent: IntentRow): Promise<boolean> {
  const key = `intent:${intent.id}`
  const meta = intent.metadata ?? {}
  if (intent.purpose === 'credit_pack') {
    const { data, error } = await admin.rpc('payg_purchase_credits', {
      p_partner_id: intent.partner_id,
      p_credits: Number(meta.credits),
      p_amount_fcfa: intent.amount_fcfa,
      p_idempotency_key: key,
      p_payment_intent_id: intent.id,
      p_actor: intent.created_by as string,
      p_note: `FedaPay ${intent.provider_reference}`,
    })
    const outcome = (data as { outcome?: string } | null)?.outcome
    if (error || (outcome !== 'applied' && outcome !== 'already_applied')) {
      log.error('Credit pack paid but not applied', { intentId: intent.id, outcome, error })
      return false
    }
    return true
  }
  if (intent.purpose === 'training_fee') {
    const accountId = String(meta.account_id ?? '')
    const { data, error } = await admin.rpc('payg_record_training_payment', {
      p_account_id: accountId,
      p_amount_fcfa: intent.amount_fcfa,
      p_method: 'fedapay',
      p_idempotency_key: key,
      p_payment_intent_id: intent.id,
      p_actor: intent.created_by as string,
      p_reference: intent.provider_reference,
    })
    const result = data as { outcome?: string; status?: string } | null
    if (error || (result?.outcome !== 'applied' && result?.outcome !== 'already_applied')) {
      // Argent reçu mais non imputable (montant devenu supérieur au reste dû) : visible en base,
      // réglé par l'équipe ; jamais un second encaissement silencieux.
      log.error('Training paid but not applied', { intentId: intent.id, result, error })
      return false
    }
    if (result.status === 'paid') await certifyIfReady(admin, accountId, intent.created_by)
    return true
  }
  if (intent.purpose === 'print_order') {
    const now = new Date().toISOString()
    await admin
      .from('faitierehub_print_orders')
      .update({ status: 'paid', paid_at: now, payment_intent_id: intent.id, updated_at: now })
      .eq('id', String(meta.order_id ?? ''))
      .eq('status', 'quoted')
    return true
  }
  return false
}

/**
 * Formation soldée : si l'évaluation est déjà réussie, la certification est enregistrée
 * (sinon elle le sera au moment de l'évaluation, cf. recordPartnerExamResult).
 */
export async function certifyIfReady(
  admin: AdminClient,
  accountId: string,
  actorId: string | null,
) {
  const { data: account } = await admin
    .from('training_fee_accounts')
    .select('user_id, status')
    .eq('id', accountId)
    .maybeSingle()
  if (!account || (account.status !== 'paid' && account.status !== 'waived')) return
  const { data: cert } = await admin
    .from('partner_certifications')
    .select('partner_id, exam_passed_at, certified_at')
    .eq('user_id', account.user_id)
    .maybeSingle()
  if (!cert?.partner_id || !cert.exam_passed_at || cert.certified_at) return
  await recordCertificationFeePaid(admin, {
    partnerId: cert.partner_id,
    userId: account.user_id,
    validatorId: actorId,
    method: 'training',
    note: 'Formation soldée après l’évaluation',
  })
}

/** Règle une intention PAYG d'après FedaPay. Rejouable sans risque (retour et notification). */
export async function settlePaygIntent(
  admin: AdminClient,
  intentId: string,
): Promise<PaygPaymentState> {
  const { data } = await admin
    .from('partner_payment_intents')
    .select(
      'id, partner_id, purpose, amount_fcfa, provider, provider_reference, status, metadata, created_by',
    )
    .eq('id', intentId)
    .maybeSingle()
  const intent = data as IntentRow | null
  if (!intent || intent.provider !== 'fedapay') return 'unknown'
  if (!PAYG_PURPOSES.includes(intent.purpose as PaygPurpose)) return 'unknown'
  // Déjà réglée : on rejoue l'effet (idempotent) au cas où il aurait été interrompu.
  if (intent.status === 'success') return (await applyIntent(admin, intent)) ? 'success' : 'pending'
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
      log.error('FedaPay amount/currency mismatch on PAYG intent', {
        intentId,
        txAmount: tx.amount,
        expected: intent.amount_fcfa,
      })
      await claimPartnerIntentForSettlement(admin, intent.id, {
        status: 'failed',
        metadata: { ...(intent.metadata ?? {}), reason: 'amount_mismatch' } as Json,
        updated_at: now,
      })
      return 'failed'
    }
    const claim = await claimPartnerIntentForSettlement(admin, intent.id, {
      status: 'success',
      paid_at: now,
      updated_at: now,
    })
    if (claim.claimed || claim.reason === 'already_settled') {
      return (await applyIntent(admin, { ...intent, status: 'success' })) ? 'success' : 'pending'
    }
    return 'pending'
  }
  if (['declined', 'canceled', 'cancelled', 'expired', 'refunded'].includes(tx.status)) {
    await claimPartnerIntentForSettlement(admin, intent.id, {
      status: tx.status === 'expired' ? 'expired' : 'failed',
      updated_at: now,
    })
    return 'failed'
  }
  return 'pending'
}

/** Intention PAYG correspondant à une transaction FedaPay (notification). */
export async function paygIntentForTransaction(
  admin: AdminClient,
  txId: string,
): Promise<string | null> {
  const { data } = await admin
    .from('partner_payment_intents')
    .select('id')
    .eq('provider', 'fedapay')
    .in('purpose', [...PAYG_PURPOSES])
    .eq('provider_reference', txId)
    .maybeSingle()
  return data?.id ?? null
}
