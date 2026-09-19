import { assertRole } from '@/lib/security/assert-access'
import { createClient as createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'

const PAGE_SIZE = 30

/** Connexions récentes + total sur 30 jours par utilisateur. super_admin uniquement. */
export async function GET(request: Request) {
  const guard = await assertRole('super_admin')
  if (!guard.ok) return guard.response

  const url = new URL(request.url)
  const page = Math.max(1, Number.parseInt(url.searchParams.get('page') ?? '1', 10) || 1)
  const from = (page - 1) * PAGE_SIZE

  const admin = createAdminClient()

  const { data: events, count } = await admin
    .from('user_login_events')
    .select('id, user_id, ip_address, user_agent, created_at', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(from, from + PAGE_SIZE - 1)

  const userIds = [...new Set((events ?? []).map((e) => e.user_id))]
  const { data: profiles } =
    userIds.length > 0
      ? await admin.from('profiles').select('id, first_name, last_name, email').in('id', userIds)
      : { data: [] }
  const profileById = new Map((profiles ?? []).map((p) => [p.id, p]))

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
  const { data: recentAll } = await admin
    .from('user_login_events')
    .select('user_id')
    .gte('created_at', thirtyDaysAgo)
  const countByUser = new Map<string, number>()
  for (const row of recentAll ?? []) {
    countByUser.set(row.user_id, (countByUser.get(row.user_id) ?? 0) + 1)
  }

  const logins = (events ?? []).map((e) => {
    const profile = profileById.get(e.user_id)
    return {
      id: e.id,
      user_id: e.user_id,
      full_name: profile ? `${profile.first_name} ${profile.last_name}`.trim() : null,
      email: profile?.email ?? null,
      ip_address: e.ip_address,
      user_agent: e.user_agent,
      created_at: e.created_at,
      logins_last_30d: countByUser.get(e.user_id) ?? 0,
    }
  })

  return NextResponse.json({ logins, total: count ?? 0, page, page_size: PAGE_SIZE })
}
