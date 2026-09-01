'use client'

import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/app/context/auth-context'
import { performLogout } from '@/lib/auth/logout'
import { isHarooRole } from '@/lib/utils/permissions'
import { cn } from '@/lib/utils'
import { LayoutDashboard, LogOut } from 'lucide-react'

/**
 * Dynamic auth buttons for the marketing header.
 * Shows "Se connecter / Commencer" when logged out.
 * Shows "Tableau de bord / Déconnexion" when logged in.
 *
 * `stacked` renders full-width vertical buttons for the mobile menu dropdown
 * instead of the compact horizontal pair used in the desktop header.
 */
export function AuthButtons({
  className,
  stacked = false,
}: {
  className?: string
  stacked?: boolean
}) {
  const { isAuthenticated, isLoading, user } = useAuth()
  const wrapClassName = cn(stacked ? 'flex flex-col gap-2' : 'flex items-center gap-3', className)
  const linkClassName = stacked ? 'w-full' : undefined
  const buttonClassName = stacked ? 'w-full' : undefined

  // Don't show skeleton — show login buttons immediately
  // They'll be replaced once auth state is resolved
  if (isAuthenticated && user) {
    const dashboardUrl =
      user.role === 'super_admin'
        ? '/admin'
        : isHarooRole(user.role)
          ? '/haroo'
          : '/dashboard'
    return (
      <div className={wrapClassName}>
        <Link href={dashboardUrl} className={linkClassName}>
          <Button size="sm" className={cn('gap-2', buttonClassName)}>
            <LayoutDashboard className="h-3.5 w-3.5" />
            Tableau de bord
          </Button>
        </Link>
        <Button
          variant="outline"
          size="sm"
          className={cn('gap-2', buttonClassName)}
          onClick={() => performLogout()}
        >
          <LogOut className="h-3.5 w-3.5" />
          {stacked && 'Déconnexion'}
        </Button>
      </div>
    )
  }

  // Show login buttons (also shown during loading — better than skeleton)
  return (
    <div className={wrapClassName}>
      <Link href="/auth/login" className={linkClassName}>
        <Button variant="outline" size="sm" className={buttonClassName}>
          Se connecter
        </Button>
      </Link>
      <Link href="/auth/signup" className={linkClassName}>
        <Button size="sm" className={buttonClassName}>
          Commencer
        </Button>
      </Link>
    </div>
  )
}
