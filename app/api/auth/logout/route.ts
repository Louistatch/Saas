import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * POST /api/auth/logout
 * 
 * Server-side logout — required to clear httpOnly cookies set by @supabase/ssr.
 * Client-side document.cookie cannot delete httpOnly cookies.
 * 
 * Flow:
 * 1. Server reads cookies, calls supabase.auth.signOut() with scope:'global'
 * 2. The Supabase SSR client clears the auth cookies via the cookies() handler
 * 3. Refresh token is invalidated server-side on Supabase
 */
export async function POST() {
  try {
    const supabase = await createClient()
    // signOut with global scope revokes the refresh token on Supabase
    // The SSR client also clears the auth cookies via the cookies() handler
    await supabase.auth.signOut({ scope: 'global' })
  } catch {
    // Even if signOut fails, return success — client will clear local state anyway
  }

  return NextResponse.json({ ok: true })
}
