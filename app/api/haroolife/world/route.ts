// Le monde HarooLife : territoire, habitants et lieux d'un canton. Lecture seule, compte requis.
// Les effectifs viennent de la base ; la météo et les prix viennent des sources déjà utilisées
// par la plateforme (Open-Meteo, market_prices). Rien n'est inventé ni mis en cache côté client.
import { marketFor } from '@/lib/haroolife/market-prices'
import type { World } from '@/lib/haroolife/world'
import { getAccessContext } from '@/lib/security/assert-access'
import { fetchOpenMeteoForRegion } from '@/lib/weather/open-meteo'
import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

export const dynamic = 'force-dynamic'
const headers = { 'Cache-Control': 'private, no-store' }

async function skyFor(regionName: string) {
  try {
    const days = await fetchOpenMeteoForRegion(regionName)
    return days.slice(0, 3).map((d) => ({
      date: d.date,
      temperature_max: d.temperature_max,
      temperature_min: d.temperature_min,
      precipitation_mm: d.precipitation_mm,
      precipitation_probability: d.precipitation_probability,
    }))
  } catch {
    return []
  }
}

export async function GET(request: NextRequest) {
  if (process.env.HAROOLIFE_ENABLED !== 'true') {
    return NextResponse.json({ error: 'HarooLife est en préparation.' }, { status: 503, headers })
  }
  const canton = request.nextUrl.searchParams.get('canton')
  if (canton && !z.string().uuid().safeParse(canton).success) {
    return NextResponse.json({ error: 'Canton invalide' }, { status: 400, headers })
  }
  const ctx = await getAccessContext({ allowVisitor: true })
  if (!ctx) return NextResponse.json({ error: 'Connexion requise' }, { status: 401, headers })
  const { data, error } = await ctx.supabase.rpc('haroolife_world', { p_canton: canton })
  if (error) {
    const status = error.code === '42501' ? 403 : 503
    return NextResponse.json({ error: error.message }, { status, headers })
  }
  const world = data as World
  if (world.here) {
    const [market, sky] = await Promise.all([
      marketFor(world.here.canton.region),
      skyFor(world.here.canton.region),
    ])
    world.here = { ...world.here, market, sky }
  }
  return NextResponse.json(world, { headers })
}
