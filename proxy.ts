import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'

/**
 * Optimized proxy (Next 16 convention, replaces middleware.ts).
 * Only calls getUser() on protected routes to avoid unnecessary latency.
 */
export async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname

  // Fast path: skip auth check for public routes
  const isProtected = pathname.startsWith('/dashboard') || pathname.startsWith('/admin')
  const isAuthPage = pathname.startsWith('/auth/login') || pathname.startsWith('/auth/signup')

  // Static dashboard pages that don't need fresh auth check on every pre-render
  const isStaticDashboard = pathname === '/dashboard/kobo-setup'

  // If neither protected nor auth page, just pass through (no DB call)
  if (!isProtected && !isAuthPage) {
    return NextResponse.next({ request })
  }

  // Static dashboard pages: still protected but don't need getUser() on every edge pre-render
  // The client-side ProtectedRoute handles the actual auth check
  if (isStaticDashboard && request.headers.get('purpose') === 'prefetch') {
    return NextResponse.next({ request })
  }

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

  // Refresh session — keeps JWT alive
  const { data: { user } } = await supabase.auth.getUser()

  // Resolve role from JWT for admin-area gating
  const role: string | undefined =
    (user?.app_metadata as { role?: string } | undefined)?.role ??
    (user?.user_metadata as { role?: string } | undefined)?.role

  // Protected routes: redirect unauthenticated users
  if (isProtected && !user) {
    const url = request.nextUrl.clone()
    url.pathname = '/auth/login'
    url.searchParams.set('redirect', pathname)
    return NextResponse.redirect(url)
  }

  // /admin requires super_admin
  if (user && pathname.startsWith('/admin') && role && role !== 'super_admin') {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  // Auth pages: NEVER redirect away from /auth/login
  // If someone goes to /auth/login, they want to login — period.
  // Only redirect away from /auth/signup if already authenticated.
  if (user && pathname.startsWith('/auth/signup')) {
    if (role === 'super_admin') {
      return NextResponse.redirect(new URL('/admin', request.url))
    }
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
}
