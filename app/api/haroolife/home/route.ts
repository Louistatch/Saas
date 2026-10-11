// Choisir sa maison sur le territoire (canton, nom affiché, pagne, visibilité).
import { homeSchema } from '@/lib/haroolife/world'
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
  const ctx = await getAccessContext()
  if (!ctx) return NextResponse.json({ error: 'Connexion requise' }, { status: 401, headers })
  if (
    !rateLimit(`haroolife-home:${ctx.userId}:${clientKeyFromHeaders(request.headers)}`, 10, 600_000)
      .ok
  ) {
    return NextResponse.json(
      { error: 'Trop de changements. Réessayez plus tard.' },
      { status: 429, headers },
    )
  }
  const parsed = homeSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Vérifiez le canton et le nom affiché.' },
      { status: 400, headers },
    )
  }
  const { canton_id, display_name, pagne, visible } = parsed.data
  const { error } = await ctx.supabase.rpc('haroolife_set_home', {
    p_canton: canton_id,
    p_display_name: display_name,
    p_pagne: pagne,
    p_visible: visible,
  })
  if (error) {
    const status = error.code === '42501' ? 403 : error.code === '22023' ? 409 : 503
    return NextResponse.json({ error: error.message }, { status, headers })
  }
  return NextResponse.json({ ok: true }, { headers })
}
