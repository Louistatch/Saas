import { MarketingLayout } from '@/components/shared/marketing-layout'
import { publicPageMetadata } from '@/lib/seo'
import { Suspense } from 'react'
import MarketplaceContent from './marketplace-content'

export const metadata = publicPageMetadata('/marketplace')

export default function MarketplacePage() {
  return (
    <MarketingLayout>
      <section className="border-b border-border bg-primary/5 py-10 sm:py-12">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <h1 className="text-2xl font-bold sm:text-3xl">
            Comptes d’exploitation et produits agricoles
          </h1>
          <p className="mt-4 max-w-2xl leading-relaxed text-muted-foreground">
            Consultez les comptes d’exploitation prévisionnels, itinéraires techniques et produits
            agricoles publiés. Filtrez par culture, région, préfecture ou canton et choisissez les
            fiches adaptées à votre projet. Les administrateurs préparent les données ; vous
            sélectionnez les documents disponibles avant de les acheter.
          </p>
        </div>
      </section>
      <Suspense
        fallback={
          <output className="mx-auto block max-w-7xl p-6">
            Chargement du catalogue et des filtres…
          </output>
        }
      >
        <MarketplaceContent />
      </Suspense>
    </MarketingLayout>
  )
}
