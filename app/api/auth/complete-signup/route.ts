/**
 * POST /api/auth/complete-signup  (AUTH-03)
 *
 * Server-side completion of the signup flow. The browser must NEVER insert into
 * `cooperatives` directly — it would run before the role is assigned and could
 * be abused to create arbitrary cooperatives.
 *
 * Flow (all server-side):
 *   1. Verify the caller's identity via their session cookie (getUser).
 *   2. Ensure the profile row exists (trigger may be slightly delayed).
 *   3. Create the cooperative with the admin (service_role) client.
 *   4. Promote the caller via bootstrap_cooperative_admin (anti self-promote).
 *
 * @security session-authenticated + service_role for the privileged insert
 * @security rate limited via the 'auth' bucket
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@/lib/supabase/admin'
import { createLogger } from '@/lib/utils/logger'
import { applyRateLimit } from '@/lib/utils/rate-limit-persistent'
import { cooperativeNameSchema } from '@/lib/validators/kobo'

const log = createLogger('api:auth:complete-signup')

const MAX_PROFILE_WAIT = 8
const PROFILE_WAIT_MS = 400

export async function POST(request: NextRequest) {
  const rateLimitBlock = await applyRateLimit(request, 'auth')
  if (rateLimitBlock) return rateLimitBlock

  // 1. Authenticate the caller from their session.
  const supabase = await createServerClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Parse + validate body.
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = cooperativeNameSchema.safeParse(
    (body as { cooperativeName?: unknown })?.cooperativeName,
  )
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid cooperative name', issues: parsed.error.flatten().formErrors },
      { status: 400 },
    )
  }
  const cooperativeName = parsed.data

  const admin = createAdminClient()

  // 2. Wait for the trigger-created profile (it may lag a few hundred ms).
  let profileReady = false
  for (let i = 0; i < MAX_PROFILE_WAIT; i++) {
    const { data: profile } = await admin
      .from('profiles')
      .select('id, role')
      .eq('id', user.id)
      .maybeSingle()
    if (profile) {
      // Refuse if the user is already privileged (idempotency / anti-abuse).
      if (profile.role === 'cooperative_admin' || profile.role === 'super_admin') {
        return NextResponse.json(
          { error: 'Account already linked to a cooperative' },
          { status: 409 },
        )
      }
      profileReady = true
      break
    }
    await new Promise((r) => setTimeout(r, PROFILE_WAIT_MS))
  }

  if (!profileReady) {
    log.error('Profile trigger did not run within timeout', { userId: user.id })
    return NextResponse.json(
      { error: 'Profile not ready, please retry' },
      { status: 503 },
    )
  }

  // 3. Create the cooperative with the privileged client.
  const { data: coop, error: coopError } = await admin
    .from('cooperatives')
    .insert({ name: cooperativeName, description: '' })
    .select('id')
    .single<{ id: string }>()

  if (coopError || !coop) {
    log.error('Failed to create cooperative on signup', { error: coopError?.message })
    return NextResponse.json({ error: 'Failed to create cooperative' }, { status: 500 })
  }

  // 4. Promote the caller. bootstrap_cooperative_admin enforces caller=target,
  //    so we call it through the *user-scoped* client (auth.uid() = caller).
  const { error: bootstrapErr } = await supabase.rpc('bootstrap_cooperative_admin', {
    target_user_id: user.id,
    target_cooperative_id: coop.id,
  })

  if (bootstrapErr) {
    log.error('Failed to bootstrap cooperative admin', { error: bootstrapErr.message })
    // Roll back the orphan cooperative to avoid dangling tenants.
    await admin.from('cooperatives').delete().eq('id', coop.id)
    return NextResponse.json({ error: 'Failed to assign admin role' }, { status: 500 })
  }

  return NextResponse.json({ ok: true, cooperativeId: coop.id })
}
