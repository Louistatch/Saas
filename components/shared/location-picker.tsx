'use client'

import { useEffect, useRef } from 'react'
import { Label } from '@/components/ui/label'
import { Spinner } from '@/components/shared/loading'
import {
  useCascadingLocations,
  type CascadingLocationLevel,
} from '@/hooks/use-cascading-locations'

interface LocationValue {
  region_id?: string
  prefecture_id?: string
  commune_id?: string
  canton_id?: string
  village_id?: string
  // Display names for the card
  region?: string
  prefecture?: string
  village?: string
  canton?: string
}

interface LocationPickerProps {
  value: LocationValue
  onChange: (value: LocationValue) => void
  disabled?: boolean
  /** Compact mode: show on 2 rows instead of 5 */
  compact?: boolean
}

const LEVELS: CascadingLocationLevel[] = [
  'region_id',
  'prefecture_id',
  'commune_id',
  'canton_id',
  'village_id',
]

const LOADING_LABEL: Partial<Record<CascadingLocationLevel, string>> = {
  prefecture_id: 'prefecture',
  commune_id: 'commune',
  canton_id: 'canton',
  village_id: 'village',
}

/**
 * Cascading location picker for Togo administrative subdivisions.
 * Région → Préfecture → Commune → Canton → Village
 * Auto-loads options from Supabase as the user selects each level.
 */
export function LocationPicker({ value, onChange, disabled, compact }: LocationPickerProps) {
  const { selection, setSelection, setLevel, options, loadingLevel } = useCascadingLocations({
    levels: LEVELS,
    initialSelection: {
      region_id: value.region_id ?? '',
      prefecture_id: value.prefecture_id ?? '',
      commune_id: value.commune_id ?? '',
      canton_id: value.canton_id ?? '',
      village_id: value.village_id ?? '',
    },
  })

  // Keep the hook's selection in sync when the controlled `value` changes
  // from the outside (e.g. loading an existing record).
  const lastExternalIds = useRef('')
  useEffect(() => {
    const ids = [value.region_id, value.prefecture_id, value.commune_id, value.canton_id, value.village_id]
      .map((v) => v ?? '')
      .join('|')
    if (ids === lastExternalIds.current) return
    lastExternalIds.current = ids
    setSelection({
      region_id: value.region_id ?? '',
      prefecture_id: value.prefecture_id ?? '',
      commune_id: value.commune_id ?? '',
      canton_id: value.canton_id ?? '',
      village_id: value.village_id ?? '',
    })
  }, [value.region_id, value.prefecture_id, value.commune_id, value.canton_id, value.village_id, setSelection])

  const handleChange = (level: CascadingLocationLevel, id: string, name: string) => {
    setLevel(level, id)

    const updated: LocationValue = { ...value }
    switch (level) {
      case 'region_id':
        updated.region_id = id || undefined
        updated.region = name || undefined
        updated.prefecture_id = undefined
        updated.prefecture = undefined
        updated.commune_id = undefined
        updated.canton_id = undefined
        updated.canton = undefined
        updated.village_id = undefined
        updated.village = undefined
        break
      case 'prefecture_id':
        updated.prefecture_id = id || undefined
        updated.prefecture = name || undefined
        updated.commune_id = undefined
        updated.canton_id = undefined
        updated.canton = undefined
        updated.village_id = undefined
        updated.village = undefined
        break
      case 'commune_id':
        updated.commune_id = id || undefined
        updated.canton_id = undefined
        updated.canton = undefined
        updated.village_id = undefined
        updated.village = undefined
        break
      case 'canton_id':
        updated.canton_id = id || undefined
        updated.canton = name || undefined
        updated.village_id = undefined
        updated.village = undefined
        break
      case 'village_id':
        updated.village_id = id || undefined
        updated.village = name || undefined
        break
    }

    onChange(updated)
  }

  const selectClass =
    'w-full border border-border rounded-md p-2 bg-background text-foreground text-sm disabled:opacity-50'

  const grid = compact ? 'grid grid-cols-2 gap-3' : 'space-y-3'

  const regions = options.region_id
  const prefectures = options.prefecture_id
  const communes = options.commune_id
  const cantons = options.canton_id
  const villages = options.village_id

  return (
    <div className={grid}>
      {/* Région */}
      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">Région</Label>
        <select
          className={selectClass}
          value={selection.region_id}
          onChange={(e) => {
            const opt = regions.find((r) => r.id === e.target.value)
            handleChange('region_id', e.target.value, opt?.name ?? '')
          }}
          disabled={disabled}
        >
          <option value="">— Sélectionner —</option>
          {regions.map((r) => (
            <option key={r.id} value={r.id}>{r.name}</option>
          ))}
        </select>
      </div>

      {/* Préfecture */}
      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">
          Préfecture {loadingLevel === 'prefecture_id' && <Spinner className="inline h-3 w-3" />}
        </Label>
        <select
          className={selectClass}
          value={selection.prefecture_id}
          onChange={(e) => {
            const opt = prefectures.find((r) => r.id === e.target.value)
            handleChange('prefecture_id', e.target.value, opt?.name ?? '')
          }}
          disabled={disabled || !selection.region_id || prefectures.length === 0}
        >
          <option value="">— Sélectionner —</option>
          {prefectures.map((r) => (
            <option key={r.id} value={r.id}>{r.name}</option>
          ))}
        </select>
      </div>

      {/* Commune */}
      {communes.length > 0 || selection.commune_id ? (
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">
            Commune {loadingLevel === 'commune_id' && <Spinner className="inline h-3 w-3" />}
          </Label>
          <select
            className={selectClass}
            value={selection.commune_id}
            onChange={(e) => handleChange('commune_id', e.target.value, '')}
            disabled={disabled || !selection.prefecture_id}
          >
            <option value="">— Sélectionner —</option>
            {communes.map((r) => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </select>
        </div>
      ) : null}

      {/* Canton */}
      {cantons.length > 0 || selection.canton_id ? (
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">
            Canton {loadingLevel === 'canton_id' && <Spinner className="inline h-3 w-3" />}
          </Label>
          <select
            className={selectClass}
            value={selection.canton_id}
            onChange={(e) => {
              const opt = cantons.find((r) => r.id === e.target.value)
              handleChange('canton_id', e.target.value, opt?.name ?? '')
            }}
            disabled={disabled || !selection.commune_id}
          >
            <option value="">— Sélectionner —</option>
            {cantons.map((r) => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </select>
        </div>
      ) : null}

      {/* Village */}
      {villages.length > 0 || selection.village_id ? (
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">
            Village {loadingLevel === 'village_id' && <Spinner className="inline h-3 w-3" />}
          </Label>
          <select
            className={selectClass}
            value={selection.village_id}
            onChange={(e) => {
              const opt = villages.find((r) => r.id === e.target.value)
              handleChange('village_id', e.target.value, opt?.name ?? '')
            }}
            disabled={disabled || !selection.canton_id}
          >
            <option value="">— Sélectionner —</option>
            {villages.map((r) => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </select>
        </div>
      ) : null}
    </div>
  )
}
