import { createServerClient } from '@supabase/ssr'
import { type NextRequest, NextResponse } from 'next/server'

/**
 * Next.js middleware — PRIMARY auth gate (SEC-01 / AUTH-07).
 *
 * CRITICAL: refreshes the Supabase session on EVERY request to keep the JWT
 * cookies alive server-side. This is the Supabase-recommended pattern for
 * Next.js App Router and prevents:
 *   - stale-JWT redirect loops after login
 *   - silent token expiry in Server Components / API routes (AUTH-07)
 *
 * Scale note (10M MAU): getUser() here hits Supabase Auth, but the result is
 * cookie-cached by @supabase/ssr; only expired tokens trigger a refresh round-trip.
 */
export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname
  const hostname = request.headers.get('host') ?? ''

  // Domain redirect: force all Vercel preview/production URLs to www.faitierehub.com
  const isVercelDomain =
    hostname.endsWith('.vercel.app') || hostname === 'saas-one-teal-62.vercel.app'
  const isProductionDomain = hostname === 'www.faitierehub.com' || hostname === 'faitierehub.com'

  if (isVercelDomain && !isProductionDomain) {
    const url = new URL(request.url)
    url.hostname = 'www.faitierehub.com'
    url.port = ''
    url.protocol = 'https:'
    return NextResponse.redirect(url.toString(), { status: 301 })
  }

  if (hostname === 'faitierehub.com') {
    const url = new URL(request.url)
    url.hostname = 'www.faitierehub.com'
    return NextResponse.redirect(url.toString(), { status: 301 })
  }

  // ─── ALWAYS refresh session (keeps cookies alive on every navigation) ───
  let supabaseResponse = NextResponse.next({ request })

  // Ce code s'exécute sur chaque requête. Sans ces variables, `createServerClient`
  // lève, et le site entier répond 500 sur une erreur illisible. On laisse
  // plutôt passer la requête sans rafraîchir la session : l'utilisateur devra
  // se reconnecter, mais rien ne s'ouvre pour autant — le middleware ne décide
  // d'aucun accès, les gardes serveur (`assertRole`, lisant `profiles`) et le
  // RLS restent seuls juges, et ils échouent fermés.
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!supabaseUrl || !supabaseAnonKey) {
    console.error(
      '[middleware] NEXT_PUBLIC_SUPABASE_URL ou NEXT_PUBLIC_SUPABASE_ANON_KEY manquante — session non rafraîchie',
    )
    return supabaseResponse
  }

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
        supabaseResponse = NextResponse.next({ request })
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options),
        )
      },
    },
  })

  // Refresh session on EVERY request — this is the Supabase-recommended pattern.
  // It ensures the JWT stays fresh and cookies are properly rotated.
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // ─── Route protection logic ───
  const isProtected =
    pathname.startsWith('/dashboard') ||
    pathname.startsWith('/admin') ||
    pathname.startsWith('/operator')
  const isAuthPage = pathname.startsWith('/auth/')

  // Protected routes: redirect unauthenticated users
  if (isProtected && !user) {
    const url = request.nextUrl.clone()
    url.pathname = '/auth/login'
    if (/^\/[^/]/.test(pathname)) {
      url.searchParams.set('redirect', pathname)
    }
    return NextResponse.redirect(url)
  }

  // Les claims du JWT ne sont qu'un miroir de `profiles`, rafraîchi au
  // renouvellement du jeton. Ils peuvent être absents (comptes antérieurs au
  // hook) ou périmés (entre une activation et le refresh). Ils servent donc
  // au routage, jamais à l'autorisation.
  const claims = user?.app_metadata as
    | { role?: string; haroo_type?: string; account_type?: string }
    | undefined

  // /admin : pré-filtre peu coûteux seulement. On ne détourne que sur un claim
  // présent ET contradictoire — un claim absent laisse passer, et c'est
  // requireRole('super_admin') dans app/admin/layout.tsx, qui lit `profiles`,
  // qui trancherait. Bloquer sur un claim manquant fermerait la porte aux
  // super_admins dont app_metadata n'a jamais été renseigné.
  if (user && pathname.startsWith('/admin')) {
    if (claims?.role && claims.role !== 'super_admin') {
      return NextResponse.redirect(new URL('/dashboard', request.url))
    }
  }

  // Auth pages: if already authenticated, redirect to their space (avoid login page when logged in)
  if (isAuthPage && user && pathname === '/auth/login') {
    // Un compte porte deux couches indépendantes. La couche organisationnelle
    // prime : son dashboard porte la bascule vers Haroo.
    const orgRole = claims?.role
    const hasOrg = !!orgRole && !['none', 'ouvrier', 'acheteur', 'agronome'].includes(orgRole)
    const hasHaroo = !!claims?.haroo_type
    const isOperator = claims?.account_type === 'operator'
    const destination = hasOrg
      ? '/dashboard'
      : isOperator
        ? '/operator'
        : hasHaroo
          ? '/haroo'
          : '/dashboard'
    return NextResponse.redirect(new URL(destination, request.url))
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
}
