import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/admin'
import { checkCinetPayTransaction } from '@/lib/payments/cinetpay'
import { queueInAppNotification } from '@/lib/notifications/queue'

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
    .select('id, cooperative_id, cotisation_id, amount_fcfa, member_id, status')
    .eq('reference', transactionId)
    .single()

  if (fetchError || !payment) {
    return NextResponse.json({ error: 'Payment not found' }, { status: 404 })
  }

  // Already settled — CinetPay may re-send notifications; don't double-process.
  if (payment.status === 'success' || payment.status === 'failed') {
    return NextResponse.json({ received: true })
  }

  const now = new Date().toISOString()
  const isSuccess = check.status === 'ACCEPTED'
  const isTerminal = check.status === 'ACCEPTED' || check.status === 'REFUSED' || check.status === 'CANCELLED'

  if (!isTerminal) {
    // Still PENDING — nothing to settle yet, CinetPay will notify again.
    return NextResponse.json({ received: true })
  }

  const { error: updateError } = await supabase
    .from('payments')
    .update({
      status: isSuccess ? 'success' : 'failed',
      paid_at: isSuccess ? now : null,
      failure_reason: isSuccess ? null : `CinetPay: ${check.status}`,
      metadata: { payment_method: check.paymentMethod, operator_id: check.operatorId },
      updated_at: now,
    })
    .eq('id', payment.id)

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 })
  }

  if (isSuccess && payment.cotisation_id) {
    void supabase
      .from('cotisations')
      .update({ status: 'paid', paid_date: now })
      .eq('id', payment.cotisation_id)
      .then(() => undefined)
  }

  void queueInAppNotification({
    cooperativeId: payment.cooperative_id as string,
    title: isSuccess ? 'Paiement reçu' : 'Paiement échoué',
    body: isSuccess
      ? `Paiement de ${payment.amount_fcfa} FCFA confirmé via ${check.paymentMethod ?? 'mobile money'} (réf. ${transactionId})`
      : `Paiement de ${payment.amount_fcfa} FCFA échoué (réf. ${transactionId})`,
    type: isSuccess ? 'success' : 'alert',
    icon: isSuccess ? '✅' : '❌',
    link: '/dashboard/cotisations',
  })

  if (isSuccess && payment.member_id) {
    void (async () => {
      try {
        const { data: member } = await supabase
          .from('members')
          .select('first_name, phone')
          .eq('id', payment.member_id as string)
          .single()

        if (member?.phone) {
          const { data: tpl } = await supabase
            .from('notification_templates')
            .select('body_fr')
            .eq('key', 'cotisation_paid')
            .eq('channel', 'sms')
            .maybeSingle()

          const body = (tpl?.body_fr ?? '')
            .replace('{prenom}', member.first_name ?? '')
            .replace('{montant}', String(payment.amount_fcfa))

          if (body) {
            await supabase.from('notification_queue').insert({
              member_id: payment.member_id as string,
              cooperative_id: payment.cooperative_id as string,
              channel: 'sms',
              template_key: 'cotisation_paid',
              recipient_phone: member.phone,
              variables: { prenom: member.first_name ?? '', montant: String(payment.amount_fcfa) },
              body_rendered: body,
              scheduled_at: now,
            })
          }
        }
      } catch { /* non-bloquant */ }
    })()
  }

  return NextResponse.json({ received: true })
}
