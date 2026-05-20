'use client'

import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/app/context/auth-context'
import { performLogout } from '@/lib/auth/logout'
import { LayoutDashboard, LogOut } from 'lucide-react'

/**
 * Dynamic auth buttons for the marketing header.
 * Shows "Se connecter / Commencer" when logged out.
 * Shows "Tableau de bord / Déconnexion" when logged in.
 */
export function AuthButtons() {
  const { isAuthenticated, isLoading, user } = useAuth()

  if (isLoading) {
    return (
      <div className="flex items-center gap-3">
        <div className="h-8 w-20 bg-muted rounded animate-pulse" />
      </div>
    )
  }

  if (isAuthenticated && user) {
    const dashboardUrl = user.role === 'super_admin' ? '/admin' : '/dashboard'
    return (
      <div className="flex items-center gap-3">
        <Link href={dashboardUrl}>
          <Button size="sm" className="gap-2">
            <LayoutDashboard className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Tableau de bord</span>
          </Button>
        </Link>
        <Button
          variant="outline"
          size="sm"
          className="gap-2"
          onClick={() => performLogout()}
        >
          <LogOut className="h-3.5 w-3.5" />
        </Button>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-3">
      <Link href="/auth/login">
        <Button variant="outline" size="sm">
          Se connecter
        </Button>
      </Link>
      <Link href="/auth/signup">
        <Button size="sm">
          Commencer
        </Button>
      </Link>
    </div>
  )
}
