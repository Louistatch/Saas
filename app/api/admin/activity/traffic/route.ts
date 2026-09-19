import { assertRole } from '@/lib/security/assert-access'
import { createClient as createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'

/** Résumé du trafic (7 jours) : total, visiteurs uniques, pages les plus visitées. super_admin uniquement. */
export async function GET() {
  const guard = await assertRole('super_admin')
  if (!guard.ok) return guard.response

  const admin = createAdminClient()
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

  const { data: visits, count } = await admin
    .from('site_visits')
    .select('path, visitor_hash', { count: 'exact' })
    .gte('created_at', sevenDaysAgo)
    .limit(10000)

  const uniqueVisitors = new Set((visits ?? []).map((v) => v.visitor_hash)).size

  const countByPath = new Map<string, number>()
  for (const v of visits ?? []) {
    countByPath.set(v.path, (countByPath.get(v.path) ?? 0) + 1)
  }
  const topPages = [...countByPath.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([path, views]) => ({ path, views }))

  return NextResponse.json({
    total_visits_7d: count ?? 0,
    unique_visitors_7d: uniqueVisitors,
    top_pages: topPages,
  })
}
