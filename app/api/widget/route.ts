import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { clientKeyFromHeaders, isUuid, rateLimit } from '@/lib/utils/rate-limit'
import { createLogger } from '@/lib/utils/logger'

const log = createLogger('widget-api')

interface CoopRow {
  id: string
  name: string
  description: string | null
  primary_color: string | null
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
} as const

/** Handle CORS preflight */
export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS })
}

export async function GET(request: NextRequest) {
  const limit = rateLimit(
    `widget-api:${clientKeyFromHeaders(request.headers)}`,
    60,
    60_000,
  )
  if (!limit.ok) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
  }

  const { searchParams } = new URL(request.url)
  const cooperativeId = searchParams.get('id')
  if (!isUuid(cooperativeId)) {
    return NextResponse.json(
      { error: 'A valid cooperative id is required' },
      { status: 400 },
    )
  }

  try {
    const supabase = await createClient()

    const [coopRes, fichesRes] = await Promise.all([
      supabase
        .from('cooperatives')
        .select('id, name, description, primary_color')
        .eq('id', cooperativeId)
        .single<CoopRow>(),
      supabase
        .from('fiches_techniques')
        .select('id, title, description, culture, type_agriculture, price_non_member')
        .eq('cooperative_id', cooperativeId)
        .eq('status', 'published')
        .order('title')
        .limit(100),
    ])

    if (coopRes.error || !coopRes.data) {
      return NextResponse.json({ error: 'Cooperative not found' }, { status: 404 })
    }

    return NextResponse.json(
      {
        id: coopRes.data.id,
        name: coopRes.data.name,
        description: coopRes.data.description,
        primaryColor: coopRes.data.primary_color,
        fiches: (fichesRes.data ?? []),
      },
      {
        headers: {
          ...CORS_HEADERS,
          'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
        },
      },
    )
  } catch (error) {
    log.error('Widget API failed', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
