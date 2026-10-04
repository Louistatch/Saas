// Administration des cartes professionnelles Haroo (super_admin uniquement).
//
// POST { action: 'issue', profile_type, profile_id }
//   → génère un numéro unique (OUV-/ACH-/AGR-NNNNNN), insère la carte dans
//     member_cards (card_type Haroo, sans coopérative ni membre) et reporte
//     le numéro sur le profil. Les agronomes doivent être validés avant.
//
// POST { action: 'validate_agronome', profile_id, decision }
//   → VALIDE (badge accordé) ou REJETE.
//
// La carte émise est immédiatement vérifiable par QR via le flux existant
// (/api/verify/[card] → AgriTogo /api/v1/haroo/verify/[card]).

import { emailUser } from '@/lib/email/resend'
import { issueAgronomePin } from '@/lib/security/agronome-pin'
import { assertRole } from '@/lib/security/assert-access'
import { generateUniqueCardNumber } from '@/lib/utils/card-number'
import { clientKeyFromHeaders, rateLimit } from '@/lib/utils/rate-limit'
import { type NextRequest, NextResponse, after } from 'next/server'
import { z } from 'zod'

const PROFILE_META = {
  OUVRIER: { table: 'haroo_ouvrier_profiles', prefix: 'OUV' },
  ACHETEUR: { table: 'haroo_acheteur_profiles', prefix: 'ACH' },
  AGRONOME: { table: 'haroo_agronome_profiles', prefix: 'AGR' },
} as const

const CARD_VALIDITY_DAYS = 730 // 2 ans, comme les cartes FAITIERE par défaut

const bodySchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('issue'),
    profile_type: z.enum(['OUVRIER', 'ACHETEUR', 'AGRONOME']),
    profile_id: z.string().uuid(),
  }),
  z.object({
    action: z.literal('issue_agronome_pin'),
    profile_id: z.string().uuid(),
  }),
  z.object({
    action: z.literal('validate_agronome'),
    profile_id: z.string().uuid(),
    decision: z.enum(['VALIDE', 'REJETE']),
  }),
])

export async function POST(request: NextRequest) {
  const ip = clientKeyFromHeaders(request.headers)
  const limit = rateLimit(`haroo-cards-admin:${ip}`, 30, 60_000)
  if (!limit.ok) {
    return NextResponse.json({ error: 'Trop de requêtes' }, { status: 429 })
  }

  const auth = await assertRole('super_admin')
  if (!auth.ok) return auth.response
  const { supabase } = auth.ctx

  const raw: unknown = await request.json().catch(() => null)
  const parsed = bodySchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Données invalides' }, { status: 400 })
  }
  const body = parsed.data

  // ── PIN de la carte agronome ────────────────────────────────────────────────
  // Le PIN en clair n'est renvoyé QU'ICI, une fois : à remettre avec la carte.
  // Il est demandé pour accepter et pour terminer une mission.
  if (body.action === 'issue_agronome_pin') {
    const issued = await issueAgronomePin(body.profile_id, auth.ctx.userId)
    if (!issued.ok) {
      const message =
        issued.reason === 'no_card'
          ? 'Émettez d’abord la carte (agronome validé).'
          : issued.reason === 'not_configured'
            ? 'CARD_AUTH_SECRET non configuré.'
            : 'Émission du PIN impossible.'
      return NextResponse.json(
        { error: message },
        { status: issued.reason === 'no_card' ? 409 : 500 },
      )
    }
    return NextResponse.json({ success: true, pin: issued.pin, card_number: issued.cardNumber })
  }

  // ── Validation d'un agronome ────────────────────────────────────────────────
  if (body.action === 'validate_agronome') {
    const { data, error } = await supabase
      .from('haroo_agronome_profiles')
      .update({
        statut_validation: body.decision,
        badge_valide: body.decision === 'VALIDE',
        updated_at: new Date().toISOString(),
      })
      .eq('id', body.profile_id)
      .select('user_id')
      .maybeSingle<{ user_id: string }>()
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    const validated = body.decision === 'VALIDE'
    after(() =>
      emailUser(
        data?.user_id,
        validated ? 'Votre profil agronome est validé' : 'Votre profil agronome n’a pas été validé',
        validated
          ? {
              title: 'Votre profil agronome est validé',
              lines: [
                'Félicitations : FaîtiereHub a validé votre profil d’agronome.',
                'Votre carte professionnelle va être émise. Elle vous permettra de recevoir et d’accepter des missions avec votre code PIN.',
              ],
              cta: { label: 'Ouvrir mon espace', path: '/haroo' },
            }
          : {
              title: 'Votre profil agronome n’a pas été validé',
              lines: [
                'Votre profil d’agronome n’a pas pu être validé pour le moment.',
                'Complétez votre profil (spécialisations, zone) puis contactez-nous pour une nouvelle vérification.',
              ],
              cta: { label: 'Compléter mon profil', path: '/compte' },
            },
      ),
    )
    return NextResponse.json({ success: true, decision: body.decision })
  }

  // ── Émission d'une carte ────────────────────────────────────────────────────
  const meta = PROFILE_META[body.profile_type]

  const { data: profile, error: profileError } = await supabase
    .from(meta.table)
    .select('id, user_id, card_number, first_name, last_name, statut_validation')
    .eq('id', body.profile_id)
    .maybeSingle<{
      id: string
      user_id: string | null
      card_number: string | null
      first_name: string
      last_name: string
      statut_validation?: string
    }>()

  if (profileError || !profile) {
    return NextResponse.json({ error: 'Profil introuvable' }, { status: 404 })
  }
  if (profile.card_number) {
    return NextResponse.json(
      { error: `Une carte existe déjà : ${profile.card_number}` },
      { status: 409 },
    )
  }
  if (body.profile_type === 'AGRONOME' && profile.statut_validation !== 'VALIDE') {
    return NextResponse.json(
      { error: "Le profil agronome doit être validé avant l'émission de la carte" },
      { status: 409 },
    )
  }

  const cardNumber = await generateUniqueCardNumber(supabase, meta.prefix)

  const expiry = new Date()
  expiry.setDate(expiry.getDate() + CARD_VALIDITY_DAYS)

  const { error: cardError } = await supabase.from('member_cards').insert({
    card_number: cardNumber,
    card_type: body.profile_type,
    status: 'active',
    expiry_date: expiry.toISOString().split('T')[0],
    cooperative_id: null,
    member_id: null,
  })
  if (cardError) {
    return NextResponse.json({ error: cardError.message }, { status: 500 })
  }

  const { error: linkError } = await supabase
    .from(meta.table)
    .update({ card_number: cardNumber, updated_at: new Date().toISOString() })
    .eq('id', body.profile_id)
  if (linkError) {
    // Ne pas laisser une carte orpheline si le report sur le profil échoue.
    await supabase.from('member_cards').delete().eq('card_number', cardNumber)
    return NextResponse.json({ error: linkError.message }, { status: 500 })
  }

  after(() =>
    emailUser(profile.user_id, 'Votre carte professionnelle Haroo est prête', {
      title: 'Votre carte professionnelle Haroo est prête',
      lines: [
        `Bonjour ${profile.first_name}, votre carte professionnelle a été émise.`,
        `Elle est valable jusqu’au ${expiry.toLocaleDateString('fr-FR')}.`,
        'Elle est personnelle : ne la confiez à personne.',
      ],
      cta: { label: 'Voir ma carte', path: '/haroo' },
    }),
  )

  return NextResponse.json({
    success: true,
    card_number: cardNumber,
    expiry_date: expiry.toISOString().split('T')[0],
  })
}
