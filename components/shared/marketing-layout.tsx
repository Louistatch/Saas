'use client'

import { AuthButtons } from '@/components/shared/auth-buttons'
import { Logo } from '@/components/shared/logo'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Briefcase,
  ChevronDown,
  GraduationCap,
  Menu,
  ScanLine,
  ShoppingBasket,
  Store,
  X,
} from 'lucide-react'
import Link from 'next/link'
import { useState } from 'react'

const headerLinks = [
  { href: '/marche', label: 'Marché' },
  { href: '/produit', label: 'Produit' },
  { href: '/features', label: 'Fonctionnalités' },
  { href: '/pricing', label: 'Tarifs' },
  { href: '/#operateur', label: 'Opérateur' },
  { href: '/a-propos', label: 'À propos' },
  { href: '/contact', label: 'Contact' },
]

const harooLinks = [
  {
    href: '/marche',
    label: 'Marché de proximité',
    description: 'Préventes, emplois et missions près de chez vous',
    icon: Store,
  },
  {
    href: '/#haroo-ouvrier',
    label: 'Emplois agricoles',
    description: 'Compétences, disponibilité et offres locales',
    icon: Briefcase,
  },
  {
    href: '/#haroo-acheteur',
    label: 'Préventes de récoltes',
    description: 'Produits recherchés et contacts producteurs',
    icon: ShoppingBasket,
  },
  {
    href: '/#haroo-agronome',
    label: 'Missions de conseil',
    description: 'Expertise agronomique et suivi des missions',
    icon: GraduationCap,
  },
]

const footerColumns = [
  {
    title: 'FaîtiereHub',
    links: [
      { href: '/features', label: 'Fonctionnalités' },
      { href: '/pricing', label: 'Tarifs' },
      { href: '/marketplace', label: "Comptes d'exploitation" },
      { href: '/securite', label: 'Sécurité' },
      { href: '/blog', label: 'Blog' },
    ],
  },
  {
    title: 'Haroo',
    links: [
      { href: '/marche', label: 'Marché de proximité' },
      { href: '/#haroo', label: "Qu'est-ce que Haroo ?" },
      { href: '/auth/signup/haroo', label: 'Créer un profil Haroo' },
      { href: '/auth/signup/haroo?type=OUVRIER', label: 'Ouvrier agricole — Emplois' },
      { href: '/auth/signup/haroo?type=ACHETEUR', label: 'Acheteur — Préventes' },
      { href: '/auth/signup/haroo?type=AGRONOME', label: 'Agronome — Missions' },
      { href: '/haroo', label: 'Mon espace Haroo' },
    ],
  },
  {
    title: 'Opérateur',
    links: [
      { href: '/#operateur', label: 'Devenir Opérateur certifié' },
      { href: '/auth/signup/operator', label: 'Créer un compte Opérateur' },
      { href: '/operator', label: 'Espace Opérateur' },
    ],
  },
  {
    title: 'Entreprise',
    links: [
      { href: '/a-propos', label: 'À propos' },
      { href: '/contact', label: 'Contact' },
      { href: '/entreprise', label: 'Entreprise' },
    ],
  },
  {
    title: 'Légal',
    links: [
      { href: '/legal/confidentialite', label: 'Confidentialité' },
      { href: '/legal/conditions', label: 'Conditions' },
      { href: '/legal/cookies', label: 'Cookies' },
    ],
  },
]

export function MarketingLayout({ children }: { children: React.ReactNode }) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  return (
    <div className="min-h-screen flex flex-col bg-background overflow-x-hidden">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <nav className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link href="/" className="flex items-center gap-2">
            <Logo size="md" />
          </Link>

          {/* Desktop nav */}
          <div className="hidden xl:flex items-center gap-4">
            <DropdownMenu>
              <DropdownMenuTrigger className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-amber-100 px-3 text-sm font-semibold text-amber-900 hover:bg-amber-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-700">
                Haroo <ChevronDown aria-hidden="true" className="h-4 w-4" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-80 max-w-[calc(100vw-2rem)] p-2">
                <DropdownMenuItem asChild>
                  <Link href="/#haroo" className="font-semibold">
                    Découvrir les services Haroo
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                {harooLinks.map(({ href, label, description, icon: Icon }) => (
                  <DropdownMenuItem key={href} asChild>
                    <Link href={href} className="flex items-start gap-3 py-3">
                      <Icon aria-hidden="true" className="mt-1 h-5 w-5 text-amber-700" />
                      <span>
                        <span className="block font-semibold">{label}</span>
                        <span className="mt-1 block text-xs text-muted-foreground">
                          {description}
                        </span>
                      </span>
                    </Link>
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href="/auth/signup/haroo">Créer mon profil Haroo</Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/haroo">Mon espace Haroo</Link>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            {headerLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={'text-sm text-muted-foreground hover:text-foreground transition-colors'}
              >
                {link.label}
              </Link>
            ))}
          </div>

          <div className="flex items-center gap-3">
            <Link
              href="/scan"
              className="hidden xl:inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-4 py-2 text-sm font-semibold text-primary hover:bg-primary/15 transition-colors"
            >
              <ScanLine className="h-4 w-4" />
              Scanner
            </Link>
            <AuthButtons className="hidden xl:flex" />
            {/* Mobile menu toggle */}
            <button
              type="button"
              className="xl:hidden p-2 text-muted-foreground hover:text-foreground"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              aria-label={mobileMenuOpen ? 'Fermer le menu' : 'Ouvrir le menu'}
              aria-expanded={mobileMenuOpen}
              aria-controls="marketing-mobile-menu"
            >
              {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </nav>

        {/* Mobile nav dropdown */}
        {mobileMenuOpen && (
          <div
            id="marketing-mobile-menu"
            className="xl:hidden max-h-[calc(100dvh-4rem)] overflow-y-auto border-t border-border bg-background px-4 py-4 space-y-2"
            onKeyDown={(event) => {
              if (event.key === 'Escape') setMobileMenuOpen(false)
            }}
          >
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-amber-950">
              <Link
                href="/#haroo"
                onClick={() => setMobileMenuOpen(false)}
                className="block px-2 py-2 font-bold"
              >
                Haroo · Votre réseau agricole
              </Link>
              {harooLinks.map(({ href, label, description, icon: Icon }) => (
                <Link
                  key={href}
                  href={href}
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex gap-3 rounded-lg px-2 py-3 hover:bg-amber-100"
                >
                  <Icon aria-hidden="true" className="mt-1 h-5 w-5 shrink-0" />
                  <span>
                    <span className="block text-sm font-semibold">{label}</span>
                    <span className="block text-xs">{description}</span>
                  </span>
                </Link>
              ))}
              <div className="mt-2 grid grid-cols-2 gap-2 border-t border-amber-200 pt-3 text-sm font-semibold">
                <Link
                  href="/auth/signup/haroo"
                  onClick={() => setMobileMenuOpen(false)}
                  className="rounded-lg bg-amber-800 px-3 py-3 text-center text-white"
                >
                  Créer mon profil
                </Link>
                <Link
                  href="/haroo"
                  onClick={() => setMobileMenuOpen(false)}
                  className="rounded-lg border border-amber-300 px-3 py-3 text-center"
                >
                  Mon espace Haroo
                </Link>
              </div>
            </div>
            <Link
              href="/scan"
              onClick={() => setMobileMenuOpen(false)}
              className="flex items-center gap-2 px-3 py-2 rounded-md text-sm font-semibold text-primary bg-primary/10 hover:bg-primary/15 transition-colors"
            >
              <ScanLine className="h-4 w-4" />
              Scanner une carte
            </Link>
            {headerLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setMobileMenuOpen(false)}
                className={
                  'block px-3 py-2 rounded-md text-sm text-muted-foreground hover:text-foreground hover:bg-accent/10 transition-colors'
                }
              >
                {link.label}
              </Link>
            ))}
            <div className="pt-2 mt-2 border-t border-border">
              <AuthButtons stacked />
            </div>
          </div>
        )}
      </header>

      {/* Main Content */}
      <main className="flex-1">{children}</main>

      {/* Footer */}
      <footer className="border-t border-border bg-background">
        <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
          {/* 1 colonne d'identité + 5 colonnes de liens */}
          <div className="grid gap-8 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
            <div className="space-y-4">
              <Logo size="sm" />
              <p className="text-sm text-muted-foreground">
                La plateforme numérique au service des faîtières et coopératives agricoles
                africaines.
              </p>
            </div>
            {footerColumns.map((column) => (
              <div key={column.title}>
                <h4 className="font-semibold text-foreground mb-4">{column.title}</h4>
                <ul className="space-y-2">
                  {column.links.map((link) => (
                    <li key={link.label}>
                      <Link
                        href={link.href}
                        className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                      >
                        {link.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <div className="border-t border-border mt-8 pt-8 flex flex-col sm:flex-row justify-between items-center gap-4">
            <p className="text-sm text-muted-foreground">
              © {new Date().getFullYear()} FaîtiereHub. Tous droits réservés.
            </p>
            <p className="text-sm text-muted-foreground">
              Fait avec <span className="text-primary">♥</span> pour les coopératives agricoles
            </p>
          </div>
        </div>
      </footer>
    </div>
  )
}
