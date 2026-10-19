// Abonnement push de l'appareil courant. Le compte connecté ne reçoit ensuite que les
// alertes auxquelles son rôle lui donne droit (voir admin_event_recipients).
import { assertAuthenticated } from '@/lib/security/assert-access'
import { createClient as createAdminClient } from '@/lib/supabase/admin'
import { clientKeyFromHeaders, rateLimit } from '@/lib/utils/rate-limit'
import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

const subscriptionSchema = z
  .object({
    endpoint: z.string().url().startsWith('https://').max(1000),
    keys: z.object({ p256dh: z.string().min(1).max(200), auth: z.string().min(1).max(100) }),
  })
  .passthrough()
const removalSchema = z.object({ endpoint: z.string().url().max(1000) })

function sameOrigin(request: NextRequest) {
  return request.headers.get('origin') === request.nextUrl.origin
}

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return NextResponse.json({ error: 'Origine invalide' }, { status: 403 })
  if (!rateLimit(`push-sub:${clientKeyFromHeaders(request.headers)}`, 10, 60_000).ok) {
    return NextResponse.json({ error: 'Trop de requêtes' }, { status: 429 })
  }
  const auth = await assertAuthenticated()
  if (!auth.ok) return auth.response
  const parsed = subscriptionSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Abonnement invalide' }, { status: 400 })
  const { endpoint, keys } = parsed.data
  const { error } = await createAdminClient()
    .from('push_subscriptions')
    .upsert(
      { user_id: auth.ctx.userId, endpoint, p256dh: keys.p256dh, auth: keys.auth, failures: 0 },
      { onConflict: 'endpoint' },
    )
  if (error) return NextResponse.json({ error: 'Enregistrement impossible' }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(request: NextRequest) {
  if (!sameOrigin(request)) return NextResponse.json({ error: 'Origine invalide' }, { status: 403 })
  const auth = await assertAuthenticated()
  if (!auth.ok) return auth.response
  const parsed = removalSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Requête invalide' }, { status: 400 })
  await createAdminClient()
    .from('push_subscriptions')
    .delete()
    .eq('endpoint', parsed.data.endpoint)
    .eq('user_id', auth.ctx.userId)
  return NextResponse.json({ ok: true })
}
