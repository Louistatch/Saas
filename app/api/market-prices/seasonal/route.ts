import { createClient } from '@/lib/supabase/server'
import { applyRateLimit } from '@/lib/utils/rate-limit-persistent'
import { type NextRequest, NextResponse } from 'next/server'

/**
 * GET /api/market-prices/seasonal?culture_id=…&region_id=…&months=12,1,2
 *
 * Ce qu'on a OBSERVÉ sur les mêmes mois les années précédentes (par défaut la
 * saison sèche, décembre à février) : médiane et fourchette (quartiles) des
 * médianes de marché. C'est un repère historique, pas une prévision.
 */
export async function GET(request: NextRequest) {
  const limited = await applyRateLimit(request, 'marketplace')
  if (limited) return limited

  const { searchParams } = new URL(request.url)
  const cultureId = searchParams.get('culture_id')
  const regionId = searchParams.get('region_id')
  const months = (searchParams.get('months') ?? '12,1,2')
    .split(',')
    .map((m) => Number.parseInt(m, 10))
    .filter((m) => m >= 1 && m <= 12)
  if (!cultureId || !regionId || months.length === 0) {
    return NextResponse.json({ ok: false, reason: 'paramètres manquants' }, { status: 400 })
  }

  const supabase = await createClient()
  const rows: { market_name: string; price: number; observed_at: string | null; created_at: string }[] = []
  for (let page = 0; page < 5; page++) {
    const { data, error } = await supabase
      .from('market_prices')
      .select('market_name, price, observed_at, created_at')
      .eq('culture_id', cultureId)
      .eq('region_id', regionId)
      .gt('price', 0)
      .range(page * 1000, page * 1000 + 999)
    if (error) return NextResponse.json({ ok: false, reason: 'erreur serveur' }, { status: 500 })
    rows.push(...((data ?? []) as typeof rows))
    if ((data ?? []).length < 1000) break
  }

  // Mois de l'année en cours exclus : on veut un repère PASSÉ, pas les relevés d'hier.
  const now = new Date()
  const inSeason = rows.filter((r) => {
    const d = new Date(r.observed_at ?? r.created_at)
    const recent = now.getTime() - d.getTime() < 120 * 86_400_000
    return months.includes(d.getUTCMonth() + 1) && !recent
  })
  if (inSeason.length < 3) return NextResponse.json({ ok: false, reason: 'pas d’historique pour ces mois' })

  const byMarket = new Map<string, number[]>()
  for (const r of inSeason) byMarket.set(r.market_name, [...(byMarket.get(r.market_name) ?? []), Number(r.price)])
  const median = (v: number[]) => {
    const s = [...v].sort((a, b) => a - b)
    const m = Math.floor(s.length / 2)
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
  }
  const marketMedians = [...byMarket.values()].map(median).sort((a, b) => a - b)
  const all = inSeason.map((r) => Number(r.price)).sort((a, b) => a - b)
  const q = (p: number) => all[Math.min(all.length - 1, Math.max(0, Math.round(p * (all.length - 1))))]
  const years = [...new Set(inSeason.map((r) => new Date(r.observed_at ?? r.created_at).getUTCFullYear()))].sort()

  return NextResponse.json(
    {
      ok: true,
      months,
      median: Math.round(median(marketMedians)),
      low: Math.round(q(0.25)),
      high: Math.round(q(0.75)),
      observations: inSeason.length,
      markets: byMarket.size,
      years,
    },
    { headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400' } },
  )
}
