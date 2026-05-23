/**
 * Centralized server-side access control assertions.
 * Use these in API routes and Server Actions to enforce authorization.
 * 
 * These functions throw or return error responses — they are the LAST LINE
 * of defense after RLS. Use them for defense-in-depth.
 */
import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export interface AccessContext {
  userId: string
  role: 'super_admin' | 'cooperative_admin' | 'member' | 'guest'
  cooperativeId: string | null
  cooperativeLevel: string | null
  supabase: Awaited<ReturnType<typeof createClient>>
}

/**
 * Authenticate the current request and return the user's access context.
 * Returns null if not authenticated.
 */
export async function getAccessContext(): Promise<AccessContext | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, cooperative_id')
    .eq('id', user.id)
    .single<{ role: string; cooperative_id: string | null }>()

  if (!profile) return null

  // Get cooperative level if applicable
  let cooperativeLevel: string | null = null
  if (profile.cooperative_id) {
    const { data: coop } = await supabase
      .from('cooperatives')
      .select('level')
      .eq('id', profile.cooperative_id)
      .single<{ level: string | null }>()
    cooperativeLevel = coop?.level ?? null
  }

  return {
    userId: user.id,
    role: profile.role as AccessContext['role'],
    cooperativeId: profile.cooperative_id,
    cooperativeLevel,
    supabase,
  }
}

/**
 * Assert that the user is authenticated. Returns 401 response if not.
 */
export async function assertAuthenticated() {
  const ctx = await getAccessContext()
  if (!ctx) {
    return { ok: false as const, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }
  return { ok: true as const, ctx }
}

/**
 * Assert that the user has at least the specified role.
 */
export async function assertRole(requiredRole: 'super_admin' | 'cooperative_admin') {
  const result = await assertAuthenticated()
  if (!result.ok) return result

  const { ctx } = result
  if (requiredRole === 'super_admin' && ctx.role !== 'super_admin') {
    return { ok: false as const, response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }
  if (requiredRole === 'cooperative_admin' && ctx.role !== 'super_admin' && ctx.role !== 'cooperative_admin') {
    return { ok: false as const, response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }
  return { ok: true as const, ctx }
}

/**
 * Assert that the user can access a specific cooperative's data.
 * Checks hierarchy: faitiere admins can access child cooperatives.
 */
export async function assertTenantAccess(cooperativeId: string) {
  const result = await assertRole('cooperative_admin')
  if (!result.ok) return result

  const { ctx } = result
  if (ctx.role === 'super_admin') {
    return { ok: true as const, ctx }
  }

  // Check if the target cooperative is in the user's accessible hierarchy
  const { data } = await ctx.supabase.rpc('get_accessible_cooperative_ids')
  const accessibleIds = (data as string[] | null) ?? []

  if (!accessibleIds.includes(cooperativeId)) {
    return { ok: false as const, response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }

  return { ok: true as const, ctx }
}

/**
 * Assert that the user is a faitiere-level admin (required for fiches upload).
 */
export async function assertFaitiereAccess() {
  const result = await assertRole('cooperative_admin')
  if (!result.ok) return result

  const { ctx } = result
  if (ctx.role === 'super_admin') {
    return { ok: true as const, ctx }
  }

  if (ctx.cooperativeLevel !== 'faitiere') {
    return { ok: false as const, response: NextResponse.json(
      { error: 'Seuls les administrateurs de faîtière peuvent effectuer cette action' },
      { status: 403 },
    )}
  }

  return { ok: true as const, ctx }
}
