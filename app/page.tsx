import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { ArrowRight, Users, TrendingUp, BarChart3, Zap } from 'lucide-react'
import { HomeClient } from '@/app/components/home-client'
import { Logo } from '@/components/shared/logo'
import { AuthButtons } from '@/components/shared/auth-buttons'

export default function Home() {
  return (
    <HomeClient>
      <div className="min-h-screen bg-gradient-to-b from-background via-background to-secondary/10">
      {/* Navigation */}
      <header className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <nav className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-2">
            <Logo size="md" />
          </div>
          
          <div className="hidden md:flex items-center gap-8">
            <Link href="/features" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
              Fonctionnalités
            </Link>
            <Link href="/#how-it-works" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
              Comment ça marche
            </Link>
            <Link href="/pricing" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
              Tarifs
            </Link>
            <Link href="/setup" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
              Installation
            </Link>
            <Link href="/demo" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
              Démo
            </Link>
          </div>

          <div className="flex items-center gap-3">
            <AuthButtons />
          </div>
        </nav>
      </header>

      {/* Hero Section */}
      <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
        <div className="grid gap-12 lg:grid-cols-2 lg:gap-8 items-center">
          <div className="space-y-6">
            <div>
              <h1 className="text-4xl font-bold tracking-tight text-foreground sm:text-5xl lg:text-6xl">
                Donnez du pouvoir à votre coopérative agricole
              </h1>
              <p className="mt-4 text-lg text-muted-foreground max-w-lg">
                Connectez vos membres, gérez les exploitations et grandissez ensemble grâce à notre plateforme numérique tout-en-un conçue pour les faîtières agricoles.
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:gap-4">
              <Link href="/auth/signup">
                <Button size="lg" className="gap-2 bg-primary hover:bg-primary/90 w-full sm:w-auto">
                  Essai gratuit <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
              <Link href="/demo">
                <Button size="lg" variant="outline" className="w-full sm:w-auto">
                  Voir les identifiants démo
                </Button>
              </Link>
            </div>

            <div className="flex gap-6 pt-4">
              <div className="flex items-center gap-2">
                <div className="flex h-2 w-2 rounded-full bg-primary"></div>
                <span className="text-sm text-muted-foreground">Essai gratuit de 30 jours</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex h-2 w-2 rounded-full bg-accent"></div>
                <span className="text-sm text-muted-foreground">Sans carte bancaire</span>
              </div>
            </div>
          </div>

          {/* Video Demo + Card Showcase */}
          <div className="relative w-full max-w-2xl mx-auto lg:mx-0">
            {/* Video container with premium frame */}
            <div className="rounded-2xl overflow-hidden border border-border shadow-2xl bg-card">
              {/* Browser chrome */}
              <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border bg-muted/30">
                <div className="flex gap-1.5">
                  <div className="w-3 h-3 rounded-full bg-red-400" />
                  <div className="w-3 h-3 rounded-full bg-yellow-400" />
                  <div className="w-3 h-3 rounded-full bg-green-400" />
                </div>
                <div className="flex-1 flex justify-center">
                  <div className="px-3 py-1 rounded-md bg-background border border-border text-[10px] text-muted-foreground font-mono">
                    faitierehub.com
                  </div>
                </div>
              </div>
              {/* Video */}
              <video
                autoPlay
                muted
                loop
                playsInline
                className="w-full aspect-video object-cover"
                poster="/showcase-card.png"
              >
                <source src="/demo-video.mp4" type="video/mp4" />
              </video>
            </div>

            {/* Floating card showcase */}
            <div className="absolute -bottom-8 -right-4 md:-right-12 w-48 md:w-56 rounded-xl overflow-hidden shadow-2xl border-2 border-white/20 rotate-3 hover:rotate-0 transition-transform duration-500">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/showcase-card.png"
                alt="Carte membre FaîtiereHub"
                className="w-full h-auto"
              />
            </div>

            {/* Glow effect */}
            <div className="absolute -inset-4 -z-10 bg-gradient-to-r from-primary/20 via-accent/10 to-primary/20 rounded-3xl blur-3xl opacity-40" />
          </div>
        </div>
      </section>

      {/* Card Showcase Section */}
      <section className="py-20 sm:py-28 bg-gradient-to-b from-background to-card/50">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center space-y-4 mb-12">
            <h2 className="text-3xl font-bold text-foreground sm:text-4xl">
              Carte membre premium
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Chaque membre reçoit une carte numérique avec QR code vérifiable, photo d'identité et toutes ses informations.
            </p>
          </div>
          <div className="flex justify-center">
            <div className="relative group">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/showcase-card.png"
                alt="Carte membre FaîtiereHub — Design premium avec photo, QR code, localité, coopérative"
                className="w-full max-w-3xl rounded-2xl shadow-2xl border border-border group-hover:scale-[1.02] transition-transform duration-500"
              />
              {/* Decorative glow */}
              <div className="absolute -inset-4 -z-10 bg-gradient-to-r from-primary/20 via-transparent to-primary/20 rounded-3xl blur-2xl opacity-50 group-hover:opacity-70 transition-opacity" />
              {/* Badge */}
              <div className="absolute top-4 right-4 bg-primary text-primary-foreground px-3 py-1.5 rounded-full text-xs font-semibold shadow-lg">
                ✓ Vérifiable par QR
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="bg-card/50 py-20 sm:py-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center space-y-4 mb-16">
            <h2 className="text-3xl font-bold text-foreground sm:text-4xl">
              Conçu pour les coopératives agricoles
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Tout ce dont vous avez besoin pour gérer vos membres, exploitations et croissance en un seul endroit
            </p>
          </div>

          <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-4">
            {[
              {
                icon: Users,
                title: "Gestion des membres",
                description: "Suivez et engagez les membres de la coopérative avec des cartes numériques et un contrôle d'accès"
              },
              {
                icon: TrendingUp,
                title: "Place de marché",
                description: "Connectez les membres aux exploitations et facilitez les transactions directes au sein de la coopérative"
              },
              {
                icon: BarChart3,
                title: "Statistiques",
                description: "Obtenez des informations sur l'activité des membres, les ventes et les indicateurs de croissance en temps réel"
              },
              {
                icon: Zap,
                title: "Intégration de données",
                description: "Synchronisez automatiquement les données des membres depuis KoboToolbox et d'autres sources"
              }
            ].map((feature, i) => (
              <div key={i} className="rounded-lg border border-border bg-background p-6 space-y-3">
                <feature.icon className="h-8 w-8 text-primary" />
                <h3 className="font-semibold text-foreground">{feature.title}</h3>
                <p className="text-sm text-muted-foreground">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section id="how-it-works" className="py-20 sm:py-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-bold text-foreground text-center sm:text-4xl mb-16">
            Comment fonctionne FaîtiereHub
          </h2>

          <div className="grid gap-8 md:grid-cols-3">
            {[
              {
                step: "1",
                title: "Configurez votre coopérative",
                description: "Créez votre compte coopératif et configurez votre marketplace avec votre image de marque et vos paramètres"
              },
              {
                step: "2",
                title: "Ajoutez membres et données",
                description: "Importez les listes de membres et les données d'exploitation, puis émettez des cartes numériques avec codes QR"
              },
              {
                step: "3",
                title: "Activez les transactions",
                description: "Les membres parcourent le marketplace, effectuent des achats et accèdent aux avantages avec leurs cartes"
              }
            ].map((item, i) => (
              <div key={i} className="relative space-y-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground font-semibold">
                  {item.step}
                </div>
                <h3 className="font-semibold text-lg text-foreground">{item.title}</h3>
                <p className="text-muted-foreground">{item.description}</p>
                {i < 2 && (
                  <div className="hidden md:block absolute top-6 -right-4 h-0.5 w-8 bg-border"></div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="border-t border-border bg-card/50 py-20 sm:py-28">
        <div className="mx-auto max-w-3xl px-4 text-center sm:px-6 lg:px-8">
          <h2 className="text-3xl font-bold text-foreground sm:text-4xl">
            Prêt à transformer votre coopérative ?
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            Rejoignez les coopératives agricoles de la région qui utilisent FaîtiereHub pour connecter leurs membres et grandir ensemble.
          </p>
          <Link href="/auth/signup" className="mt-8 inline-block">
            <Button size="lg" className="gap-2 bg-primary hover:bg-primary/90">
              Commencer votre essai gratuit <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border bg-background">
        <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
          <div className="grid gap-8 md:grid-cols-4">
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Logo size="sm" />
              </div>
              <p className="text-sm text-muted-foreground">
                Au service des coopératives agricoles avec des outils numériques.
              </p>
            </div>
            <div>
              <h4 className="font-semibold text-foreground mb-4">Produit</h4>
              <ul className="space-y-2">
                <li><Link href="#" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Fonctionnalités</Link></li>
                <li><Link href="#" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Tarifs</Link></li>
                <li><Link href="#" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Sécurité</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold text-foreground mb-4">Entreprise</h4>
              <ul className="space-y-2">
                <li><Link href="#" className="text-sm text-muted-foreground hover:text-foreground transition-colors">À propos</Link></li>
                <li><Link href="#" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Blog</Link></li>
                <li><Link href="#" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Contact</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold text-foreground mb-4">Légal</h4>
              <ul className="space-y-2">
                <li><Link href="#" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Confidentialité</Link></li>
                <li><Link href="#" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Conditions</Link></li>
                <li><Link href="#" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Cookies</Link></li>
              </ul>
            </div>
          </div>
          <div className="border-t border-border mt-8 pt-8 flex flex-col sm:flex-row justify-between items-center">
            <p className="text-sm text-muted-foreground">
              © 2026 FaîtiereHub. Tous droits réservés.
            </p>
            <p className="text-sm text-muted-foreground">
              Fait avec <span className="text-primary">♦</span> pour les coopératives agricoles
            </p>
          </div>
        </div>
      </footer>
      </div>
    </HomeClient>
  )
}
