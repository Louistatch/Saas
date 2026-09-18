/**
 * Shared logic for completing the cooperative admin signup.
 * Called from both:
 *   - POST /api/auth/complete-signup  (when email confirmation is OFF)
 *   - GET  /auth/callback             (when email confirmation is ON, after code exchange)
 */
import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient as createAdminClient } from '@/lib/supabase/admin'
import { createLogger } from '@/lib/utils/logger'
import { cooperativeNameSchema } from '@/lib/validators/kobo'

const log = createLogger('auth:complete-signup')

const MAX_PROFILE_WAIT = 8
const PROFILE_WAIT_MS = 400

export type CompleteSignupResult =
  | { ok: true; cooperativeId: string }
  | { ok: false; status: number; error: string }

export async function runCompleteSignup(
  supabase: SupabaseClient,
  rawCooperativeName: string,
): Promise<CompleteSignupResult> {
  // Validate the cooperative name
  const parsed = cooperativeNameSchema.safeParse(rawCooperativeName)
  if (!parsed.success) {
    return { ok: false, status: 400, error: 'Invalid cooperative name' }
  }
  const cooperativeName = parsed.data

  // Verify the caller has an active session
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    return { ok: false, status: 401, error: 'Unauthorized' }
  }

  const admin = createAdminClient()

  // Wait for the DB trigger to create the profile row
  let profileReady = false
  for (let i = 0; i < MAX_PROFILE_WAIT; i++) {
    const { data: profile } = await admin
      .from('profiles')
      .select('id, role')
      .eq('id', user.id)
      .maybeSingle()

    if (profile) {
      if (profile.role === 'cooperative_admin' || profile.role === 'super_admin') {
        // Already bootstrapped — idempotent, treat as success
        return { ok: false, status: 409, error: 'Account already linked to a cooperative' }
      }
      profileReady = true
      break
    }
    await new Promise((r) => setTimeout(r, PROFILE_WAIT_MS))
  }

  if (!profileReady) {
    log.error('Profile trigger did not run within timeout', { userId: user.id })
    return { ok: false, status: 503, error: 'Profile not ready, please retry' }
  }

  // Create the cooperative
  const { data: coop, error: coopError } = await admin
    .from('cooperatives')
    .insert({ name: cooperativeName, description: '' })
    .select('id')
    .single<{ id: string }>()

  if (coopError || !coop) {
    log.error('Failed to create cooperative', { error: coopError?.message })
    return { ok: false, status: 500, error: 'Failed to create cooperative' }
  }

  // Promote the caller via the user-scoped client (auth.uid() must match target)
  const { error: bootstrapErr } = await supabase.rpc('bootstrap_cooperative_admin', {
    target_user_id: user.id,
    target_cooperative_id: coop.id,
  })

  if (bootstrapErr) {
    log.error('Failed to bootstrap cooperative admin', { error: bootstrapErr.message })
    await admin.from('cooperatives').delete().eq('id', coop.id)
    return { ok: false, status: 500, error: 'Failed to assign admin role' }
  }

  return { ok: true, cooperativeId: coop.id }
}
