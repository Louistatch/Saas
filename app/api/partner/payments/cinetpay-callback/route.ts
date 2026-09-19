// notify_url CinetPay dédié aux paiements côté Partenaire.
//
// Séparé du callback cotisations (app/api/payments/cinetpay-callback) — §39
// du plan : « Do not make one callback blindly infer domain behaviour. »
// Celui-ci ne connaît que partner_payment_intents ; il ne lit jamais
// cooperative_id/cotisation_id, qui n'existent pas dans ce domaine.
//
// Même garde-fou que le callback cotisations : CinetPay ne transmet jamais
// le statut lui-même dans la notification (anti man-in-the-middle) — on doit
// toujours revérifier auprès de CinetPay avant de créditer quoi que ce soit.

import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/admin'
import { checkCinetPayTransaction } from '@/lib/payments/cinetpay'
import { claimPartnerIntentForSettlement } from '@/lib/payments/settle-partner-intent'

export async function POST(req: NextRequest): Promise<NextResponse> {
  let transactionId: string | null = null

  const contentType = req.headers.get('content-type') ?? ''
  try {
    if (contentType.includes('application/json')) {
      const body = await req.json()
      transactionId = body.cpm_trans_id ?? body.transaction_id ?? null
    } else {
      const form = await req.formData()
      transactionId = (form.get('cpm_trans_id') ?? form.get('transaction_id'))?.toString() ?? null
    }
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }

  if (!transactionId) {
    return NextResponse.json({ error: 'Missing cpm_trans_id' }, { status: 400 })
  }

  const check = await checkCinetPayTransaction(transactionId)
  if (!check.success) {
    return NextResponse.json({ error: check.error ?? 'Verification failed' }, { status: 502 })
  }

  const supabase = createClient()

  const { data: intent, error: fetchError } = await supabase
    .from('partner_payment_intents')
    .select('id, partner_id, purpose, amount_fcfa')
    .eq('provider_reference', transactionId)
    .single()

  if (fetchError || !intent) {
    return NextResponse.json({ error: 'Payment intent not found' }, { status: 404 })
  }

  const now = new Date().toISOString()
  const isSuccess = check.status === 'ACCEPTED'
  const isTerminal =
    check.status === 'ACCEPTED' || check.status === 'REFUSED' || check.status === 'CANCELLED'

  if (!isTerminal) {
    return NextResponse.json({ received: true })
  }

  // Même point de sérialisation que le callback cotisations : l'UPDATE
  // conditionnel gagne la course, pas un `if` applicatif sur un statut lu
  // plus tôt. Tous les effets financiers restent SOUS ce garde.
  const settlement = await claimPartnerIntentForSettlement(supabase, intent.id, {
    status: isSuccess ? 'success' : 'failed',
    paid_at: isSuccess ? now : null,
    metadata: { payment_method: check.paymentMethod, operator_id: check.operatorId },
    updated_at: now,
  })

  if (!settlement.claimed) {
    if (settlement.reason === 'error') {
      return NextResponse.json({ error: settlement.message }, { status: 500 })
    }
    return NextResponse.json({ received: true, duplicate: true })
  }

  if (!isSuccess) {
    return NextResponse.json({ received: true })
  }

  // L'idempotency_key du crédit réutilise la référence CinetPay elle-même :
  // même si ce callback était rejoué APRÈS avoir déjà réclamé l'intention
  // (impossible en théorie vu le garde ci-dessus, mais la fonction SQL reste
  // idempotente en profondeur plutôt que de compter sur un seul verrou).
  if (intent.purpose === 'wallet_topup') {
    const { error: creditError } = await supabase.rpc('credit_partner_wallet', {
      p_partner_id: intent.partner_id,
      p_entry_type: 'CREDIT',
      p_amount_fcfa: intent.amount_fcfa,
      p_idempotency_key: `topup:${transactionId}`,
      p_payment_intent_id: intent.id,
      p_note: `Rechargement via ${check.paymentMethod ?? 'mobile money'}`,
    })
    if (creditError) {
      // Le paiement est réglé côté intention mais pas encore crédité : ne
      // jamais faire échouer la réponse à CinetPay pour autant (il rejouerait
      // indéfiniment sur un statut déjà 'success'). L'écart est visible en
      // base — intention 'success' sans ligne de grand livre correspondante —
      // et se répare par un crédit manuel, jamais un renvoi silencieux.
      console.error('[partner-callback] credit_partner_wallet failed', creditError, {
        intentId: intent.id,
      })
    }
  } else if (intent.purpose === 'certification') {
    await supabase
      .from('partner_certifications')
      .update({ certified_at: now, updated_at: now })
      .eq('partner_id', intent.partner_id)
    await supabase
      .from('partners')
      .update({ status: 'certified', updated_at: now })
      .eq('id', intent.partner_id)
  }

  return NextResponse.json({ received: true })
}
