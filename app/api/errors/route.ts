// Réception des erreurs affichées dans le navigateur (écrans d'erreur). Public mais limité :
// débit par IP, taille bornée, seuls message / chemin / digest sont gardés.
import { recordAppError } from '@/lib/errors/record'
import { clientKeyFromHeaders, rateLimit } from '@/lib/utils/rate-limit'
import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

const schema = z.object({
  message: z.string().max(500),
  digest: z.string().max(100).nullable().optional(),
  route: z.string().startsWith('/').max(300),
})

/**
 * The browser's Origin must name the host that received the request. Compared on the Host header
 * rather than nextUrl.origin, which a self-hosted `next start` can report under another name
 * (localhost vs 127.0.0.1), silently dropping every error report.
 */
function sameOrigin(request: NextRequest): boolean {
  const origin = request.headers.get('origin')
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host')
  if (!origin || !host) return false
  try {
    return new URL(origin).host === host
  } catch {
    return false
  }
}

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) {
    return NextResponse.json({ error: 'Origine invalide' }, { status: 403 })
  }
  if (!rateLimit(`client-error:${clientKeyFromHeaders(request.headers)}`, 5, 60_000).ok) {
    return NextResponse.json({ ok: true })
  }
  const text = await request.text()
  if (text.length > 2_000) return NextResponse.json({ error: 'Trop volumineux' }, { status: 413 })
  let body: unknown
  try {
    body = JSON.parse(text)
  } catch {
    return NextResponse.json({ error: 'Requête invalide' }, { status: 400 })
  }
  const parsed = schema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Requête invalide' }, { status: 400 })
  await recordAppError({ source: 'navigateur', ...parsed.data })
  return NextResponse.json({ ok: true })
}
