/**
 * POST /api/haroo/missions/take
 *   { announcement_id, pin }                       — depuis le site (session)
 *   { announcement_id, pin, card_number }          — depuis l'écran de la carte
 *
 * L'agronome prend une annonce « mission » du Marché de proximité. Carte
 * active et PIN de la carte OBLIGATOIRES, vérifiés ici.
 */

import { marketMissionsFor, takeMarketMission } from '@/lib/haroo/missions'
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

const schema = z.object({
  announcement_id: z.string().uuid(),
  pin: z.string().trim().max(6),
  card_number: z.string().trim().max(20).optional(),
})

/** GET : missions du marché proches de l'agronome connecté (site). */
export async function GET() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ announcements: [] }, { status: 401 })
  const { data: ag } = await createAdminClient()
    .from('haroo_agronome_profiles')
    .select('id')
    .eq('user_id', user.id)
    .maybeSingle<{ id: string }>()
  if (!ag) return NextResponse.json({ announcements: [] })
  return NextResponse.json(
    { announcements: await marketMissionsFor(ag.id) },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}

export async function POST(request: NextRequest) {
  const limit = rateLimit(`mission-take:${clientKeyFromHeaders(request.headers)}`, 15, 60_000)
  if (!limit.ok) return NextResponse.json({ error: 'Trop de requêtes' }, { status: 429 })
  const parsed = schema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Données invalides' }, { status: 400 })
  const body = parsed.data

  let agronomeId: string | null = null
  if (body.card_number) {
    const auth = await agronomeFromCardPin(body.card_number, body.pin)
    if (!auth.ok) {
      return NextResponse.json(
        {
          error: AGRONOME_PIN_ERRORS[auth.reason] ?? 'PIN refusé',
          code: auth.reason,
          attempts_left: auth.attemptsLeft,
        },
        { status: auth.reason === 'locked' ? 423 : 403 },
      )
    }
    agronomeId = auth.agronomeId
  } else {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Connectez-vous.' }, { status: 401 })
    const { data: ag } = await createAdminClient()
      .from('haroo_agronome_profiles')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle<{ id: string }>()
    if (!ag) return NextResponse.json({ error: 'Réservé aux agronomes' }, { status: 403 })
    const pin = await checkAgronomePin(ag.id, body.pin)
    if (!pin.ok) {
      return NextResponse.json(
        {
          error: AGRONOME_PIN_ERRORS[pin.reason] ?? 'PIN refusé',
          code: pin.reason,
          attempts_left: pin.attemptsLeft,
        },
        { status: pin.reason === 'locked' ? 423 : 403 },
      )
    }
    agronomeId = ag.id
  }

  if (!(await activeAgronomeCard(agronomeId))) {
    return NextResponse.json(
      { error: AGRONOME_PIN_ERRORS.no_card, code: 'no_card' },
      { status: 403 },
    )
  }
  const taken = await takeMarketMission(agronomeId, body.announcement_id)
  if (!taken.ok) return NextResponse.json({ error: taken.error }, { status: taken.status })
  return NextResponse.json({ success: true, mission_id: taken.missionId })
}
