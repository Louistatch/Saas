'use client'

import { EmptyState } from '@/components/shared/empty-state'
import { LoadingBlock } from '@/components/shared/loading'
import { PaginationBar } from '@/components/shared/pagination'
import { Button } from '@/components/ui/button'
import type { PublicFiche } from '@/hooks/use-fiches-public'
import type { MarketplaceFilters } from '@/hooks/use-marketplace-filters'
import { AlertCircle, FileText } from 'lucide-react'
import Link from 'next/link'
import { useEffect, useMemo, useRef, useState } from 'react'
import { FicheAccessDialog } from './fiche-access-dialog'
import { FicheCard } from './fiche-card'

interface FicheGridProps {
  fiches: PublicFiche[]
  total: number
  totalPages: number
  isLoading: boolean
  error: string | null
  filters: MarketplaceFilters
  cultures: { id: string; name: string; icon: string | null }[]
  setFilter: <K extends keyof MarketplaceFilters>(key: K, value: MarketplaceFilters[K]) => void
  /** Fiche → achat réglé de ce visiteur (compte connecté ou appareil). */
  ownedByFiche?: ReadonlyMap<string, string>
  /**
   * Lien vers une fiche (/marketplace?fiche=<id>) : la grille ne montre
   * qu'elle et ouvre sa fenêtre d'achat une fois, dès qu'elle est chargée.
   */
  focusFicheId?: string | null
  /**
   * Lien avec « nouvel_achat=1 » (page d'un achat : Réessayer, nouvelle
   * demande) : la fenêtre ouverte par le lien montre le formulaire et ne
   * reprend aucun paiement en cours.
   */
  newPurchase?: boolean
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
  ownedByFiche,
  focusFicheId,
  newPurchase = false,
}: FicheGridProps) {
  const [selectedFiche, setSelectedFiche] = useState<PublicFiche | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  // Fiche ouverte par un lien « nouvel achat » ; un clic sur une carte l'efface.
  const [freshFicheId, setFreshFicheId] = useState<string | null>(null)

  // Fiche du lien : ouverte une seule fois (fermer la fenêtre ne la rouvre pas).
  const openedFor = useRef<string | null>(null)
  useEffect(() => {
    if (!focusFicheId || openedFor.current === focusFicheId) return
    const fiche = fiches.find((f) => f.id === focusFicheId)
    if (!fiche) return
    openedFor.current = focusFicheId
    setFreshFicheId(newPurchase ? focusFicheId : null)
    setSelectedFiche(fiche)
    setDialogOpen(true)
  }, [focusFicheId, fiches, newPurchase])

  const showAll = (
    <Button asChild variant="outline" size="sm">
      <Link href="/marketplace" scroll={false}>
        Voir tous les comptes d’exploitation
      </Link>
    </Button>
  )

  const cultureIconMap = useMemo(() => {
    const map = new Map<string, string | null>()
    cultures.forEach((c) => map.set(c.name, c.icon))
    return map
  }, [cultures])

  const handleAccess = (fiche: PublicFiche) => {
    setFreshFicheId(null)
    setSelectedFiche(fiche)
    setDialogOpen(true)
  }

  if (error) {
    return (
      <div className="flex items-start gap-3 p-4 bg-destructive/10 border border-destructive/20 rounded-lg">
        <AlertCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-medium text-destructive">
            Les comptes d’exploitation n’ont pas pu être chargés.
          </p>
          <p className="text-xs text-destructive/80 mt-0.5">
            Vérifiez votre connexion puis rechargez la page ({error}).
          </p>
        </div>
      </div>
    )
  }

  if (isLoading && fiches.length === 0) {
    return <LoadingBlock message="Chargement des fiches techniques…" className="py-16" />
  }

  if (!isLoading && fiches.length === 0 && focusFicheId) {
    return (
      <EmptyState
        icon={FileText}
        title="Ce compte d’exploitation n’est plus en vente"
        description="Il a été retiré de la boutique, ou le lien est incomplet. Les autres comptes restent disponibles."
        action={showAll}
      />
    )
  }

  if (!isLoading && fiches.length === 0) {
    return (
      <EmptyState
        icon={FileText}
        title="Aucun compte d’exploitation pour ces critères"
        description="Retirez un filtre (culture, région ou système) pour voir plus de comptes."
      />
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {focusFicheId ? (
          <p className="text-sm text-muted-foreground">Compte d’exploitation ouvert par un lien.</p>
        ) : (
          <p className="text-sm text-muted-foreground">
            <span className="font-semibold text-foreground">{total}</span>{' '}
            {total === 1 ? "compte d'exploitation" : "comptes d'exploitation"}
          </p>
        )}
        {focusFicheId ? showAll : null}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {fiches.map((fiche) => (
          <FicheCard
            key={fiche.id}
            fiche={fiche}
            cultureIcon={cultureIconMap.get(fiche.culture)}
            onAccess={handleAccess}
            owned={ownedByFiche?.has(fiche.id) ?? false}
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
        ownedPurchaseId={selectedFiche ? (ownedByFiche?.get(selectedFiche.id) ?? null) : null}
        startFresh={selectedFiche !== null && freshFicheId === selectedFiche.id}
      />
    </div>
  )
}
