import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@/lib/supabase/admin'
import { claimPaymentForSettlement } from '@/lib/payments/settle'
import { initiateOrangeMoneyPayment, generatePaymentReference } from '@/lib/payments/orange-money'
import { initiateCinetPayPayment } from '@/lib/payments/cinetpay'
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
  const session = await createClient()
  const { data: { user } } = await session.auth.getUser()
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

  // Check both related rows before using the service-role client.
  const { data: memberRow } = await session.from('members').select('id')
    .eq('id', member_id).eq('cooperative_id', cooperative_id).maybeSingle()
  if (!memberRow) return NextResponse.json({ error: 'Membre non autorisé' }, { status: 403 })
  if (cotisation_id) {
    const { data: cotisation } = await session.from('cotisations').select('amount, currency, status')
      .eq('id', cotisation_id).eq('member_id', member_id).eq('cooperative_id', cooperative_id).maybeSingle()
    if (!cotisation || cotisation.status === 'paid' || cotisation.status === 'waived'
      || Number(cotisation.amount) !== amount_fcfa || cotisation.currency !== 'XOF') {
      return NextResponse.json({ error: 'Cotisation ou montant invalide' }, { status: 400 })
    }
  }
  if (['moov', 'tmoney'].includes(provider) && amount_fcfa % 5 !== 0) {
    return NextResponse.json({ error: 'Le montant Mobile Money doit être un multiple de 5 FCFA' }, { status: 400 })
  }
  const supabase = createAdminClient()

  // Le paiement en espèces est saisi par l'administrateur, sans téléphone ;
  // tout opérateur mobile en exige un.
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
    const settlement = await claimPaymentForSettlement(supabase, payment.id, { status: 'success', paid_at: now })
    if (!settlement.claimed && settlement.reason === 'error') {
      return NextResponse.json({ error: 'Enregistrement du paiement impossible' }, { status: 500 })
    }

    return NextResponse.json({ success: true, reference, provider: 'cash' })
  }

  if (provider === 'orange_money') {
    // Redit ici pour que le rétrécissement soit local et vérifié par le
    // compilateur, plutôt que déduit d'un garde cinquante lignes plus haut.
    if (!phone) {
      return NextResponse.json({ error: 'Phone required for non-cash payment' }, { status: 400 })
    }
    const result = await initiateOrangeMoneyPayment({
      phone,
      amount: amount_fcfa,
      reference,
      description: `Paiement cotisation — réf. ${reference}`,
      returnUrl: `${process.env.NEXT_PUBLIC_APP_URL ?? ''}/dashboard/cotisations`,
    })

    if (!result.success) {
      await supabase
        .from('payments')
        .update({ status: 'failed', failure_reason: result.error ?? 'Initiation failed' })
        .eq('id', payment.id)
        .eq('status', 'pending')
        .then(() => undefined)

      return NextResponse.json({ error: result.error ?? 'Payment initiation failed' }, { status: 502 })
    }

    await supabase
      .from('payments')
      .update({ status: 'processing', provider_tx_id: result.txId ?? null })
      .eq('id', payment.id)
        .eq('status', 'pending')
      .then(() => undefined)

    return NextResponse.json({ success: true, paymentUrl: result.paymentUrl, reference })
  }

  if (provider === 'moov' || provider === 'tmoney') {
    const { data: member } = await supabase
      .from('members')
      .select('first_name, last_name')
      .eq('id', member_id)
      .maybeSingle()

    const result = await initiateCinetPayPayment({
      transactionId: reference,
      amount: amount_fcfa,
      description: `Paiement cotisation — réf. ${reference}`,
      customerName: member?.first_name ?? undefined,
      customerSurname: member?.last_name ?? undefined,
      customerPhone: phone,
      notifyUrl: `${process.env.NEXT_PUBLIC_APP_URL ?? ''}/api/payments/cinetpay-callback`,
      returnUrl: `${process.env.NEXT_PUBLIC_APP_URL ?? ''}/dashboard/cotisations`,
    })

    if (!result.success) {
      await supabase
        .from('payments')
        .update({ status: 'failed', failure_reason: result.error ?? 'Initiation failed' })
        .eq('id', payment.id)
        .eq('status', 'pending')
        .then(() => undefined)

      return NextResponse.json({ error: result.error ?? 'Payment initiation failed' }, { status: 502 })
    }

    await supabase
      .from('payments')
      .update({ status: 'processing', provider_tx_id: result.paymentToken ?? null })
      .eq('id', payment.id)
        .eq('status', 'pending')
      .then(() => undefined)

    return NextResponse.json({ success: true, paymentUrl: result.paymentUrl, reference })
  }

  return NextResponse.json({ error: `Unsupported provider: ${provider}` }, { status: 400 })
}
