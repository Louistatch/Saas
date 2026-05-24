'use client'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Search, X, SlidersHorizontal } from 'lucide-react'
import { useState } from 'react'
import type { MarketplaceFilters } from '@/hooks/use-marketplace-filters'

const TYPES_AGRICULTURE = [
  { value: 'conventionnel', label: 'Conventionnel' },
  { value: 'biologique', label: 'Biologique' },
  { value: 'agroforesterie', label: 'Agroforesterie' },
  { value: 'maraîchage', label: 'Maraîchage' },
  { value: 'élevage', label: 'Élevage' },
  { value: 'pisciculture', label: 'Pisciculture' },
  { value: 'autre', label: 'Autre' },
]

interface FicheFilterBarProps {
  filters: MarketplaceFilters
  localSearch: string
  setLocalSearch: (v: string) => void
  setFilter: <K extends keyof MarketplaceFilters>(
    key: K,
    value: MarketplaceFilters[K],
  ) => void
  resetFilters: () => void
  activeFilterCount: number
  referenceData: {
    regions: { id: string; name: string }[]
    prefectures: { id: string; name: string; region_id: string }[]
    cantons: { id: string; name: string; prefecture_id: string }[]
    cultures: { id: string; name: string; icon: string | null; category: string }[]
    cooperatives: { id: string; name: string }[]
  }
}

export function FicheFilterBar({
  filters,
  localSearch,
  setLocalSearch,
  setFilter,
  resetFilters,
  activeFilterCount,
  referenceData,
}: FicheFilterBarProps) {
  const [mobileOpen, setMobileOpen] = useState(false)

  return (
    <>
      {/* Mobile trigger */}
      <div className="lg:hidden flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-10"
            placeholder="Rechercher une fiche…"
            value={localSearch}
            onChange={(e) => setLocalSearch(e.target.value)}
          />
        </div>
        <Button
          variant="outline"
          size="icon"
          onClick={() => setMobileOpen((v) => !v)}
          aria-label="Filtres"
          className="relative shrink-0"
        >
          <SlidersHorizontal className="h-4 w-4" />
          {activeFilterCount > 0 ? (
            <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center">
              {activeFilterCount}
            </span>
          ) : null}
        </Button>
      </div>

      {/* Filters panel — always visible on desktop, toggle on mobile */}
      <div className={`${mobileOpen ? 'block' : 'hidden'} lg:block space-y-4`}>
        {/* Search (desktop only) */}
        <div className="hidden lg:block space-y-2">
          <Label htmlFor="search">Recherche</Label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              id="search"
              className="pl-10"
              placeholder="Titre, culture, description…"
              value={localSearch}
              onChange={(e) => setLocalSearch(e.target.value)}
            />
          </div>
        </div>

        {/* Culture */}
        <div className="space-y-2">
          <Label htmlFor="culture">Culture</Label>
          <select
            id="culture"
            className="w-full border border-border rounded-md p-2 bg-background text-foreground text-sm"
            value={filters.culture}
            onChange={(e) => setFilter('culture', e.target.value)}
          >
            <option value="">Toutes les cultures</option>
            {referenceData.cultures.map((c) => (
              <option key={c.id} value={c.name}>
                {c.icon ? `${c.icon} ` : ''}
                {c.name}
              </option>
            ))}
          </select>
        </div>

        {/* Type d'agriculture (mappé sur producer_type dans les filters) */}
        <div className="space-y-2">
          <Label htmlFor="type_agriculture">Type d'agriculture</Label>
          <select
            id="type_agriculture"
            className="w-full border border-border rounded-md p-2 bg-background text-foreground text-sm"
            value={filters.producer_type}
            onChange={(e) => setFilter('producer_type', e.target.value)}
          >
            <option value="">Tous les types</option>
            {TYPES_AGRICULTURE.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </div>

        {/* Région */}
        <div className="space-y-2">
          <Label htmlFor="region">Région</Label>
          <select
            id="region"
            className="w-full border border-border rounded-md p-2 bg-background text-foreground text-sm"
            value={filters.region_id}
            onChange={(e) => {
              setFilter('region_id', e.target.value)
              // Reset cascading filters
              if (filters.prefecture_id) setFilter('prefecture_id', '')
              if (filters.canton_id) setFilter('canton_id', '')
            }}
          >
            <option value="">Toutes les régions</option>
            {referenceData.regions.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </div>

        {/* Préfecture */}
        <div className="space-y-2">
          <Label htmlFor="prefecture">Préfecture</Label>
          <select
            id="prefecture"
            className="w-full border border-border rounded-md p-2 bg-background text-foreground text-sm"
            value={filters.prefecture_id}
            onChange={(e) => {
              setFilter('prefecture_id', e.target.value)
              if (filters.canton_id) setFilter('canton_id', '')
            }}
            disabled={referenceData.prefectures.length === 0}
          >
            <option value="">Toutes les préfectures</option>
            {referenceData.prefectures.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>

        {/* Canton */}
        <div className="space-y-2">
          <Label htmlFor="canton">Canton</Label>
          <select
            id="canton"
            className="w-full border border-border rounded-md p-2 bg-background text-foreground text-sm"
            value={filters.canton_id}
            onChange={(e) => setFilter('canton_id', e.target.value)}
            disabled={!filters.prefecture_id || referenceData.cantons.length === 0}
          >
            <option value="">Tous les cantons</option>
            {referenceData.cantons.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        {/* Coopérative */}
        <div className="space-y-2">
          <Label htmlFor="cooperative">Coopérative</Label>
          <select
            id="cooperative"
            className="w-full border border-border rounded-md p-2 bg-background text-foreground text-sm"
            value={filters.cooperative_id}
            onChange={(e) => setFilter('cooperative_id', e.target.value)}
          >
            <option value="">Toutes les coopératives</option>
            {referenceData.cooperatives.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        {/* Reset */}
        {activeFilterCount > 0 ? (
          <Button
            variant="outline"
            className="w-full gap-2"
            onClick={resetFilters}
          >
            <X className="h-4 w-4" />
            Effacer les filtres ({activeFilterCount})
          </Button>
        ) : null}
      </div>
    </>
  )
}
