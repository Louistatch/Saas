/**
 * GET /api/faitieres — liste publique des faîtières (id, nom) pour le choix
 * de la faîtière de rattachement à l'inscription. Aucune donnée personnelle
 * (ni coordonnées du coordonnateur, ni effectifs). Mise en cache 10 min
 * (mémoire + CDN).
 */

import { listFaitieres } from '@/lib/professionals/server'
import { createClient as createAdminClient } from '@/lib/supabase/admin'
import { clientKeyFromHeaders, rateLimit } from '@/lib/utils/rate-limit'
import { type NextRequest, NextResponse } from 'next/server'

const TTL_MS = 10 * 60_000
let cache: { at: number; data: { id: string; name: string }[] } | null = null

export async function GET(request: NextRequest) {
  const limit = rateLimit(`faitieres:${clientKeyFromHeaders(request.headers)}`, 60, 60_000)
  if (!limit.ok) return NextResponse.json({ error: 'Trop de requêtes' }, { status: 429 })

  if (!cache || Date.now() - cache.at > TTL_MS) {
    const rows = await listFaitieres(createAdminClient())
    cache = { at: Date.now(), data: rows.map((r) => ({ id: r.id, name: r.name })) }
  }
  return NextResponse.json(
    { faitieres: cache.data },
    { headers: { 'Cache-Control': 'public, s-maxage=600, stale-while-revalidate=3600' } },
  )
}
