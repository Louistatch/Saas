// Réponse d'un opérateur de la zone dans la conversation (jamais sur son propre message).
import { assertAuthenticated } from '@/lib/security/assert-access'
import { createClient as createAdminClient } from '@/lib/supabase/admin'
import { addReply } from '@/lib/support-threads'
import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (request.headers.get('origin') !== request.nextUrl.origin) {
    return NextResponse.json({ error: 'Origine invalide' }, { status: 403 })
  }
  const auth = await assertAuthenticated()
  if (!auth.ok) return auth.response
  const { id } = await params
  const body = z
    .string()
    .trim()
    .min(1)
    .max(4000)
    .safeParse((await request.json().catch(() => null))?.body)
  if (!z.string().uuid().safeParse(id).success || !body.success) {
    return NextResponse.json({ error: 'Écrivez une réponse.' }, { status: 400 })
  }
  const admin = createAdminClient()
  const { data: msg } = await admin
    .from('contact_messages')
    .select('cooperative_id, user_id, category')
    .eq('id', id)
    .maybeSingle()
  if (
    !msg?.cooperative_id ||
    !msg.category?.startsWith('support:') ||
    msg.user_id === auth.ctx.userId
  ) {
    return NextResponse.json({ error: 'Conversation introuvable' }, { status: 404 })
  }
  const { data: operators } = await admin.rpc('support_zone_operators', {
    p_coop: msg.cooperative_id,
    p_exclude: msg.user_id,
  })
  if (!((operators as string[] | null) ?? []).includes(auth.ctx.userId)) {
    return NextResponse.json({ error: 'Ce message n’est pas dans votre zone.' }, { status: 403 })
  }
  const result = await addReply(admin, {
    messageId: id,
    authorId: auth.ctx.userId,
    role: 'operateur',
    body: body.data,
  })
  return result.ok
    ? NextResponse.json({ ok: true })
    : NextResponse.json({ error: result.error }, { status: 502 })
}
