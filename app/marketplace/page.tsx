'use client'

import { Suspense } from 'react'
import { FicheFilterBar } from '@/components/marketplace/fiche-filter-bar'
import { FicheGrid } from '@/components/marketplace/fiche-grid'
import { useMarketplaceFilters } from '@/hooks/use-marketplace-filters'
import { useFichesPublic } from '@/hooks/use-fiches-public'
import { Logo } from '@/components/shared/logo'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { FileText, LogIn } from 'lucide-react'

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
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Logo size="sm" />
            <div className="hidden sm:flex items-center gap-1.5 text-sm text-muted-foreground">
              <FileText className="h-4 w-4" />
              <span>Comptes d'exploitation</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/auth/login">
              <Button variant="outline" size="sm" className="gap-2 border-border">
                <LogIn className="h-4 w-4" />
                <span className="hidden sm:inline">Connexion</span>
              </Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="bg-gradient-to-br from-primary/5 via-background to-accent/5 border-b border-border">
        <div className="max-w-7xl mx-auto px-4 py-8 md:py-12">
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
      <div className="max-w-7xl mx-auto px-4 py-6">
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
    </div>
  )
}

export default function MarketplacePage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center">
          <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
        </div>
      }
    >
      <MarketplaceContent />
    </Suspense>
  )
}
