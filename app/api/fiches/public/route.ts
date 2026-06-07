import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createLogger } from '@/lib/utils/logger'
import { clientKeyFromHeaders, rateLimit } from '@/lib/utils/rate-limit'
import { applyRateLimit } from '@/lib/utils/rate-limit-persistent'
import { z } from 'zod'

const log = createLogger('api:fiches:public')

/**
 * GET /api/fiches/public
 *
 * Public endpoint listing PUBLISHED fiches techniques (comptes d'exploitation).
 * Used by the public marketplace page to show available fiches with filters.
 *
 * Query params:
 *   - q (search)
 *   - culture
 *   - type_agriculture
 *   - region_id, prefecture_id, canton_id
 *   - cooperative_id
 *   - page (default 1)
 *   - limit (default 20, max 50)
 *
 * Returns: { fiches, total, page, pageSize }
 *
 * Security:
 *   - Rate limited (120 req/min/IP)
 *   - Only returns status='published'
 *   - Files URLs are storage paths (not signed) — full download requires
 *     POST /api/fiches/[id]/access with card_number or purchase_id
 */
export async function GET(request: NextRequest) {
  const persistentBlock = await applyRateLimit(request, 'marketplace')
  if (persistentBlock) return persistentBlock

  const limit = rateLimit(`fiches-public:${clientKeyFromHeaders(request.headers)}`, 120, 60_000)
  if (!limit.ok) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
  }

  const { searchParams } = new URL(request.url)
  const culture = searchParams.get('culture')
  const typeAgriculture = searchParams.get('type_agriculture')
  const cantonId = searchParams.get('canton_id')
  const prefectureId = searchParams.get('prefecture_id')
  const regionId = searchParams.get('region_id')
  const cooperativeId = searchParams.get('cooperative_id')
  const search = searchParams.get('q')
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1'))
  const pageSize = Math.min(parseInt(searchParams.get('limit') ?? '20'), 50)

  try {
    const supabase = await createClient()

    let query = supabase
      .from('fiches_techniques')
      .select(
        `id, title, description, culture, type_agriculture, campaign,
         price_non_member, is_free_for_members, download_count, created_at, cooperative_id,
         cooperatives(name, faitiere_name),
         region:region_id(id, name), prefecture:prefecture_id(id, name), canton:canton_id(id, name)`,
        { count: 'exact' },
      )
      .eq('status', 'published')
      .order('created_at', { ascending: false })

    if (culture) query = query.eq('culture', culture)
    if (typeAgriculture) query = query.eq('type_agriculture', typeAgriculture)
    if (cantonId) query = query.eq('canton_id', cantonId)
    if (prefectureId) query = query.eq('prefecture_id', prefectureId)
    if (regionId) query = query.eq('region_id', regionId)
    if (cooperativeId) query = query.eq('cooperative_id', cooperativeId)

    if (search) {
      const searchSchema = z.string().min(1).max(100).trim()
      const parsed = searchSchema.safeParse(search)
      if (!parsed.success) {
        return NextResponse.json({ error: 'Invalid search parameter' }, { status: 400 })
      }
      // Escape ILIKE wildcards and PostgREST separators
      const sanitized = parsed.data
        .replace(/[%_\\]/g, '\\$&')
        .replace(/[,()[\]]/g, '')
      query = query.or(
        `title.ilike.%${sanitized}%,description.ilike.%${sanitized}%,culture.ilike.%${sanitized}%`,
      )
    }

    const from = (page - 1) * pageSize
    query = query.range(from, from + pageSize - 1)

    const { data, error, count } = await query

    if (error) {
      log.error('Public fiches query error', error)
      return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
    }

    return NextResponse.json(
      { fiches: data ?? [], total: count ?? 0, page, pageSize },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=120',
        },
      },
    )
  } catch (error) {
    log.error('Public fiches API error', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
