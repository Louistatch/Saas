import 'server-only'
/**
 * The real market prices of a region (market_prices, the platform's price survey): the latest
 * line per culture over the last 14 days. Used by the world sheet and by « Mon champ » to sell a
 * harvest at today's price. « Mon champ » also reads the region's undated reference prices and the
 * past year's dearest and cheapest months (referenceFor, yearFor).
 */
import { createClient as createAdminClient } from '@/lib/supabase/admin'
import { type MarketLine, latestPerCulture } from './world'

export async function marketFor(regionName: string, max = 8): Promise<MarketLine[]> {
  const admin = createAdminClient()
  const { data: region } = await admin
    .from('regions')
    .select('id')
    .eq('name', regionName)
    .maybeSingle()
  if (!region) return []
  const since = new Date(Date.now() - 14 * 24 * 3600 * 1000).toISOString()
  const { data } = await admin
    .from('market_prices')
    .select('price, unit, market_name, observed_at, cultures(name, icon)')
    .eq('region_id', region.id)
    .gte('observed_at', since)
    .order('observed_at', { ascending: false })
    .limit(120)
  const lines = (
    (data ?? []) as unknown as {
      price: number
      unit: string
      market_name: string | null
      observed_at: string
      cultures: { name: string; icon: string | null } | null
    }[]
  )
    .filter((r) => r.cultures?.name)
    .map((r) => ({
      culture: r.cultures?.name ?? '',
      icon: r.cultures?.icon ?? null,
      price: r.price,
      unit: r.unit,
      market: r.market_name,
      observed_at: r.observed_at,
    }))
  return latestPerCulture(lines, max)
}

interface Row {
  price: number
  unit: string
  observed_at: string | null
  cultures: { name: string } | null
}

async function regionId(regionName: string): Promise<string | null> {
  const { data } = await createAdminClient()
    .from('regions')
    .select('id')
    .eq('name', regionName)
    .maybeSingle()
  return (data as { id: string } | null)?.id ?? null
}

/**
 * The survey's undated reference prices of a region (one per culture, the median of its lines):
 * what « Mon champ » shows as indicative when nothing was surveyed in the last 14 days.
 */
export async function referenceFor(
  regionName: string,
): Promise<{ culture: string; price: number; unit: string }[]> {
  const id = await regionId(regionName)
  if (!id) return []
  const { data } = await createAdminClient()
    .from('market_prices')
    .select('price, unit, observed_at, cultures(name)')
    .eq('region_id', id)
    .is('observed_at', null)
    .limit(400)
  const by = new Map<string, { unit: string; prices: number[] }>()
  for (const r of (data ?? []) as unknown as Row[]) {
    const name = r.cultures?.name
    if (!name || !(r.price > 0)) continue
    const e = by.get(name) ?? { unit: r.unit, prices: [] }
    if (e.unit === r.unit) e.prices.push(Number(r.price))
    by.set(name, e)
  }
  return [...by].map(([culture, e]) => {
    const sorted = e.prices.sort((a, b) => a - b)
    return { culture, unit: e.unit, price: Math.round(sorted[Math.floor(sorted.length / 2)]) }
  })
}

export interface YearRange {
  culture: string
  /** Months of the last 12 with at least one price (per kg). */
  months: number
  high: { month: number; price: number }
  low: { month: number; price: number }
}

/**
 * For each culture, the dearest and the cheapest month of the last 12 (monthly averages of the
 * prices per kg surveyed in the region): what keeping a harvest can be worth, from what was seen.
 */
export async function yearFor(regionName: string, now = new Date()): Promise<YearRange[]> {
  const id = await regionId(regionName)
  if (!id) return []
  const since = new Date(now.getTime() - 365 * 24 * 3600 * 1000).toISOString()
  const { data } = await createAdminClient()
    .from('market_prices')
    .select('price, unit, observed_at, cultures(name)')
    .eq('region_id', id)
    .eq('unit', 'kg')
    .gte('observed_at', since)
    .limit(3000)
  const sums = new Map<string, Map<number, { sum: number; n: number }>>()
  for (const r of (data ?? []) as unknown as Row[]) {
    const name = r.cultures?.name
    if (!name || !r.observed_at || !(r.price > 0)) continue
    const month = new Date(r.observed_at).getUTCMonth() + 1
    const months = sums.get(name) ?? new Map()
    const m = months.get(month) ?? { sum: 0, n: 0 }
    m.sum += Number(r.price)
    m.n += 1
    months.set(month, m)
    sums.set(name, months)
  }
  const out: YearRange[] = []
  for (const [culture, months] of sums) {
    if (months.size < 2) continue
    const avg = [...months].map(([month, m]) => ({ month, price: Math.round(m.sum / m.n) }))
    avg.sort((a, b) => b.price - a.price)
    out.push({ culture, months: months.size, high: avg[0], low: avg[avg.length - 1] })
  }
  return out
}
