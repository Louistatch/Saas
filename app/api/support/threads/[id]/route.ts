import { assertAuthenticated } from '@/lib/security/assert-access'
import { createClient as createAdminClient } from '@/lib/supabase/admin'
// Action de l'expéditeur sur sa conversation : la marquer lue, ou répondre.
import { addReply } from '@/lib/support-threads'
import { rateLimit } from '@/lib/utils/rate-limit'
import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

const schema = z.union([
  z.object({ action: z.literal('read') }),
  z.object({ action: z.literal('reply'), body: z.string().trim().min(1).max(4000) }),
])

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (request.headers.get('origin') !== request.nextUrl.origin) {
    return NextResponse.json({ error: 'Origine invalide' }, { status: 403 })
  }
  const auth = await assertAuthenticated()
  if (!auth.ok) return auth.response
  const { id } = await params
  const parsed = schema.safeParse(await request.json().catch(() => null))
  if (!z.string().uuid().safeParse(id).success || !parsed.success) {
    return NextResponse.json({ error: 'Requête invalide' }, { status: 400 })
  }
  const admin = createAdminClient()
  const { data: msg } = await admin
    .from('contact_messages')
    .select('user_id')
    .eq('id', id)
    .maybeSingle()
  if (!msg || msg.user_id !== auth.ctx.userId) {
    return NextResponse.json({ error: 'Conversation introuvable' }, { status: 404 })
  }
  if (parsed.data.action === 'read') {
    await admin
      .from('contact_messages')
      .update({ user_last_read_at: new Date().toISOString() })
      .eq('id', id)
    return NextResponse.json({ ok: true })
  }
  if (!rateLimit(`support-reply:${auth.ctx.userId}`, 10, 600_000).ok) {
    return NextResponse.json(
      { error: 'Patientez quelques minutes avant de répondre à nouveau.' },
      { status: 429 },
    )
  }
  const body = parsed.data.body
  const result = await addReply(admin, {
    messageId: id,
    authorId: auth.ctx.userId,
    role: 'utilisateur',
    body,
  })
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 502 })
  return NextResponse.json({ ok: true })
}
