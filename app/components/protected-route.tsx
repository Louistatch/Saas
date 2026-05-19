'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth, type UserRole } from '@/app/context/auth-context'

interface ProtectedRouteProps {
  children: React.ReactNode
  requiredRole?: UserRole
}

export function ProtectedRoute({ children, requiredRole }: ProtectedRouteProps) {
  const router = useRouter()
  const { isAuthenticated, isLoading, user } = useAuth()
  const [timedOut, setTimedOut] = useState(false)

  // Safety timeout: if after 10s we're still loading or not authenticated,
  // redirect to login rather than showing a blank page forever.
  useEffect(() => {
    const timer = setTimeout(() => {
      if (!isAuthenticated) {
        setTimedOut(true)
      }
    }, 10000)
    return () => clearTimeout(timer)
  }, [isAuthenticated])

  useEffect(() => {
    if (isLoading) return

    if (!isAuthenticated) {
      router.push('/auth/login')
      return
    }

    // Role guard — redirect non-admins away from admin panel
    if (requiredRole && user?.role !== requiredRole) {
      if (user?.role === 'super_admin') return
      router.push('/dashboard')
    }
  }, [isAuthenticated, isLoading, user, requiredRole, router])

  useEffect(() => {
    if (timedOut && !isAuthenticated) {
      router.push('/auth/login')
    }
  }, [timedOut, isAuthenticated, router])

  if (isLoading || (!isAuthenticated && !timedOut)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="space-y-4 text-center">
          <div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-muted-foreground">Loading…</p>
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
