'use client'

import Link from 'next/link'
import { useState } from 'react'
import { Menu, X, ScanLine } from 'lucide-react'
import { Logo } from '@/components/shared/logo'
import { AuthButtons } from '@/components/shared/auth-buttons'

const headerLinks = [
  { href: '/produit', label: 'Produit' },
  { href: '/marketplace', label: 'Comptes d\'exploitation' },
  { href: '/pricing', label: 'Tarifs' },
  { href: '/securite', label: 'Sécurité' },
  { href: '/a-propos', label: 'À propos' },
  { href: '/contact', label: 'Contact' },
]

const footerColumns = [
  {
    title: 'Produit',
    links: [
      { href: '/produit', label: 'Produit' },
      { href: '/marketplace', label: 'Comptes d\'exploitation' },
      { href: '/pricing', label: 'Tarifs' },
      { href: '/securite', label: 'Sécurité' },
      { href: '/blog', label: 'Blog' },
      { href: '/auth/signup/haroo', label: 'Services Haroo' },
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
          <div className="hidden md:flex items-center gap-6">
            {headerLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                {link.label}
              </Link>
            ))}
          </div>

          <div className="flex items-center gap-3">
            <Link
              href="/scan"
              className="hidden sm:inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-4 py-2 text-sm font-semibold text-primary hover:bg-primary/15 transition-colors"
            >
              <ScanLine className="h-4 w-4" />
              Scanner
            </Link>
            <AuthButtons />
            {/* Mobile menu toggle */}
            <button
              className="md:hidden p-2 text-muted-foreground hover:text-foreground"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              aria-label={mobileMenuOpen ? 'Fermer le menu' : 'Ouvrir le menu'}
            >
              {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </nav>

        {/* Mobile nav dropdown */}
        {mobileMenuOpen && (
          <div className="md:hidden border-t border-border bg-background px-4 py-4 space-y-2">
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
                className="block px-3 py-2 rounded-md text-sm text-muted-foreground hover:text-foreground hover:bg-accent/10 transition-colors"
              >
                {link.label}
              </Link>
            ))}
          </div>
        )}
      </header>

      {/* Main Content */}
      <main className="flex-1">{children}</main>

      {/* Footer */}
      <footer className="border-t border-border bg-background">
        <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
          <div className="grid gap-8 md:grid-cols-4">
            <div className="space-y-4">
              <Logo size="sm" />
              <p className="text-sm text-muted-foreground">
                La plateforme numérique au service des faîtières et coopératives agricoles africaines.
              </p>
            </div>
            {footerColumns.map((column) => (
              <div key={column.title}>
                <h4 className="font-semibold text-foreground mb-4">{column.title}</h4>
                <ul className="space-y-2">
                  {column.links.map((link) => (
                    <li key={link.href}>
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
