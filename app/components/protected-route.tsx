'use client'

import { useEffect, useState } from 'react'
import { useAuth, type UserRole } from '@/app/context/auth-context'

interface ProtectedRouteProps {
  children: React.ReactNode
  requiredRole?: UserRole
}

/**
 * Client-side route guard.
 * 
 * IMPORTANT: The timeout only triggers AFTER isLoading becomes false.
 * This prevents false redirects on slow networks where getUser() takes time.
 * 
 * Flow:
 * 1. Show spinner while isLoading = true (no timeout during this phase)
 * 2. Once isLoading = false:
 *    - If authenticated → show children
 *    - If NOT authenticated → redirect to login immediately
 * 3. Safety net: if isLoading stays true for 20s → redirect (something is broken)
 */
export function ProtectedRoute({ children, requiredRole }: ProtectedRouteProps) {
  const { isAuthenticated, isLoading, user } = useAuth()
  const [loadingTooLong, setLoadingTooLong] = useState(false)

  // Safety net: if auth loading takes more than 20s, something is broken
  // This handles the case where getUser() hangs indefinitely
  useEffect(() => {
    if (!isLoading) return // Already loaded, no need for timeout

    const timer = setTimeout(() => {
      setLoadingTooLong(true)
    }, 20000)

    return () => clearTimeout(timer)
  }, [isLoading])

  // Redirect logic — only runs AFTER loading is complete
  useEffect(() => {
    if (isLoading) return // Wait for auth to finish loading

    if (!isAuthenticated) {
      window.location.replace(`/auth/login?redirect=${encodeURIComponent(window.location.pathname)}`)
      return
    }

    // Role guard
    if (requiredRole && user?.role !== requiredRole && user?.role !== 'super_admin') {
      window.location.replace('/dashboard')
    }
  }, [isAuthenticated, isLoading, user, requiredRole])

  // Safety net redirect
  useEffect(() => {
    if (loadingTooLong && !isAuthenticated) {
      window.location.replace('/auth/login')
    }
  }, [loadingTooLong, isAuthenticated])

  // Still loading auth state — show spinner (patient, no timeout pressure)
  if (isLoading && !loadingTooLong) {
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
