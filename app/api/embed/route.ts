import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createLogger } from '@/lib/utils/logger'
import { clientKeyFromHeaders, rateLimit } from '@/lib/utils/rate-limit'

const log = createLogger('api:embed')

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Embed-Token',
  'Access-Control-Max-Age': '86400',
} as const

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS })
}

/**
 * GET /api/embed?cooperative_id=xxx&widget=marketplace|member_verify|fiches|dashboard
 * 
 * Public embed API that returns data for embeddable widgets.
 * Validates origin against allowed_origins in embed_configs.
 */
export async function GET(request: NextRequest) {
  const limit = rateLimit(`embed:${clientKeyFromHeaders(request.headers)}`, 60, 60_000)
  if (!limit.ok) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429, headers: CORS_HEADERS })
  }

  const { searchParams } = new URL(request.url)
  const cooperativeId = searchParams.get('cooperative_id')
  const widget = searchParams.get('widget') ?? 'marketplace'

  if (!cooperativeId) {
    return NextResponse.json({ error: 'cooperative_id required' }, { status: 400, headers: CORS_HEADERS })
  }

  try {
    const supabase = await createClient()

    // Get embed config
    const { data: config } = await supabase
      .from('embed_configs')
      .select('*')
      .eq('cooperative_id', cooperativeId)
      .eq('enabled', true)
      .single()

    if (!config) {
      return NextResponse.json(
        { error: 'Embed not configured for this cooperative' },
        { status: 404, headers: CORS_HEADERS },
      )
    }

    // Validate origin if allowed_origins is set
    const origin = request.headers.get('origin')
    if (config.allowed_origins && config.allowed_origins.length > 0 && origin) {
      const allowed = config.allowed_origins.some((o: string) =>
        o === '*' || origin.includes(o),
      )
      if (!allowed) {
        return NextResponse.json(
          { error: 'Origin not allowed' },
          { status: 403, headers: CORS_HEADERS },
        )
      }
    }

    // Check widget is enabled
    if (config.widgets && !config.widgets.includes(widget)) {
      return NextResponse.json(
        { error: `Widget "${widget}" not enabled` },
        { status: 403, headers: CORS_HEADERS },
      )
    }

    // Get cooperative info
    const { data: coop } = await supabase
      .from('cooperatives')
      .select('id, name, description, logo_url, primary_color, faitiere_name')
      .eq('id', cooperativeId)
      .single()

    if (!coop) {
      return NextResponse.json({ error: 'Cooperative not found' }, { status: 404, headers: CORS_HEADERS })
    }

    // Widget-specific data
    let widgetData: Record<string, unknown> = {}

    switch (widget) {
      case 'marketplace': {
        const { data: products } = await supabase
          .from('marketplace_products')
          .select('id, name, description, category, culture, price, currency, unit, images, certification, season')
          .eq('cooperative_id', cooperativeId)
          .eq('available', true)
          .order('created_at', { ascending: false })
          .limit(50)
        widgetData = { products: products ?? [] }
        break
      }

      case 'fiches': {
        const { data: fiches } = await supabase
          .from('fiches_techniques')
          .select('id, title, description, culture, type_agriculture, price_non_member, download_count')
          .eq('cooperative_id', cooperativeId)
          .eq('status', 'published')
          .order('title')
          .limit(100)
        widgetData = { fiches: fiches ?? [] }
        break
      }

      case 'member_verify': {
        // Just return config — verification happens via POST
        widgetData = { verify_endpoint: '/api/member-access' }
        break
      }

      case 'dashboard': {
        const [membersRes, productsRes] = await Promise.all([
          supabase.from('members').select('id', { count: 'exact', head: true }).eq('cooperative_id', cooperativeId),
          supabase.from('marketplace_products').select('id', { count: 'exact', head: true }).eq('cooperative_id', cooperativeId).eq('available', true),
        ])
        widgetData = {
          stats: {
            members: membersRes.count ?? 0,
            products: productsRes.count ?? 0,
          },
        }
        break
      }
    }

    return NextResponse.json(
      {
        cooperative: {
          id: coop.id,
          name: coop.name,
          description: coop.description,
          logo: coop.logo_url,
          faitiere: coop.faitiere_name,
        },
        theme: config.theme,
        widget,
        data: widgetData,
      },
      {
        headers: {
          ...CORS_HEADERS,
          'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
        },
      },
    )
  } catch (error) {
    log.error('Embed API error', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: CORS_HEADERS })
  }
}
