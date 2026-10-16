import 'server-only'
/**
 * The real market prices of a region (market_prices, the platform's price survey): the latest
 * line per culture over the last 14 days. Used by the world sheet and by « Mon champ » to sell a
 * harvest at today's price.
 */
import { createClient as createAdminClient } from '@/lib/supabase/admin'
import { type MarketLine, latestPerCulture } from './world'

export async function marketFor(regionName: string): Promise<MarketLine[]> {
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
  return latestPerCulture(lines)
}
