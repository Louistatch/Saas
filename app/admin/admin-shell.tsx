'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import {
  BarChart3,
  Briefcase,
  Users,
  Settings,
  LogOut,
  Menu,
  X,
  Building2,
  TrendingUp,
  LayoutDashboard,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Logo } from '@/components/shared/logo'
import { performLogout } from '@/lib/auth/logout'

const ADMIN_LINKS = [
  { href: '/admin', label: "Vue d'ensemble", icon: TrendingUp },
  { href: '/admin/cooperatives', label: 'Coopératives', icon: Building2 },
  { href: '/admin/users', label: 'Utilisateurs', icon: Users },
  { href: '/admin/haroo', label: 'Professionnels Haroo', icon: Briefcase },
  { href: '/admin/analytics', label: 'Statistiques', icon: BarChart3 },
  { href: '/admin/logs', label: "Logs d'audit", icon: BarChart3 },
  { href: '/admin/settings', label: 'Paramètres', icon: Settings },
] as const

/**
 * Pure presentational shell for the admin area.
 * Authorization is enforced UPSTREAM by the Server Component layout
 * (assertRole) and by the edge middleware — this component renders only
 * after access has been positively verified server-side.
 */
export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-background">
      {/* Sidebar */}
      <div
        className={`fixed md:static left-0 top-0 z-40 w-64 h-screen bg-sidebar border-r border-sidebar-border transition-transform duration-300 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        }`}
      >
        <div className="p-6 flex items-center gap-3 border-b border-sidebar-border">
          <Logo size="lg" textClassName="text-sidebar-foreground" />
        </div>

        <nav className="space-y-2 p-4 flex-1">
          {ADMIN_LINKS.map((link) => {
            const Icon = link.icon
            const isActive = pathname === link.href
            return (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setSidebarOpen(false)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                  isActive
                    ? 'bg-sidebar-primary text-sidebar-primary-foreground'
                    : 'text-sidebar-foreground hover:bg-sidebar-accent/10'
                }`}
              >
                <Icon className="h-5 w-5" />
                {link.label}
              </Link>
            )
          })}
        </nav>

        <div className="p-4 border-t border-sidebar-border space-y-2">
          <Link href="/dashboard">
            <Button
              variant="outline"
              className="w-full justify-start gap-3 border-sidebar-border text-sidebar-foreground hover:bg-sidebar-accent/10"
            >
              <LayoutDashboard className="h-4 w-4" />
              Tableau de bord
            </Button>
          </Link>
          <Button
            variant="outline"
            className="w-full justify-start gap-3 border-sidebar-border text-sidebar-foreground hover:bg-sidebar-accent/10"
            onClick={() => performLogout()}
          >
            <LogOut className="h-4 w-4" />
            Déconnexion
          </Button>
        </div>
      </div>

      {/* Main Content */}
      <main className="flex-1 overflow-auto">
        <div className="md:hidden p-4 border-b border-border flex items-center justify-between bg-card">
          <div className="flex items-center gap-3">
            <Logo size="sm" showText={false} />
            <span className="font-semibold text-foreground">Panneau admin</span>
          </div>
          <Button
            size="icon"
            variant="outline"
            onClick={() => setSidebarOpen((o) => !o)}
            aria-label={sidebarOpen ? 'Fermer le menu' : 'Ouvrir le menu'}
            className="border-border"
          >
            {sidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </Button>
        </div>

        <div className="p-6 md:p-8">{children}</div>
      </main>

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-30 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}
    </div>
  )
}
