import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'

/**
 * Proxy (Next 16 convention) — PRIMARY auth gate.
 * 
 * This is the SINGLE authority for server-side auth.
 * The client-side ProtectedRoute just waits for AuthProvider to load.
 * 
 * Optimization: only calls getUser() when strictly necessary.
 */
export async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname
  const hostname = request.headers.get('host') ?? ''

  // Domain redirect: force all Vercel preview/production URLs to www.faitierehub.com
  // This ensures QR codes always show the branded domain
  const isVercelDomain = hostname.endsWith('.vercel.app') || hostname === 'saas-one-teal-62.vercel.app'
  const isProductionDomain = hostname === 'www.faitierehub.com' || hostname === 'faitierehub.com'

  if (isVercelDomain && !isProductionDomain) {
    const url = new URL(request.url)
    url.hostname = 'www.faitierehub.com'
    url.port = ''
    url.protocol = 'https:'
    return NextResponse.redirect(url.toString(), { status: 301 })
  }

  // Redirect bare domain to www
  if (hostname === 'faitierehub.com') {
    const url = new URL(request.url)
    url.hostname = 'www.faitierehub.com'
    return NextResponse.redirect(url.toString(), { status: 301 })
  }

  const isProtected = pathname.startsWith('/dashboard') || pathname.startsWith('/admin')
  const isAuthPage = pathname.startsWith('/auth/')

  // Fast path: public routes — no auth check needed
  if (!isProtected && !isAuthPage) {
    return NextResponse.next({ request })
  }

  // FAST PATH: ALL auth pages load INSTANTLY — zero server-side auth check
  // Facebook technique: login/signup pages never wait for session validation.
  // If user is already logged in, the CLIENT-SIDE AuthProvider will detect it
  // and redirect. This eliminates the "stuck on login" bug when cookies are stale.
  if (isAuthPage) {
    return NextResponse.next({ request })
  }

  // Prefetch requests: skip auth ONLY for non-protected routes (already handled above)
  // Protected routes MUST always be auth-checked, even for prefetch


  // Set up Supabase server client with cookie handling
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
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
    },
  )

  // Refresh session (keeps JWT alive, rotates refresh token)
  const { data: { user } } = await supabase.auth.getUser()

  // Resolve role from JWT — ONLY from app_metadata (server-controlled)
  // NEVER trust user_metadata for authorization decisions
  const role: string | undefined =
    (user?.app_metadata as { role?: string } | undefined)?.role

  // Protected routes: redirect unauthenticated users
  if (isProtected && !user) {
    const url = request.nextUrl.clone()
    url.pathname = '/auth/login'
    // Validate redirect parameter: must start with '/' and NOT '//' (open redirect prevention)
    if (/^\/[^/]/.test(pathname)) {
      url.searchParams.set('redirect', pathname)
    }
    return NextResponse.redirect(url)
  }

  // /admin requires super_admin
  if (user && pathname.startsWith('/admin') && role !== 'super_admin') {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  // Auth pages: if user is already authenticated, redirect to dashboard
  // But NEVER redirect from /auth/login — user might be re-authenticating
  // NOTE: This code is unreachable now (auth pages return early above)
  // Kept as documentation of the intended behavior.
  // The CLIENT-SIDE handles this redirect via useEffect in signup page.

  // Auth pages: skip getUser() entirely for login/forgot/reset — no need to validate
  // This makes the login page load INSTANTLY after logout (no network call)
  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
}
