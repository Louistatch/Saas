import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'

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
  const isVercelDomain = hostname.endsWith('.vercel.app') || hostname === 'saas-one-teal-62.vercel.app'
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

  // Refresh session on EVERY request — this is the Supabase-recommended pattern.
  // It ensures the JWT stays fresh and cookies are properly rotated.
  const { data: { user } } = await supabase.auth.getUser()

  // ─── Route protection logic ───
  const isProtected = pathname.startsWith('/dashboard') || pathname.startsWith('/admin')
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

  // /admin requires super_admin
  if (user && pathname.startsWith('/admin')) {
    const role = (user.app_metadata as { role?: string } | undefined)?.role
    if (role !== 'super_admin') {
      return NextResponse.redirect(new URL('/dashboard', request.url))
    }
  }

  // Auth pages: if already authenticated, redirect to dashboard (avoid login page when logged in)
  if (isAuthPage && user && pathname === '/auth/login') {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
}
