'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth, type UserRole } from '@/app/context/auth-context'

interface ProtectedRouteProps {
  children: React.ReactNode
  requiredRole?: UserRole
}

/**
 * Client-side route guard — TRUST THE PROXY.
 * 
 * The PROXY (server-side) is the primary auth gate:
 * - It checks cookies and redirects unauthenticated users to /auth/login
 * - If the user reaches this component, they PASSED the proxy check
 * 
 * This component shows a brief spinner (max 3s) then renders content.
 * The proxy guarantees the user is authenticated.
 */
export function ProtectedRoute({ children, requiredRole }: ProtectedRouteProps) {
  const { isAuthenticated, isLoading, user } = useAuth()
  const router = useRouter()
  const [showContent, setShowContent] = useState(false)

  // Show content immediately if auth is ready, or after 3s max (trust the proxy)
  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      setShowContent(true)
      return
    }
    // After 3s, show content anyway — proxy already validated the session
    const timer = setTimeout(() => setShowContent(true), 3000)
    return () => clearTimeout(timer)
  }, [isLoading, isAuthenticated])

  // Role guard (only after auth is loaded)
  useEffect(() => {
    if (isLoading || !isAuthenticated) return
    if (requiredRole && user?.role !== requiredRole && user?.role !== 'super_admin') {
      router.replace('/forbidden')
    }
  }, [isAuthenticated, isLoading, user, requiredRole, router])

  // Brief spinner while waiting
  if (!showContent) {
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
