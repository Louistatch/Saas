'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useMemo } from 'react'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { RotateCcw } from 'lucide-react'

interface FournisseursFiltersProps {
  cultures: string[]
  regions: { id: string; name: string }[]
  prefectures: { id: string; name: string; region_id: string }[]
  currentCulture: string
  currentRegionId: string
  currentPrefectureId: string
}

export function FournisseursFilters({
  cultures,
  regions,
  prefectures,
  currentCulture,
  currentRegionId,
  currentPrefectureId,
}: FournisseursFiltersProps) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const filteredPrefectures = useMemo(() => {
    if (!currentRegionId) return prefectures
    return prefectures.filter(p => p.region_id === currentRegionId)
  }, [prefectures, currentRegionId])

  const updateFilter = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString())
    if (value) {
      params.set(key, value)
    } else {
      params.delete(key)
    }
    // Reset page when filters change
    params.delete('page')
    // Reset prefecture when region changes
    if (key === 'region_id') {
      params.delete('prefecture_id')
    }
    router.push(`/fournisseurs?${params.toString()}`)
  }

  const resetFilters = () => {
    router.push('/fournisseurs')
  }

  const hasFilters = currentCulture || currentRegionId || currentPrefectureId

  return (
    <div className="space-y-5 p-4 rounded-xl border border-border bg-card/50">
      <h3 className="font-semibold text-foreground text-sm">Filtres</h3>

      {/* Culture */}
      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground uppercase tracking-wide">Culture</Label>
        <select
          className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background text-foreground"
          value={currentCulture}
          onChange={(e) => updateFilter('culture', e.target.value)}
        >
          <option value="">Toutes les cultures</option>
          {cultures.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </div>

      {/* Region */}
      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground uppercase tracking-wide">Région</Label>
        <select
          className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background text-foreground"
          value={currentRegionId}
          onChange={(e) => updateFilter('region_id', e.target.value)}
        >
          <option value="">Toutes les régions</option>
          {regions.map((r) => (
            <option key={r.id} value={r.id}>{r.name}</option>
          ))}
        </select>
      </div>

      {/* Prefecture (cascaded from region) */}
      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground uppercase tracking-wide">Préfecture</Label>
        <select
          className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background text-foreground"
          value={currentPrefectureId}
          onChange={(e) => updateFilter('prefecture_id', e.target.value)}
          disabled={filteredPrefectures.length === 0}
        >
          <option value="">Toutes les préfectures</option>
          {filteredPrefectures.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
      </div>

      {/* Reset */}
      {hasFilters && (
        <Button variant="outline" size="sm" className="w-full gap-2 border-border" onClick={resetFilters}>
          <RotateCcw className="h-3.5 w-3.5" />
          Réinitialiser
        </Button>
      )}
    </div>
  )
}
