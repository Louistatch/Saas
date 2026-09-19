import { type NextRequest, NextResponse } from 'next/server'
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
      // AUTH-05: password-recovery links carry type=recovery.
      if (type === 'recovery') {
        return NextResponse.redirect(`${base}/auth/reset-password`)
      }

      // Confirmation d'email (type=signup ou type=email).
      // La création autonome de coopérative n'existe plus : les comptes
      // organisationnels sont créés par l'administration après demande
      // d'accès (/api/access-request). On se contente donc d'orienter.
      if (type === 'signup' || type === 'email') {
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
