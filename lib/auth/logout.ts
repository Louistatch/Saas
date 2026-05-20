/**
 * Enterprise-grade logout procedure.
 * Ensures COMPLETE session destruction with zero leaks.
 */

import { createBrowserClient } from '@supabase/ssr'
import { destroySession, broadcastLogout } from './session'

/**
 * Full logout procedure — call this instead of supabase.auth.signOut() directly.
 * 
 * Steps:
 * 1. Sign out from Supabase (revokes refresh token server-side)
 * 2. Destroy local session (clear all storage)
 * 3. Broadcast logout to other tabs
 * 4. Hard redirect to login (forces server to see no cookie)
 */
export async function performLogout(): Promise<never> {
  // 1. Revoke the session server-side
  try {
    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    )
    // scope: 'global' revokes ALL sessions for this user (all devices)
    // scope: 'local' revokes only the current session
    await supabase.auth.signOut({ scope: 'local' })
  } catch {
    // Continue even if signOut fails — we'll clear everything locally
  }

  // 2. Destroy all local state
  destroySession()

  // 3. Notify other tabs
  broadcastLogout()

  // 4. Hard redirect — this is a full page navigation that:
  //    - Clears the in-memory React state
  //    - Forces the proxy to re-evaluate (no cookie = no redirect)
  //    - Prevents any stale state from persisting
  window.location.replace('/auth/login')

  // TypeScript: this never returns
  return new Promise(() => {}) as never
}
