'use client'

import { useEffect, useState } from 'react'
import { useAuth, type UserRole } from '@/app/context/auth-context'

interface ProtectedRouteProps {
  children: React.ReactNode
  requiredRole?: UserRole
}

/**
 * Client-side route guard.
 * Uses window.location.replace for redirects to ensure a full page reload
 * (clears React state, forces proxy re-evaluation).
 */
export function ProtectedRoute({ children, requiredRole }: ProtectedRouteProps) {
  const { isAuthenticated, isLoading, user } = useAuth()
  const [timedOut, setTimedOut] = useState(false)

  // Safety timeout: if after 8s we're still loading or not authenticated,
  // hard redirect to login rather than showing a blank page forever.
  useEffect(() => {
    const timer = setTimeout(() => {
      if (!isAuthenticated) {
        setTimedOut(true)
      }
    }, 8000)
    return () => clearTimeout(timer)
  }, [isAuthenticated])

  useEffect(() => {
    if (isLoading) return

    if (!isAuthenticated) {
      // Hard redirect — clears all React state
      window.location.replace(`/auth/login?redirect=${encodeURIComponent(window.location.pathname)}`)
      return
    }

    // Role guard — redirect non-admins away from admin panel
    if (requiredRole && user?.role !== requiredRole && user?.role !== 'super_admin') {
      window.location.replace('/dashboard')
    }
  }, [isAuthenticated, isLoading, user, requiredRole])

  useEffect(() => {
    if (timedOut && !isAuthenticated) {
      window.location.replace('/auth/login')
    }
  }, [timedOut, isAuthenticated])

  if (isLoading || (!isAuthenticated && !timedOut)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="space-y-4 text-center">
          <div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-muted-foreground text-sm">Chargement…</p>
        </div>
      </div>
    )
  }

  if (!isAuthenticated) return null

  if (requiredRole && user?.role !== requiredRole && user?.role !== 'super_admin') {
    return null
  }

  return <>{children}</>
}
