'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth, UserRole } from '@/app/context/auth-context'

interface ProtectedRouteProps {
  children: React.ReactNode
  requiredRole?: UserRole
}

export function ProtectedRoute({ children, requiredRole }: ProtectedRouteProps) {
  const router = useRouter()
  const { isAuthenticated, isLoading, user } = useAuth()

  useEffect(() => {
    if (isLoading) return

    if (!isAuthenticated) {
      router.push('/auth/login')
      return
    }

    // Role guard — redirect non-admins away from admin panel
    if (requiredRole && user?.role !== requiredRole) {
      // super_admin can access everything
      if (user?.role === 'super_admin') return
      router.push('/dashboard')
    }
  }, [isAuthenticated, isLoading, user, requiredRole, router])

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="space-y-4 text-center">
          <div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-muted-foreground">Loading...</p>
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
