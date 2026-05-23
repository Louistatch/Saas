'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { Slider } from '@/components/ui/slider'
import { Search, SlidersHorizontal, X, RotateCcw } from 'lucide-react'
import type { MarketplaceFilters } from '@/hooks/use-marketplace-filters'

interface FilterBarProps {
  filters: MarketplaceFilters
  localSearch: string
  setLocalSearch: (v: string) => void
  setFilter: <K extends keyof MarketplaceFilters>(key: K, value: MarketplaceFilters[K]) => void
  resetFilters: () => void
  activeFilterCount: number
  referenceData: {
    regions: { id: string; name: string }[]
    prefectures: { id: string; name: string }[]
    cantons: { id: string; name: string }[]
    cultures: { id: string; name: string; icon: string | null }[]
    cooperatives: { id: string; name: string }[]
  }
}

const CATEGORIES = [
  { value: 'produit', label: 'Produits', icon: '🌾' },
  { value: 'service', label: 'Services', icon: '🔧' },
  { value: 'intrant', label: 'Intrants', icon: '🧪' },
  { value: 'equipement', label: 'Équipements', icon: '🚜' },
  { value: 'semence', label: 'Semences', icon: '🌱' },
  { value: 'transformation', label: 'Transformation', icon: '🏭' },
]

const SEASONS = [
  { value: 'saison_seche', label: 'Saison sèche' },
  { value: 'saison_pluies', label: 'Saison des pluies' },
  { value: 'toute_annee', label: 'Toute l\'année' },
  { value: 'contre_saison', label: 'Contre-saison' },
]

const CERTIFICATIONS = [
  { value: 'bio', label: 'Biologique' },
  { value: 'fair_trade', label: 'Commerce équitable' },
  { value: 'global_gap', label: 'GlobalGAP' },
  { value: 'local', label: 'Label local' },
]

const PRODUCER_TYPES = [
  { value: 'cooperative', label: 'Coopérative' },
  { value: 'individuel', label: 'Individuel' },
  { value: 'groupement', label: 'Groupement' },
  { value: 'union', label: 'Union' },
]

function FilterSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: string
  options: { value: string; label: string; icon?: string | null }[]
  onChange: (v: string) => void
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</label>
      <select
        className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background text-foreground focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">Tous</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.icon ? `${o.icon} ` : ''}{o.label}
          </option>
        ))}
      </select>
    </div>
  )
}

export function MarketplaceFilterBar({
  filters,
  localSearch,
  setLocalSearch,
  setFilter,
  resetFilters,
  activeFilterCount,
  referenceData,
}: FilterBarProps) {
  const [sheetOpen, setSheetOpen] = useState(false)

  const FilterPanel = () => (
    <div className="space-y-5">
      {/* Category chips */}
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Catégorie</label>
        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map((cat) => (
            <button
              key={cat.value}
              onClick={() => setFilter('category', filters.category === cat.value ? '' : cat.value)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-all ${
                filters.category === cat.value
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'bg-secondary/50 text-foreground hover:bg-secondary'
              }`}
            >
              <span>{cat.icon}</span>
              <span>{cat.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Geographic cascade */}
      <FilterSelect
        label="Région"
        value={filters.region_id}
        options={referenceData.regions.map(r => ({ value: r.id, label: r.name }))}
        onChange={(v) => setFilter('region_id', v)}
      />

      <FilterSelect
        label="Préfecture"
        value={filters.prefecture_id}
        options={referenceData.prefectures.map(p => ({ value: p.id, label: p.name }))}
        onChange={(v) => setFilter('prefecture_id', v)}
      />

      <FilterSelect
        label="Canton"
        value={filters.canton_id}
        options={referenceData.cantons.map(c => ({ value: c.id, label: c.name }))}
        onChange={(v) => setFilter('canton_id', v)}
      />

      {/* Culture */}
      <FilterSelect
        label="Culture"
        value={filters.culture}
        options={referenceData.cultures.map(c => ({ value: c.name, label: c.name, icon: c.icon }))}
        onChange={(v) => setFilter('culture', v)}
      />

      {/* Cooperative */}
      <FilterSelect
        label="Coopérative"
        value={filters.cooperative_id}
        options={referenceData.cooperatives.map(c => ({ value: c.id, label: c.name }))}
        onChange={(v) => setFilter('cooperative_id', v)}
      />

      {/* Price range */}
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Prix (FCFA)</label>
        <div className="flex gap-2 items-center">
          <Input
            type="number"
            placeholder="Min"
            value={filters.min_price}
            onChange={(e) => setFilter('min_price', e.target.value)}
            className="text-sm"
          />
          <span className="text-muted-foreground">—</span>
          <Input
            type="number"
            placeholder="Max"
            value={filters.max_price}
            onChange={(e) => setFilter('max_price', e.target.value)}
            className="text-sm"
          />
        </div>
      </div>

      {/* Season */}
      <FilterSelect
        label="Saison"
        value={filters.season}
        options={SEASONS}
        onChange={(v) => setFilter('season', v)}
      />

      {/* Certification */}
      <FilterSelect
        label="Certification"
        value={filters.certification}
        options={CERTIFICATIONS}
        onChange={(v) => setFilter('certification', v)}
      />

      {/* Producer type */}
      <FilterSelect
        label="Type de producteur"
        value={filters.producer_type}
        options={PRODUCER_TYPES}
        onChange={(v) => setFilter('producer_type', v)}
      />

      {/* Reset */}
      {activeFilterCount > 0 && (
        <Button
          variant="outline"
          className="w-full gap-2 border-border"
          onClick={() => {
            resetFilters()
            setSheetOpen(false)
          }}
        >
          <RotateCcw className="h-4 w-4" />
          Réinitialiser ({activeFilterCount})
        </Button>
      )}
    </div>
  )

  return (
    <div className="space-y-3">
      {/* Search + filter toggle */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-10 h-11 rounded-xl border-border bg-background"
            placeholder="Rechercher produits, cultures, coopératives…"
            value={localSearch}
            onChange={(e) => setLocalSearch(e.target.value)}
          />
          {localSearch && (
            <button
              onClick={() => setLocalSearch('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Mobile: sheet trigger */}
        <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
          <SheetTrigger asChild>
            <Button variant="outline" className="h-11 gap-2 border-border lg:hidden relative">
              <SlidersHorizontal className="h-4 w-4" />
              <span className="hidden sm:inline">Filtres</span>
              {activeFilterCount > 0 && (
                <Badge className="absolute -top-1.5 -right-1.5 h-5 w-5 p-0 flex items-center justify-center text-[10px] bg-primary">
                  {activeFilterCount}
                </Badge>
              )}
            </Button>
          </SheetTrigger>
          <SheetContent side="right" className="w-[320px] overflow-y-auto">
            <SheetHeader>
              <SheetTitle>Filtres</SheetTitle>
            </SheetHeader>
            <div className="mt-6">
              <FilterPanel />
            </div>
          </SheetContent>
        </Sheet>
      </div>

      {/* Active filter badges */}
      {activeFilterCount > 0 && (
        <div className="flex flex-wrap gap-2 items-center">
          {filters.category && (
            <Badge variant="secondary" className="gap-1 cursor-pointer" onClick={() => setFilter('category', '')}>
              {CATEGORIES.find(c => c.value === filters.category)?.label}
              <X className="h-3 w-3" />
            </Badge>
          )}
          {filters.culture && (
            <Badge variant="secondary" className="gap-1 cursor-pointer" onClick={() => setFilter('culture', '')}>
              {filters.culture}
              <X className="h-3 w-3" />
            </Badge>
          )}
          {filters.region_id && (
            <Badge variant="secondary" className="gap-1 cursor-pointer" onClick={() => setFilter('region_id', '')}>
              {referenceData.regions.find(r => r.id === filters.region_id)?.name}
              <X className="h-3 w-3" />
            </Badge>
          )}
          {filters.season && (
            <Badge variant="secondary" className="gap-1 cursor-pointer" onClick={() => setFilter('season', '')}>
              {SEASONS.find(s => s.value === filters.season)?.label}
              <X className="h-3 w-3" />
            </Badge>
          )}
          <button
            onClick={resetFilters}
            className="text-xs text-muted-foreground hover:text-foreground underline"
          >
            Tout effacer
          </button>
        </div>
      )}

      {/* Desktop: inline filters */}
      <div className="hidden lg:block">
        <FilterPanel />
      </div>
    </div>
  )
}
