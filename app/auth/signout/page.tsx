'use client'

import { useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

/**
 * Force sign-out page. Clears the Supabase session and redirects to login.
 * Visit /auth/signout to clear a stale session.
 */
export default function SignOutPage() {
  useEffect(() => {
    const supabase = createClient()
    supabase.auth.signOut().finally(() => {
      window.location.href = '/auth/login'
    })
  }, [])

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="space-y-4 text-center">
        <div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
        <p className="text-muted-foreground">Signing out…</p>
      </div>
    </div>
  )
}
