'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Button } from '@/components/ui/button'
import {
  BarChart3,
  ShoppingCart,
  Users,
  Settings,
  LogOut,
  Menu,
  X,
  Home,
  FileText,
  FolderOpen,
  Zap,
  Shield,
  Smartphone,
  Banknote,
} from 'lucide-react'
import { useState } from 'react'
import { Logo } from '@/components/shared/logo'
import { useAuth } from '@/app/context/auth-context'
import { performLogout } from '@/lib/auth/logout'
import { useCooperative } from '@/app/context/cooperative-context'
import { ProtectedRoute } from '@/app/components/protected-route'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const { user } = useAuth()
  const { currentCooperative, cooperatives, switchCooperative } = useCooperative()

  const handleLogout = () => {
    performLogout() // Enterprise logout — clears everything, broadcasts, redirects
  }

  // Navigation items filtered by role
  const navigationItems = [
    { href: '/dashboard', label: 'Vue d\'ensemble', icon: Home, roles: ['super_admin', 'cooperative_admin', 'member', 'guest'] },
    { href: '/dashboard/marketplace', label: 'Comptes d\'exploitation', icon: ShoppingCart, roles: ['super_admin', 'cooperative_admin', 'member', 'guest'] },
    { href: '/dashboard/templates', label: 'Modèles', icon: FolderOpen, roles: ['super_admin', 'cooperative_admin'] },
    { href: '/dashboard/members', label: 'Membres', icon: Users, roles: ['super_admin', 'cooperative_admin', 'member'] },
    { href: '/dashboard/cotisations', label: 'Cotisations', icon: Banknote, roles: ['super_admin', 'cooperative_admin'] },
    { href: '/dashboard/cards', label: 'Cartes membres', icon: FileText, roles: ['super_admin', 'cooperative_admin', 'member'] },
    { href: '/dashboard/analytics', label: 'Statistiques', icon: BarChart3, roles: ['super_admin', 'cooperative_admin'] },
    { href: '/dashboard/integrations', label: 'Intégrations', icon: Zap, roles: ['super_admin', 'cooperative_admin'] },
    { href: '/dashboard/kobo-setup', label: 'KoboCollect', icon: Smartphone, roles: ['super_admin', 'cooperative_admin'] },
  ].filter(item => user?.role && item.roles.includes(user.role))

  return (
    <ProtectedRoute>
      <div className="min-h-screen flex flex-col md:flex-row bg-background">
        {/* Mobile header */}
        <div className="md:hidden sticky top-0 z-50 flex items-center justify-between border-b border-border bg-background p-4">
          <Logo size="sm" />
          <button onClick={() => setSidebarOpen(!sidebarOpen)} className="text-muted-foreground hover:text-foreground">
            {sidebarOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>

        {/* Sidebar */}
        <aside className={`${sidebarOpen ? 'block' : 'hidden'} md:flex md:flex-col md:sticky md:top-0 w-full md:w-64 h-screen border-r border-border bg-card overflow-y-auto`}>
          <div className="hidden md:flex items-center gap-2 p-6 border-b border-border">
            <Logo size="md" />
          </div>

          {/* User info */}
          <div className="px-4 py-3 border-b border-border">
            <p className="text-sm font-medium text-foreground">{user?.firstName} {user?.lastName}</p>
            <p className="text-xs text-muted-foreground capitalize">
              {currentCooperative?.level === 'faitiere' ? 'Admin Faîtière' :
               currentCooperative?.level === 'union' ? 'Admin Union' :
               user?.role?.replace('_', ' ')}
            </p>
            {currentCooperative && (
              <p className="text-xs text-primary mt-0.5 truncate">{currentCooperative.name}</p>
            )}
          </div>

          <nav className="flex-1 px-4 py-4 space-y-1">
            {navigationItems.map((item) => {
              const isActive = pathname === item.href
              const Icon = item.icon
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setSidebarOpen(false)}
                  className={`flex items-center gap-3 px-4 py-2.5 rounded-lg transition-colors ${
                    isActive
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:bg-accent/10 hover:text-foreground'
                  }`}
                >
                  <Icon className="h-5 w-5" />
                  <span className="font-medium">{item.label}</span>
                </Link>
              )
            })}
          </nav>

          <div className="border-t border-border p-4 space-y-2">
            {/* Settings — only for admins */}
            {(user?.role === 'super_admin' || user?.role === 'cooperative_admin') && (
              <Link href="/dashboard/settings">
                <Button variant="outline" className="w-full justify-start gap-3 border-border text-foreground hover:bg-accent/10">
                  <Settings className="h-4 w-4" />
                  Paramètres
                </Button>
              </Link>
            )}
            {/* Admin panel shortcut for super_admin */}
            {user?.role === 'super_admin' && (
              <Link href="/admin">
                <Button variant="outline" className="w-full justify-start gap-3 border-border text-purple-600 hover:bg-purple-50">
                  <Shield className="h-4 w-4" />
                  Panneau admin
                </Button>
              </Link>
            )}
            <Button
              variant="outline"
              className="w-full justify-start gap-3 border-border text-foreground hover:bg-accent/10"
              onClick={handleLogout}
            >
              <LogOut className="h-4 w-4" />
              Déconnexion
            </Button>
          </div>
        </aside>

        {/* Main content */}
        <main className="flex-1 overflow-auto">
          {/* Top bar */}
          <div className="hidden md:flex items-center justify-between border-b border-border bg-background px-6 py-3 sticky top-0 z-40">
            <div>
              <h1 className="text-base font-semibold text-foreground">
                {currentCooperative?.name || 'Tableau de bord'}
              </h1>
            </div>
            <div className="flex items-center gap-3">
              {/* Cooperative switcher for super_admin */}
              {user?.role === 'super_admin' && cooperatives.length > 1 && (
                <select
                  className="text-sm border border-border rounded-md px-3 py-1.5 bg-background text-foreground"
                  value={currentCooperative?.id || ''}
                  onChange={e => switchCooperative(e.target.value)}
                >
                  {cooperatives.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              )}
            </div>
          </div>

          <div className="p-4 md:p-6 lg:p-8">
            {children}
          </div>
        </main>
      </div>
    </ProtectedRoute>
  )
}
