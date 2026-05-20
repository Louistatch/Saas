import { Metadata } from 'next'
import Link from 'next/link'
import { MarketingLayout } from '@/components/shared/marketing-layout'
import { Calendar, ArrowRight } from 'lucide-react'

export const metadata: Metadata = {
  title: 'Blog — FaîtiereHub | Actualités et ressources pour les coopératives agricoles',
  description:
    'Découvrez nos articles sur la digitalisation des coopératives agricoles, les bonnes pratiques de gestion et les innovations pour les faîtières.',
}

const articles = [
  {
    date: '15 janvier 2025',
    title: 'Comment digitaliser votre faîtière agricole en 5 étapes',
    excerpt:
      'La transformation numérique des organisations agricoles n\'est plus un luxe mais une nécessité. Découvrez notre guide pratique pour démarrer votre digitalisation sans bouleverser vos processus existants.',
    category: 'Guide',
  },
  {
    date: '8 janvier 2025',
    title: 'L\'importance des cartes numériques pour l\'identification des membres',
    excerpt:
      'Les cartes de membre avec QR code révolutionnent la gestion des coopératives. Retour d\'expérience sur le déploiement auprès de 3 000 producteurs au Togo.',
    category: 'Étude de cas',
  },
  {
    date: '22 décembre 2024',
    title: 'KoboCollect et FaîtiereHub : automatiser la collecte de données terrain',
    excerpt:
      'Connecter KoboToolbox à votre plateforme de gestion permet de gagner des heures de saisie manuelle. Voici comment configurer le pipeline en quelques minutes.',
    category: 'Tutoriel',
  },
  {
    date: '10 décembre 2024',
    title: 'Bilan 2024 : les coopératives agricoles face aux défis du numérique',
    excerpt:
      'Retour sur une année de transformation digitale dans le secteur agricole ouest-africain. Chiffres clés, tendances et perspectives pour 2025.',
    category: 'Analyse',
  },
]

export default function BlogPage() {
  return (
    <MarketingLayout>
      {/* Hero */}
      <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
        <h1 className="text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
          Blog
        </h1>
        <p className="mt-4 text-lg text-muted-foreground max-w-2xl">
          Actualités, guides et ressources pour accompagner la digitalisation
          des faîtières et coopératives agricoles.
        </p>
      </section>

      {/* Articles */}
      <section className="pb-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid gap-8 md:grid-cols-2">
            {articles.map((article) => (
              <article
                key={article.title}
                className="rounded-xl border border-border bg-background p-8 space-y-4 hover:shadow-md transition-shadow group"
              >
                <div className="flex items-center gap-3">
                  <span className="inline-flex items-center rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
                    {article.category}
                  </span>
                  <span className="flex items-center gap-1 text-sm text-muted-foreground">
                    <Calendar className="h-3.5 w-3.5" />
                    {article.date}
                  </span>
                </div>
                <h2 className="text-xl font-semibold text-foreground group-hover:text-primary transition-colors">
                  {article.title}
                </h2>
                <p className="text-muted-foreground leading-relaxed">
                  {article.excerpt}
                </p>
                <div className="flex items-center gap-1 text-sm font-medium text-primary">
                  Lire l&apos;article <ArrowRight className="h-3.5 w-3.5" />
                </div>
              </article>
            ))}
          </div>

          {/* Coming soon */}
          <div className="mt-16 text-center rounded-xl border border-dashed border-border bg-muted/30 p-12">
            <p className="text-lg font-medium text-foreground">Bientôt plus d&apos;articles</p>
            <p className="mt-2 text-muted-foreground">
              Nous publions régulièrement du contenu pour vous aider à tirer le meilleur de FaîtiereHub.
              Revenez bientôt !
            </p>
          </div>
        </div>
      </section>
    </MarketingLayout>
  )
}
