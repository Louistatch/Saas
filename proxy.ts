import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'

export async function proxy(request: NextRequest) {
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
  const pathname = request.nextUrl.pathname

  // Resolve role for admin-area gating. We trust the JWT app_metadata first,
  // then fall back to the user_metadata claim, then null.
  const role: string | undefined =
    (user?.app_metadata as { role?: string } | undefined)?.role ??
    (user?.user_metadata as { role?: string } | undefined)?.role

  // Protected app surfaces
  if (!user && (pathname.startsWith('/dashboard') || pathname.startsWith('/admin'))) {
    const url = request.nextUrl.clone()
    url.pathname = '/auth/login'
    url.searchParams.set('redirect', pathname)
    return NextResponse.redirect(url)
  }

  // /admin requires super_admin
  if (user && pathname.startsWith('/admin') && role && role !== 'super_admin') {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  // Authed users away from auth pages
  if (user && (pathname.startsWith('/auth/login') || pathname.startsWith('/auth/signup'))) {
    if (role === 'super_admin') {
      return NextResponse.redirect(new URL('/admin', request.url))
    }
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
