import { NextRequest, NextResponse } from 'next/server'
import { createHmac, timingSafeEqual } from 'crypto'
import { createClient } from '@/lib/supabase/admin'
import { queueInAppNotification } from '@/lib/notifications/queue'

interface OrangeCallbackBody {
  reference: string
  tx_id: string
  status: 'SUCCESS' | 'FAILED'
  failure_reason?: string
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const apiKey = process.env.ORANGE_MONEY_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'Server misconfiguration' }, { status: 500 })
  }

  const rawBody = await req.text()

  const signature = req.headers.get('x-orange-signature') ?? ''
  const expected = createHmac('sha256', apiKey).update(rawBody).digest('hex')
  const sigBuf = Buffer.from(signature)
  const expBuf = Buffer.from(expected)
  const valid = sigBuf.length === expBuf.length && timingSafeEqual(sigBuf, expBuf)
  if (!valid) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  let body: OrangeCallbackBody
  try {
    body = JSON.parse(rawBody) as OrangeCallbackBody
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { reference, tx_id, status, failure_reason } = body
  if (!reference || !status) {
    return NextResponse.json({ error: 'Missing reference or status' }, { status: 400 })
  }

  const supabase = createClient()

  const { data: payment, error: fetchError } = await supabase
    .from('payments')
    .select('id, cooperative_id, cotisation_id, amount_fcfa, member_id')
    .eq('reference', reference)
    .single()

  if (fetchError || !payment) {
    return NextResponse.json({ error: 'Payment not found' }, { status: 404 })
  }

  const now = new Date().toISOString()
  const isSuccess = status === 'SUCCESS'

  const { error: updateError } = await supabase
    .from('payments')
    .update({
      status: isSuccess ? 'success' : 'failed',
      provider_tx_id: tx_id ?? null,
      paid_at: isSuccess ? now : null,
      failure_reason: isSuccess ? null : (failure_reason ?? 'Payment failed'),
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
      ? `Paiement de ${payment.amount_fcfa} FCFA confirmé (réf. ${reference})`
      : `Paiement de ${payment.amount_fcfa} FCFA échoué (réf. ${reference})`,
    type: isSuccess ? 'success' : 'alert',
    icon: isSuccess ? '✅' : '❌',
    link: '/dashboard/cotisations',
  })

  // SMS de confirmation au membre (fire-and-forget)
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
