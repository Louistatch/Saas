import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createLogger } from '@/lib/utils/logger'
import { clientKeyFromHeaders, rateLimit } from '@/lib/utils/rate-limit'

const log = createLogger('api:fiches')

/**
 * GET /api/fiches?culture=Maïs&canton_id=xxx&prefecture_id=xxx
 * Public catalog of published fiches techniques.
 * Returns metadata only (not file URLs — those require auth or purchase).
 */
export async function GET(request: NextRequest) {
  // Rate limit: 120 requests per minute per IP (generous for catalog browsing)
  const limit = rateLimit(`fiches-catalog:${clientKeyFromHeaders(request.headers)}`, 120, 60_000)
  if (!limit.ok) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
  }

  const { searchParams } = new URL(request.url)
  const culture = searchParams.get('culture')
  const cantonId = searchParams.get('canton_id')
  const prefectureId = searchParams.get('prefecture_id')
  const regionId = searchParams.get('region_id')
  const page = parseInt(searchParams.get('page') ?? '1')
  const pageSize = Math.min(parseInt(searchParams.get('limit') ?? '20'), 50)

  try {
    const supabase = await createClient()

    let query = supabase
      .from('fiches_techniques')
      .select(
        'id, title, description, culture, type_agriculture, campaign, price_non_member, currency, is_free_for_members, download_count, created_at, canton:cantons(id, name), prefecture:prefectures(id, name), region:regions(id, name)',
        { count: 'exact' },
      )
      .eq('status', 'published')
      .order('created_at', { ascending: false })

    // Filters
    if (culture) query = query.eq('culture', culture)
    if (cantonId) query = query.eq('canton_id', cantonId)
    if (prefectureId) query = query.eq('prefecture_id', prefectureId)
    if (regionId) query = query.eq('region_id', regionId)

    // Pagination
    const from = (page - 1) * pageSize
    query = query.range(from, from + pageSize - 1)

    const { data, error, count } = await query

    if (error) {
      log.error('Fiches query error', error)
      return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
    }

    return NextResponse.json({
      fiches: data ?? [],
      total: count ?? 0,
      page,
      pageSize,
    }, {
      headers: {
        'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
      },
    })
  } catch (error) {
    log.error('Fiches API error', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
