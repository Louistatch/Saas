import { commandSchema } from '@/lib/haroolife/core'
import { getAccessContext } from '@/lib/security/assert-access'
import { clientKeyFromHeaders, rateLimit } from '@/lib/utils/rate-limit'
import { applyRateLimit } from '@/lib/utils/rate-limit-persistent'
import { type NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
const headers = { 'Cache-Control': 'private, no-store' }
function reply(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers })
}
function unavailable() {
  return reply(
    { error: 'HarooLife est en préparation. Vos services habituels restent disponibles.' },
    503,
  )
}
function databaseError(error: { code?: string; message: string }) {
  if (error.code === '42501') return reply({ error: error.message }, 403)
  if (error.code === '22023') return reply({ error: error.message }, 409)
  return unavailable()
}

export async function GET() {
  if (process.env.HAROOLIFE_ENABLED !== 'true') return unavailable()
  try {
    const ctx = await getAccessContext()
    if (!ctx) return reply({ error: 'Connectez-vous pour accéder à HarooLife.' }, 401)
    const { data, error } = await ctx.supabase.rpc('haroolife_board')
    return error ? databaseError(error) : reply(data)
  } catch {
    return unavailable()
  }
}

export async function POST(request: NextRequest) {
  if (process.env.HAROOLIFE_ENABLED !== 'true') return unavailable()
  // Browser commands are same-origin and use the existing HttpOnly session.
  const origin = request.headers.get('origin')
  if (!origin || origin !== request.nextUrl.origin) return reply({ error: 'Origine invalide' }, 403)
  try {
    const blocked = await applyRateLimit(request, 'haroolife')
    if (blocked) return blocked
    const ctx = await getAccessContext()
    if (!ctx) return reply({ error: 'Connexion requise' }, 401)
    if (
      !rateLimit(`haroolife:${ctx.userId}:${clientKeyFromHeaders(request.headers)}`, 20, 60_000).ok
    )
      return reply({ error: 'Trop de demandes. Réessayez dans une minute.' }, 429)
    const text = await request.text()
    if (text.length > 4096) return reply({ error: 'Requête trop volumineuse' }, 413)
    let body: unknown
    try {
      body = JSON.parse(text)
    } catch {
      return reply({ error: 'Requête invalide' }, 400)
    }
    const parsed = commandSchema.safeParse(body)
    if (!parsed.success) return reply({ error: 'Vérifiez les informations du groupe.' }, 400)
    const { action, request_id, payload } = parsed.data
    const { data, error } = await ctx.supabase.rpc('haroolife_command', {
      p_action: action,
      p_request_id: request_id,
      p_payload: payload,
    })
    return error ? databaseError(error) : reply({ group_id: data })
  } catch {
    return unavailable()
  }
}
