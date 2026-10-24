import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { memberSearchFilters } from '@/lib/members/search'
import { assertRole, assertTenantAccess } from '@/lib/security/assert-access'

const schema = z.object({
  cooperative_id: z.string().uuid(),
  page: z.coerce.number().int().min(1).max(100_000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  q: z.string().trim().max(100).default(''),
})
export async function GET(request: NextRequest) {
  const guard = await assertRole('cooperative_admin')
  if (!guard.ok) return guard.response
  const parsed = schema.safeParse(Object.fromEntries(request.nextUrl.searchParams))
  if (!parsed.success) return NextResponse.json({ error: 'Recherche invalide' }, { status: 400 })
  const { cooperative_id, page, limit, q } = parsed.data
  const tenant = await assertTenantAccess(cooperative_id)
  if (!tenant.ok) return tenant.response
  let query = guard.ctx.supabase
    .from('members')
    .select('*', { count: 'exact' })
    .eq('cooperative_id', cooperative_id)
    .is('deleted_at', null)
    .order('last_name')
    .order('first_name')
    .order('id')
  for (const filter of memberSearchFilters(q)) query = query.or(filter)
  const { data, error, count } = await query.range((page - 1) * limit, page * limit - 1)
  if (error) return NextResponse.json({ error: 'Lecture des membres impossible' }, { status: 503 })
  return NextResponse.json(
    { members: data ?? [], total: count ?? 0, page, pageSize: limit },
    { headers: { 'Cache-Control': 'private, no-store' } },
  )
}
