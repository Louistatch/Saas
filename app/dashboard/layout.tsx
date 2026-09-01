'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet'
import {
  BarChart3,
  ShoppingCart,
  ShoppingBag,
  BookOpen,
  Handshake,
  CreditCard,
  Map,
  GraduationCap,
  Users,
  Settings,
  LogOut,
  Menu,
  Home,
  Leaf,
  FolderOpen,
  Zap,
  Shield,
  Smartphone,
  Banknote,
  Code,
  PhoneCall,
  IdCard,
  ChevronDown,
} from 'lucide-react'
import { useState } from 'react'
import { Logo } from '@/components/shared/logo'
import { useAuth } from '@/app/context/auth-context'
import { performLogout } from '@/lib/auth/logout'
import { useCooperative } from '@/app/context/cooperative-context'
import { ProtectedRoute } from '@/app/components/protected-route'
import { NotificationBell } from '@/components/shared/notification-bell'

interface NavItem {
  href: string
  label: string
  icon: React.ElementType
  roles: string[]
}

interface NavSection {
  label: string
  items: NavItem[]
}

const NAV_SECTIONS: NavSection[] = [
  {
    label: 'Coopérative',
    items: [
      { href: '/dashboard', label: 'Vue d\'ensemble', icon: Home, roles: ['super_admin', 'cooperative_admin', 'member', 'guest'] },
      { href: '/dashboard/members', label: 'Membres', icon: Users, roles: ['super_admin', 'cooperative_admin', 'member'] },
      { href: '/dashboard/cards', label: 'Cartes membres', icon: IdCard, roles: ['super_admin', 'cooperative_admin', 'member'] },
      { href: '/dashboard/cotisations', label: 'Cotisations', icon: Banknote, roles: ['super_admin', 'cooperative_admin'] },
      { href: '/dashboard/parcelles', label: 'Parcelles', icon: Leaf, roles: ['super_admin', 'cooperative_admin'] },
    ],
  },
  {
    label: 'Agricole',
    items: [
      { href: '/dashboard/agrimarket', label: 'AgriMarket', icon: ShoppingBag, roles: ['super_admin', 'cooperative_admin', 'member'] },
      { href: '/dashboard/carnet', label: 'Carnet Agricole', icon: BookOpen, roles: ['super_admin', 'cooperative_admin', 'member'] },
      { href: '/dashboard/matching', label: 'Matching', icon: Handshake, roles: ['super_admin', 'cooperative_admin'] },
      { href: '/dashboard/credit', label: 'AgriCredit', icon: CreditCard, roles: ['super_admin', 'cooperative_admin'] },
    ],
  },
  {
    label: 'Analyse',
    items: [
      { href: '/dashboard/analytics', label: 'Statistiques', icon: BarChart3, roles: ['super_admin', 'cooperative_admin'] },
      { href: '/dashboard/carte', label: 'Carte Agricole', icon: Map, roles: ['super_admin', 'cooperative_admin'] },
      { href: '/dashboard/academy', label: 'AgriAcademy', icon: GraduationCap, roles: ['super_admin', 'cooperative_admin', 'member'] },
    ],
  },
  {
    label: 'Gestion',
    items: [
      { href: '/dashboard/marketplace', label: 'Exploitations', icon: ShoppingCart, roles: ['super_admin', 'cooperative_admin', 'member', 'guest'] },
      { href: '/dashboard/templates', label: 'Modèles', icon: FolderOpen, roles: ['super_admin', 'cooperative_admin'] },
      { href: '/dashboard/techniciens', label: 'Techniciens', icon: PhoneCall, roles: ['super_admin', 'cooperative_admin'] },
      { href: '/dashboard/integrations', label: 'Intégrations', icon: Zap, roles: ['super_admin', 'cooperative_admin'] },
      { href: '/dashboard/kobo-setup', label: 'KoboCollect', icon: Smartphone, roles: ['super_admin', 'cooperative_admin'] },
      { href: '/dashboard/embed', label: 'Widget Embed', icon: Code, roles: ['super_admin', 'cooperative_admin'] },
    ],
  },
]

function UserAvatar({ firstName, lastName }: { firstName?: string; lastName?: string }) {
  const initials = [firstName?.[0], lastName?.[0]].filter(Boolean).join('').toUpperCase() || '?'
  return (
    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
      {initials}
    </div>
  )
}

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname()
  const { user } = useAuth()
  const { currentCooperative, cooperatives, switchCooperative } = useCooperative()
  const [gestionOpen, setGestionOpen] = useState(false)

  const isActive = (href: string) =>
    href === '/dashboard' ? pathname === href : pathname.startsWith(href)

  return (
    <div className="flex h-full flex-col">
      {/* Logo */}
      <div className="flex items-center gap-2 px-5 py-4 border-b border-border">
        <Logo size="md" />
      </div>

      {/* User identity */}
      <div className="px-4 py-3 border-b border-border">
        <div className="flex items-center gap-3">
          <UserAvatar firstName={user?.firstName} lastName={user?.lastName} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-foreground">
              {user?.firstName} {user?.lastName}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {currentCooperative?.level === 'faitiere' ? 'Admin Faîtière' :
               currentCooperative?.level === 'union' ? 'Admin Union' :
               user?.role === 'super_admin' ? 'Super Admin' :
               user?.role === 'cooperative_admin' ? 'Admin Coopérative' :
               user?.role === 'member' ? 'Membre' : 'Visiteur'}
            </p>
          </div>
        </div>
        {currentCooperative && (
          <p className="mt-2 truncate text-xs font-medium text-primary/80">{currentCooperative.name}</p>
        )}
        {/* Cooperative switcher for super_admin */}
        {user?.role === 'super_admin' && cooperatives.length > 1 && (
          <select
            className="mt-2 w-full rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground"
            value={currentCooperative?.id || ''}
            onChange={e => switchCooperative(e.target.value)}
          >
            {cooperatives.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-5">
        {NAV_SECTIONS.map(section => {
          const visibleItems = section.items.filter(
            item => user?.role && item.roles.includes(user.role)
          )
          if (visibleItems.length === 0) return null

          // Collapse "Gestion" section on desktop
          const isGestion = section.label === 'Gestion'

          return (
            <div key={section.label}>
              {isGestion ? (
                <button
                  onClick={() => setGestionOpen(o => !o)}
                  className="flex w-full items-center justify-between px-2 mb-1"
                >
                  <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">
                    {section.label}
                  </span>
                  <ChevronDown className={`h-3 w-3 text-muted-foreground/60 transition-transform ${gestionOpen ? 'rotate-180' : ''}`} />
                </button>
              ) : (
                <p className="px-2 mb-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">
                  {section.label}
                </p>
              )}

              {(!isGestion || gestionOpen) && (
                <div className="space-y-0.5">
                  {visibleItems.map(item => {
                    const active = isActive(item.href)
                    const Icon = item.icon
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={onNavigate}
                        className={`group flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-all ${
                          active
                            ? 'bg-primary/10 text-primary font-medium'
                            : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                        }`}
                      >
                        <Icon className={`h-4 w-4 shrink-0 ${active ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground'}`} />
                        <span className="truncate">{item.label}</span>
                        {active && (
                          <div className="ml-auto h-1.5 w-1.5 rounded-full bg-primary" />
                        )}
                      </Link>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </nav>

      {/* Footer actions */}
      <div className="border-t border-border px-3 py-3 space-y-1">
        {(user?.role === 'super_admin' || user?.role === 'cooperative_admin') && (
          <Link
            href="/dashboard/settings"
            onClick={onNavigate}
            className="flex items-center gap-3 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <Settings className="h-4 w-4" />
            Paramètres
          </Link>
        )}
        {user?.role === 'super_admin' && (
          <Link
            href="/admin"
            onClick={onNavigate}
            className="flex items-center gap-3 rounded-md px-3 py-2 text-sm text-purple-600 hover:bg-purple-50 dark:hover:bg-purple-950/30 transition-colors"
          >
            <Shield className="h-4 w-4" />
            Panneau admin
          </Link>
        )}
        <button
          onClick={performLogout}
          className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
        >
          <LogOut className="h-4 w-4" />
          Déconnexion
        </button>
      </div>
    </div>
  )
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { currentCooperative } = useCooperative()
  const [mobileOpen, setMobileOpen] = useState(false)

  return (
    <ProtectedRoute>
      <div className="min-h-screen flex bg-background">

        {/* Desktop sidebar — fixed */}
        <aside className="hidden md:flex md:flex-col md:w-60 lg:w-64 shrink-0 border-r border-border bg-card sticky top-0 h-screen">
          <SidebarContent />
        </aside>

        {/* Mobile: Sheet overlay */}
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetTrigger asChild>
            <button className="md:hidden fixed top-3 left-3 z-50 flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-background shadow-sm text-muted-foreground hover:text-foreground">
              <Menu className="h-5 w-5" />
            </button>
          </SheetTrigger>
          <SheetContent side="left" className="w-64 p-0">
            <SidebarContent onNavigate={() => setMobileOpen(false)} />
          </SheetContent>
        </Sheet>

        {/* Main content */}
        <main className="flex-1 flex flex-col min-w-0 overflow-auto">
          {/* Top bar */}
          <header className="sticky top-0 z-40 flex items-center justify-between border-b border-border bg-background/80 backdrop-blur-sm px-4 md:px-6 py-3">
            {/* Mobile: spacer for hamburger button */}
            <div className="md:hidden w-9" />

            {/* Desktop: cooperative name */}
            <div className="hidden md:block">
              <p className="text-sm font-semibold text-foreground">
                {currentCooperative?.name || 'Tableau de bord'}
              </p>
            </div>

            {/* Mobile: logo centered */}
            <div className="md:hidden flex-1 flex justify-center">
              <Logo size="sm" />
            </div>

            {/* Right: notification bell */}
            <div className="flex items-center gap-2">
              {currentCooperative && (
                <NotificationBell cooperativeId={currentCooperative.id} />
              )}
            </div>
          </header>

          {/* Page content */}
          <div className="flex-1 p-4 md:p-6 lg:p-8">
            {children}
          </div>
        </main>
      </div>
    </ProtectedRoute>
  )
}
