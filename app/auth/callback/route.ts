import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { runCompleteSignup } from '@/lib/auth/complete-signup'
import { createLogger } from '@/lib/utils/logger'

const log = createLogger('auth:callback')

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next')
  const type = searchParams.get('type')
  // cooperative name encoded by signup() in auth-context when email confirmation is ON
  const cooperativeParam = searchParams.get('cooperative')

  // Use request.nextUrl.origin as the trusted base URL
  // NEVER trust x-forwarded-host for redirect targets (open redirect risk)
  const base = request.nextUrl.origin

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error) {
      // AUTH-05: password-recovery links carry type=recovery.
      if (type === 'recovery') {
        return NextResponse.redirect(`${base}/auth/reset-password`)
      }

      // C1+C2 FIX: Email-confirmation links (type=signup or type=email).
      // The session is now active — if a cooperativeName was encoded in the
      // redirect URL, run complete-signup now before sending to the dashboard.
      if (type === 'signup' || type === 'email') {
        if (cooperativeParam) {
          const cooperativeName = decodeURIComponent(cooperativeParam)
          const result = await runCompleteSignup(supabase, cooperativeName)
          if (!result.ok && result.status !== 409) {
            // 409 = already linked (idempotent), treat as success.
            // Any other error → send to a recoverable error page so the user
            // can retry rather than silently land on a broken dashboard.
            log.error('complete-signup failed in callback', {
              status: result.status,
              error: result.error,
            })
            return NextResponse.redirect(
              `${base}/auth/login?error=setup_failed&retry=1`,
            )
          }
        } else {
          // cooperativeParam may have been stripped by an email client.
          // Check if the profile already has a cooperative; if not, send to
          // onboarding so the user can finish setup instead of landing on a
          // broken dashboard with no cooperative context.
          const { data: { user: cbUser } } = await supabase.auth.getUser()
          if (cbUser) {
            const { data: cbProfile } = await supabase
              .from('profiles')
              .select('cooperative_id')
              .eq('id', cbUser.id)
              .maybeSingle()
            if (!cbProfile?.cooperative_id) {
              return NextResponse.redirect(`${base}/dashboard?welcome=1`)
            }
          }
        }
        return NextResponse.redirect(`${base}/dashboard?welcome=1`)
      }

      // All other events (magic link, OAuth, etc.) — route by role.
      const { data: { user }, error: userError } = await supabase.auth.getUser()

      if (userError || !user) {
        return NextResponse.redirect(`${base}/auth/login?error=callback_failed`)
      }

      // `profiles` fait foi. Ce callback ne s'exécute qu'une fois par
      // connexion : on peut s'offrir la lecture, contrairement au middleware
      // qui tourne à chaque requête et se contente des claims.
      const { data: profile } = await supabase
        .from('profiles')
        .select('role, haroo_type')
        .eq('id', user.id)
        .maybeSingle<{ role: string; haroo_type: string | null }>()

      const role = profile?.role
      const hasOrg = !!role && !['none', 'ouvrier', 'acheteur', 'agronome'].includes(role)
      const hasHaroo =
        !!profile?.haroo_type ||
        (!!role && ['ouvrier', 'acheteur', 'agronome'].includes(role))

      // Validate ?next parameter: must start with '/' and not '//' (open redirect prevention)
      const validNext = next && /^\/[^/]/.test(next) ? next : null

      if (validNext) {
        return NextResponse.redirect(`${base}${validNext}`)
      }

      if (role === 'super_admin') {
        return NextResponse.redirect(`${base}/admin`)
      }

      // Couche organisationnelle prioritaire : son dashboard porte la bascule
      // vers Haroo pour les comptes qui ont les deux.
      if (!hasOrg && hasHaroo) {
        return NextResponse.redirect(`${base}/haroo`)
      }

      return NextResponse.redirect(`${base}/dashboard`)
    }
  }

  return NextResponse.redirect(`${base}/auth/login?error=callback_failed`)
}
