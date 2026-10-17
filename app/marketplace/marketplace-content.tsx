'use client'

import { FicheFilterBar } from '@/components/marketplace/fiche-filter-bar'
import { FicheGrid } from '@/components/marketplace/fiche-grid'
import { MarketplaceFilterBar } from '@/components/marketplace/filter-bar'
import { MyPurchases } from '@/components/marketplace/my-purchases'
import { PresalesStrip } from '@/components/marketplace/presales-strip'
import { ProductGrid } from '@/components/marketplace/product-grid'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useFichesPublic } from '@/hooks/use-fiches-public'
import { useMarketplaceData } from '@/hooks/use-marketplace-data'
import { useMarketplaceFilters } from '@/hooks/use-marketplace-filters'
import { FileText, ShoppingCart } from 'lucide-react'
import { useState } from 'react'

function FichesTab() {
  const { filters, localSearch, setLocalSearch, setFilter, resetFilters, activeFilterCount } =
    useMarketplaceFilters()

  const { fiches, total, totalPages, isLoading, error, referenceData } = useFichesPublic(filters)

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
  const { filters, localSearch, setLocalSearch, setFilter, resetFilters, activeFilterCount } =
    useMarketplaceFilters()

  const { products, total, totalPages, isLoading, error, referenceData } =
    useMarketplaceData(filters)

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

export default function MarketplaceContent() {
  const [activeTab, setActiveTab] = useState('fiches')

  return (
    <>
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
            <MyPurchases />
            <FichesTab />
          </TabsContent>

          <TabsContent value="produits" className="space-y-8">
            <PresalesStrip />
            <ProduitsTab />
          </TabsContent>
        </Tabs>
      </div>
    </>
  )
}
