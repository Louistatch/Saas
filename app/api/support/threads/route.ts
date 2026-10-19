import { assertAuthenticated } from '@/lib/security/assert-access'
import { createClient as createAdminClient } from '@/lib/supabase/admin'
// « Mes échanges » : les messages envoyés par le compte connecté, avec les réponses reçues.
import { repliesFor } from '@/lib/support-threads'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  const auth = await assertAuthenticated()
  if (!auth.ok) return auth.response
  const admin = createAdminClient()
  const { data } = await admin
    .from('contact_messages')
    .select('id, category, subject, message, status, created_at, last_reply_at, user_last_read_at')
    .eq('user_id', auth.ctx.userId)
    .order('created_at', { ascending: false })
    .limit(50)
  const rows = data ?? []
  const replies = await repliesFor(
    admin,
    rows.map((r) => r.id),
  )
  const threads = rows.map((r) => {
    const list = replies.get(r.id) ?? []
    const lastRead = r.user_last_read_at ? new Date(r.user_last_read_at).getTime() : 0
    const unread = list.filter(
      (x) => x.author_role !== 'utilisateur' && new Date(x.created_at).getTime() > lastRead,
    ).length
    return { ...r, replies: list, unread }
  })
  return NextResponse.json(
    { threads, unread: threads.reduce((n, t) => n + t.unread, 0) },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
