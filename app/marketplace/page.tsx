'use client'

import { Suspense } from 'react'
import { FicheFilterBar } from '@/components/marketplace/fiche-filter-bar'
import { FicheGrid } from '@/components/marketplace/fiche-grid'
import { useMarketplaceFilters } from '@/hooks/use-marketplace-filters'
import { useFichesPublic } from '@/hooks/use-fiches-public'
import { MarketingLayout } from '@/components/shared/marketing-layout'

function MarketplaceContent() {
  const {
    filters,
    localSearch,
    setLocalSearch,
    setFilter,
    resetFilters,
    activeFilterCount,
  } = useMarketplaceFilters()

  const {
    fiches,
    total,
    totalPages,
    isLoading,
    error,
    referenceData,
  } = useFichesPublic(filters)

  return (
    <>
      {/* Hero */}
      <section className="bg-gradient-to-br from-primary/5 via-background to-accent/5 border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 md:py-12">
          <h1 className="text-2xl md:text-3xl font-bold text-foreground">
            Comptes d'exploitation agricole
          </h1>
          <p className="text-muted-foreground mt-2 max-w-2xl">
            Consultez les fiches techniques et itinéraires de culture publiés par les coopératives
            agricoles. Gratuit pour les membres titulaires d'une carte, accessible aux non-membres
            après paiement.
          </p>
        </div>
      </section>

      {/* Main content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6">
          {/* Sidebar filters (desktop) */}
          <aside className="hidden lg:block space-y-4 sticky top-20 self-start max-h-[calc(100vh-6rem)] overflow-y-auto pr-2">
            <FicheFilterBar
              filters={filters}
              localSearch={localSearch}
              setLocalSearch={setLocalSearch}
              setFilter={setFilter}
              resetFilters={resetFilters}
              activeFilterCount={activeFilterCount}
              referenceData={referenceData}
            />
          </aside>

          {/* Mobile filter bar + grid */}
          <div className="space-y-4">
            <div className="lg:hidden">
              <FicheFilterBar
                filters={filters}
                localSearch={localSearch}
                setLocalSearch={setLocalSearch}
                setFilter={setFilter}
                resetFilters={resetFilters}
                activeFilterCount={activeFilterCount}
                referenceData={referenceData}
              />
            </div>

            <FicheGrid
              fiches={fiches}
              total={total}
              totalPages={totalPages}
              isLoading={isLoading}
              error={error}
              filters={filters}
              cultures={referenceData.cultures}
              setFilter={setFilter}
            />
          </div>
        </div>
      </div>
    </>
  )
}

export default function MarketplacePage() {
  return (
    <MarketingLayout>
      <Suspense
        fallback={
          <div className="min-h-[60vh] flex items-center justify-center">
            <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
          </div>
        }
      >
        <MarketplaceContent />
      </Suspense>
    </MarketingLayout>
  )
}
