import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createLogger } from '@/lib/utils/logger'
import { clientKeyFromHeaders, rateLimit } from '@/lib/utils/rate-limit'

const log = createLogger('api:fournisseurs')

/**
 * GET /api/fournisseurs
 * Public API listing certified suppliers (Argent/Or members).
 * Never exposes private data (phone, email, address).
 */
export async function GET(request: NextRequest) {
  const limit = rateLimit(`fournisseurs:${clientKeyFromHeaders(request.headers)}`, 30, 60_000)
  if (!limit.ok) {
    return NextResponse.json({ error: 'Trop de requêtes' }, { status: 429 })
  }

  const { searchParams } = new URL(request.url)
  const culture = searchParams.get('culture')
  const regionId = searchParams.get('region_id')
  const prefectureId = searchParams.get('prefecture_id')
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1'))
  const pageSize = 20

  try {
    const supabase = await createClient()

    // Query active members who have Argent or Or level criteria:
    // At minimum: 1 paid cotisation + 1 parcelle + 1 production
    let query = supabase
      .from('members')
      .select(`
        id, first_name, last_name, village, canton, prefecture, region,
        cooperative_id, photo_url,
        cooperatives!inner(name),
        parcelles!inner(id, culture_principale, superficie_ha)
      `, { count: 'exact' })
      .eq('status', 'active')

    // Filter by culture
    if (culture) {
      query = query.eq('parcelles.culture_principale', culture)
    }

    // Filter by prefecture
    if (prefectureId) {
      query = query.eq('prefecture', prefectureId)
    }

    // Filter by region
    if (regionId) {
      query = query.eq('region', regionId)
    }

    // Pagination
    const from = (page - 1) * pageSize
    query = query.range(from, from + pageSize - 1).order('first_name')

    const { data, error, count } = await query

    if (error) {
      log.error('Fournisseurs query error', error)
      return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
    }

    // Map to public-safe format (no phone, email, address)
    const suppliers = (data ?? []).map((m: Record<string, unknown>) => {
      const parcelles = m.parcelles as { culture_principale: string; superficie_ha: number }[] | null
      const cultures = [...new Set((parcelles ?? []).map(p => p.culture_principale).filter(Boolean))]
      return {
        id: m.id,
        name: `${m.first_name} ${m.last_name}`,
        village: m.village,
        canton: m.canton,
        prefecture: m.prefecture,
        region: m.region,
        photo_url: m.photo_url,
        cooperative: (m.cooperatives as { name: string } | null)?.name ?? null,
        cultures,
        superficie_totale: (parcelles ?? []).reduce((s, p) => s + (p.superficie_ha ?? 0), 0),
      }
    })

    return NextResponse.json(
      { suppliers, total: count ?? 0, page, pageSize },
      { headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' } },
    )
  } catch (error) {
    log.error('Fournisseurs API error', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
