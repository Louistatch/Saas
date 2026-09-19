// Rechargement du portefeuille PAYG d'un Partenaire.
//
// Ne crée qu'une INTENTION de paiement (purpose='wallet_topup') et redirige
// vers CinetPay ; le crédit réel n'a lieu qu'au callback, une fois le
// paiement confirmé par CinetPay lui-même (jamais sur la foi de cette
// requête ou d'une redirection côté client — voir le callback dédié).
//
// Domaine séparé de /api/payments/initiate (cotisations) : un Partenaire n'a
// ni coopérative, ni cotisation. Voir la migration
// 20260921_100000_partner_billing_wallet.sql pour le raisonnement complet.

import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { requirePartnerMembership } from '@/lib/security/assert-partner-access'
import { createClient as createAdminClient } from '@/lib/supabase/admin'
import { initiateCinetPayPayment } from '@/lib/payments/cinetpay'
import { generatePaymentReference } from '@/lib/payments/orange-money'
import { rateLimit, clientKeyFromHeaders } from '@/lib/utils/rate-limit'

const bodySchema = z.object({
  partner_id: z.string().uuid(),
  amount_fcfa: z.number().int().min(1000).max(5_000_000),
  phone: z.string().trim().min(8).max(40),
})

export async function POST(request: NextRequest) {
  const ip = clientKeyFromHeaders(request.headers)
  const limit = rateLimit(`partner-wallet-topup:${ip}`, 10, 60_000)
  if (!limit.ok) {
    return NextResponse.json({ error: 'Trop de requêtes' }, { status: 429 })
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Requête de rechargement invalide' }, { status: 400 })
  }
  const { partner_id, amount_fcfa, phone } = parsed.data

  // 'manager' minimum : un simple agent de terrain ne gère pas la facturation.
  const guard = await requirePartnerMembership(partner_id, 'manager')
  if (!guard.ok) return guard.response
  const { ctx } = guard

  const admin = createAdminClient()

  let reference = generatePaymentReference('PWT')
  for (let attempt = 0; attempt < 5; attempt++) {
    const { data: clash } = await admin
      .from('partner_payment_intents')
      .select('id')
      .eq('provider_reference', reference)
      .maybeSingle()
    if (!clash) break
    reference = generatePaymentReference('PWT')
  }

  const { data: intent, error: insertError } = await admin
    .from('partner_payment_intents')
    .insert({
      partner_id,
      purpose: 'wallet_topup',
      amount_fcfa,
      provider: 'cinetpay',
      provider_reference: reference,
      phone,
      created_by: ctx.userId,
    })
    .select('id')
    .single()

  if (insertError || !intent) {
    return NextResponse.json(
      { error: 'Création de la demande de rechargement impossible' },
      { status: 502 },
    )
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? ''
  const result = await initiateCinetPayPayment({
    transactionId: reference,
    amount: amount_fcfa,
    description: `Rechargement portefeuille FaîtiereHub — réf. ${reference}`,
    customerPhone: phone,
    notifyUrl: `${baseUrl}/api/partner/payments/cinetpay-callback`,
    returnUrl: `${baseUrl}/operator?topup=${reference}`,
  })

  if (!result.success) {
    // L'intention reste 'pending' : elle ne sera jamais réglée par un
    // callback qui n'aura jamais lieu, mais on ne la supprime pas —
    // elle documente une tentative de rechargement échouée à l'initiation.
    await admin
      .from('partner_payment_intents')
      .update({ status: 'failed', updated_at: new Date().toISOString() })
      .eq('id', intent.id)
    return NextResponse.json(
      { error: result.error ?? 'Initialisation du paiement impossible' },
      { status: 502 },
    )
  }

  return NextResponse.json({ success: true, payment_url: result.paymentUrl, reference })
}
