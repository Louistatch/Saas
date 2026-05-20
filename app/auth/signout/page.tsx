'use client'

import { useEffect, useState } from 'react'
import { performLogout } from '@/lib/auth/logout'

/**
 * Minimal sign-out page — triggers the enterprise logout procedure.
 * This page exists as a fallback for direct navigation to /auth/signout.
 * The primary logout path is via performLogout() called from buttons.
 */
export default function SignOutPage() {
  const [status, setStatus] = useState('Déconnexion en cours…')

  useEffect(() => {
    // Small delay to show the spinner, then perform full logout
    const timer = setTimeout(() => {
      setStatus('Redirection…')
      performLogout() // This handles everything: signOut, destroySession, broadcast, redirect
    }, 200)
    return () => clearTimeout(timer)
  }, [])

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="space-y-4 text-center">
        <div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
        <p className="text-muted-foreground text-sm">{status}</p>
      </div>
    </div>
  )
}
