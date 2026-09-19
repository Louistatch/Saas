import { assertRole } from '@/lib/security/assert-access'
import { createClient as createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'

/**
 * Résumé du trafic (7 jours) : total, visiteurs uniques (par cookie fh_vid,
 * repli sur visitor_hash pour les visiteurs sans cookie), nouveaux vs
 * revenants, pages les plus visitées, répartition par pays. super_admin
 * uniquement.
 */
export async function GET() {
  const guard = await assertRole('super_admin')
  if (!guard.ok) return guard.response

  const admin = createAdminClient()
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

  const { data: visits, count } = await admin
    .from('site_visits')
    .select('path, visitor_id, visitor_hash, is_new_visitor, country', { count: 'exact' })
    .gte('created_at', sevenDaysAgo)
    .limit(10000)

  const rows = visits ?? []
  const identityOf = (v: (typeof rows)[number]) => v.visitor_id ?? v.visitor_hash

  const uniqueVisitors = new Set(rows.map(identityOf)).size
  const newVisitors = new Set(rows.filter((v) => v.is_new_visitor).map(identityOf)).size

  const countByPath = new Map<string, number>()
  for (const v of rows) countByPath.set(v.path, (countByPath.get(v.path) ?? 0) + 1)
  const topPages = [...countByPath.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([path, views]) => ({ path, views }))

  const countByCountry = new Map<string, number>()
  for (const v of rows) {
    if (!v.country) continue
    countByCountry.set(v.country, (countByCountry.get(v.country) ?? 0) + 1)
  }
  const topCountries = [...countByCountry.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([country, views]) => ({ country, views }))

  return NextResponse.json({
    total_visits_7d: count ?? 0,
    unique_visitors_7d: uniqueVisitors,
    new_visitors_7d: newVisitors,
    returning_visitors_7d: uniqueVisitors - newVisitors,
    top_pages: topPages,
    top_countries: topCountries,
  })
}
