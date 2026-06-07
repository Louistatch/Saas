import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { initiateOrangeMoneyPayment, generatePaymentReference } from '@/lib/payments/orange-money'
import { assertTenantAccess } from '@/lib/security/assert-access'

const paymentInitiateSchema = z.object({
  member_id: z.string().uuid(),
  cooperative_id: z.string().uuid(),
  cotisation_id: z.string().uuid().optional(),
  amount_fcfa: z.number().int().min(1).max(10_000_000),
  phone: z.string().regex(/^\+?[0-9]{8,15}$/).optional(),
  provider: z.enum(['cash', 'orange_money', 'moov', 'tmoney']),
})

export async function POST(req: NextRequest): Promise<NextResponse> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const parsed = paymentInitiateSchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid payload' }, { status: 400 })
  }

  const { member_id, cotisation_id, amount_fcfa, phone, provider, cooperative_id } = parsed.data

  const tenantCheck = await assertTenantAccess(cooperative_id)
  if (!tenantCheck.ok) return tenantCheck.response

  if (provider !== 'cash' && !phone) {
    return NextResponse.json({ error: 'Phone required for non-cash payment' }, { status: 400 })
  }

  const reference = generatePaymentReference('PAY')
  const now = new Date().toISOString()

  const { data: payment, error: insertError } = await supabase
    .from('payments')
    .insert({
      member_id,
      cooperative_id,
      cotisation_id: cotisation_id ?? null,
      amount_fcfa,
      phone: phone ?? null,
      provider,
      reference,
      status: 'pending',
    })
    .select()
    .single()

  if (insertError || !payment) {
    return NextResponse.json({ error: insertError?.message ?? 'Failed to create payment' }, { status: 500 })
  }

  if (provider === 'cash') {
    const { error: updateError } = await supabase
      .from('payments')
      .update({ status: 'success', paid_at: now })
      .eq('id', payment.id)

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    if (cotisation_id) {
      void supabase
        .from('cotisations')
        .update({ status: 'paid', paid_date: now.split('T')[0] })
        .eq('id', cotisation_id)
        .then(() => undefined)
    }

    return NextResponse.json({ success: true, reference, provider: 'cash' })
  }

  if (provider === 'orange_money') {
    const result = await initiateOrangeMoneyPayment({
      phone: phone!,
      amount: amount_fcfa,
      reference,
      description: `Paiement cotisation — réf. ${reference}`,
      returnUrl: `${process.env.NEXT_PUBLIC_APP_URL ?? ''}/dashboard/cotisations`,
    })

    if (!result.success) {
      void supabase
        .from('payments')
        .update({ status: 'failed', failure_reason: result.error ?? 'Initiation failed' })
        .eq('id', payment.id)
        .then(() => undefined)

      return NextResponse.json({ error: result.error ?? 'Payment initiation failed' }, { status: 502 })
    }

    void supabase
      .from('payments')
      .update({ status: 'processing', provider_tx_id: result.txId ?? null })
      .eq('id', payment.id)
      .then(() => undefined)

    return NextResponse.json({ success: true, paymentUrl: result.paymentUrl, reference })
  }

  // Other providers (moov, tmoney) — create pending row, await manual confirmation
  return NextResponse.json({ success: true, reference, provider })
}
