/**
 * Missions de conseil Haroo — demandes.
 *
 * GET  : missions du compte connecté (demandeur) — « Mes demandes ».
 * POST : demander une mission à un agronome de l'annuaire. Compte
 *        requis (le demandeur est la session, jamais le corps de la requête).
 *        Seuls les agronomes VALIDÉS et porteurs d'une carte active peuvent
 *        recevoir une mission : sans carte, pas de mission.
 */

import { emailUser } from '@/lib/email/resend'
import { activeAgronomeCard } from '@/lib/security/agronome-pin'
import { createClient as createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { clientKeyFromHeaders, rateLimit } from '@/lib/utils/rate-limit'
import { type NextRequest, NextResponse, after } from 'next/server'
import { z } from 'zod'

const createSchema = z.object({
  // Annuaire : l'agronome est désigné par son identifiant (la carte, elle,
  // reste personnelle et n'est jamais affichée).
  agronome_id: z.string().uuid(),
  description: z.string().trim().min(10).max(1000),
  culture: z.string().trim().max(80).optional(),
  phone: z.string().trim().min(8).max(30),
  date_debut: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  budget_propose: z.number().int().positive().max(10_000_000).optional(),
})

export async function GET() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ missions: [] }, { status: 401 })
  const { data } = await supabase
    .from('haroo_missions')
    .select(
      'id, description, culture, statut, budget_propose, date_debut, created_at, accepted_at, completed_at, cancel_reason, rating, review, haroo_agronome_profiles(first_name, last_name, card_number)',
    )
    .eq('requester_user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(50)
  return NextResponse.json({ missions: data ?? [] }, { headers: { 'Cache-Control': 'no-store' } })
}

export async function POST(request: NextRequest) {
  const limit = rateLimit(
    `mission-request:${clientKeyFromHeaders(request.headers)}`,
    5,
    60 * 60_000,
  )
  if (!limit.ok)
    return NextResponse.json({ error: 'Trop de demandes. Réessayez plus tard.' }, { status: 429 })

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json(
      { error: 'Connectez-vous pour demander une mission.' },
      { status: 401 },
    )
  }

  const parsed = createSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Décrivez la mission (10 caractères minimum) et votre téléphone.' },
      { status: 400 },
    )
  }
  const body = parsed.data
  const admin = createAdminClient()
  const { data: agronome } = await admin
    .from('haroo_agronome_profiles')
    .select('id, user_id')
    .eq('id', body.agronome_id)
    .maybeSingle<{ id: string; user_id: string }>()
  if (!agronome || !(await activeAgronomeCard(agronome.id))) {
    return NextResponse.json(
      { error: 'Cet agronome n’a pas de carte active : il ne peut pas recevoir de mission.' },
      { status: 409 },
    )
  }
  if (agronome.user_id === user.id) {
    return NextResponse.json(
      { error: 'Vous ne pouvez pas vous demander une mission.' },
      { status: 400 },
    )
  }

  const { data: me } = await supabase
    .from('profiles')
    .select('first_name, last_name')
    .eq('id', user.id)
    .maybeSingle<{ first_name: string | null; last_name: string | null }>()
  const requesterName = `${me?.first_name ?? ''} ${me?.last_name ?? ''}`.trim() || 'Exploitant'

  const { data, error } = await admin
    .from('haroo_missions')
    .insert({
      agronome_id: agronome.id,
      requester_user_id: user.id,
      requester_phone: body.phone,
      exploitant_name: requesterName,
      description: body.description,
      culture: body.culture ?? null,
      date_debut: body.date_debut ?? null,
      budget_propose: body.budget_propose ?? null,
      statut: 'DEMANDE',
    })
    .select('id')
    .single()
  if (error)
    return NextResponse.json({ error: 'Demande impossible pour le moment.' }, { status: 502 })
  // Prévenir l'agronome (après la réponse : ne ralentit ni ne bloque la demande).
  after(() =>
    emailUser(agronome.user_id, 'Nouvelle demande de mission', {
      title: 'Vous avez une nouvelle demande de mission',
      lines: [
        `${requesterName} vous demande une mission${body.culture ? ` (${body.culture})` : ''}.`,
        `« ${body.description.slice(0, 300)} »`,
        'Acceptez-la depuis votre espace Haroo avec le code PIN de votre carte.',
      ],
      cta: { label: 'Voir la demande', path: '/haroo' },
    }),
  )
  return NextResponse.json({ id: data.id, message: 'Demande envoyée à l’agronome.' })
}
