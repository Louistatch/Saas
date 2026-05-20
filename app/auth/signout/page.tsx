'use client'

import { useEffect, useState } from 'react'
import { createBrowserClient } from '@supabase/ssr'

/**
 * Minimal sign-out page — does NOT use AuthProvider or any context.
 * Directly creates a Supabase client and signs out.
 */
export default function SignOutPage() {
  const [status, setStatus] = useState('Déconnexion en cours…')

  useEffect(() => {
    async function doSignOut() {
      try {
        // Create client directly (no context dependency)
        const supabase = createBrowserClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        )
        await supabase.auth.signOut()
      } catch {
        // Ignore errors
      }

      // Clear everything
      try { localStorage.clear() } catch {}
      try { sessionStorage.clear() } catch {}
      try {
        document.cookie.split(';').forEach((c) => {
          const name = c.trim().split('=')[0]
          if (name) {
            document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/`
            document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/;domain=${window.location.hostname}`
          }
        })
      } catch {}

      setStatus('Redirection…')
      // Hard redirect
      setTimeout(() => {
        window.location.replace('/auth/login')
      }, 300)
    }

    doSignOut()
  }, [])

  return (
    <div className="min-h-screen flex items-center justify-center bg-white">
      <div className="space-y-4 text-center">
        <div className="h-8 w-8 border-4 border-green-600 border-t-transparent rounded-full animate-spin mx-auto" />
        <p className="text-gray-500 text-sm">{status}</p>
      </div>
    </div>
  )
}
