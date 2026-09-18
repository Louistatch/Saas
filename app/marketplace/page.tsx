'use client'

import { Suspense, useState } from 'react'
import { FicheFilterBar } from '@/components/marketplace/fiche-filter-bar'
import { FicheGrid } from '@/components/marketplace/fiche-grid'
import { MarketplaceFilterBar } from '@/components/marketplace/filter-bar'
import { ProductGrid } from '@/components/marketplace/product-grid'
import { useMarketplaceFilters } from '@/hooks/use-marketplace-filters'
import { useFichesPublic } from '@/hooks/use-fiches-public'
import { useMarketplaceData } from '@/hooks/use-marketplace-data'
import { MarketingLayout } from '@/components/shared/marketing-layout'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { FileText, ShoppingCart } from 'lucide-react'

function FichesTab() {
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
    <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6">
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
  )
}

function ProduitsTab() {
  const {
    filters,
    localSearch,
    setLocalSearch,
    setFilter,
    resetFilters,
    activeFilterCount,
  } = useMarketplaceFilters()

  const {
    products,
    total,
    totalPages,
    isLoading,
    error,
    referenceData,
  } = useMarketplaceData(filters)

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6">
      <aside className="hidden lg:block space-y-4 sticky top-20 self-start max-h-[calc(100vh-6rem)] overflow-y-auto pr-2">
        <MarketplaceFilterBar
          filters={filters}
          localSearch={localSearch}
          setLocalSearch={setLocalSearch}
          setFilter={setFilter}
          resetFilters={resetFilters}
          activeFilterCount={activeFilterCount}
          referenceData={referenceData}
        />
      </aside>
      <div className="space-y-4">
        <div className="lg:hidden">
          <MarketplaceFilterBar
            filters={filters}
            localSearch={localSearch}
            setLocalSearch={setLocalSearch}
            setFilter={setFilter}
            resetFilters={resetFilters}
            activeFilterCount={activeFilterCount}
            referenceData={referenceData}
          />
        </div>
        <ProductGrid
          products={products}
          total={total}
          totalPages={totalPages}
          isLoading={isLoading}
          error={error}
          filters={filters}
          setFilter={setFilter}
        />
      </div>
    </div>
  )
}

function MarketplaceContent() {
  const [activeTab, setActiveTab] = useState('fiches')

  return (
    <>
      {/* Hero */}
      <section className="bg-gradient-to-br from-primary/5 via-background to-accent/5 border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 md:py-12">
          <h1 className="text-2xl md:text-3xl font-bold text-foreground">
            Marketplace agricole
          </h1>
          <p className="text-muted-foreground mt-2 max-w-2xl">
            Accédez aux comptes d'exploitation et aux produits agricoles publiés par les coopératives.
            Filtrez par région, préfecture ou canton pour trouver ce qui vous correspond.
          </p>
        </div>
      </section>

      {/* Tabs + content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-6">
            <TabsTrigger value="fiches" className="gap-2">
              <FileText className="h-4 w-4" />
              Comptes d'exploitation
            </TabsTrigger>
            <TabsTrigger value="produits" className="gap-2">
              <ShoppingCart className="h-4 w-4" />
              Produits agricoles
            </TabsTrigger>
          </TabsList>

          <TabsContent value="fiches">
            <FichesTab />
          </TabsContent>

          <TabsContent value="produits">
            <ProduitsTab />
          </TabsContent>
        </Tabs>
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
