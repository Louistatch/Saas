import { assertRole } from '@/lib/security/assert-access'
import { createClient as createAdminClient } from '@/lib/supabase/admin'
import { createLogger } from '@/lib/utils/logger'
import { type NextRequest, NextResponse } from 'next/server'

const log = createLogger('api:admin:fiches')

const PURCHASE_STATUSES = ['pending', 'completed', 'failed', 'refunded'] as const
const TOTALS_PAGE = 1000
const TOTALS_MAX_PAGES = 100

interface TotalsRow {
  amount: number | null
  fiche_id: string
  payment_status: string
}

export interface FicheSalesTotals {
  sales: number
  revenue: number
  refunded: number
}

/**
 * Totaux EXACTS des ventes : calculés sur tous les achats réglés et
 * remboursés (lus page par page, trois colonnes seulement), et non sur
 * l'échantillon des derniers achats affichés.
 */
async function salesTotals(admin: ReturnType<typeof createAdminClient>) {
  const totals: FicheSalesTotals = { sales: 0, revenue: 0, refunded: 0 }
  const byFiche: Record<string, FicheSalesTotals> = {}
  for (let page = 0; page < TOTALS_MAX_PAGES; page++) {
    const from = page * TOTALS_PAGE
    const { data, error } = await admin
      .from('purchases')
      .select('amount, fiche_id, payment_status')
      .in('payment_status', ['completed', 'refunded'])
      .order('id', { ascending: true })
      .range(from, from + TOTALS_PAGE - 1)
    if (error) {
      log.error('Sales totals read failed', error)
      return { totals, byFiche, complete: false }
    }
    const rows = (data ?? []) as TotalsRow[]
    for (const r of rows) {
      byFiche[r.fiche_id] ??= { sales: 0, revenue: 0, refunded: 0 }
      const f = byFiche[r.fiche_id] as FicheSalesTotals
      if (r.payment_status === 'completed') {
        totals.sales++
        totals.revenue += r.amount ?? 0
        f.sales++
        f.revenue += r.amount ?? 0
      } else {
        totals.refunded++
        f.refunded++
      }
    }
    if (rows.length < TOTALS_PAGE) return { totals, byFiche, complete: true }
  }
  log.warn('Sales totals truncated', { pages: TOTALS_MAX_PAGES })
  return { totals, byFiche, complete: false }
}

/**
 * GET /api/admin/fiches[?status=pending|completed|failed|refunded] — tous les
 * comptes d'exploitation (tous statuts), les derniers achats et les totaux de
 * ventes, pour l'écran super-admin. Lecture par le client de service, APRÈS
 * le contrôle super-admin (lu dans profiles par assertRole).
 */
export async function GET(request: NextRequest) {
  const guard = await assertRole('super_admin')
  if (!guard.ok) return guard.response

  const status = new URL(request.url).searchParams.get('status')
  if (status && !(PURCHASE_STATUSES as readonly string[]).includes(status))
    return NextResponse.json({ error: 'Statut inconnu' }, { status: 400 })

  const admin = createAdminClient()
  let purchasesQuery = admin
    .from('purchases')
    .select(
      'id, fiche_id, amount, payment_status, buyer_name, buyer_phone, buyer_email, user_id, provider_transaction_id, created_at, paid_at',
    )
    .order('created_at', { ascending: false })
    .limit(500)
  if (status) purchasesQuery = purchasesQuery.eq('payment_status', status)

  const [{ data: fiches }, { data: purchases }, sales] = await Promise.all([
    admin
      .from('fiches_techniques')
      .select(
        'id, title, description, culture, type_agriculture, campaign, price_non_member, is_free_for_members, status, files, download_count, cooperative_id, cover_url, region_id, prefecture_id, canton_id, created_at, cooperatives(name)',
      )
      .order('created_at', { ascending: false })
      .limit(500),
    purchasesQuery,
    salesTotals(admin),
  ])
  return NextResponse.json(
    {
      fiches: fiches ?? [],
      purchases: purchases ?? [],
      totals: { ...sales.totals, complete: sales.complete },
      totals_by_fiche: sales.byFiche,
    },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
