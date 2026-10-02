import { applyRateLimit } from '@/lib/utils/rate-limit-persistent'
import { type NextRequest, NextResponse } from 'next/server'

/**
 * GET /api/market-prices/forecast?produit=Maïs&zone=Kara
 *
 * Relais vers la prévision d'AgriTogo (/api/v1/forecast/price) : prix des
 * 4 prochaines semaines, fourchette à 80 %, précision mesurée contre « le prix
 * ne bouge pas ». FaîtiereHub ne calcule rien ici et n'invente rien : si
 * AgriTogo ne répond pas, la réponse le dit (`ok: false`).
 */
export async function GET(request: NextRequest) {
  const limited = await applyRateLimit(request, 'marketplace')
  if (limited) return limited

  const { searchParams } = new URL(request.url)
  const produit = (searchParams.get('produit') ?? '').trim().slice(0, 60)
  const zone = (searchParams.get('zone') ?? '').trim().slice(0, 80)
  if (!produit) return NextResponse.json({ ok: false, reason: 'produit manquant' }, { status: 400 })

  const base = process.env.AGRITOGO_API_URL
  if (!base) return NextResponse.json({ ok: false, reason: 'prévision indisponible' }, { status: 503 })

  const url = `${base}/api/v1/forecast/price?produit=${encodeURIComponent(produit)}${zone ? `&zone=${encodeURIComponent(zone)}` : ''}`
  const call = () => fetch(url, { signal: AbortSignal.timeout(20000), cache: 'no-store' })
  try {
    let res = await call()
    // Service endormi : 503 pendant quelques secondes au réveil.
    if (res.status === 503) {
      await new Promise((r) => setTimeout(r, 3000))
      res = await call()
    }
    if (!res.ok) return NextResponse.json({ ok: false, reason: 'prévision indisponible' }, { status: 502 })
    const data = (await res.json()) as Record<string, unknown>
    if (data.error) return NextResponse.json({ ok: false, reason: 'prévision indisponible' }, { status: 502 })
    return NextResponse.json(data, {
      headers: { 'Cache-Control': 'public, s-maxage=1800, stale-while-revalidate=3600' },
    })
  } catch {
    return NextResponse.json({ ok: false, reason: 'prévision indisponible' }, { status: 504 })
  }
}
