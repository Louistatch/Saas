// Paiement des frais de certification Opérateur (15 000 XOF, §9 du plan), par FedaPay.
//
// Gardé sur la formation ET l'évaluation pratique réussies : la formation pose
// training_completed_at (12 leçons validées), l'équipe pose exam_passed_at
// (évaluation sur le terrain). La certification n'est enregistrée qu'après relecture
// de la transaction auprès de FedaPay (lib/partners/certification-payment.ts).

import { startCertificationPayment } from '@/lib/partners/certification-payment'
import { isFedaPayConfigured } from '@/lib/payments/fedapay'
import { getAccessContext } from '@/lib/security/assert-access'
import { createClient as createAdminClient } from '@/lib/supabase/admin'
import { clientKeyFromHeaders, rateLimit } from '@/lib/utils/rate-limit'
import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

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
  // Les frais de certification sont la formation PAYG (15 000 FCFA) : une personne qui a déjà
  // réglé des tranches ne paie que le reste, et un agent dont l'institution paie ne paie rien.
  const { data: account } = await admin
    .from('training_fee_accounts')
    .select('total_fcfa, paid_fcfa, payer')
    .eq('user_id', ctx.userId)
    .maybeSingle<{ total_fcfa: number; paid_fcfa: number; payer: 'self' | 'institution' }>()
  if (account?.payer === 'institution') {
    return NextResponse.json(
      { error: 'Votre institution règle votre formation : vous n’avez rien à payer.' },
      { status: 403 },
    )
  }
  const amount = account ? account.total_fcfa - account.paid_fcfa : rule.price_xof
  if (amount <= 0) {
    return NextResponse.json({ error: 'Frais de formation déjà réglés' }, { status: 409 })
  }
  if (!isFedaPayConfigured()) {
    return NextResponse.json(
      { error: 'Le paiement en ligne n’est pas encore ouvert. Écrivez à l’équipe FaîtiereHub.' },
      { status: 503 },
    )
  }

  const { data: profile } = await admin
    .from('profiles')
    .select('first_name, last_name, email')
    .eq('id', ctx.userId)
    .maybeSingle<{ first_name: string | null; last_name: string | null; email: string | null }>()
  const name = [profile?.first_name, profile?.last_name].filter(Boolean).join(' ') || 'Opérateur'

  const result = await startCertificationPayment({
    partnerId: certification.partner_id,
    userId: ctx.userId,
    amount,
    phone,
    customer: { name, email: profile?.email ?? null },
    appUrl: (process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin).replace(/\/$/, ''),
  })
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 502 })

  return NextResponse.json({ success: true, payment_url: result.url, reference: result.intentId })
}
