/**
 * POST /api/haroo/card-missions { card_number, pin }
 *
 * « Mes missions » sur l'écran de la carte agronome : le titulaire saisit le
 * PIN de sa carte (pas de compte, pas de mot de passe). Mêmes missions que
 * l'espace /haroo du site — une seule source.
 */

import { marketMissionsFor } from '@/lib/haroo/missions'
import { AGRONOME_PIN_ERRORS, agronomeFromCardPin } from '@/lib/security/agronome-pin'
import { createClient as createAdminClient } from '@/lib/supabase/admin'
import { clientKeyFromHeaders, rateLimit } from '@/lib/utils/rate-limit'
import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

const schema = z.object({ card_number: z.string().trim().max(20), pin: z.string().trim().max(6) })

export async function POST(request: NextRequest) {
  const limit = rateLimit(`card-missions:${clientKeyFromHeaders(request.headers)}`, 15, 60_000)
  if (!limit.ok) return NextResponse.json({ error: 'Trop de requêtes' }, { status: 429 })
  const parsed = schema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Données invalides' }, { status: 400 })

  const auth = await agronomeFromCardPin(parsed.data.card_number, parsed.data.pin)
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

  const { data } = await createAdminClient()
    .from('haroo_missions')
    .select(
      'id, description, statut, budget_propose, date_debut, date_fin, exploitant_name, culture, requester_phone, rating, review, created_at',
    )
    .eq('agronome_id', auth.agronomeId)
    .order('created_at', { ascending: false })
    .limit(30)
  // Annonces « mission » du Marché de proximité, les plus proches d'abord.
  const market = await marketMissionsFor(auth.agronomeId).catch(() => [])
  return NextResponse.json(
    { missions: data ?? [], market },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
