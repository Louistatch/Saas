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
  const cantonId = searchParams.get('canton_id')

  const supabase = await createClient()

  // Return regions with price counts
  if (action === 'regions') {
    // Nombre de prix COURANTS (une culture dans une région = un prix), lu dans la
    // vue : l'ancien décompte lisait 1000 lignes brutes au hasard et pouvait
    // annoncer « 0 prix » pour une région qui en a des dizaines.
    const regionCounts: Record<string, number> = {}
    const { data: current, error: currentError } = await supabase
      .from('market_price_current')
      .select('region_id')
    if (!currentError) {
      for (const row of (current ?? []) as { region_id: string }[]) {
        regionCounts[row.region_id] = (regionCounts[row.region_id] ?? 0) + 1
      }
    } else {
      const { data: allPrices } = await supabase.from('market_prices').select('region_id').limit(1000)
      for (const p of allPrices ?? []) {
        regionCounts[p.region_id] = (regionCounts[p.region_id] ?? 0) + 1
      }
    }
    return NextResponse.json({ regionCounts }, {
      headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' }
    })
  }

  // Return prefectures for a region
  if (action === 'prefectures' && regionId) {
    const { data } = await supabase
      .from('prefectures')
      .select('id, name')
      .eq('region_id', regionId)
      .order('name')
    
    // Nombre de prix courants par préfecture (une culture = un prix), lu dans la vue.
    // L'ancien décompte cherchait le NOM de la préfecture dans le nom du marché :
    // « Kétao » ne contient pas « Binah », donc 0 prix pour la quasi-totalité.
    const { data: scoped } = await supabase
      .from('market_price_scoped')
      .select('scope_id')
      .eq('scope', 'prefecture')
      .eq('region_id', regionId)

    const counts = new Map<string, number>()
    for (const row of (scoped ?? []) as { scope_id: string }[]) {
      counts.set(row.scope_id, (counts.get(row.scope_id) ?? 0) + 1)
    }
    const prefWithCounts = (data ?? []).map((p) => ({ ...p, priceCount: counts.get(p.id) ?? 0 }))

    return NextResponse.json({ prefectures: prefWithCounts }, {
      headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' }
    })
  }

  // Return cantons for a prefecture
  if (action === 'cantons' && prefectureId) {
    const { data } = await supabase
      .from('cantons')
      .select('id, name')
      .eq('prefecture_id', prefectureId)
      .order('name')
    
    const cantonIds = (data ?? []).map((c) => c.id)
    const counts = new Map<string, number>()
    if (cantonIds.length > 0) {
      const { data: scoped } = await supabase
        .from('market_price_scoped')
        .select('scope_id')
        .eq('scope', 'canton')
        .in('scope_id', cantonIds)
      for (const row of (scoped ?? []) as { scope_id: string }[]) {
        counts.set(row.scope_id, (counts.get(row.scope_id) ?? 0) + 1)
      }
    }
    const cantonsWithCounts = (data ?? []).map((c) => ({ ...c, priceCount: counts.get(c.id) ?? 0 }))

    return NextResponse.json({ cantons: cantonsWithCounts }, {
      headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' }
    })
  }

  // Prix courants : UNE ligne par culture et par région (vue partagée avec
  // AgriTogo : relevés dédupliqués, médiane par marché puis par région, tendance
  // sur 21 jours), à la maille choisie : canton, préfecture ou région.
  {
    let q = supabase.from('market_price_scoped').select('*').order('age_days', { ascending: true })
    if (cantonId) q = q.eq('scope', 'canton').eq('scope_id', cantonId)
    else if (prefectureId) q = q.eq('scope', 'prefecture').eq('scope_id', prefectureId)
    else {
      q = q.eq('scope', 'region')
      if (regionId) q = q.eq('scope_id', regionId)
    }
    if (cultureId) q = q.eq('culture_id', cultureId)
    const { data: current, error: currentError } = await q
    if (!currentError) {
      const prices = (current ?? []).map((r: Record<string, unknown>) => ({
        id: `${r.culture_id}:${r.scope}:${r.scope_id}`,
        culture_id: r.culture_id,
        region_id: r.region_id,
        market_name: ((r.markets as string[] | null) ?? []).join(', '),
        price: r.price,
        unit: 'kg',
        currency: 'FCFA',
        trend: r.trend,
        verified: false,
        created_at: `${String(r.last_observed)}T12:00:00Z`,
        cultures: { name: r.culture_name },
        regions: { name: r.region_name },
        region_name: r.region_name,
        scope: r.scope,
        scope_name: r.scope_name,
        markets: r.markets,
        sources: r.sources,
        n_markets: r.n_markets,
        n_obs: r.n_obs,
        price_min: r.price_min,
        price_max: r.price_max,
        previous_price: r.previous_price,
        change_pct: r.change_pct == null ? null : Number(r.change_pct),
        trend_known: r.trend_known,
        history: r.history,
      }))
      return NextResponse.json(
        { prices, mode: 'current' },
        { headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' } },
      )
    }
    // Vue absente (42P01) ou erreur : on retombe sur les relevés bruts ci-dessous.
  }

  // Relevés bruts (repli si la vue n'est pas disponible).
  //
  // `price_type` (gros / détail) n'existe qu'une fois la migration CPC
  // d'AgriTogo appliquée. PostgREST répond 42703 sur une colonne inconnue, ce
  // qui casserait toute la page Marchés — on tente donc avec, et on retombe
  // sans. La seconde branche disparaîtra une fois la migration en place.
  const BASE_COLUMNS =
    'id, culture_id, region_id, market_name, price, unit, currency, trend, verified, created_at, source, cultures(name), regions(name)'

  // PostgREST plafonne une réponse à 1000 lignes. Les relevés d'une source
  // externe (CPC : plusieurs milliers) dépassent ce plafond et, triés par date,
  // ils noieraient les saisies plus anciennes. On lit donc par tranches, puis on
  // ne garde que les quelques relevés les plus récents de chaque couple
  // culture / marché / type de prix : de quoi afficher le prix actuel, sa
  // tendance et sa courbe, sans renvoyer des milliers de lignes.
  const PAGE = 1000
  const MAX_PAGES = 6
  const KEEP_PER_SERIES = 6

  const runQuery = async (columns: string) => {
    const rows: Record<string, unknown>[] = []
    for (let page = 0; page < MAX_PAGES; page++) {
      let q = supabase
        .from('market_prices')
        .select(columns)
        .order('created_at', { ascending: false })
      if (regionId) q = q.eq('region_id', regionId)
      if (cultureId) q = q.eq('culture_id', cultureId)
      if (cantonId) q = q.eq('canton_id', cantonId)
      const { data: chunk, error: chunkError } = await q.range(page * PAGE, page * PAGE + PAGE - 1)
      if (chunkError) return { data: null, error: chunkError }
      const got = (chunk ?? []) as unknown as Record<string, unknown>[]
      rows.push(...got)
      if (got.length < PAGE) break
    }
    const seen = new Map<string, number>()
    const kept = rows.filter((row) => {
      const key = `${row.culture_id}|${String(row.market_name ?? '').toLowerCase()}|${row.price_type ?? ''}`
      const n = seen.get(key) ?? 0
      seen.set(key, n + 1)
      return n < KEEP_PER_SERIES
    })
    return { data: kept, error: null }
  }

  let { data, error } = (await runQuery(`${BASE_COLUMNS}, price_type`)) as {
    data: unknown[] | null
    error: { code?: string } | null
  }
  if (error?.code === '42703') {
    ;({ data, error } = (await runQuery(BASE_COLUMNS)) as {
      data: unknown[] | null
      error: { code?: string } | null
    })
  }

  if (error) {
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }

  return NextResponse.json({ prices: data ?? [] }, {
    headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' }
  })
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
