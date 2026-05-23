'use client'

import { ProductCard, ProductCardSkeleton } from './product-card'
import { EmptyState } from '@/components/shared/empty-state'
import { PaginationBar } from '@/components/shared/pagination'
import { Button } from '@/components/ui/button'
import { ShoppingCart, ArrowUpDown } from 'lucide-react'
import type { MarketplaceProduct } from '@/hooks/use-marketplace-data'
import type { MarketplaceFilters } from '@/hooks/use-marketplace-filters'

interface ProductGridProps {
  products: MarketplaceProduct[]
  total: number
  totalPages: number
  isLoading: boolean
  error: string | null
  filters: MarketplaceFilters
  setFilter: <K extends keyof MarketplaceFilters>(key: K, value: MarketplaceFilters[K]) => void
  onProductClick?: (product: MarketplaceProduct) => void
}

const SORT_OPTIONS = [
  { value: 'created_at:desc', label: 'Plus récents' },
  { value: 'created_at:asc', label: 'Plus anciens' },
  { value: 'price:asc', label: 'Prix croissant' },
  { value: 'price:desc', label: 'Prix décroissant' },
  { value: 'name:asc', label: 'Nom A-Z' },
  { value: 'name:desc', label: 'Nom Z-A' },
]

export function ProductGrid({
  products,
  total,
  totalPages,
  isLoading,
  error,
  filters,
  setFilter,
  onProductClick,
}: ProductGridProps) {
  const currentSort = `${filters.sort_by}:${filters.sort_order}`

  if (error) {
    return (
      <div className="text-center py-12">
        <p className="text-destructive font-medium">Erreur de chargement</p>
        <p className="text-sm text-muted-foreground mt-1">{error}</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Header: count + sort */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {isLoading ? (
            <span className="inline-block h-4 w-24 bg-secondary/40 rounded animate-pulse" />
          ) : (
            <>{total.toLocaleString('fr-FR')} produit{total !== 1 ? 's' : ''}</>
          )}
        </p>

        <div className="flex items-center gap-2">
          <ArrowUpDown className="h-4 w-4 text-muted-foreground" />
          <select
            className="text-sm border border-border rounded-lg px-2 py-1.5 bg-background text-foreground"
            value={currentSort}
            onChange={(e) => {
              const [sort_by, sort_order] = e.target.value.split(':')
              setFilter('sort_by', sort_by)
              setFilter('sort_order', sort_order)
            }}
          >
            {SORT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <ProductCardSkeleton key={i} />
          ))}
        </div>
      ) : products.length === 0 ? (
        <EmptyState
          icon={ShoppingCart}
          title="Aucun produit trouvé"
          description="Essayez de modifier vos filtres ou votre recherche"
          action={
            <Button variant="outline" onClick={() => setFilter('category', '')}>
              Voir tous les produits
            </Button>
          }
        />
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {products.map((product) => (
              <ProductCard
                key={product.id}
                product={product}
                onClick={() => onProductClick?.(product)}
              />
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <PaginationBar
              page={filters.page}
              pageSize={20}
              total={total}
              onPageChange={(p) => setFilter('page', p)}
            />
          )}
        </>
      )}
    </div>
  )
}
