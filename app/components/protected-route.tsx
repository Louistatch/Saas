'use client'

import { useEffect, useState } from 'react'
import { useAuth, type UserRole } from '@/app/context/auth-context'

interface ProtectedRouteProps {
  children: React.ReactNode
  requiredRole?: UserRole
}

/**
 * Client-side route guard — LIGHTWEIGHT.
 * 
 * The PROXY (server-side) is the primary auth gate:
 * - It checks cookies and redirects unauthenticated users to /auth/login
 * - If the user reaches this component, they PASSED the proxy check
 * 
 * This component's job is ONLY:
 * 1. Wait for AuthProvider to finish loading (show spinner)
 * 2. Role-gate (e.g. /admin requires super_admin)
 * 3. Safety net: if after 25s auth still hasn't loaded, redirect
 * 
 * It does NOT duplicate the proxy's auth check.
 */
export function ProtectedRoute({ children, requiredRole }: ProtectedRouteProps) {
  const { isAuthenticated, isLoading, user } = useAuth()
  const [timedOut, setTimedOut] = useState(false)

  // Safety net: 25s max wait for auth to load
  useEffect(() => {
    if (!isLoading) return
    const timer = setTimeout(() => setTimedOut(true), 25000)
    return () => clearTimeout(timer)
  }, [isLoading])

  // If loading finished and not authenticated → redirect
  // (This shouldn't happen normally because proxy already gates)
  useEffect(() => {
    if (isLoading) return
    if (!isAuthenticated) {
      window.location.replace(`/auth/login?redirect=${encodeURIComponent(window.location.pathname)}`)
    }
  }, [isAuthenticated, isLoading])

  // Role guard (only after auth is loaded)
  useEffect(() => {
    if (isLoading || !isAuthenticated) return
    if (requiredRole && user?.role !== requiredRole && user?.role !== 'super_admin') {
      window.location.replace('/forbidden')
    }
  }, [isAuthenticated, isLoading, user, requiredRole])

  // Safety net: auth loading hung
  useEffect(() => {
    if (timedOut && isLoading) {
      window.location.replace('/auth/login')
    }
  }, [timedOut, isLoading])

  // Show spinner while auth loads (trust the proxy — user is likely valid)
  if (isLoading && !timedOut) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="space-y-4 text-center">
          <div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-muted-foreground text-sm">Chargement…</p>
        </div>
      </div>
    )
  }

  // Not authenticated (shouldn't happen if proxy works)
  if (!isAuthenticated) return null

  // Role mismatch
  if (requiredRole && user?.role !== requiredRole && user?.role !== 'super_admin') {
    return null
  }

  return <>{children}</>
}
