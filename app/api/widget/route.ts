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

interface ExploitationRow {
  id: string
  name: string
  description: string | null
  category: string | null
  price: number | null
  unit: string | null
  producer: string | null
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

    const [coopRes, exploitationsRes] = await Promise.all([
      supabase
        .from('cooperatives')
        .select('id, name, description, primary_color')
        .eq('id', cooperativeId)
        .single<CoopRow>(),
      supabase
        .from('exploitations')
        .select('id, name, description, category, price, unit, producer')
        .eq('cooperative_id', cooperativeId)
        .eq('active', true)
        .order('name')
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
        exploitations: (exploitationsRes.data ?? []) as ExploitationRow[],
      },
      {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
        },
      },
    )
  } catch (error) {
    log.error('Widget API failed', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
