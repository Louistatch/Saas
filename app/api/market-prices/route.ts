/**
 * Market Prices API
 * 
 * GET /api/market-prices — Fetch prices (public, no auth required)
 *   Query params: region_id, culture_id (optional filters)
 * 
 * POST /api/market-prices — Submit a price (requires valid card number)
 *   Body: { card_number, culture_id, region_id, market_name, price }
 */

import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createPublicClient } from '@/lib/supabase/public'
import { z } from 'zod'
import { applyRateLimit } from '@/lib/utils/rate-limit-persistent'

const filters = z.object({
  action: z.enum(['regions', 'prefectures', 'cantons']).optional(),
  region_id: z.string().uuid().optional(), culture_id: z.string().uuid().optional(),
  prefecture_id: z.string().uuid().optional(), canton_id: z.string().uuid().optional(),
})
const cacheHeaders = { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' }
const unavailable = () => NextResponse.json({ error: 'Prix courants indisponibles. Réessayez plus tard.' }, { status: 503 })

type LocationCount = { scope_id: string; price_count: number }
export async function GET(request: NextRequest) {
  const rateLimited = await applyRateLimit(request, 'marketplace')
  if (rateLimited) return rateLimited
  const parsed = filters.safeParse(Object.fromEntries(new URL(request.url).searchParams))
  if (!parsed.success) return NextResponse.json({error: 'Filtres invalides'}, {status: 400})
  const {action, region_id: regionId, culture_id: cultureId, prefecture_id: prefectureId, canton_id: cantonId} = parsed.data
  // A CDN-cached response always uses the anonymous public view, never a user's cookies.
  const supabase = createPublicClient()
  if (action === 'regions') {
    const {data, error} = await supabase.rpc('get_market_location_counts', {p_scope: 'region'})
    if (error) return unavailable()
    const regionCounts = Object.fromEntries(((data ?? []) as LocationCount[]).map(row => [row.scope_id, Number(row.price_count)]))
    return NextResponse.json({regionCounts}, {headers: cacheHeaders})
  }
  if (action === 'prefectures' || action === 'cantons') {
    if ((action === 'prefectures' && !regionId) || (action === 'cantons' && !prefectureId)) {
      return NextResponse.json({error: 'Zone requise'}, {status: 400})
    }
    const table = action === 'prefectures' ? 'prefectures' : 'cantons'
    const [locations, counts] = await Promise.all([
      supabase.from(table).select('id, name').eq(action === 'prefectures' ? 'region_id' : 'prefecture_id',
        (action === 'prefectures' ? regionId : prefectureId) as string).order('name'),
      supabase.rpc('get_market_location_counts', {p_scope: action === 'prefectures' ? 'prefecture' : 'canton',
        ...(regionId ? {p_region_id: regionId} : {}), ...(prefectureId ? {p_prefecture_id: prefectureId} : {})}),
    ])
    if (locations.error || counts.error) return unavailable()
    const countMap = new Map(((counts.data ?? []) as LocationCount[]).map(row => [row.scope_id, Number(row.price_count)]))
    return NextResponse.json({[action]: (locations.data ?? []).map(row => ({...row, priceCount: countMap.get(row.id) ?? 0}))},
      {headers: cacheHeaders})
  }
  const {data, error} = await supabase.rpc('get_market_prices', {
    p_scope: cantonId ? 'canton' : prefectureId ? 'prefecture' : 'region',
    ...(cantonId || prefectureId || regionId ? {p_scope_id: cantonId ?? prefectureId ?? regionId} : {}),
    ...(regionId ? {p_region_id: regionId} : {}), ...(cultureId ? {p_culture_id: cultureId} : {}),
  })
  if (error || !Array.isArray(data)) return unavailable()
  // Same price/trend calculation as the shared SQL view, returned without row truncation.
  const prices = (data as Record<string, unknown>[]).map(r => ({
    id: `${r.culture_id}:${r.scope}:${r.scope_id}`, culture_id: r.culture_id, region_id: r.region_id,
    market_name: ((r.markets as string[] | null) ?? []).join(', '), price: r.price, unit: 'kg', currency: 'FCFA',
    trend: r.trend, verified: false, created_at: `${String(r.last_observed)}T12:00:00Z`,
    cultures: {name: r.culture_name}, regions: {name: r.region_name}, region_name: r.region_name,
    scope: r.scope, scope_name: r.scope_name, markets: r.markets, sources: r.sources,
    n_markets: r.n_markets, n_obs: r.n_obs, price_min: r.price_min, price_max: r.price_max,
    previous_price: r.previous_price, change_pct: r.change_pct == null ? null : Number(r.change_pct),
    trend_known: r.trend_known, history: r.history,
  }))
  return NextResponse.json({prices, mode: 'current'}, {headers: cacheHeaders})
}

export async function POST(request: NextRequest) {
  // Rate limit price submissions — a leaked/guessed card number must not allow
  // flooding the market with fake prices.
  const rateLimited = await applyRateLimit(request, 'marketplace')
  if (rateLimited) return rateLimited

  try {
    const body = await request.json()
    const { card_number, culture_id, region_id, market_name, price } = body

    if (!card_number || !culture_id || !region_id || !market_name || !price) {
      return NextResponse.json({ error: 'Champs requis manquants' }, { status: 400 })
    }

    if (typeof price !== 'number' || price <= 0 || price > 100000) {
      return NextResponse.json({ error: 'Prix invalide' }, { status: 400 })
    }

    const supabase = await createClient()

    // Verify the card is valid
    const { data: card } = await supabase
      .from('member_cards')
      .select('id, member_id, cooperative_id, status')
      .eq('card_number', card_number.toUpperCase().trim())
      .eq('status', 'active')
      .maybeSingle()

    if (!card) {
      return NextResponse.json({ error: 'Carte invalide ou expirée' }, { status: 403 })
    }

    // Get the user ID from the member
    const { data: member } = await supabase
      .from('members')
      .select('id')
      .eq('id', card.member_id)
      .maybeSingle()

    // Compute real trend from last 5 prices for same culture+region
    let trend: 'up' | 'down' | 'stable' = 'stable'
    const { data: recentPrices } = await supabase
      .from('market_prices')
      .select('price')
      .eq('culture_id', culture_id)
      .eq('region_id', region_id)
      .order('created_at', { ascending: false })
      .limit(5)

    if (recentPrices && recentPrices.length >= 2) {
      const avg = recentPrices.reduce((s, r) => s + r.price, 0) / recentPrices.length
      const pctDiff = ((price - avg) / avg) * 100
      if (pctDiff > 5) trend = 'up'
      else if (pctDiff < -5) trend = 'down'
    }

    // Insert the price
    const { error: insertError } = await supabase
      .from('market_prices')
      .insert({
        culture_id,
        region_id,
        market_name: market_name.trim(),
        price: Math.round(price),
        cooperative_id: card.cooperative_id,
        reported_by: member?.id ?? null,
        trend,
        verified: false,
      })

    if (insertError) {
      return NextResponse.json({ error: 'Erreur lors de l\'enregistrement' }, { status: 500 })
    }

    return NextResponse.json({ success: true, message: 'Prix enregistré. Il sera vérifié par votre coopérative.' })
  } catch {
    return NextResponse.json({ error: 'Requête invalide' }, { status: 400 })
  }
}
