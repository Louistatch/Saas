import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error) {
      // Check user role to redirect appropriately
      const { data: { user } } = await supabase.auth.getUser()

      const forwardedHost = request.headers.get('x-forwarded-host')
      const proto = request.headers.get('x-forwarded-proto')
      const host = forwardedHost || request.headers.get('host') || ''
      const protocol = proto || 'http'
      const base = `${protocol}://${host}`

      if (user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', user.id)
          .single()

        if (profile?.role === 'super_admin') {
          return NextResponse.redirect(`${base}/admin`)
        }
      }

      return NextResponse.redirect(`${base}/dashboard`)
    }
  }

  return NextResponse.redirect(`${request.nextUrl.origin}/auth/login?error=callback_failed`)
}
