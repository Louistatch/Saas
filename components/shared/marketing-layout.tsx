import Link from 'next/link'
import { Logo } from '@/components/shared/logo'
import { Button } from '@/components/ui/button'

const headerLinks = [
  { href: '/produit', label: 'Produit' },
  { href: '/features', label: 'Fonctionnalités' },
  { href: '/pricing', label: 'Tarifs' },
  { href: '/securite', label: 'Sécurité' },
  { href: '/entreprise', label: 'Entreprise' },
]

const footerColumns = [
  {
    title: 'Produit',
    links: [
      { href: '/features', label: 'Fonctionnalités' },
      { href: '/pricing', label: 'Tarifs' },
      { href: '/securite', label: 'Sécurité' },
      { href: '/blog', label: 'Blog' },
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
  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <nav className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link href="/" className="flex items-center gap-2">
            <Logo size="md" />
          </Link>

          <div className="hidden md:flex items-center gap-8">
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
            <Link href="/auth/login">
              <Button variant="outline" size="sm">
                Se connecter
              </Button>
            </Link>
            <Link href="/auth/signup">
              <Button size="sm">
                Commencer
              </Button>
            </Link>
          </div>
        </nav>
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
