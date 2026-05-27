import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createLogger } from '@/lib/utils/logger'
import { clientKeyFromHeaders, rateLimit } from '@/lib/utils/rate-limit'
import { applyRateLimit } from '@/lib/utils/rate-limit-persistent'
import { z } from 'zod'

const log = createLogger('api:marketplace')

/**
 * GET /api/marketplace
 * Public marketplace API for embeddable widgets and external consumers.
 * Returns available products with filtering.
 */
export async function GET(request: NextRequest) {
  // [SECURITY FIX - GHOST-003] Rate limiting persistant via Upstash (si configuré)
  const persistentBlock = await applyRateLimit(request, 'marketplace')
  if (persistentBlock) return persistentBlock

  const limit = rateLimit(`marketplace:${clientKeyFromHeaders(request.headers)}`, 120, 60_000)
  if (!limit.ok) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
  }

  const { searchParams } = new URL(request.url)
  const category = searchParams.get('category')
  const culture = searchParams.get('culture')
  const regionId = searchParams.get('region_id')
  const prefectureId = searchParams.get('prefecture_id')
  const cooperativeId = searchParams.get('cooperative_id')
  const search = searchParams.get('q')
  const page = parseInt(searchParams.get('page') ?? '1')
  const pageSize = Math.min(parseInt(searchParams.get('limit') ?? '20'), 50)

  try {
    const supabase = await createClient()

    let query = supabase
      .from('marketplace_products')
      .select(
        'id, name, description, category, culture, price, currency, unit, quantity_available, images, certification, season, producer_type, cooperative_id, created_at, cooperatives(name), regions(name), prefectures(name)',
        { count: 'exact' },
      )
      .eq('available', true)
      .order('created_at', { ascending: false })

    if (category) query = query.eq('category', category)
    if (culture) query = query.eq('culture', culture)
    if (regionId) query = query.eq('region_id', regionId)
    if (prefectureId) query = query.eq('prefecture_id', prefectureId)
    if (cooperativeId) query = query.eq('cooperative_id', cooperativeId)
    if (search) {
      // [SECURITY FIX - GHOST-002]
      // Valider et sanitiser le paramètre de recherche pour éviter l'injection PostgREST
      const searchSchema = z.string().min(1).max(100).trim()
      const parsed = searchSchema.safeParse(search)

      if (!parsed.success) {
        return NextResponse.json(
          { error: 'Invalid search parameter' },
          { status: 400 }
        )
      }

      // Échapper les caractères spéciaux ILIKE PostgreSQL et séparateurs PostgREST
      const sanitized = parsed.data
        .replace(/[%_\\]/g, '\\$&')  // Échapper wildcards ILIKE
        .replace(/[,()[\]]/g, '')    // Supprimer séparateurs PostgREST

      query = query.or(
        `name.ilike.%${sanitized}%,description.ilike.%${sanitized}%,culture.ilike.%${sanitized}%`
      )
    }

    const from = (page - 1) * pageSize
    query = query.range(from, from + pageSize - 1)

    const { data, error, count } = await query

    if (error) {
      log.error('Marketplace query error', error)
      return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
    }

    return NextResponse.json(
      { products: data ?? [], total: count ?? 0, page, pageSize },
      {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
          'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=120',
        },
      },
    )
  } catch (error) {
    log.error('Marketplace API error', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}

export function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400',
    },
  })
}
