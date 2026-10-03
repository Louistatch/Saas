/**
 * GET /api/haroo/agronomes — annuaire public des agronomes CERTIFIÉS (profil
 * validé + carte active). Ni numéro de carte (la carte est personnelle) ni
 * téléphone : on passe par une demande de mission.
 */

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
  cantons: {
    name: string
    prefectures: { name: string; regions: { name: string } | null } | null
  } | null
}

export async function GET(request: NextRequest) {
  const limit = rateLimit(`agronomes:${clientKeyFromHeaders(request.headers)}`, 60, 60_000)
  if (!limit.ok) return NextResponse.json({ error: 'Trop de requêtes' }, { status: 429 })
  const admin = createAdminClient()
  const { data } = await admin
    .from('haroo_agronome_profiles')
    .select(
      'id, first_name, last_name, photo_url, specialisations, note_moyenne, nombre_missions, card_number, cantons(name, prefectures(name, regions(name)))',
    )
    .eq('badge_valide', true)
    .not('card_number', 'is', null)
    .returns<Row[]>()
  const rows = data ?? []
  const cards = rows.map((r) => r.card_number as string)
  const { data: active } = cards.length
    ? await admin
        .from('member_cards')
        .select('card_number')
        .in('card_number', cards)
        .eq('card_type', 'AGRONOME')
        .eq('status', 'active')
        .is('deleted_at', null)
    : { data: [] }
  const ok = new Set((active ?? []).map((c: { card_number: string }) => c.card_number))
  const agronomes = rows
    .filter((r) => ok.has(r.card_number as string))
    .map((r) => ({
      id: r.id,
      name: `${r.first_name ?? ''} ${r.last_name ?? ''}`.trim(),
      photo_url: r.photo_url,
      specialisations: r.specialisations ?? [],
      note_moyenne: Number(r.note_moyenne ?? 0),
      nombre_missions: r.nombre_missions ?? 0,
      canton: r.cantons?.name ?? null,
      prefecture: r.cantons?.prefectures?.name ?? null,
      region: r.cantons?.prefectures?.regions?.name ?? null,
    }))
  return NextResponse.json({ agronomes }, { headers: { 'Cache-Control': 'public, s-maxage=300' } })
}
