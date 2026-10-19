// Expédie les alertes admin en attente. Sans donnée d'entrée ni secret : la route ne fait
// qu'envoyer, une seule fois, des événements déjà enregistrés en base pour leurs seuls
// destinataires autorisés. Appelée après une action HarooLife et par le planificateur.
import { dispatchPendingEvents } from '@/lib/push/server'
import { clientKeyFromHeaders, rateLimit } from '@/lib/utils/rate-limit'
import { type NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

export async function POST(request: NextRequest) {
  if (!rateLimit(`push-dispatch:${clientKeyFromHeaders(request.headers)}`, 6, 60_000).ok) {
    return NextResponse.json({ error: 'Trop de requêtes' }, { status: 429 })
  }
  const result = await dispatchPendingEvents()
  return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } })
}
