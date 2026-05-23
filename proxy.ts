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

  const isProtected = pathname.startsWith('/dashboard') || pathname.startsWith('/admin')
  const isAuthPage = pathname.startsWith('/auth/login') || pathname.startsWith('/auth/signup')

  // Fast path: public routes — no auth check needed
  if (!isProtected && !isAuthPage) {
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
    url.searchParams.set('redirect', pathname)
    return NextResponse.redirect(url)
  }

  // /admin requires super_admin
  if (user && pathname.startsWith('/admin') && role !== 'super_admin') {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  // Auth pages: NEVER redirect from /auth/login
  if (user && pathname.startsWith('/auth/signup')) {
    return NextResponse.redirect(new URL(
      role === 'super_admin' ? '/admin' : '/dashboard',
      request.url,
    ))
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
}
