'use client'

import { Logo } from '@/components/shared/logo'
import { Button } from '@/components/ui/button'
import { performLogout } from '@/lib/auth/logout'
import {
  Activity,
  Award,
  BookOpen,
  Briefcase,
  Bug,
  Building2,
  ChevronRight,
  Coins,
  Copy,
  Cpu,
  CreditCard,
  FileText,
  GraduationCap,
  Landmark,
  LayoutDashboard,
  Leaf,
  LogOut,
  Mail,
  Megaphone,
  Menu,
  Printer,
  Settings,
  ShieldAlert,
  TrendingUp,
  UserCheck,
  Users,
  Users2,
  X,
} from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'

type AdminLink = { href: string; label: string; icon: typeof TrendingUp; badge?: string }

// Menu par thème. Les badges reprennent les compteurs du centre de pilotage (/api/admin/inbox).
const ADMIN_SECTIONS: { title: string; links: AdminLink[] }[] = [
  {
    title: 'Pilotage',
    links: [
      { href: '/admin', label: 'Centre de pilotage', icon: TrendingUp },
      // Le super_admin instruit aussi les dossiers, comme un opérateur officier.
      {
        href: '/operator/professionals',
        label: 'Dossiers à valider',
        icon: UserCheck,
        badge: 'dossiers',
      },
      { href: '/admin/messages', label: 'Messages', icon: Mail, badge: 'messages' },
      { href: '/admin/erreurs', label: 'Erreurs du site', icon: Bug, badge: 'errors' },
    ],
  },
  {
    title: 'Voir comme',
    links: [
      { href: '/dashboard', label: 'Coopérative', icon: LayoutDashboard },
      { href: '/operator', label: 'Opérateur', icon: Award },
      { href: '/haroo', label: 'Professionnel Haroo', icon: Briefcase },
      { href: '/haroolife', label: 'HarooLife', icon: Leaf },
    ],
  },
  {
    title: 'Organisations et comptes',
    links: [
      { href: '/admin/cooperatives', label: 'Coopératives', icon: Building2 },
      { href: '/admin/users', label: 'Utilisateurs et rôles', icon: Users },
      { href: '/admin/doublons', label: 'Doublons', icon: Copy },
      { href: '/admin/partners', label: 'Opérateurs', icon: Award },
      { href: '/admin/partners/training', label: 'Formation des opérateurs', icon: GraduationCap },
    ],
  },
  {
    title: 'Haroo et cartes',
    links: [
      { href: '/admin/haroo', label: 'Professionnels Haroo', icon: Briefcase },
      { href: '/admin/cartes', label: 'Cartes et PIN', icon: CreditCard },
      { href: '/admin/haroolife-panneaux', label: 'Panneaux HarooLife', icon: Megaphone },
      { href: '/admin/haroolife-moderation', label: 'Modération HarooLife', icon: ShieldAlert },
      {
        href: '/admin/commandes-cartes',
        label: 'Commandes de cartes',
        icon: Printer,
        badge: 'cards-print',
      },
    ],
  },
  {
    title: 'Économie',
    links: [
      { href: '/admin/comptes-exploitation', label: "Comptes d'exploitation", icon: FileText },
      { href: '/admin/referentiel-agronomique', label: 'Référentiel agronomique', icon: BookOpen },
      { href: '/admin/organization-earnings', label: 'Gains des organisations', icon: Coins },
      { href: '/admin/credits', label: 'Demandes de crédit', icon: Landmark },
    ],
  },
  {
    title: 'Plateforme',
    links: [
      { href: '/admin/agritogo', label: 'AgriTogo', icon: Cpu },
      { href: '/admin/agrismat', label: 'Agrismat', icon: Leaf },
      { href: '/admin/logs', label: 'Suivi du site', icon: Activity },
      { href: '/admin/demo-accounts', label: 'Comptes de démo', icon: Users2 },
      { href: '/admin/settings', label: 'Paramètres', icon: Settings },
    ],
  },
]

/**
 * Pure presentational shell for the admin area.
 * Authorization is enforced UPSTREAM by the Server Component layout
 * (assertRole) and by the edge middleware — this component renders only
 * after access has been positively verified server-side.
 */
export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [badges, setBadges] = useState<Record<string, number>>({})

  // Compteurs du centre de pilotage, rafraîchis à chaque changement de page.
  // biome-ignore lint/correctness/useExhaustiveDependencies: recharger à chaque navigation
  useEffect(() => {
    fetch('/api/admin/inbox', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { items?: { key: string; count: number }[] } | null) =>
        setBadges(Object.fromEntries((d?.items ?? []).map((i) => [i.key, i.count]))),
      )
      .catch(() => undefined)
  }, [pathname])

  // Fermer le tiroir mobile à l'échappement — l'arrière-plan lui-même n'est
  // jamais une cible clavier légitime (un utilisateur au clavier ne peut de
  // toute façon pas s'y focaliser), mais Escape reste l'attente standard
  // pour un panneau modal.
  useEffect(() => {
    if (!sidebarOpen) return
    document.body.style.overflow = 'hidden'
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSidebarOpen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      document.body.style.overflow = ''
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [sidebarOpen])

  const sectionIsActive = (links: AdminLink[]) =>
    links.some((link) =>
      link.href === '/admin' ? pathname === link.href : pathname.startsWith(link.href),
    )

  return (
    <div className="min-h-screen bg-muted/20 xl:flex">
      {/* Sidebar */}
      <aside
        aria-label="Navigation d’administration"
        className={`fixed inset-y-0 left-0 z-50 flex w-[min(88vw,19rem)] flex-col border-r border-sidebar-border bg-sidebar shadow-2xl transition-transform duration-200 xl:sticky xl:top-0 xl:h-dvh xl:w-72 xl:shrink-0 xl:translate-x-0 xl:shadow-none ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex h-20 shrink-0 items-center justify-between border-b border-sidebar-border px-5">
          <div>
            <Logo size="md" textClassName="text-sidebar-foreground" />
            <p className="mt-1 pl-9 text-[11px] font-medium uppercase tracking-[0.16em] text-sidebar-foreground/55">
              Administration nationale
            </p>
          </div>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="xl:hidden"
            onClick={() => setSidebarOpen(false)}
            aria-label="Fermer le menu"
          >
            <X className="h-5 w-5" />
          </Button>
        </div>

        <nav className="min-h-0 flex-1 space-y-2 overflow-y-auto px-3 py-4">
          {ADMIN_SECTIONS.map((section, sectionIndex) => (
            <details
              key={section.title}
              open={sectionIndex < 2 || sectionIsActive(section.links)}
              className="group"
            >
              <summary className="flex cursor-pointer list-none items-center justify-between rounded-lg px-3 py-2 text-xs font-semibold uppercase tracking-wider text-sidebar-foreground/55 hover:bg-sidebar-accent/10 hover:text-sidebar-foreground">
                {section.title}
                <ChevronRight className="h-3.5 w-3.5 transition-transform group-open:rotate-90" />
              </summary>
              <div className="mt-1 space-y-1">
                {section.links.map((link) => {
                  const Icon = link.icon
                  const isActive =
                    link.href === '/admin' ? pathname === link.href : pathname.startsWith(link.href)
                  const count = link.badge ? (badges[link.badge] ?? 0) : 0
                  return (
                    <Link
                      key={link.href}
                      href={link.href}
                      // HarooLife est un monde 3D : pas de préchargement depuis le menu admin.
                      prefetch={link.href.startsWith('/haroolife') ? false : undefined}
                      aria-current={isActive ? 'page' : undefined}
                      onClick={() => setSidebarOpen(false)}
                      className={`flex min-h-11 w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                        isActive
                          ? 'bg-sidebar-primary text-sidebar-primary-foreground'
                          : 'text-sidebar-foreground hover:bg-sidebar-accent/10'
                      }`}
                    >
                      <Icon className="h-[18px] w-[18px] shrink-0" />
                      <span className="min-w-0 flex-1">{link.label}</span>
                      {count > 0 && (
                        <span
                          className="ml-auto rounded-full bg-red-600 px-2 py-0.5 text-xs font-semibold text-white"
                          aria-label={`${count} en attente`}
                        >
                          {count}
                        </span>
                      )}
                    </Link>
                  )
                })}
              </div>
            </details>
          ))}
        </nav>

        <div className="p-4 border-t border-sidebar-border space-y-2 shrink-0">
          <Link href="/dashboard">
            <Button
              variant="outline"
              className="w-full justify-start gap-3 border-sidebar-border text-sidebar-foreground hover:bg-sidebar-accent/10"
            >
              <LayoutDashboard className="h-4 w-4" />
              Voir comme coopérative
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
      </aside>

      {/* Main Content */}
      <main className="min-w-0 flex-1">
        <div className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-border bg-background/95 px-4 backdrop-blur xl:hidden">
          <div className="flex items-center gap-3">
            <Logo size="sm" showText={false} />
            <span>
              <span className="block text-sm font-semibold text-foreground">Administration</span>
              <span className="block text-xs text-muted-foreground">FaîtièreHub</span>
            </span>
          </div>
          <Button
            size="icon"
            variant="outline"
            onClick={() => setSidebarOpen((o) => !o)}
            aria-label={sidebarOpen ? 'Fermer le menu' : 'Ouvrir le menu'}
            className="border-border"
          >
            <Menu className="h-5 w-5" />
          </Button>
        </div>

        <div className="px-4 py-6 sm:px-6 lg:px-8 xl:px-10 xl:py-10">{children}</div>
      </main>

      {/* Mobile overlay */}
      {sidebarOpen && (
        // biome-ignore lint/a11y/useKeyWithClickEvents: arrière-plan de tiroir modal — jamais une cible clavier, la fermeture au clavier passe par Escape (cf. le useEffect ci-dessus)
        <div
          className="fixed inset-0 z-40 bg-black/55 backdrop-blur-[1px] xl:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}
    </div>
  )
}
