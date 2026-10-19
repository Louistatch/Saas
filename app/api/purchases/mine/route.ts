import { createClient as createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { createLogger } from '@/lib/utils/logger'
import { NextResponse } from 'next/server'

const log = createLogger('api:purchases:mine')

const COLS = 'id, fiche_id, amount, payment_status, access_granted, paid_at, created_at'
/** Les paiements en attente restent visibles une semaine (au-delà : rapprochés par le cron). */
const PENDING_DAYS = 7

interface MineRow {
  id: string
  fiche_id: string
  amount: number
  payment_status: string
  access_granted: boolean
  paid_at: string | null
  created_at: string
}

/** Échappe un e-mail pour une égalité insensible à la casse via ILIKE (sans joker). */
const ilikeExact = (s: string) => s.replace(/[\\%_]/g, '\\$&')

/**
 * GET /api/purchases/mine — achats du compte connecté, SaaS comme Haroo.
 *
 * Le filtre est EXPLICITE : l'achat est rattaché au compte (user_id), ou a été
 * fait avec l'e-mail de connexion du compte, et seulement si cet e-mail est
 * vérifié (auth.users, jamais profiles.email, modifiable par l'utilisateur).
 * Lu avec le client de session : la RLS (purchases_own_read) reste une
 * seconde barrière — et un super_admin ne voit ici que SES achats, pas toutes
 * les ventes (purchases_admin_all).
 */
export async function GET() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ purchases: [] }, { status: 401 })

  const statuses = ['completed', 'pending']
  const queries = [
    supabase
      .from('purchases')
      .select(COLS)
      .eq('user_id', user.id)
      .in('payment_status', statuses)
      .order('created_at', { ascending: false })
      .limit(100),
  ]
  const email = user.email?.trim().toLowerCase()
  if (email && user.email_confirmed_at) {
    queries.push(
      supabase
        .from('purchases')
        .select(COLS)
        .ilike('buyer_email', ilikeExact(email))
        .in('payment_status', statuses)
        .order('created_at', { ascending: false })
        .limit(100),
    )
  }
  const results = await Promise.all(queries)
  for (const r of results) if (r.error) log.error('Purchases read failed', r.error)

  const pendingSince = Date.now() - PENDING_DAYS * 86_400_000
  const byId = new Map<string, MineRow>()
  for (const r of results)
    for (const row of (r.data ?? []) as MineRow[]) {
      if (row.payment_status === 'pending' && new Date(row.created_at).getTime() < pendingSince)
        continue
      byId.set(row.id, row)
    }
  const rows = [...byId.values()]
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, 100)

  // Titres lus par le client de service : une fiche retirée de la vente
  // (archivée) garde son titre dans « Mes achats ».
  const ficheIds = [...new Set(rows.map((r) => r.fiche_id))]
  const titles = new Map<string, { title: string; culture: string | null }>()
  if (ficheIds.length > 0) {
    const { data: fiches } = await createAdminClient()
      .from('fiches_techniques')
      .select('id, title, culture')
      .in('id', ficheIds)
    for (const f of (fiches ?? []) as { id: string; title: string; culture: string | null }[])
      titles.set(f.id, { title: f.title, culture: f.culture })
  }

  return NextResponse.json(
    {
      purchases: rows.map((r) => ({
        ...r,
        status: r.payment_status,
        fiches_techniques: titles.get(r.fiche_id) ?? null,
      })),
    },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
