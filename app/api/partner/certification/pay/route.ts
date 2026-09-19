// Paiement des frais de certification Opérateur (15 000 XOF, §9 du plan).
//
// Gardé sur la formation ET l'examen réussis — même si rien ne pose encore
// `training_completed_at`/`exam_passed_at` aujourd'hui (le parcours
// formation/examen est un chantier produit séparé, pas dans ce PR). Le garde
// reste honnête : tant qu'aucun mécanisme d'examen n'existe, personne ne
// peut passer ces deux colonnes à non-null, donc personne ne peut payer —
// ce qui est le comportement correct, pas une fonctionnalité manquante
// déguisée en succès.

import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { getAccessContext } from '@/lib/security/assert-access'
import { createClient as createAdminClient } from '@/lib/supabase/admin'
import { initiateCinetPayPayment } from '@/lib/payments/cinetpay'
import { generatePaymentReference } from '@/lib/payments/orange-money'
import { rateLimit, clientKeyFromHeaders } from '@/lib/utils/rate-limit'

const bodySchema = z.object({
  phone: z.string().trim().min(8).max(40),
})

export async function POST(request: NextRequest) {
  const ip = clientKeyFromHeaders(request.headers)
  const limit = rateLimit(`partner-cert-pay:${ip}`, 5, 60_000)
  if (!limit.ok) {
    return NextResponse.json({ error: 'Trop de requêtes' }, { status: 429 })
  }

  const ctx = await getAccessContext()
  if (!ctx) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Numéro de téléphone requis' }, { status: 400 })
  }
  const { phone } = parsed.data

  const { data: certification } = await ctx.supabase
    .from('partner_certifications')
    .select('partner_id, training_completed_at, exam_passed_at, certified_at')
    .eq('user_id', ctx.userId)
    .maybeSingle<{
      partner_id: string | null
      training_completed_at: string | null
      exam_passed_at: string | null
      certified_at: string | null
    }>()

  if (!certification || !certification.partner_id) {
    return NextResponse.json(
      { error: 'Aucune candidature Opérateur en cours pour ce compte' },
      { status: 404 },
    )
  }
  if (certification.certified_at) {
    return NextResponse.json({ error: 'Certification déjà réglée' }, { status: 409 })
  }
  if (!certification.training_completed_at || !certification.exam_passed_at) {
    return NextResponse.json(
      { error: 'Formation et examen doivent être validés avant le paiement de la certification' },
      { status: 422 },
    )
  }

  const admin = createAdminClient()

  const { data: rule } = await admin
    .from('billing_rules')
    .select('price_xof')
    .eq('code', 'certification_fee')
    .eq('active', true)
    .is('effective_to', null)
    .maybeSingle<{ price_xof: number }>()

  if (!rule) {
    return NextResponse.json({ error: 'Tarif de certification indisponible' }, { status: 502 })
  }

  let reference = generatePaymentReference('CERT')
  for (let attempt = 0; attempt < 5; attempt++) {
    const { data: clash } = await admin
      .from('partner_payment_intents')
      .select('id')
      .eq('provider_reference', reference)
      .maybeSingle()
    if (!clash) break
    reference = generatePaymentReference('CERT')
  }

  const { data: intent, error: insertError } = await admin
    .from('partner_payment_intents')
    .insert({
      partner_id: certification.partner_id,
      purpose: 'certification',
      amount_fcfa: rule.price_xof,
      provider: 'cinetpay',
      provider_reference: reference,
      phone,
      created_by: ctx.userId,
    })
    .select('id')
    .single()

  if (insertError || !intent) {
    return NextResponse.json(
      { error: 'Création du paiement de certification impossible' },
      { status: 502 },
    )
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? ''
  const result = await initiateCinetPayPayment({
    transactionId: reference,
    amount: rule.price_xof,
    description: `Certification Opérateur FaîtiereHub — réf. ${reference}`,
    customerPhone: phone,
    notifyUrl: `${baseUrl}/api/partner/payments/cinetpay-callback`,
    returnUrl: `${baseUrl}/operator?certification=${reference}`,
  })

  if (!result.success) {
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
