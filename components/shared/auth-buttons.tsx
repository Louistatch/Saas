'use client'

import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/app/context/auth-context'
import { performLogout } from '@/lib/auth/logout'
import { isHarooRole, hasOrgLayer } from '@/lib/utils/permissions'
import { cn } from '@/lib/utils'
import { ArrowRight, LayoutDashboard, LogIn, LogOut } from 'lucide-react'

/**
 * Dynamic auth buttons for the marketing header.
 * Shows "Se connecter / Commencer" when logged out.
 * Shows "Tableau de bord / Déconnexion" when logged in.
 *
 * `stacked` renders full-width vertical buttons instead of the compact
 * horizontal pair used in the desktop header. `variant="drawer"` is the tall,
 * full-width pair of the mobile navigation drawer — same links, same logic.
 */
export function AuthButtons({
  className,
  stacked = false,
  variant = 'default',
  onNavigate,
}: {
  className?: string
  stacked?: boolean
  variant?: 'default' | 'drawer'
  onNavigate?: () => void
}) {
  const { isAuthenticated, user } = useAuth()
  if (variant === 'drawer')
    return <DrawerAuthButtons className={className} onNavigate={onNavigate} />
  const wrapClassName = cn(stacked ? 'flex flex-col gap-2' : 'flex items-center gap-3', className)
  const linkClassName = stacked ? 'w-full' : undefined
  const buttonClassName = stacked ? 'w-full' : undefined

  // Don't show skeleton — show login buttons immediately
  // They'll be replaced once auth state is resolved
  if (isAuthenticated && user) {
    const dashboardUrl =
      user.role === 'super_admin'
        ? '/admin'
        : !hasOrgLayer(user.role) && isHarooRole(user.role, user.harooType)
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

const drawerSecondary =
  'flex h-[3.25rem] w-full items-center justify-center gap-2 rounded-2xl border border-border bg-background text-[0.95rem] font-semibold text-foreground transition-colors duration-150 hover:bg-muted/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary'
const drawerPrimary =
  'flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-primary text-[0.95rem] font-semibold text-primary-foreground shadow-sm transition-colors duration-150 hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary'

/** Mêmes destinations que `AuthButtons`, au format du menu mobile. */
function DrawerAuthButtons({
  className,
  onNavigate,
}: { className?: string; onNavigate?: () => void }) {
  const { isAuthenticated, user } = useAuth()
  if (isAuthenticated && user) {
    const dashboardUrl =
      user.role === 'super_admin'
        ? '/admin'
        : !hasOrgLayer(user.role) && isHarooRole(user.role, user.harooType)
          ? '/haroo'
          : '/dashboard'
    return (
      <div className={cn('flex flex-col gap-2', className)}>
        <Link href={dashboardUrl} onClick={onNavigate} className={drawerPrimary}>
          <LayoutDashboard aria-hidden="true" className="h-4 w-4" />
          Tableau de bord
        </Link>
        <button type="button" onClick={() => performLogout()} className={drawerSecondary}>
          <LogOut aria-hidden="true" className="h-4 w-4" />
          Déconnexion
        </button>
      </div>
    )
  }
  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <Link href="/auth/login" onClick={onNavigate} className={drawerSecondary}>
        <LogIn aria-hidden="true" className="h-4 w-4" />
        Se connecter
      </Link>
      <Link href="/auth/signup" onClick={onNavigate} className={drawerPrimary}>
        Commencer maintenant
        <ArrowRight aria-hidden="true" className="h-4 w-4" />
      </Link>
    </div>
  )
}
