import { STALE_SESSION_PARAM, isOrgOnlyPath, safeInternalPath } from '@/lib/auth/safe-redirect'
import { redirectProductionVercelHost } from '@/lib/routing/vercel-canonical-host'
import { SITE_ORIGIN } from '@/lib/seo'
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

  // Production Vercel aliases use the canonical domain, but previews must
  // stay on their own URL; otherwise new routes resolve on the old live site (404).
  // NODE_ENV cannot distinguish these because all Vercel builds use production mode.
  if (redirectProductionVercelHost(hostname, process.env.VERCEL_ENV)) {
    const url = new URL(request.url)
    url.hostname = new URL(SITE_ORIGIN).hostname
    url.port = ''
    url.protocol = 'https:'
    return NextResponse.redirect(url.toString(), { status: 301 })
  }

  // The apex/www redirect belongs to Vercel Domains. Do not add the reverse
  // redirect here while its existing apex -> www rule is active (infinite loop).

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
    data: { user: sessionUser },
  } = await supabase.auth.getUser()
  // A HarooLife visitor (anonymous account) opens the game only: for FaîtiereHub they are signed
  // out, so the dashboards send them to the login page and the login page stays open to them.
  const user = sessionUser && !sessionUser.is_anonymous ? sessionUser : null

  // ─── Route protection logic ───
  const isProtected =
    pathname.startsWith('/dashboard') ||
    pathname.startsWith('/admin') ||
    pathname.startsWith('/operator') ||
    // Attestations et rapports : documents nominatifs, jamais sans session (la RLS filtre les
    // lignes, mais l'en-tête d'un « rapport officiel » s'affichait pour n'importe qui).
    pathname.startsWith('/reports')
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
  if (
    isAuthPage &&
    user &&
    pathname === '/auth/login' &&
    // Le garde côté client n'a pas trouvé de session alors que le serveur en voit une : renvoyer
    // la personne vers sa page bouclerait sans fin. On affiche le formulaire de connexion.
    request.nextUrl.searchParams.get(STALE_SESSION_PARAM) !== '1'
  ) {
    // Un compte porte deux couches indépendantes. La couche organisationnelle
    // prime : son dashboard porte la bascule vers Haroo.
    const orgRole = claims?.role
    const hasOrg = !!orgRole && !['none', 'ouvrier', 'acheteur', 'agronome'].includes(orgRole)
    const hasHaroo = !!claims?.haroo_type
    const isOperator = claims?.account_type === 'operator'
    // La page demandée (?redirect=) prime, comme après une connexion : /haroolife reste /haroolife.
    // Les gardes de chaque espace décident ensuite de l'accès ; un compte sans couche
    // organisationnelle n'est jamais envoyé vers le dashboard ou l'admin.
    const asked = safeInternalPath(
      request.nextUrl.searchParams.get('redirect'),
      request.nextUrl.origin,
      {
        refuseAuthPages: true,
      },
    )
    const requested = asked && (hasOrg || !isOrgOnlyPath(asked)) ? asked : null
    const destination =
      requested ??
      (hasOrg ? '/dashboard' : isOperator ? '/operator' : hasHaroo ? '/haroo' : '/dashboard')
    return NextResponse.redirect(new URL(destination, request.url))
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    // Static files never need the session: skipping them saves an invocation (and, for a signed-in
    // person, a Supabase Auth round trip) per 3D model, pack, font or manifest; /monitoring is the
    // Sentry tunnel.
    '/((?!_next/static|_next/image|favicon.ico|monitoring|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|avif|glb|gltf|bin|ktx2|json|webmanifest|woff2?|ttf|mp3|wav|js|txt|xml|map)$).*)',
  ],
}
