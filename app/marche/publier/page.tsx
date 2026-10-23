import { MarketNav } from '@/components/market/market-nav'
import { MarketingLayout } from '@/components/shared/marketing-layout'
import type { Metadata } from 'next'
import { Suspense } from 'react'
import PublishContent from './publish-content'

export const metadata: Metadata = {
  title: 'Publier une annonce — Marché et travail — FaîtiereHub',
  robots: { index: false, follow: false },
}

export default function PublierPage() {
  return (
    <MarketingLayout>
      <MarketNav />
      <section className="py-8 sm:py-12">
        <div className="mx-auto max-w-2xl px-4 sm:px-6">
          <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">
            Publier une annonce
          </h1>
          <p className="mt-2 text-muted-foreground">
            Gratuit. Vos voisins la voient en premier ; les réponses arrivent dans Mon suivi.
          </p>
          <div className="mt-8">
            <Suspense
              fallback={<output className="block text-muted-foreground">Chargement…</output>}
            >
              <PublishContent />
            </Suspense>
          </div>
        </div>
      </section>
    </MarketingLayout>
  )
}
