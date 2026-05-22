import { Metadata } from 'next'
import { MarketingLayout } from '@/components/shared/marketing-layout'
import { BookOpen } from 'lucide-react'

export const metadata: Metadata = {
  title: 'Blog — FaîtiereHub | Actualités et ressources pour les coopératives agricoles',
  description:
    'Découvrez nos articles sur la digitalisation des coopératives agricoles, les bonnes pratiques de gestion et les innovations pour les faîtières.',
}

export default function BlogPage() {
  return (
    <MarketingLayout>
      <section className="mx-auto max-w-3xl px-4 py-20 sm:px-6 lg:px-8">
        <div className="text-center space-y-6">
          <div className="flex justify-center">
            <div className="p-4 rounded-full bg-primary/10">
              <BookOpen className="h-12 w-12 text-primary" />
            </div>
          </div>
          <h1 className="text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
            Blog
          </h1>
          <p className="text-lg text-muted-foreground max-w-xl mx-auto">
            Notre blog est en cours de préparation. Bientôt, vous trouverez ici des articles sur la digitalisation des coopératives agricoles, des guides pratiques et des études de cas.
          </p>
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-yellow-50 border border-yellow-200 text-yellow-800 text-sm font-medium">
            🚧 En cours de développement
          </div>
        </div>
      </section>
    </MarketingLayout>
  )
}
