'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

/**
 * Force sign-out page.
 * 1. Calls supabase.auth.signOut() to invalidate the session
 * 2. Clears localStorage and sessionStorage
 * 3. Redirects to /auth/login with a full page load
 * 
 * Visit /auth/signout to force-clear a stale session.
 */
export default function SignOutPage() {
  const [status, setStatus] = useState('Déconnexion en cours…')

  useEffect(() => {
    async function performSignOut() {
      try {
        const supabase = createClient()
        
        // Sign out from Supabase (clears the session token)
        await supabase.auth.signOut()
        
        // Clear all local storage
        localStorage.clear()
        sessionStorage.clear()
        
        // Clear cookies manually (belt and suspenders)
        document.cookie.split(';').forEach((c) => {
          const name = c.trim().split('=')[0]
          if (name) {
            document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/`
          }
        })

        setStatus('Redirection…')
        
        // Full page redirect (not client-side navigation)
        // This ensures the proxy sees no auth cookie on the next request
        setTimeout(() => {
          window.location.href = '/auth/login'
        }, 500)
      } catch (error) {
        setStatus('Erreur — redirection…')
        setTimeout(() => {
          window.location.href = '/auth/login'
        }, 1000)
      }
    }

    performSignOut()
  }, [])

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="space-y-4 text-center">
        <div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
        <p className="text-muted-foreground">{status}</p>
      </div>
    </div>
  )
}
