'use client'

import { useState, useMemo } from 'react'
import { FicheCard } from './fiche-card'
import { FicheAccessDialog } from './fiche-access-dialog'
import { LoadingBlock } from '@/components/shared/loading'
import { EmptyState } from '@/components/shared/empty-state'
import { PaginationBar } from '@/components/shared/pagination'
import { FileText, AlertCircle } from 'lucide-react'
import type { PublicFiche } from '@/hooks/use-fiches-public'
import type { MarketplaceFilters } from '@/hooks/use-marketplace-filters'

interface FicheGridProps {
  fiches: PublicFiche[]
  total: number
  totalPages: number
  isLoading: boolean
  error: string | null
  filters: MarketplaceFilters
  cultures: { id: string; name: string; icon: string | null }[]
  setFilter: <K extends keyof MarketplaceFilters>(
    key: K,
    value: MarketplaceFilters[K],
  ) => void
}

const PAGE_SIZE = 20

export function FicheGrid({
  fiches,
  total,
  totalPages,
  isLoading,
  error,
  filters,
  cultures,
  setFilter,
}: FicheGridProps) {
  const [selectedFiche, setSelectedFiche] = useState<PublicFiche | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)

  const cultureIconMap = useMemo(() => {
    const map = new Map<string, string | null>()
    cultures.forEach((c) => map.set(c.name, c.icon))
    return map
  }, [cultures])

  const handleAccess = (fiche: PublicFiche) => {
    setSelectedFiche(fiche)
    setDialogOpen(true)
  }

  if (error) {
    return (
      <div className="flex items-start gap-3 p-4 bg-destructive/10 border border-destructive/20 rounded-lg">
        <AlertCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-medium text-destructive">
            Erreur lors du chargement
          </p>
          <p className="text-xs text-destructive/80 mt-0.5">{error}</p>
        </div>
      </div>
    )
  }

  if (isLoading && fiches.length === 0) {
    return <LoadingBlock message="Chargement des fiches techniques…" className="py-16" />
  }

  if (!isLoading && fiches.length === 0) {
    return (
      <EmptyState
        icon={FileText}
        title="Aucune fiche disponible"
        description="Aucun compte d'exploitation ne correspond à vos critères. Essayez d'élargir votre recherche."
      />
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          <span className="font-semibold text-foreground">{total}</span>{' '}
          {total === 1 ? 'compte d\'exploitation' : 'comptes d\'exploitation'}
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {fiches.map((fiche) => (
          <FicheCard
            key={fiche.id}
            fiche={fiche}
            cultureIcon={cultureIconMap.get(fiche.culture)}
            onAccess={handleAccess}
          />
        ))}
      </div>

      {totalPages > 1 ? (
        <PaginationBar
          page={filters.page}
          pageSize={PAGE_SIZE}
          total={total}
          onPageChange={(page) => setFilter('page', page)}
        />
      ) : null}

      <FicheAccessDialog
        fiche={selectedFiche}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
      />
    </div>
  )
}
