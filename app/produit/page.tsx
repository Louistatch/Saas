import type { Metadata } from 'next'
import Link from 'next/link'
import { MarketingLayout } from '@/components/shared/marketing-layout'
import { Button } from '@/components/ui/button'
import {
  Users,
  CreditCard,
  BarChart3,
  Database,
  Coins,
  ShoppingCart,
  Globe,
  QrCode,
  MapPin,
  GraduationCap,
  Network,
  ArrowRight,
  CheckCircle,
  Zap,
  Shield,
  ScanLine,
} from 'lucide-react'

export const metadata: Metadata = {
  title: 'Produit — FaîtiereHub | Plateforme tout-en-un pour faîtières agricoles',
  description:
    "Découvrez FaîtiereHub : gestion des membres, cartes numériques, comptes d'exploitation, AgriMarket, AgriCredit, AgriAcademy et l'écosystème Haroo.",
}

const CORE = [
  {
    icon: Users,
    title: 'Gestion des membres',
    badge: 'Fondation',
    badgeColor: 'bg-green-100 text-green-800',
    description:
      "Centralisez les informations de tous vos membres : identité, localisation, parcelles, productions. Importez en masse depuis KoboToolbox et suivez l'évolution de votre base en temps réel.",
    points: [
      'Profils complets : photo, localité, cultures, surface',
      'Scoring automatique Bronze / Silver / Gold',
      'Historique des cotisations et activités',
      'Import KoboToolbox en un clic',
    ],
  },
  {
    icon: CreditCard,
    title: 'Cartes numériques vérifiables',
    badge: 'Identité',
    badgeColor: 'bg-blue-100 text-blue-800',
    description:
      "Émettez des cartes membres avec QR code unique, photo d'identité et informations agricoles. Vérification instantanée sur le terrain, traçabilité complète.",
    points: [
      'QR code unique par membre',
      'Photo intégrée + données agricoles',
      'Vérification hors-ligne possible',
      'Timer de sécurité 10 minutes',
    ],
  },
  {
    icon: BarChart3,
    title: "Comptes d'exploitation",
    badge: 'Données terrain',
    badgeColor: 'bg-teal-100 text-teal-800',
    description:
      "Publiez et partagez les fiches techniques et itinéraires de culture classés par région, préfecture et canton. Accès membre et accès public différenciés.",
    points: [
      'Fiches par canton, préfecture et région',
      'Itinéraires culturaux détaillés',
      'Widget embeddable sur votre site',
      'API publique pour partenaires',
    ],
  },
  {
    icon: Database,
    title: 'Pipeline KoboToolbox',
    badge: 'Intégration',
    badgeColor: 'bg-purple-100 text-purple-800',
    description:
      "Connectez vos formulaires KoboToolbox et synchronisez automatiquement les données terrain. Webhook en temps réel, retry queue, mapping intelligent.",
    points: [
      'Webhook en temps réel',
      'Retry queue automatique',
      'Mapping de colonnes intelligent',
      'Synchronisation manuelle disponible',
    ],
  },
  {
    icon: Coins,
    title: 'Cotisations',
    badge: 'Finance',
    badgeColor: 'bg-amber-100 text-amber-800',
    description:
      "Gérez les cotisations annuelles, suivez les paiements, envoyez des rappels. Tableau de bord financier avec taux de recouvrement et projections.",
    points: [
      'Suivi des paiements membre',
      'Rappels automatiques',
      "Taux de recouvrement en temps réel",
      'Export comptable',
    ],
  },
  {
    icon: MapPin,
    title: 'Carte agricole interactive',
    badge: 'Géographie',
    badgeColor: 'bg-emerald-100 text-emerald-800',
    description:
      "Visualisez la répartition géographique des membres et parcelles sur la carte interactive du Togo. Filtrez par préfecture, culture ou surface.",
    points: [
      'Carte du Togo par préfecture',
      'Filtres par culture et surface',
      'Top 5 préfectures en temps réel',
      'Export des données cartographiques',
    ],
  },
]

const ADVANCED = [
  {
    icon: ShoppingCart,
    title: 'AgriMarket',
    description:
      "Place de marché agricole intégrée — catalogue de produits, services et intrants avec filtres en cascade, full-text search et pagination.",
  },
  {
    icon: CreditCard,
    title: 'AgriCredit',
    description:
      "Gérez les demandes de crédit agricole avec scoring automatique basé sur le profil membre et suivi des remboursements en temps réel.",
  },
  {
    icon: GraduationCap,
    title: 'AgriAcademy',
    description:
      "Modules de formation certifiante pour vos membres — irrigation FAO-56, pratiques culturales, agrobusiness et bonnes pratiques terrain.",
  },
  {
    icon: Users,
    title: 'Matching & Carnet',
    description:
      "Mettez en relation producteurs et acheteurs. Gérez votre carnet de contacts et de techniciens agricoles partenaires.",
  },
  {
    icon: Globe,
    title: 'Widget embeddable',
    description:
      "Intégrez FaîtiereHub sur votre site web en une ligne de code. Compatible WordPress, Webflow, HTML statique.",
  },
  {
    icon: Zap,
    title: 'Multi-niveaux',
    description:
      "Architecture faîtière → unions → coopératives. Chaque niveau a son tableau de bord et ses droits propres.",
  },
]

const SECURITY = [
  'Row-Level Security Supabase sur toutes les tables',
  "Isolation totale des données par coopérative",
  'Webhook HMAC pour les intégrations',
  'Rate limiting par IP (en mémoire + Redis)',
  "Pas de cache sur les pages de vérification (/verify/* = no-store)",
  'JWT rafraîchi à chaque requête (middleware Vercel Edge)',
]

export default function ProduitPage() {
  return (
    <MarketingLayout>

      {/* Hero */}
      <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
        <div className="max-w-3xl">
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-wider text-primary mb-6">
            <Zap className="h-3.5 w-3.5" /> Tout l&apos;écosystème en détail
          </div>
          <h1 className="text-4xl font-extrabold tracking-tight text-foreground sm:text-5xl lg:text-6xl leading-[1.08]">
            La plateforme tout-en-un pour les{' '}
            <span className="text-primary">faîtières agricoles</span>
          </h1>
          <p className="mt-6 text-lg text-muted-foreground max-w-2xl leading-relaxed">
            FaîtiereHub réunit tous les outils dont votre organisation a besoin pour
            gérer ses membres, digitaliser ses opérations et accélérer sa croissance.
            Et Haroo connecte les acteurs humains qui font vivre l&apos;écosystème.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link href="/auth/signup">
              <Button size="lg" className="w-full gap-2 sm:w-auto">
                Démarrer gratuitement <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
            <Link href="/pricing">
              <Button size="lg" variant="outline" className="w-full sm:w-auto">
                Voir les tarifs
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Core features — deep dive */}
      <section className="bg-card/50 py-20 sm:py-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-12">
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-wider text-primary mb-4">
              <Users className="h-3.5 w-3.5" /> FaîtiereHub core
            </div>
            <h2 className="text-3xl font-extrabold tracking-tight text-foreground">
              Fonctionnalités principales
            </h2>
          </div>

          <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
            {CORE.map(({ icon: Icon, title, badge, badgeColor, description, points }) => (
              <div
                key={title}
                className="rounded-2xl border border-border bg-background p-7 space-y-4 hover:shadow-md transition-shadow"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10">
                    <Icon className="h-5 w-5 text-primary" />
                  </div>
                  <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${badgeColor}`}>
                    {badge}
                  </span>
                </div>
                <h3 className="text-lg font-bold text-foreground">{title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{description}</p>
                <ul className="space-y-1.5">
                  {points.map((p) => (
                    <li key={p} className="flex items-start gap-2 text-sm">
                      <CheckCircle className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                      <span className="text-foreground">{p}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Advanced modules */}
      <section className="py-20 sm:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-12">
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-wider text-primary mb-4">
              Modules avancés
            </div>
            <h2 className="text-3xl font-extrabold tracking-tight text-foreground">
              L&apos;écosystème s&apos;étend
            </h2>
            <p className="mt-3 text-muted-foreground max-w-2xl">
              Au-delà de la gestion de base, FaîtiereHub embarque des modules métier
              pour accélérer votre développement.
            </p>
          </div>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {ADVANCED.map(({ icon: Icon, title, description }) => (
              <div
                key={title}
                className="rounded-xl border border-border bg-card p-6 hover:shadow-sm transition-shadow"
              >
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 mb-4">
                  <Icon className="h-4.5 w-4.5 text-primary" />
                </div>
                <h3 className="font-semibold text-foreground mb-2">{title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Haroo */}
      <section className="py-20 sm:py-24 bg-gradient-to-br from-amber-50 via-orange-50/40 to-background dark:from-amber-950/20 dark:to-background">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid gap-12 lg:grid-cols-2 items-center">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-100 px-4 py-1.5 text-xs font-semibold uppercase tracking-wider text-amber-800 mb-6">
                <Network className="h-3.5 w-3.5" /> Haroo — Couche humaine
              </div>
              <h2 className="text-3xl font-extrabold tracking-tight text-foreground">
                Les acteurs du terrain ont leur propre espace
              </h2>
              <p className="mt-4 text-muted-foreground leading-relaxed">
                Haroo est la couche humaine de l&apos;écosystème FaîtiereHub. Ouvriers agricoles,
                acheteurs et agronomes disposent chacun d&apos;un profil professionnel dédié,
                d&apos;une carte vérifiable et d&apos;un flux d&apos;opportunités personnalisé.
              </p>
              <div className="mt-6 space-y-3">
                {[
                  { label: 'Ouvrier agricole', desc: "Emploi saisonnier géolocalisé par canton" },
                  { label: 'Acheteur', desc: "Préventes de production filtrées par produit" },
                  { label: 'Agronome', desc: "Missions de conseil avec badge de validation" },
                ].map(({ label, desc }) => (
                  <div key={label} className="flex items-start gap-3">
                    <CheckCircle className="h-5 w-5 text-amber-600 mt-0.5 flex-shrink-0" />
                    <div>
                      <span className="font-semibold text-foreground">{label}</span>
                      <span className="text-muted-foreground"> — {desc}</span>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-8 flex gap-3">
                <Link href="/auth/signup/haroo">
                  <Button className="gap-2 bg-amber-600 text-white hover:bg-amber-700 border-0">
                    Créer un profil Haroo
                  </Button>
                </Link>
                <Link href="/#haroo">
                  <Button variant="outline" className="border-amber-200 text-amber-700 hover:bg-amber-50">
                    En savoir plus
                  </Button>
                </Link>
              </div>
            </div>

            {/* Scanner QR visual */}
            <div className="rounded-2xl border border-amber-200/60 bg-white dark:bg-card p-8 shadow-sm">
              <div className="text-center space-y-4">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-100">
                  <ScanLine className="h-8 w-8 text-amber-700" />
                </div>
                <h3 className="text-xl font-bold text-foreground">
                  Un seul scanner pour tout l&apos;écosystème
                </h3>
                <p className="text-sm text-muted-foreground">
                  Le même QR code scanner vérifie indifféremment les 4 types de cartes :
                </p>
                <div className="space-y-2 text-left">
                  {[
                    { prefix: 'ALL-XXXXXX', label: 'Carte FAITIERE (membres coopérative)', color: 'bg-green-100 text-green-800' },
                    { prefix: 'OUV-XXXXXX', label: 'Ouvrier agricole Haroo', color: 'bg-amber-100 text-amber-800' },
                    { prefix: 'ACH-XXXXXX', label: 'Acheteur Haroo', color: 'bg-orange-100 text-orange-800' },
                    { prefix: 'AGR-XXXXXX', label: 'Agronome Haroo', color: 'bg-yellow-100 text-yellow-800' },
                  ].map(({ prefix, label, color }) => (
                    <div key={prefix} className="flex items-center gap-3 rounded-lg border border-border p-3">
                      <span className={`rounded-full px-2.5 py-0.5 font-mono text-xs font-bold ${color}`}>
                        {prefix}
                      </span>
                      <span className="text-sm text-foreground">{label}</span>
                    </div>
                  ))}
                </div>
                <Link href="/scan">
                  <Button variant="outline" size="sm" className="w-full gap-2 mt-2">
                    <QrCode className="h-4 w-4" /> Essayer le scanner
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Security */}
      <section className="bg-card/50 py-20 sm:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid gap-12 lg:grid-cols-2 items-center">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-wider text-primary mb-6">
                <Shield className="h-3.5 w-3.5" /> Sécurité
              </div>
              <h2 className="text-3xl font-extrabold tracking-tight text-foreground">
                Sécurité enterprise, adapté aux coopératives
              </h2>
              <p className="mt-4 text-muted-foreground leading-relaxed">
                Chaque coopérative est isolée des autres. Vos données ne sont jamais
                visibles par une autre organisation.
              </p>
            </div>
            <ul className="space-y-3">
              {SECURITY.map((item) => (
                <li key={item} className="flex items-start gap-3">
                  <Shield className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                  <span className="text-sm text-foreground">{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 sm:py-24">
        <div className="mx-auto max-w-3xl px-4 text-center sm:px-6 lg:px-8">
          <h2 className="text-3xl font-extrabold tracking-tight text-foreground mb-4">
            Prêt à digitaliser votre faîtière ?
          </h2>
          <p className="text-lg text-muted-foreground mb-8">
            Commencez votre essai gratuit de 30 jours, sans engagement, sans carte bancaire.
          </p>
          <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
            <Link href="/auth/signup">
              <Button size="lg" className="gap-2 w-full sm:w-auto">
                Démarrer l&apos;essai gratuit <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
            <Link href="/contact">
              <Button size="lg" variant="outline" className="w-full sm:w-auto">
                Contacter l&apos;équipe
              </Button>
            </Link>
          </div>
        </div>
      </section>
    </MarketingLayout>
  )
}
