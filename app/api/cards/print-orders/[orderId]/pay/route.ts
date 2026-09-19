// Paiement d'une commande de cartes physiques. Toujours le fournisseur
// CinetPay existant (lib/payments/cinetpay.ts), jamais le schéma `payments`
// des cotisations — voir la migration pour le raisonnement complet.

import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { assertTenantAccess } from '@/lib/security/assert-access'
import { createClient as createAdminClient } from '@/lib/supabase/admin'
import { initiateCinetPayPayment } from '@/lib/payments/cinetpay'
import { generatePaymentReference } from '@/lib/payments/orange-money'
import { rateLimit, clientKeyFromHeaders } from '@/lib/utils/rate-limit'

const bodySchema = z.object({
  phone: z.string().trim().min(8).max(40),
})

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ orderId: string }> },
) {
  const ip = clientKeyFromHeaders(request.headers)
  const limit = rateLimit(`print-order-pay:${ip}`, 10, 60_000)
  if (!limit.ok) {
    return NextResponse.json({ error: 'Trop de requêtes' }, { status: 429 })
  }

  const { orderId } = await params
  if (!z.string().uuid().safeParse(orderId).success) {
    return NextResponse.json({ error: 'Identifiant de commande invalide' }, { status: 400 })
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Numéro de téléphone requis' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { data: order } = await admin
    .from('card_print_orders')
    .select('id, cooperative_id, status, amount_fcfa, provider_reference')
    .eq('id', orderId)
    .maybeSingle<{
      id: string
      cooperative_id: string
      status: string
      amount_fcfa: number
      provider_reference: string | null
    }>()
  if (!order) {
    return NextResponse.json({ error: 'Commande introuvable' }, { status: 404 })
  }

  const guard = await assertTenantAccess(order.cooperative_id)
  if (!guard.ok) return guard.response

  if (order.status !== 'requested') {
    return NextResponse.json(
      { error: 'Cette commande a déjà été payée ou annulée' },
      { status: 409 },
    )
  }

  let reference = order.provider_reference
  if (!reference) {
    reference = generatePaymentReference('CARD')
    for (let attempt = 0; attempt < 5; attempt++) {
      const { data: clash } = await admin
        .from('card_print_orders')
        .select('id')
        .eq('provider_reference', reference)
        .maybeSingle()
      if (!clash) break
      reference = generatePaymentReference('CARD')
    }
    await admin
      .from('card_print_orders')
      .update({ provider_reference: reference })
      .eq('id', orderId)
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? ''
  const result = await initiateCinetPayPayment({
    transactionId: reference,
    amount: order.amount_fcfa,
    description: `Cartes membres physiques — réf. ${reference}`,
    customerPhone: parsed.data.phone,
    notifyUrl: `${baseUrl}/api/cards/print-orders/cinetpay-callback`,
    returnUrl: `${baseUrl}/dashboard/cards?order=${reference}`,
  })

  if (!result.success) {
    return NextResponse.json(
      { error: result.error ?? 'Initialisation du paiement impossible' },
      { status: 502 },
    )
  }

  return NextResponse.json({ success: true, payment_url: result.paymentUrl, reference })
}
