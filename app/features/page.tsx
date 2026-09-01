import Link from 'next/link'
import { MarketingLayout } from '@/components/shared/marketing-layout'
import { Button } from '@/components/ui/button'
import {
  Users,
  BarChart3,
  QrCode,
  Database,
  Zap,
  Globe,
  ArrowRight,
  MapPin,
  ShoppingBag,
  CreditCard,
  GraduationCap,
  Handshake,
  Network,
  Briefcase,
  Sprout,
  BookOpen,
  CheckCircle,
  ScanLine,
} from 'lucide-react'

const FAITIERE_FEATURES = [
  {
    icon: Users,
    title: 'Gestion des membres',
    description:
      "Base de données complète avec profils, cotisations, scores Bronze / Silver / Gold et historique d'activité. Importez via KoboToolbox ou ajoutez manuellement.",
  },
  {
    icon: QrCode,
    title: 'Cartes numériques vérifiables',
    description:
      'Générez des cartes membres avec QR code unique, photo et informations agricoles. Vérifiables en un scan, même hors connexion.',
  },
  {
    icon: MapPin,
    title: 'Carte agricole interactive',
    description:
      'Visualisez la répartition géographique des membres et parcelles par préfecture sur la carte du Togo. Filtrez par région ou culture.',
  },
  {
    icon: BarChart3,
    title: 'Analytiques & rapports',
    description:
      "Suivez l'engagement des membres, les cotisations, les ventes et la croissance de la coopérative avec des indicateurs en temps réel.",
  },
  {
    icon: Database,
    title: 'Intégration KoboToolbox',
    description:
      'Synchronisez automatiquement les données de terrain depuis KoboToolbox — collectes, formulaires, mises à jour de profils membres.',
  },
  {
    icon: ShoppingBag,
    title: 'AgriMarket',
    description:
      'Place de marché agricole intégrée — connectez producteurs et acheteurs, gérez les offres et facilitez les transactions directes.',
  },
  {
    icon: CreditCard,
    title: 'AgriCredit',
    description:
      'Gérez les demandes de crédit agricole avec scoring automatique basé sur le profil membre, et suivez les remboursements en temps réel.',
  },
  {
    icon: GraduationCap,
    title: 'AgriAcademy',
    description:
      "Modules de formation certifiante pour vos membres — irrigation (FAO-56), pratiques culturales, agrobusiness, bonnes pratiques de terrain.",
  },
  {
    icon: Handshake,
    title: 'Matching & Carnet',
    description:
      'Mettez en relation producteurs et acheteurs selon les cultures et zones. Gérez votre carnet de contacts et techniciens agricoles.',
  },
  {
    icon: Globe,
    title: 'Widget embeddable',
    description:
      "Intégrez les comptes d'exploitation et la place de marché sur votre site web existant avec un widget personnalisable à votre marque.",
  },
  {
    icon: Zap,
    title: 'Hiérarchie multi-niveaux',
    description:
      'Architecture faîtière → unions → coopératives. Chaque niveau a son tableau de bord, ses données et ses droits propres.',
  },
  {
    icon: Database,
    title: 'Sécurité & RLS',
    description:
      "Row-Level Security Supabase sur toutes les tables. Chaque coopérative ne voit que ses propres données. Webhook HMAC et rate limiting intégrés.",
  },
]

const HAROO_PROFILES = [
  {
    icon: Sprout,
    role: 'Ouvrier agricole',
    color: 'text-amber-700 bg-amber-100',
    features: [
      "Profil avec compétences et cantons de disponibilité",
      "Offres d'emploi géolocalisées par canton",
      "Carte professionnelle OUV-XXXXXX vérifiable",
      "Météo agricole 4 jours et prix du marché",
    ],
  },
  {
    icon: Briefcase,
    role: 'Acheteur',
    color: 'text-orange-700 bg-orange-100',
    features: [
      "Profil avec produits et zones d'intervention",
      "Préventes filtrées sur vos intérêts",
      "Carte professionnelle ACH-XXXXXX vérifiable",
      "Contacts producteurs qualifiés",
    ],
  },
  {
    icon: BookOpen,
    role: 'Agronome',
    color: 'text-yellow-700 bg-yellow-100',
    features: [
      "Profil avec spécialisations et certifications",
      "Demandes de mission directes depuis l'écosystème",
      "Badge de validation professionnelle",
      "Carte AGR-XXXXXX vérifiable par QR",
    ],
  },
]

const USE_CASES = [
  {
    title: 'Coopérative maraîchère',
    description:
      "FENOMAT utilise FaîtiereHub pour gérer ses membres maraîchers, partager les comptes d'exploitation par canton et préfecture, et émettre des cartes vérifiables aux marchés.",
  },
  {
    title: 'Faîtière régionale',
    description:
      "Une faîtière couvre plusieurs unions et coopératives. Chaque niveau a son tableau de bord propre. Le super_admin voit l'ensemble de la hiérarchie.",
  },
  {
    title: 'Filière cacao / café',
    description:
      "Les agronomes Haroo effectuent des missions de conseil auprès des exploitants. Les acheteurs accèdent aux préventes de production avant la récolte.",
  },
  {
    title: 'Marché de travail agricole',
    description:
      "Les ouvriers agricoles déclarent leur disponibilité par canton. Les exploitants publient des offres via AgriTogo. Le matching se fait automatiquement par proximité.",
  },
]

export default function FeaturesPage() {
  return (
    <MarketingLayout>

      {/* Hero */}
      <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
        <div className="text-center space-y-4 mb-16">
          <h1 className="text-4xl font-extrabold tracking-tight text-foreground sm:text-5xl">
            Un écosystème complet pour l&apos;agriculture
          </h1>
          <p className="mx-auto max-w-2xl text-lg text-muted-foreground">
            FaîtiereHub structure vos coopératives. Haroo donne une identité professionnelle
            aux acteurs du terrain. Tout est connecté, tout est vérifiable.
          </p>
        </div>

        {/* FaîtiereHub features grid */}
        <div className="mb-4">
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-wider text-primary mb-8">
            <Users className="h-3.5 w-3.5" /> FaîtiereHub — Couche organisationnelle
          </div>
        </div>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {FAITIERE_FEATURES.map(({ icon: Icon, title, description }) => (
            <div
              key={title}
              className="rounded-xl border border-border bg-card p-6 hover:shadow-md transition-shadow"
            >
              <Icon className="h-8 w-8 text-primary mb-4" />
              <h3 className="font-semibold text-foreground mb-2">{title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Haroo features */}
      <section className="py-20 sm:py-24 bg-gradient-to-br from-amber-50 via-orange-50/40 to-background dark:from-amber-950/20 dark:to-background">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <div className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-100 px-4 py-1.5 text-xs font-semibold uppercase tracking-wider text-amber-800 mb-4">
              <Network className="h-3.5 w-3.5" /> Haroo — Couche humaine &amp; réseau
            </div>
            <h2 className="text-3xl font-extrabold tracking-tight text-foreground">
              L&apos;identité professionnelle agricole
            </h2>
            <p className="mt-4 mx-auto max-w-2xl text-muted-foreground">
              Trois profils, trois expériences — une seule plateforme partagée.
              Haroo est gratuit et complémentaire à FaîtiereHub.
            </p>
          </div>

          <div className="grid gap-6 sm:grid-cols-3">
            {HAROO_PROFILES.map(({ icon: Icon, role, color, features }) => (
              <div
                key={role}
                className="rounded-2xl border border-amber-200/60 bg-white dark:bg-card p-6 shadow-sm"
              >
                <div className={`inline-flex h-10 w-10 items-center justify-center rounded-lg ${color} mb-4`}>
                  <Icon className="h-5 w-5" />
                </div>
                <h3 className="font-bold text-foreground mb-3">{role}</h3>
                <ul className="space-y-2">
                  {features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-sm">
                      <CheckCircle className="h-4 w-4 text-amber-600 mt-0.5 flex-shrink-0" />
                      <span className="text-muted-foreground">{f}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          {/* Scanner QR bridge */}
          <div className="mt-10 rounded-xl border border-amber-200 bg-amber-50/80 dark:bg-amber-900/10 p-5 max-w-2xl mx-auto text-center">
            <div className="flex items-center justify-center gap-2 text-sm font-semibold text-amber-800 dark:text-amber-300 mb-2">
              <ScanLine className="h-4 w-4" />
              Un seul scanner pour toutes les cartes
            </div>
            <p className="text-sm text-amber-700 dark:text-amber-400">
              Le même QR code scanner vérifie les cartes FAITIERE des membres de
              coopérative et les cartes professionnelles Haroo (OUV / ACH / AGR).
            </p>
          </div>
        </div>
      </section>

      {/* Use cases */}
      <section className="bg-card/50 py-20 sm:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-extrabold tracking-tight text-foreground mb-12 text-center">
            Comment les organisations utilisent l&apos;écosystème
          </h2>
          <div className="grid gap-6 sm:grid-cols-2">
            {USE_CASES.map(({ title, description }) => (
              <div key={title} className="rounded-xl border border-border bg-background p-6">
                <h3 className="font-semibold text-foreground mb-2">{title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 sm:py-24">
        <div className="mx-auto max-w-3xl px-4 text-center sm:px-6 lg:px-8">
          <h2 className="text-3xl font-extrabold tracking-tight text-foreground mb-4">
            Transformez votre coopérative aujourd&apos;hui
          </h2>
          <p className="text-lg text-muted-foreground mb-8">
            Découvrez comment FaîtiereHub et Haroo peuvent révolutionner la gestion
            et les connexions au sein de votre coopérative.
          </p>
          <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
            <Link href="/auth/signup">
              <Button size="lg" className="gap-2 w-full sm:w-auto">
                Essai gratuit FaîtiereHub <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
            <Link href="/auth/signup/haroo">
              <Button size="lg" variant="outline" className="gap-2 border-amber-200 text-amber-700 hover:bg-amber-50 w-full sm:w-auto">
                <Network className="h-4 w-4" /> Rejoindre Haroo
              </Button>
            </Link>
            <Link href="/pricing">
              <Button size="lg" variant="ghost" className="w-full sm:w-auto">
                Voir les tarifs
              </Button>
            </Link>
          </div>
        </div>
      </section>
    </MarketingLayout>
  )
}
