// Dire quelque chose sur la place d'un canton (200 caractères, une fois par 20 s en base).
import { sayMessageSchema } from '@/lib/haroolife/world'
import { getAccessContext } from '@/lib/security/assert-access'
import { clientKeyFromHeaders, rateLimit } from '@/lib/utils/rate-limit'
import { type NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
const headers = { 'Cache-Control': 'private, no-store' }

export async function POST(request: NextRequest) {
  if (process.env.HAROOLIFE_ENABLED !== 'true') {
    return NextResponse.json({ error: 'HarooLife est en préparation.' }, { status: 503, headers })
  }
  if (request.headers.get('origin') !== request.nextUrl.origin) {
    return NextResponse.json({ error: 'Origine invalide' }, { status: 403, headers })
  }
  const ctx = await getAccessContext({ allowVisitor: true })
  if (!ctx) return NextResponse.json({ error: 'Connexion requise' }, { status: 401, headers })
  if (
    !rateLimit(`haroolife-say:${ctx.userId}:${clientKeyFromHeaders(request.headers)}`, 30, 600_000)
      .ok
  ) {
    return NextResponse.json(
      { error: 'Trop de messages. Reprenez dans quelques minutes.' },
      { status: 429, headers },
    )
  }
  const parsed = sayMessageSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Message vide ou trop long (200 caractères).' },
      { status: 400, headers },
    )
  }
  const { data, error } = await ctx.supabase.rpc('haroolife_say', {
    p_canton: parsed.data.canton_id,
    p_body: parsed.data.body,
  })
  if (error) {
    const status = error.code === '42501' ? 403 : error.code === '22023' ? 409 : 503
    return NextResponse.json({ error: error.message }, { status, headers })
  }
  return NextResponse.json({ ok: true, id: data }, { headers })
}
