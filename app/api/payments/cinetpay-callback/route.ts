import { checkCinetPayTransaction } from '@/lib/payments/cinetpay'
import { claimPaymentForSettlement } from '@/lib/payments/settle'
import { createClient } from '@/lib/supabase/admin'
import { type NextRequest, NextResponse } from 'next/server'

/**
 * CinetPay notify_url — called after every transaction status change.
 *
 * By design CinetPay sends ONLY the transaction id here, never the payment
 * status itself (anti man-in-the-middle). We must always call the
 * verification API ourselves and treat that response as the sole source of
 * truth — never the incoming request body.
 * https://docs.cinetpay.com/api/1.0-en/checkout/notification
 */
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

  const { data: payment, error: fetchError } = await supabase
    .from('payments')
    .select('id, cooperative_id, cotisation_id, amount_fcfa, member_id, currency, provider')
    .eq('reference', transactionId)
    .single()

  if (fetchError || !payment) {
    return NextResponse.json({ error: 'Payment not found' }, { status: 404 })
  }

  if (!['moov', 'tmoney'].includes(payment.provider)) {
    return NextResponse.json({ error: 'Provider mismatch' }, { status: 409 })
  }
  if (
    check.status === 'ACCEPTED' &&
    (check.amount !== Number(payment.amount_fcfa) || check.currency !== payment.currency)
  ) {
    return NextResponse.json({ error: 'Amount or currency mismatch' }, { status: 409 })
  }

  const now = new Date().toISOString()
  const isSuccess = check.status === 'ACCEPTED'
  const isTerminal =
    check.status === 'ACCEPTED' || check.status === 'REFUSED' || check.status === 'CANCELLED'

  if (!isTerminal) {
    // Still PENDING — nothing to settle yet, CinetPay will notify again.
    return NextResponse.json({ received: true })
  }

  // L'écriture conditionnelle est le point de sérialisation : un seul appel la
  // gagne. Un `if` sur le statut lu plus haut ne suffirait pas — deux
  // livraisons simultanées le franchiraient toutes les deux et le membre
  // recevrait deux SMS. Tous les effets de bord restent donc SOUS ce garde.
  const settlement = await claimPaymentForSettlement(supabase, payment.id, {
    status: isSuccess ? 'success' : 'failed',
    paid_at: isSuccess ? now : null,
    failure_reason: isSuccess ? null : `CinetPay: ${check.status}`,
    metadata: { payment_method: check.paymentMethod, operator_id: check.operatorId },
    updated_at: now,
  })

  if (!settlement.claimed) {
    if (settlement.reason === 'error') {
      return NextResponse.json({ error: settlement.message }, { status: 500 })
    }
    // Déjà réglé par une livraison précédente ou concurrente : on acquitte sans
    // rejouer quoi que ce soit.
    return NextResponse.json({ received: true, duplicate: true })
  }

  return NextResponse.json({ received: true })
}
