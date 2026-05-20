import { Metadata } from 'next'
import { MarketingLayout } from '@/components/shared/marketing-layout'
import { Users, CreditCard, BarChart3, Database, Coins, ShoppingCart } from 'lucide-react'

export const metadata: Metadata = {
  title: 'Produit — FaîtiereHub | Plateforme tout-en-un pour faîtières agricoles',
  description:
    'Découvrez FaîtiereHub : gestion des membres, cartes numériques, comptes d\'exploitation, pipeline KoboCollect, cotisations pour les faîtières agricoles.',
}

const features = [
  {
    icon: Users,
    title: 'Gestion des membres',
    description:
      'Centralisez les informations de tous vos membres : identité, localisation, parcelles, productions. Importez en masse depuis Excel ou KoboCollect et suivez l\'évolution de votre base en temps réel.',
  },
  {
    icon: CreditCard,
    title: 'Cartes numériques',
    description:
      'Émettez des cartes de membre avec QR code unique. Vérification instantanée sur le terrain, accès aux services de la coopérative et traçabilité complète des interactions.',
  },
  {
    icon: BarChart3,
    title: 'Comptes d\'exploitation',
    description:
      'Suivez les fiches d\'exploitation de chaque membre : superficies, cultures, rendements, intrants utilisés. Générez des rapports consolidés pour votre faîtière.',
  },
  {
    icon: Database,
    title: 'Pipeline KoboCollect',
    description:
      'Connectez vos formulaires KoboToolbox et synchronisez automatiquement les données terrain. Webhook en temps réel, mapping intelligent des champs et historique complet.',
  },
  {
    icon: Coins,
    title: 'Cotisations',
    description:
      'Gérez les cotisations annuelles, suivez les paiements, envoyez des rappels automatiques. Tableau de bord financier avec taux de recouvrement et projections.',
  },
  {
    icon: ShoppingCart,
    title: 'Comptes d\'exploitation',
    description:
      'Publiez et partagez les comptes d\'exploitation et itinéraires techniques classés par canton, préfecture et région. Accès gratuit pour les membres.',
  },
]

export default function ProduitPage() {
  return (
    <MarketingLayout>
      {/* Hero */}
      <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8 text-center">
        <h1 className="text-4xl font-bold tracking-tight text-foreground sm:text-5xl lg:text-6xl">
          La plateforme tout-en-un pour les faîtières agricoles
        </h1>
        <p className="mt-6 text-lg text-muted-foreground max-w-3xl mx-auto">
          FaîtiereHub réunit tous les outils dont votre organisation a besoin pour gérer ses membres,
          digitaliser ses opérations et accélérer sa croissance.
        </p>
      </section>

      {/* Features */}
      <section className="bg-card/50 py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid gap-12 md:grid-cols-2 lg:grid-cols-3">
            {features.map((feature) => (
              <div
                key={feature.title}
                className="rounded-xl border border-border bg-background p-8 space-y-4 hover:shadow-md transition-shadow"
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
                  <feature.icon className="h-6 w-6 text-primary" />
                </div>
                <h3 className="text-xl font-semibold text-foreground">{feature.title}</h3>
                <p className="text-muted-foreground leading-relaxed">{feature.description}</p>
                <div className="h-32 rounded-lg bg-muted/50 border border-border flex items-center justify-center">
                  <span className="text-sm text-muted-foreground">Illustration</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20">
        <div className="mx-auto max-w-3xl px-4 text-center sm:px-6 lg:px-8">
          <h2 className="text-3xl font-bold text-foreground">
            Prêt à digitaliser votre faîtière ?
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            Commencez votre essai gratuit de 30 jours, sans engagement.
          </p>
        </div>
      </section>
    </MarketingLayout>
  )
}
