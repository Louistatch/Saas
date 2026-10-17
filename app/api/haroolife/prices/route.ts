// The real market prices of the town the player is in (Lomé → Maritime, Kara → Kara), for
// « Mon champ »: a harvest is sold at today's surveyed price, else at the region's undated
// reference price (said as indicative); the past year's dearest and cheapest months help decide
// when to sell a harvest kept in the granary. Open to HarooLife visitors (the prices are public
// data); no-store, like the rest of the game's live data.
import { isLocalityId } from '@/lib/haroolife/city/locality'
import { marketFor, referenceFor, yearFor } from '@/lib/haroolife/market-prices'
import { getAccessContext } from '@/lib/security/assert-access'
import { clientKeyFromHeaders, rateLimit } from '@/lib/utils/rate-limit'
import { type NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
const headers = { 'Cache-Control': 'private, no-store' }
const REGION = {
  lome: 'Maritime',
  kara: 'Kara',
  dapaong: 'Savanes',
  sokode: 'Centrale',
  kpalime: 'Plateaux',
  atakpame: 'Plateaux',
} as const

export async function GET(request: NextRequest) {
  const ctx = await getAccessContext({ allowVisitor: true })
  if (!ctx) return NextResponse.json({ error: 'Connexion requise' }, { status: 401, headers })
  if (!rateLimit(`haroolife-prices:${clientKeyFromHeaders(request.headers)}`, 30, 60_000).ok)
    return NextResponse.json({ error: 'Trop de requêtes' }, { status: 429, headers })
  const locality = request.nextUrl.searchParams.get('locality')
  if (!isLocalityId(locality))
    return NextResponse.json({ error: 'Ville inconnue' }, { status: 400, headers })
  const region = REGION[locality]
  const [prices, reference, year] = await Promise.all([
    // Every culture the farm grows (the world sheet shows 8).
    marketFor(region, 30).catch(() => []),
    referenceFor(region).catch(() => []),
    yearFor(region).catch(() => []),
  ])
  return NextResponse.json({ region, prices, reference, year }, { headers })
}
