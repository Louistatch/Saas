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
import { applyRateLimit } from '@/lib/utils/rate-limit-persistent'

export async function GET(request: NextRequest) {
  const rateLimited = await applyRateLimit(request, 'marketplace')
  if (rateLimited) return rateLimited

  const { searchParams } = new URL(request.url)
  const action = searchParams.get('action')
  const regionId = searchParams.get('region_id')
  const cultureId = searchParams.get('culture_id')
  const prefectureId = searchParams.get('prefecture_id')

  const supabase = await createClient()

  // Return regions with price counts
  if (action === 'regions') {
    const { data: allPrices } = await supabase
      .from('market_prices')
      .select('region_id')
    
    const regionCounts: Record<string, number> = {}
    for (const p of allPrices ?? []) {
      regionCounts[p.region_id] = (regionCounts[p.region_id] ?? 0) + 1
    }
    return NextResponse.json({ regionCounts })
  }

  // Return prefectures for a region
  if (action === 'prefectures' && regionId) {
    const { data } = await supabase
      .from('prefectures')
      .select('id, name')
      .eq('region_id', regionId)
      .order('name')
    
    // Count prices per prefecture (via market_prices where region matches)
    const { data: priceCounts } = await supabase
      .from('market_prices')
      .select('market_name')
      .eq('region_id', regionId)
    
    const prefWithCounts = (data ?? []).map(p => ({
      ...p,
      priceCount: (priceCounts ?? []).filter(pc => 
        pc.market_name?.toLowerCase().includes(p.name.toLowerCase())
      ).length,
    }))
    
    return NextResponse.json({ prefectures: prefWithCounts })
  }

  // Return cantons for a prefecture
  if (action === 'cantons' && prefectureId) {
    const { data } = await supabase
      .from('cantons')
      .select('id, name')
      .eq('prefecture_id', prefectureId)
      .order('name')
    
    // Get the region_id for this prefecture
    const { data: pref } = await supabase
      .from('prefectures')
      .select('region_id')
      .eq('id', prefectureId)
      .maybeSingle()
    
    // Count prices per canton
    let cantonCounts: { market_name: string }[] = []
    if (pref?.region_id) {
      const { data: prices } = await supabase
        .from('market_prices')
        .select('market_name')
        .eq('region_id', pref.region_id)
      cantonCounts = prices ?? []
    }
    
    const cantonsWithCounts = (data ?? []).map(c => ({
      ...c,
      priceCount: cantonCounts.filter(pc => 
        pc.market_name?.toLowerCase() === c.name.toLowerCase()
      ).length,
    }))
    
    return NextResponse.json({ cantons: cantonsWithCounts })
  }

  // Default: return market prices
  let query = supabase
    .from('market_prices')
    .select('id, culture_id, region_id, market_name, price, unit, currency, trend, verified, created_at, cultures(name), regions(name)')
    .order('created_at', { ascending: false })

  if (regionId) query = query.eq('region_id', regionId)
  if (cultureId) query = query.eq('culture_id', cultureId)

  const { data, error } = await query.limit(200)

  if (error) {
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }

  return NextResponse.json({ prices: data ?? [] })
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
        trend: 'stable',
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
