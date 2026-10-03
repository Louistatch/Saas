'use client'

/**
 * Menu mobile de la vitrine (en dessous de `xl`).
 *
 * FaîtiereHub est le produit ; Haroo est un ESPACE de ce produit (les
 * opportunités), pas un autre site. Le sélecteur en haut change l'espace
 * affiché, jamais le compte : la même identité sert aux deux.
 *
 * Tout est piloté par données : `NAVIGATION_BY_CONTEXT` pour les liens propres
 * à chaque espace, `SHARED_NAVIGATION` pour les liens communs. Les actions du
 * bas dépendent de l'état réel du compte (lib/account/journey).
 */

import { useAuth } from '@/app/context/auth-context'
import { Sheet, SheetClose, SheetContent, SheetTitle } from '@/components/ui/sheet'
import { PROFILE_URL, accountJourney, harooAction } from '@/lib/account/journey'
import { performLogout } from '@/lib/auth/logout'
import { type ProductContext, useProductContext } from '@/lib/navigation/product-context'
import { cn } from '@/lib/utils'
import {
  ArrowRight,
  Briefcase,
  ChevronRight,
  CircleUserRound,
  FileSpreadsheet,
  GraduationCap,
  IdCard,
  Info,
  LayoutDashboard,
  LayoutGrid,
  LogIn,
  LogOut,
  type LucideIcon,
  Package,
  Phone,
  ScanLine,
  Settings2,
  ShoppingBasket,
  Sprout,
  Store,
  Tag,
  UserRoundPen,
  Users,
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

const NAVIGATION_BY_CONTEXT: Record<ProductContext, NavItem[]> = {
  faitierehub: [
    {
      href: '/dashboard',
      label: 'Espace organisation',
      description: 'Tableau de bord de votre faîtière ou coopérative',
      icon: LayoutDashboard,
      tone: 'green',
    },
    {
      href: '/dashboard/members',
      label: 'Membres',
      description: 'Producteurs, cotisations et scores',
      icon: Users,
      tone: 'blue',
    },
    {
      href: '/dashboard/cards',
      label: 'Cartes membres',
      description: 'Cartes vérifiables par QR code',
      icon: IdCard,
      tone: 'amber',
    },
    {
      href: '/scan',
      label: 'Scanner une carte',
      description: 'Vérifier un membre ou un producteur',
      icon: ScanLine,
      tone: 'green',
    },
    {
      href: '/marketplace',
      label: 'Comptes d’exploitation',
      description: 'Itinéraires et budgets par culture',
      icon: FileSpreadsheet,
      tone: 'orange',
    },
  ],
  haroo: [
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
  ],
}

/** Bannière de chaque espace : le texte est dans l'image, repris en aria-label. */
const BANNER_BY_CONTEXT: Record<
  ProductContext,
  { src: string; width: number; height: number; href: string; label: string }
> = {
  faitierehub: {
    src: '/images/menu/gestion-organisations.webp',
    width: 1200,
    height: 349,
    href: '/features',
    label:
      'Gestion des organisations agricoles : faîtières, coopératives, membres et identification numérique',
  },
  haroo: {
    src: '/images/menu/plateforme-agricole.webp',
    width: 1200,
    height: 224,
    href: '/#haroo',
    label:
      'Plateforme agricole intégrée : des services pratiques pour les producteurs, coopératives et faîtières',
  },
}

const SHARED_NAVIGATION: NavItem[] = [
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

const CONTEXTS: { value: ProductContext; label: string; hint: string; icon: LucideIcon }[] = [
  { value: 'faitierehub', label: 'FaîtiereHub', hint: 'Organisations', icon: LayoutGrid },
  { value: 'haroo', label: 'Haroo', hint: 'Opportunités', icon: Sprout },
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
            <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 max-[399px]:hidden text-[0.68rem] font-semibold text-primary">
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

/** Change l'espace affiché — pas le compte. */
function ProductContextSwitcher({
  value,
  onChange,
}: {
  value: ProductContext
  onChange: (next: ProductContext) => void
}) {
  return (
    <fieldset className="grid grid-cols-2 gap-1 rounded-2xl border-0 bg-muted/70 p-1">
      <legend className="sr-only">Espace affiché (même compte)</legend>
      {CONTEXTS.map(({ value: v, label, hint, icon: Icon }) => {
        const selected = v === value
        return (
          <button
            key={v}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(v)}
            className={cn(
              'flex min-h-12 items-center justify-center gap-2 rounded-xl px-2 py-1.5 text-left transition-colors duration-150',
              'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
              selected
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-foreground/70 hover:bg-background/70',
            )}
          >
            <Icon aria-hidden="true" className="h-4 w-4 shrink-0" />
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold leading-tight">{label}</span>
              <span
                className={cn(
                  'block truncate text-[0.7rem] leading-tight',
                  selected ? 'text-primary-foreground/80' : 'text-muted-foreground',
                )}
              >
                {hint}
              </span>
            </span>
          </button>
        )
      })}
    </fieldset>
  )
}

const secondaryAction =
  'flex h-[3.25rem] w-full items-center justify-center gap-2 rounded-2xl border border-border bg-background text-[0.95rem] font-semibold text-foreground transition-colors duration-150 hover:bg-muted/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary'
const primaryAction =
  'flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-primary text-[0.95rem] font-semibold text-primary-foreground shadow-sm transition-colors duration-150 hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary'

/** Actions du bas selon l'état RÉEL du compte et l'espace choisi. */
function DrawerActions({
  context,
  onNavigate,
}: { context: ProductContext; onNavigate: () => void }) {
  const { user } = useAuth()
  const journey = accountJourney(user)

  if (journey.stage === 'anonymous') {
    return (
      <div className="flex flex-col gap-2">
        <Link href="/auth/login" onClick={onNavigate} className={secondaryAction}>
          <LogIn aria-hidden="true" className="h-4 w-4" />
          Se connecter
        </Link>
        <Link
          href={context === 'haroo' ? '/auth/signup?espace=haroo' : '/auth/signup'}
          onClick={onNavigate}
          className={primaryAction}
        >
          Commencer maintenant
          <ArrowRight aria-hidden="true" className="h-4 w-4" />
        </Link>
      </div>
    )
  }

  const haroo = harooAction(journey)
  const primary =
    context === 'haroo' || journey.stage === 'profile-incomplete'
      ? haroo
        ? { ...haroo, icon: journey.stage === 'profile-incomplete' ? UserRoundPen : Sprout }
        : { href: journey.homeUrl, label: 'Mon espace', icon: LayoutDashboard }
      : { href: journey.homeUrl, label: 'Tableau de bord', icon: LayoutDashboard }
  const PrimaryIcon = primary.icon

  return (
    <div className="flex flex-col gap-2">
      <Link href={primary.href} onClick={onNavigate} className={primaryAction}>
        <PrimaryIcon aria-hidden="true" className="h-4 w-4" />
        {primary.label}
      </Link>
      <div className="grid grid-cols-2 gap-2">
        <Link
          href={PROFILE_URL}
          onClick={onNavigate}
          className={cn(secondaryAction, 'h-12 text-sm')}
        >
          <UserRoundPen aria-hidden="true" className="h-4 w-4" />
          Mon compte
        </Link>
        <button
          type="button"
          onClick={() => performLogout()}
          className={cn(secondaryAction, 'h-12 text-sm')}
        >
          <LogOut aria-hidden="true" className="h-4 w-4" />
          Déconnexion
        </button>
      </div>
    </div>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-3 mt-5 flex items-center gap-2 text-muted-foreground">
      <LayoutGrid aria-hidden="true" className="h-4 w-4" />
      <span className="text-xs font-semibold uppercase tracking-wider">{children}</span>
      <span aria-hidden="true" className="h-px flex-1 bg-border" />
    </div>
  )
}

export function MobileNavigationDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const pathname = usePathname()
  const [context, setContext] = useProductContext(pathname)
  const isActive = (href: string) => !href.includes('#') && pathname === href
  const items = NAVIGATION_BY_CONTEXT[context]
  const banner = BANNER_BY_CONTEXT[context]

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
          <ProductContextSwitcher value={context} onChange={setContext} />

          <Link
            href={banner.href}
            onClick={onClose}
            aria-label={banner.label}
            className="mt-4 block overflow-hidden rounded-[20px] border border-primary/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            <Image
              key={banner.src}
              src={banner.src}
              alt=""
              width={banner.width}
              height={banner.height}
              sizes="(min-width: 640px) 416px, calc(100vw - 2rem)"
              className="h-auto w-full"
            />
          </Link>

          <ul className="mt-4 space-y-2">
            {items.map((item, i) => (
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

          <SectionLabel>Plateforme</SectionLabel>
          <ul className="space-y-2">
            {SHARED_NAVIGATION.map((item) => (
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
          <DrawerActions context={context} onNavigate={onClose} />
        </div>
      </SheetContent>
    </Sheet>
  )
}
