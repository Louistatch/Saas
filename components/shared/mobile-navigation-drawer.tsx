'use client'

/**
 * Menu mobile de la vitrine (en dessous de `xl`).
 *
 * Un seul langage visuel : les services Haroo (marché, emplois, préventes,
 * conseil) sont présentés comme des services DE FaîtiereHub, avec les mêmes
 * lignes que les autres liens. Construit à partir de données : ajouter un lien
 * = ajouter une entrée dans `PRIMARY_SERVICES` ou `OTHER_SERVICES`.
 *
 * Comportement conservé : mêmes destinations qu'avant, fermeture au clic sur un
 * lien, sur Échap et sur le fond ; boutons de connexion pilotés par
 * `AuthButtons` (même logique).
 */

import { AuthButtons } from '@/components/shared/auth-buttons'
import { Sheet, SheetClose, SheetContent, SheetTitle } from '@/components/ui/sheet'
import { cn } from '@/lib/utils'
import {
  Briefcase,
  ChevronRight,
  CircleUserRound,
  GraduationCap,
  Info,
  LayoutGrid,
  type LucideIcon,
  Package,
  Phone,
  ScanLine,
  Settings2,
  ShoppingBasket,
  Store,
  Tag,
  X,
} from 'lucide-react'
import Image from 'next/image'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

type Tone = 'green' | 'orange' | 'amber' | 'blue' | 'violet' | 'gray' | 'rose' | 'slate'

interface NavItem {
  href: string
  label: string
  description: string
  icon: LucideIcon
  tone: Tone
  badge?: string
}

const TONES: Record<Tone, string> = {
  green: 'bg-emerald-50 text-emerald-700',
  orange: 'bg-orange-50 text-orange-700',
  amber: 'bg-amber-50 text-amber-700',
  blue: 'bg-sky-50 text-sky-700',
  violet: 'bg-violet-50 text-violet-700',
  gray: 'bg-stone-100 text-stone-700',
  rose: 'bg-rose-50 text-rose-700',
  slate: 'bg-slate-100 text-slate-700',
}

const PRIMARY_SERVICES: NavItem[] = [
  {
    href: '/marche',
    label: 'Marché de proximité',
    description: 'Préventes, emplois et missions près de chez vous',
    icon: Store,
    tone: 'green',
    badge: 'Populaire',
  },
  {
    href: '/#haroo-ouvrier',
    label: 'Emplois agricoles',
    description: 'Compétences, disponibilité et offres locales',
    icon: Briefcase,
    tone: 'orange',
  },
  {
    href: '/#haroo-acheteur',
    label: 'Préventes de récoltes',
    description: 'Produits recherchés et contacts producteurs',
    icon: ShoppingBasket,
    tone: 'amber',
  },
  {
    href: '/#haroo-agronome',
    label: 'Missions de conseil',
    description: 'Expertise agronomique et suivi des missions',
    icon: GraduationCap,
    tone: 'blue',
  },
]

const OTHER_SERVICES: NavItem[] = [
  {
    href: '/scan',
    label: 'Scanner une carte',
    description: 'Vérifier un membre ou un producteur',
    icon: ScanLine,
    tone: 'green',
  },
  {
    href: '/produit',
    label: 'Produit',
    description: 'Catalogue et opportunités commerciales',
    icon: Package,
    tone: 'violet',
  },
  {
    href: '/features',
    label: 'Fonctionnalités',
    description: 'Découvrir la plateforme',
    icon: Settings2,
    tone: 'gray',
  },
  {
    href: '/pricing',
    label: 'Tarifs',
    description: 'Nos offres et formules',
    icon: Tag,
    tone: 'rose',
  },
  {
    href: '/#operateur',
    label: 'Opérateur',
    description: 'Devenir opérateur agréé',
    icon: CircleUserRound,
    tone: 'blue',
  },
  {
    href: '/a-propos',
    label: 'À propos',
    description: 'Notre mission et notre équipe',
    icon: Info,
    tone: 'slate',
  },
  {
    href: '/contact',
    label: 'Contact',
    description: 'Besoin d’aide ? Contactez-nous',
    icon: Phone,
    tone: 'green',
  },
]

function NavigationItem({
  item,
  active,
  featured = false,
  compact = false,
  onNavigate,
}: {
  item: NavItem
  active: boolean
  featured?: boolean
  compact?: boolean
  onNavigate: () => void
}) {
  const Icon = item.icon
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'group flex items-center gap-3 rounded-2xl border px-3 transition-colors duration-150',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
        'active:scale-[0.99] motion-reduce:active:scale-100',
        compact ? 'min-h-14 py-2' : 'min-h-[4.5rem] py-2.5',
        featured
          ? 'border-primary/20 bg-primary/[0.06] hover:bg-primary/10'
          : 'border-border/70 bg-card hover:bg-muted/60',
        active && 'border-primary/40',
      )}
    >
      <span
        className={cn(
          'flex shrink-0 items-center justify-center rounded-xl',
          compact ? 'h-10 w-10' : 'h-11 w-11',
          TONES[item.tone],
        )}
      >
        <Icon aria-hidden="true" className={compact ? 'h-5 w-5' : 'h-[1.35rem] w-[1.35rem]'} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span
            className={cn(
              'truncate font-semibold text-foreground',
              compact ? 'text-sm' : 'text-[0.95rem]',
            )}
          >
            {item.label}
          </span>
          {item.badge ? (
            <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 max-[359px]:hidden text-[0.68rem] font-semibold text-primary">
              {item.badge}
            </span>
          ) : null}
        </span>
        <span
          className={cn(
            'mt-0.5 block text-muted-foreground',
            compact
              ? 'truncate text-xs max-[340px]:hidden'
              : 'line-clamp-2 text-[0.8rem] leading-snug',
          )}
        >
          {item.description}
        </span>
      </span>
      <ChevronRight
        aria-hidden="true"
        className="h-4 w-4 shrink-0 text-muted-foreground/70 transition-transform duration-150 group-hover:translate-x-0.5"
      />
    </Link>
  )
}

export function MobileNavigationDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const pathname = usePathname()
  const isActive = (href: string) => !href.includes('#') && pathname === href

  // Sheet (Radix Dialog) apporte focus piégé, Échap, clic extérieur et blocage
  // du défilement de la page. Son bouton de fermeture générique est masqué
  // (dernier enfant) au profit de celui de l'en-tête.
  return (
    <Sheet open={open} onOpenChange={(next) => !next && onClose()}>
      <SheetContent
        side="right"
        id="marketing-mobile-menu"
        aria-describedby={undefined}
        className="h-dvh w-full gap-0 border-l-0 p-0 sm:max-w-md xl:hidden data-[state=open]:duration-200 data-[state=closed]:duration-150 [&>button:last-child]:hidden"
      >
        <SheetTitle className="sr-only">Menu principal</SheetTitle>
        {/* En-tête */}
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border/60 px-4 py-3">
          <Link href="/" onClick={onClose} className="flex min-w-0 items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" alt="" className="h-11 w-11 shrink-0 object-contain" />
            <span className="min-w-0">
              <span className="block truncate text-lg font-bold leading-tight text-foreground">
                FaîtiereHub
              </span>
              <span className="block truncate text-xs text-muted-foreground">
                Connecter · Organiser · Valoriser
              </span>
            </span>
          </Link>
          <SheetClose
            aria-label="Fermer le menu"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-muted/70 text-foreground transition-colors duration-150 hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            <X aria-hidden="true" className="h-5 w-5" />
          </SheetClose>
        </div>

        {/* Contenu défilant */}
        <nav
          aria-label="Navigation principale"
          className="flex-1 overflow-y-auto overscroll-contain px-4 py-4"
        >
          <Link
            href="/#haroo"
            onClick={onClose}
            aria-label="Plateforme agricole intégrée : des services pratiques pour les producteurs, coopératives et faîtières"
            className="block overflow-hidden rounded-[20px] border border-primary/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            <Image
              src="/images/menu/plateforme-agricole.webp"
              alt=""
              width={1200}
              height={224}
              sizes="(min-width: 640px) 416px, calc(100vw - 2rem)"
              className="h-auto w-full"
            />
          </Link>

          <ul className="mt-4 space-y-2">
            {PRIMARY_SERVICES.map((item, i) => (
              <li key={item.href}>
                <NavigationItem
                  item={item}
                  featured={i === 0}
                  active={isActive(item.href)}
                  onNavigate={onClose}
                />
              </li>
            ))}
          </ul>
          <div className="mt-2 grid grid-cols-2 gap-2 text-sm font-medium">
            <Link
              href="/auth/signup/haroo"
              onClick={onClose}
              className="flex min-h-11 items-center justify-center whitespace-nowrap rounded-xl border border-primary/20 px-2 text-[0.8rem] font-semibold text-primary hover:bg-primary/[0.06] focus-visible:outline-2 focus-visible:outline-primary"
            >
              Créer mon profil
            </Link>
            <Link
              href="/haroo"
              onClick={onClose}
              className="flex min-h-11 items-center justify-center whitespace-nowrap rounded-xl border border-border px-2 text-[0.8rem] font-semibold text-foreground/80 hover:bg-muted/60 focus-visible:outline-2 focus-visible:outline-primary"
            >
              Mon espace Haroo
            </Link>
          </div>

          <div className="mb-3 mt-5 flex items-center gap-2 text-muted-foreground">
            <LayoutGrid aria-hidden="true" className="h-4 w-4" />
            <span className="text-xs font-semibold uppercase tracking-wider">Autres services</span>
            <span aria-hidden="true" className="h-px flex-1 bg-border" />
          </div>
          <ul className="space-y-2">
            {OTHER_SERVICES.map((item) => (
              <li key={item.href}>
                <NavigationItem
                  item={item}
                  compact
                  active={isActive(item.href)}
                  onNavigate={onClose}
                />
              </li>
            ))}
          </ul>
        </nav>

        {/* Actions, toujours visibles */}
        <div className="shrink-0 border-t border-border/60 bg-background px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <AuthButtons variant="drawer" onNavigate={onClose} />
        </div>
      </SheetContent>
    </Sheet>
  )
}
