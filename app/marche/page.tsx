import { MarketingLayout } from '@/components/shared/marketing-layout'
import { publicPageMetadata } from '@/lib/seo'
import { Suspense } from 'react'
import MarcheContent from './market-content'

export const metadata = publicPageMetadata('/marche')

export default function MarchePage() {
  return (
    <MarketingLayout>
      <section className="border-b border-border bg-primary/5 py-12 sm:py-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">
            Marché agricole de proximité au Togo
          </h1>
          <p className="mt-4 max-w-2xl text-lg leading-relaxed text-muted-foreground">
            Préventes de récoltes, emplois agricoles et missions de conseil : trouvez ce qui se vend
            et se cherche près de chez vous, par canton, préfecture et région. Contactez les
            producteurs et les professionnels du réseau pour préciser vos besoins.
          </p>
        </div>
      </section>
      <Suspense
        fallback={
          <output className="mx-auto block max-w-7xl p-6">
            Chargement des annonces et des filtres…
          </output>
        }
      >
        <MarcheContent />
      </Suspense>
    </MarketingLayout>
  )
}
