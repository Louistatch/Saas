import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next')
  const type = searchParams.get('type')

  // Use request.nextUrl.origin as the trusted base URL
  // NEVER trust x-forwarded-host for redirect targets (open redirect risk)
  const base = request.nextUrl.origin

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error) {
      // AUTH-05: password-recovery links carry type=recovery. After exchanging
      // the code (which creates the recovery session), route the user to the
      // set-new-password screen instead of the dashboard.
      if (type === 'recovery') {
        return NextResponse.redirect(`${base}/auth/reset-password`)
      }

      // Email-confirmation links (type=signup) → welcome the user.
      if (type === 'signup' || type === 'email') {
        return NextResponse.redirect(`${base}/dashboard?welcome=1`)
      }

      // Check user role from app_metadata ONLY (server-controlled, never user_metadata)
      const { data: { user }, error: userError } = await supabase.auth.getUser()

      if (userError || !user) {
        return NextResponse.redirect(`${base}/auth/login?error=callback_failed`)
      }

      // Role from app_metadata — the ONLY trusted source
      const role = (user.app_metadata as { role?: string } | undefined)?.role

      // Validate ?next parameter: must start with '/' and not '//' (open redirect prevention)
      const validNext = next && /^\/[^/]/.test(next) ? next : null

      if (validNext) {
        return NextResponse.redirect(`${base}${validNext}`)
      }

      if (role === 'super_admin') {
        return NextResponse.redirect(`${base}/admin`)
      }

      return NextResponse.redirect(`${base}/dashboard`)
    }
  }

  return NextResponse.redirect(`${base}/auth/login?error=callback_failed`)
}
