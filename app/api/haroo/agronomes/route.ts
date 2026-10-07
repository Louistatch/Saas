/**
 * GET /api/haroo/agronomes[?profession=agronome|technicien|conseiller]
 *
 * Annuaire public du conseil agricole CERTIFIÉ : agronomes, techniciens et
 * conseillers dont le profil est validé ET la carte active (ni suspendue, ni
 * révoquée, ni expirée). Ni numéro de carte (la carte est personnelle) ni
 * téléphone : on passe par une demande de mission.
 */

import {
  PROFESSIONS,
  computeCardStatus,
  normalizeProfession,
  professionLabel,
} from '@/lib/professionals/core'
import { createClient as createAdminClient } from '@/lib/supabase/admin'
import { clientKeyFromHeaders, rateLimit } from '@/lib/utils/rate-limit'
import { type NextRequest, NextResponse } from 'next/server'

interface Row {
  id: string
  first_name: string | null
  last_name: string | null
  photo_url: string | null
  specialisations: string[] | null
  note_moyenne: number | null
  nombre_missions: number | null
  card_number: string | null
  profession: string | null
  cantons: {
    name: string
    prefectures: { name: string; regions: { name: string } | null } | null
  } | null
}

interface CardRow {
  card_number: string
  status: string
  expiry_date: string | null
  revoked_at: string | null
  suspended_at: string | null
}

export async function GET(request: NextRequest) {
  const limit = rateLimit(`agronomes:${clientKeyFromHeaders(request.headers)}`, 60, 60_000)
  if (!limit.ok) return NextResponse.json({ error: 'Trop de requêtes' }, { status: 429 })

  const requested = request.nextUrl.searchParams.get('profession')
  if (requested && !(PROFESSIONS as readonly string[]).includes(requested)) {
    return NextResponse.json({ error: 'Profession inconnue' }, { status: 400 })
  }

  const admin = createAdminClient()
  let query = admin
    .from('haroo_agronome_profiles')
    .select(
      'id, first_name, last_name, photo_url, specialisations, note_moyenne, nombre_missions, card_number, profession, cantons(name, prefectures(name, regions(name)))',
    )
    .eq('badge_valide', true)
    .eq('statut_validation', 'VALIDE')
    .not('card_number', 'is', null)
  if (requested) query = query.eq('profession', requested)
  const { data } = await query.returns<Row[]>()
  const rows = data ?? []
  const cards = rows.map((r) => r.card_number as string)
  const { data: cardRows } = cards.length
    ? await admin
        .from('member_cards')
        .select('card_number, status, expiry_date, revoked_at, suspended_at')
        .in('card_number', cards)
        .eq('card_type', 'AGRONOME')
        .is('deleted_at', null)
        .returns<CardRow[]>()
    : { data: [] as CardRow[] }
  const ok = new Set(
    (cardRows ?? []).filter((c) => computeCardStatus(c) === 'ACTIVE').map((c) => c.card_number),
  )
  const agronomes = rows
    .filter((r) => ok.has(r.card_number as string))
    .map((r) => ({
      id: r.id,
      name: `${r.first_name ?? ''} ${r.last_name ?? ''}`.trim(),
      photo_url: r.photo_url,
      profession: normalizeProfession(r.profession),
      profession_label: professionLabel('AGRONOME', r.profession),
      specialisations: r.specialisations ?? [],
      note_moyenne: Number(r.note_moyenne ?? 0),
      nombre_missions: r.nombre_missions ?? 0,
      canton: r.cantons?.name ?? null,
      prefecture: r.cantons?.prefectures?.name ?? null,
      region: r.cantons?.prefectures?.regions?.name ?? null,
    }))
  return NextResponse.json({ agronomes }, { headers: { 'Cache-Control': 'public, s-maxage=300' } })
}
