'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth, type UserRole } from '@/app/context/auth-context'

interface ProtectedRouteProps {
  children: React.ReactNode
  requiredRole?: UserRole
}

/**
 * Client-side route guard (SEC-04 hardened).
 *
 * Defense-in-depth layer that runs AFTER the edge middleware. It NEVER reveals
 * protected content without a positive authentication signal — there is no
 * "show anyway after 3s" fallback (that was the SEC-04 vulnerability).
 *
 * States:
 *   - loading            → spinner
 *   - not authenticated  → redirect to /auth/login (no content shown)
 *   - wrong role         → redirect to /forbidden  (no content shown)
 *   - authenticated + ok → render children
 */
export function ProtectedRoute({ children, requiredRole }: ProtectedRouteProps) {
  const { isAuthenticated, isLoading, user } = useAuth()
  const router = useRouter()

  // Redirect once auth has resolved.
  useEffect(() => {
    if (isLoading) return

    if (!isAuthenticated) {
      const current =
        typeof window !== 'undefined'
          ? window.location.pathname + window.location.search
          : ''
      router.replace(`/auth/login?redirect=${encodeURIComponent(current)}`)
      return
    }

    if (requiredRole && user?.role !== requiredRole && user?.role !== 'super_admin') {
      router.replace('/forbidden')
    }
  }, [isAuthenticated, isLoading, user, requiredRole, router])

  // Show a spinner while resolving, or while a redirect is in flight.
  const authorized =
    isAuthenticated &&
    (!requiredRole || user?.role === requiredRole || user?.role === 'super_admin')

  if (isLoading || !authorized) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="space-y-4 text-center">
          <div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-muted-foreground text-sm">Chargement…</p>
        </div>
      </div>
    )
  }

  return <>{children}</>
}
