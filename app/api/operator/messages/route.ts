// Messages d'assistance de la zone d'un opérateur (jamais les siens) et leur traitement.
import { assertAuthenticated } from '@/lib/security/assert-access'
import { createClient as createAdminClient } from '@/lib/supabase/admin'
import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const auth = await assertAuthenticated()
  if (!auth.ok) return auth.response
  const status = request.nextUrl.searchParams.get('status') === 'traite' ? 'traite' : 'nouveau'
  const { data, error } = await createAdminClient().rpc('operator_support_messages', {
    p_user: auth.ctx.userId,
    p_status: status,
  })
  if (error) return NextResponse.json({ error: 'Lecture impossible' }, { status: 500 })
  return NextResponse.json({ messages: data ?? [] }, { headers: { 'Cache-Control': 'no-store' } })
}

const patchSchema = z.object({ id: z.string().uuid(), status: z.enum(['nouveau', 'traite']) })

export async function PATCH(request: NextRequest) {
  if (request.headers.get('origin') !== request.nextUrl.origin) {
    return NextResponse.json({ error: 'Origine invalide' }, { status: 403 })
  }
  const auth = await assertAuthenticated()
  if (!auth.ok) return auth.response
  const parsed = patchSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Requête invalide' }, { status: 400 })
  const admin = createAdminClient()
  const { data: msg } = await admin
    .from('contact_messages')
    .select('cooperative_id, user_id, category')
    .eq('id', parsed.data.id)
    .maybeSingle()
  if (
    !msg?.cooperative_id ||
    !msg.category?.startsWith('support:') ||
    msg.user_id === auth.ctx.userId
  ) {
    return NextResponse.json({ error: 'Message introuvable' }, { status: 404 })
  }
  const { data: operators } = await admin.rpc('support_zone_operators', {
    p_coop: msg.cooperative_id,
    p_exclude: msg.user_id,
  })
  if (!((operators as string[] | null) ?? []).includes(auth.ctx.userId)) {
    return NextResponse.json({ error: 'Ce message n’est pas dans votre zone.' }, { status: 403 })
  }
  await admin
    .from('contact_messages')
    .update({ status: parsed.data.status })
    .eq('id', parsed.data.id)
  return NextResponse.json({ ok: true })
}
