/**
 * Missions Haroo — décisions.
 *
 *   accept   (agronome) : carte active + PIN de la carte OBLIGATOIRES
 *   complete (agronome) : carte active + PIN de la carte OBLIGATOIRES
 *   refuse   (agronome) : demande refusée (motif facultatif)
 *   cancel   (demandeur): retire sa demande tant qu'elle n'est pas acceptée
 *   rate     (demandeur): avis 1–5 une fois la mission terminée
 *
 * L'identité vient de la session ; les écritures passent par le client
 * service_role APRÈS ces contrôles (aucune écriture directe ouverte en RLS).
 */

import {
  AGRONOME_PIN_ERRORS,
  activeAgronomeCard,
  agronomeFromCardPin,
  checkAgronomePin,
} from '@/lib/security/agronome-pin'
import { createClient as createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { clientKeyFromHeaders, rateLimit } from '@/lib/utils/rate-limit'
import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

const schema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('accept'),
    pin: z.string().trim(),
    card_number: z.string().trim().max(20).optional(),
  }),
  z.object({
    action: z.literal('complete'),
    pin: z.string().trim(),
    card_number: z.string().trim().max(20).optional(),
  }),
  z.object({
    action: z.literal('refuse'),
    reason: z.string().trim().max(300).optional(),
    pin: z.string().trim().optional(),
    card_number: z.string().trim().max(20).optional(),
  }),
  z.object({ action: z.literal('cancel') }),
  z.object({
    action: z.literal('rate'),
    rating: z.number().int().min(1).max(5),
    review: z.string().trim().max(500).optional(),
  }),
])

interface MissionRow {
  id: string
  agronome_id: string
  requester_user_id: string | null
  statut: string
  rating: number | null
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const limit = rateLimit(`mission-action:${clientKeyFromHeaders(request.headers)}`, 20, 60_000)
  if (!limit.ok) return NextResponse.json({ error: 'Trop de requêtes' }, { status: 429 })
  const { id } = await params
  if (!z.string().uuid().safeParse(id).success) {
    return NextResponse.json({ error: 'Mission introuvable' }, { status: 404 })
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const parsed = schema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Action invalide' }, { status: 400 })
  const body = parsed.data

  // Écran de la carte : le titulaire s'identifie par carte + PIN, sans compte.
  const viaCard = 'card_number' in body && body.card_number && 'pin' in body && body.pin
  let cardAgronomeId: string | null = null
  if (viaCard) {
    const auth = await agronomeFromCardPin(body.card_number as string, body.pin as string)
    if (!auth.ok) {
      return NextResponse.json(
        {
          error: AGRONOME_PIN_ERRORS[auth.reason] ?? 'PIN refusé',
          code: auth.reason,
          attempts_left: auth.attemptsLeft,
          retry_after_seconds: auth.retryAfterSeconds,
        },
        { status: auth.reason === 'locked' ? 423 : 403 },
      )
    }
    cardAgronomeId = auth.agronomeId
  } else if (!user) {
    return NextResponse.json({ error: 'Connectez-vous.' }, { status: 401 })
  }

  const admin = createAdminClient()
  const { data: mission } = await admin
    .from('haroo_missions')
    .select('id, agronome_id, requester_user_id, statut, rating')
    .eq('id', id)
    .maybeSingle<MissionRow>()
  if (!mission) return NextResponse.json({ error: 'Mission introuvable' }, { status: 404 })

  const { data: agronome } = await admin
    .from('haroo_agronome_profiles')
    .select('id, user_id')
    .eq('id', mission.agronome_id)
    .maybeSingle<{ id: string; user_id: string }>()
  const isAgronome = cardAgronomeId
    ? cardAgronomeId === mission.agronome_id
    : Boolean(user && agronome?.user_id === user.id)
  const isRequester = Boolean(user && mission.requester_user_id === user.id)
  const now = new Date().toISOString()

  const update = async (patch: Record<string, unknown>, expected: string) => {
    const { data, error } = await admin
      .from('haroo_missions')
      .update({ ...patch, updated_at: now })
      .eq('id', id)
      .eq('statut', expected)
      .select('id, statut')
      .maybeSingle()
    if (error || !data) {
      return NextResponse.json(
        { error: 'La mission a changé entre-temps. Actualisez.' },
        { status: 409 },
      )
    }
    return NextResponse.json({ success: true, statut: data.statut })
  }

  if (body.action === 'accept' || body.action === 'complete') {
    if (!isAgronome) return NextResponse.json({ error: 'Réservé à l’agronome' }, { status: 403 })
    if (!(await activeAgronomeCard(mission.agronome_id))) {
      return NextResponse.json(
        { error: AGRONOME_PIN_ERRORS.no_card, code: 'no_card' },
        { status: 403 },
      )
    }
    // Par la carte, le PIN vient d'être vérifié ; par le site, on le vérifie ici.
    const pin = cardAgronomeId
      ? ({ ok: true } as const)
      : await checkAgronomePin(mission.agronome_id, body.pin)
    if (!pin.ok) {
      return NextResponse.json(
        {
          error: AGRONOME_PIN_ERRORS[pin.reason] ?? 'PIN refusé',
          code: pin.reason,
          attempts_left: pin.attemptsLeft,
          retry_after_seconds: pin.retryAfterSeconds,
        },
        { status: pin.reason === 'locked' ? 423 : 403 },
      )
    }
    return body.action === 'accept'
      ? update({ statut: 'EN_COURS', accepted_at: now }, 'DEMANDE')
      : update({ statut: 'TERMINEE', completed_at: now }, 'EN_COURS')
  }

  if (body.action === 'refuse') {
    if (!isAgronome) return NextResponse.json({ error: 'Réservé à l’agronome' }, { status: 403 })
    return update(
      { statut: 'ANNULEE', cancel_reason: body.reason || 'Refusée par l’agronome' },
      'DEMANDE',
    )
  }

  if (body.action === 'cancel') {
    if (!isRequester) return NextResponse.json({ error: 'Réservé au demandeur' }, { status: 403 })
    return update({ statut: 'ANNULEE', cancel_reason: 'Retirée par le demandeur' }, 'DEMANDE')
  }

  // rate
  if (!isRequester) return NextResponse.json({ error: 'Réservé au demandeur' }, { status: 403 })
  if (mission.rating != null)
    return NextResponse.json({ error: 'Avis déjà donné' }, { status: 409 })
  return update({ rating: body.rating, review: body.review ?? null }, 'TERMINEE')
}
