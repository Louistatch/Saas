'use client'

import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
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
 * 3. Safety net: if after 8s auth still hasn't loaded, redirect
 * 
 * It does NOT duplicate the proxy's auth check.
 */
export function ProtectedRoute({ children, requiredRole }: ProtectedRouteProps) {
  const { isAuthenticated, isLoading, user } = useAuth()
  const router = useRouter()
  const pathname = usePathname()
  const [timedOut, setTimedOut] = useState(false)

  // Safety net: 20s max wait for auth to load (generous for cold starts)
  useEffect(() => {
    if (!isLoading) return
    const timer = setTimeout(() => setTimedOut(true), 20000)
    return () => clearTimeout(timer)
  }, [isLoading])

  // If loading finished and not authenticated → redirect (SPA navigation)
  useEffect(() => {
    if (isLoading) return
    if (!isAuthenticated) {
      const redirectParam = pathname && /^\/[^/]/.test(pathname) ? `?redirect=${encodeURIComponent(pathname)}` : ''
      router.replace(`/auth/login${redirectParam}`)
    }
  }, [isAuthenticated, isLoading, pathname, router])

  // Role guard (only after auth is loaded)
  useEffect(() => {
    if (isLoading || !isAuthenticated) return
    if (requiredRole && user?.role !== requiredRole && user?.role !== 'super_admin') {
      router.replace('/forbidden')
    }
  }, [isAuthenticated, isLoading, user, requiredRole, router])

  // Safety net: auth loading hung
  useEffect(() => {
    if (timedOut && isLoading) {
      router.replace('/auth/login')
    }
  }, [timedOut, isLoading, router])

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
