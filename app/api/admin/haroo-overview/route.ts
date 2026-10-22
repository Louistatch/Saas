// Centre de pilotage, section Haroo : inscrits, cartes et activité. Lecture seule, service_role
// après la garde super_admin. Ni téléphone ni e-mail dans la réponse.
import { type CardRow, type ProfileRow, summarizeHaroo } from '@/lib/admin/haroo-overview'
import { assertRole } from '@/lib/security/assert-access'
import { createClient as createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

const LIMIT = 1000
const BASE = 'user_id, first_name, last_name, card_number, created_at'

export async function GET() {
  const guard = await assertRole('super_admin')
  if (!guard.ok) return guard.response
  const db = createAdminClient()
  const head = { count: 'exact' as const, head: true }

  const [ouvriers, acheteurs, agronomes, missions, jobs, presales, announcements] =
    await Promise.all([
      db.from('haroo_ouvrier_profiles').select(`${BASE}, disponible`).limit(LIMIT),
      db.from('haroo_acheteur_profiles').select(`${BASE}, type_acheteur`).limit(LIMIT),
      db
        .from('haroo_agronome_profiles')
        .select(`${BASE}, statut_validation, profession, faitiere_id`)
        .limit(LIMIT),
      db.from('haroo_missions').select('statut, accepted_at, created_at').limit(LIMIT),
      db.from('haroo_jobs').select('id', head).eq('statut', 'OUVERTE'),
      db.from('haroo_presales').select('id', head).eq('statut', 'DISPONIBLE'),
      db.from('producer_announcements').select('type').eq('status', 'active').limit(LIMIT),
    ])

  const failed = [ouvriers, acheteurs, agronomes, missions, jobs, presales, announcements].find(
    (r) => r.error,
  )
  if (failed?.error) {
    console.error('[admin/haroo-overview]', failed.error.message)
    return NextResponse.json(
      { error: 'Les données Haroo n’ont pas pu être lues.' },
      { status: 503 },
    )
  }

  const rows = {
    ouvriers: (ouvriers.data ?? []) as ProfileRow[],
    acheteurs: (acheteurs.data ?? []) as ProfileRow[],
    agronomes: (agronomes.data ?? []) as ProfileRow[],
  }
  const all = [...rows.ouvriers, ...rows.acheteurs, ...rows.agronomes]
  const userIds = [...new Set(all.map((r) => r.user_id))]
  const cardNumbers = [...new Set(all.map((r) => r.card_number).filter((n): n is string => !!n))]
  const faitiereIds = [
    ...new Set(rows.agronomes.map((r) => r.faitiere_id).filter((id): id is string => !!id)),
  ]

  const [demo, cards, faitieres] = await Promise.all([
    userIds.length
      ? db.from('profiles').select('id').eq('is_demo', true).in('id', userIds)
      : Promise.resolve({ data: [], error: null }),
    cardNumbers.length
      ? db
          .from('member_cards')
          .select('card_number, status, expiry_date, revoked_at, created_at')
          .in('card_number', cardNumbers)
      : Promise.resolve({ data: [], error: null }),
    faitiereIds.length
      ? db.from('cooperatives').select('id, name').in('id', faitiereIds)
      : Promise.resolve({ data: [], error: null }),
  ])
  if (demo.error || cards.error || faitieres.error) {
    console.error('[admin/haroo-overview]', (demo.error ?? cards.error ?? faitieres.error)?.message)
    return NextResponse.json(
      { error: 'Les données Haroo n’ont pas pu être lues.' },
      { status: 503 },
    )
  }

  const overview = summarizeHaroo({
    ...rows,
    demoUserIds: new Set(((demo.data ?? []) as { id: string }[]).map((p) => p.id)),
    cards: (cards.data ?? []) as CardRow[],
    faitieres: new Map(
      ((faitieres.data ?? []) as { id: string; name: string }[]).map((c) => [c.id, c.name]),
    ),
    missions: (missions.data ?? []) as {
      statut: string | null
      accepted_at: string | null
      created_at: string | null
    }[],
    jobsOpen: jobs.count ?? 0,
    presalesOpen: presales.count ?? 0,
    announcements: (announcements.data ?? []) as { type: string | null }[],
  })

  return NextResponse.json(overview, { headers: { 'Cache-Control': 'no-store' } })
}
