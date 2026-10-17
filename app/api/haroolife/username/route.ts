// Le nom d'utilisateur HarooLife : vérifier qu'il est libre (tout le monde, avant même d'avoir un
// compte), connaître le sien, et le prendre une fois (joueur connecté, visiteur compris).
import { REASON_TEXT, claimSchema, normalizeUsername } from '@/lib/haroolife/username'
import { getAccessContext } from '@/lib/security/assert-access'
import { createClient } from '@/lib/supabase/server'
import { clientKeyFromHeaders, rateLimit } from '@/lib/utils/rate-limit'
import { type NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
const headers = { 'Cache-Control': 'private, no-store' }
/**
 * The request comes from a page of this site: its Origin names the host it was sent to (behind
 * Vercel's proxy, the forwarded host). A browser never lets another site forge that header.
 */
function sameOrigin(request: NextRequest): boolean {
  const origin = request.headers.get('origin')
  if (!origin) return false
  if (origin === request.nextUrl.origin) return true
  try {
    const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host')
    return !!host && new URL(origin).host === host
  } catch {
    return false
  }
}
const off = () =>
  NextResponse.json({ error: 'HarooLife est en préparation.' }, { status: 503, headers })

export async function GET(request: NextRequest) {
  if (process.env.HAROOLIFE_ENABLED !== 'true') return off()
  const asked = request.nextUrl.searchParams.get('u')
  // Without a name: mine (null until chosen).
  if (asked === null) {
    const ctx = await getAccessContext({ allowVisitor: true })
    if (!ctx) return NextResponse.json({ error: 'Connexion requise' }, { status: 401, headers })
    const { data, error } = await ctx.supabase.rpc('haroolife_my_username')
    if (error) return NextResponse.json({ error: 'Service indisponible' }, { status: 503, headers })
    return NextResponse.json({ username: (data as string | null) ?? null }, { headers })
  }
  if (!rateLimit(`haroolife-username:${clientKeyFromHeaders(request.headers)}`, 60, 60_000).ok)
    return NextResponse.json(
      { error: 'Trop d’essais. Patiente une minute.' },
      { status: 429, headers },
    )
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('haroolife_username_available', {
    p_username: normalizeUsername(asked.slice(0, 40)),
  })
  if (error) return NextResponse.json({ error: 'Service indisponible' }, { status: 503, headers })
  const r = data as { username: string; available: boolean; reason: string | null }
  return NextResponse.json(
    { ...r, message: r.reason ? (REASON_TEXT[r.reason] ?? null) : null },
    { headers },
  )
}

export async function POST(request: NextRequest) {
  if (process.env.HAROOLIFE_ENABLED !== 'true') return off()
  if (!sameOrigin(request))
    return NextResponse.json({ error: 'Origine invalide' }, { status: 403, headers })
  const ctx = await getAccessContext({ allowVisitor: true })
  if (!ctx) return NextResponse.json({ error: 'Connexion requise' }, { status: 401, headers })
  if (
    !rateLimit(
      `haroolife-username-claim:${ctx.userId}:${clientKeyFromHeaders(request.headers)}`,
      10,
      600_000,
    ).ok
  )
    return NextResponse.json(
      { error: 'Trop d’essais. Réessaie plus tard.' },
      { status: 429, headers },
    )
  const parsed = claimSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success)
    return NextResponse.json({ error: 'Nom d’utilisateur invalide.' }, { status: 400, headers })
  const { data, error } = await ctx.supabase.rpc('haroolife_claim_username', {
    p_username: normalizeUsername(parsed.data.username),
    p_quartier: parsed.data.quartier,
    p_pagne: parsed.data.pagne,
  })
  if (error) {
    const status =
      error.code === '23505'
        ? 409
        : error.code === '22023'
          ? 400
          : error.code === '42501'
            ? 403
            : 503
    const message =
      error.code === '23505'
        ? (REASON_TEXT.taken as string)
        : status === 503
          ? 'Service indisponible. Réessaie.'
          : error.message
    return NextResponse.json({ error: message }, { status, headers })
  }
  return NextResponse.json({ ok: true, ...(data as { username: string }) }, { headers })
}
