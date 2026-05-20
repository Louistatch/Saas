'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { Label } from '@/components/ui/label'
import { createClient } from '@/lib/supabase/client'
import { Spinner } from '@/components/shared/loading'

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

interface Option {
  id: string
  name: string
}

/**
 * Cascading location picker for Togo administrative subdivisions.
 * Région → Préfecture → Commune → Canton → Village
 * Auto-loads options from Supabase as the user selects each level.
 */
export function LocationPicker({ value, onChange, disabled, compact }: LocationPickerProps) {
  const supabase = useMemo(() => createClient(), [])

  const [regions, setRegions] = useState<Option[]>([])
  const [prefectures, setPrefectures] = useState<Option[]>([])
  const [communes, setCommunes] = useState<Option[]>([])
  const [cantons, setCantons] = useState<Option[]>([])
  const [villages, setVillages] = useState<Option[]>([])
  const [loading, setLoading] = useState<string | null>(null)

  // Load regions on mount
  useEffect(() => {
    supabase
      .from('regions')
      .select('id, name')
      .order('name')
      .then(({ data }) => setRegions(data ?? []))
  }, [supabase])

  // Load prefectures when region changes
  useEffect(() => {
    if (!value.region_id) {
      setPrefectures([])
      return
    }
    setLoading('prefecture')
    supabase
      .from('prefectures')
      .select('id, name')
      .eq('region_id', value.region_id)
      .order('name')
      .then(({ data }) => {
        setPrefectures(data ?? [])
        setLoading(null)
      })
  }, [value.region_id, supabase])

  // Load communes when prefecture changes
  useEffect(() => {
    if (!value.prefecture_id) {
      setCommunes([])
      return
    }
    setLoading('commune')
    supabase
      .from('communes')
      .select('id, name')
      .eq('prefecture_id', value.prefecture_id)
      .order('name')
      .then(({ data }) => {
        setCommunes(data ?? [])
        setLoading(null)
      })
  }, [value.prefecture_id, supabase])

  // Load cantons when prefecture changes (cantons link to prefectures in Togo)
  useEffect(() => {
    if (!value.prefecture_id) {
      setCantons([])
      return
    }
    setLoading('canton')
    supabase
      .from('cantons')
      .select('id, name')
      .eq('prefecture_id', value.prefecture_id)
      .order('name')
      .then(({ data }) => {
        setCantons(data ?? [])
        setLoading(null)
      })
  }, [value.prefecture_id, supabase])

  // Load villages when canton changes
  useEffect(() => {
    if (!value.canton_id) {
      setVillages([])
      return
    }
    setLoading('village')
    supabase
      .from('villages')
      .select('id, name')
      .eq('canton_id', value.canton_id)
      .order('name')
      .then(({ data }) => {
        setVillages(data ?? [])
        setLoading(null)
      })
  }, [value.canton_id, supabase])

  const handleChange = useCallback(
    (level: keyof LocationValue, id: string, name: string) => {
      const updated = { ...value }

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
    },
    [value, onChange],
  )

  const selectClass =
    'w-full border border-border rounded-md p-2 bg-background text-foreground text-sm disabled:opacity-50'

  const grid = compact ? 'grid grid-cols-2 gap-3' : 'space-y-3'

  return (
    <div className={grid}>
      {/* Région */}
      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">Région</Label>
        <select
          className={selectClass}
          value={value.region_id ?? ''}
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
          Préfecture {loading === 'prefecture' && <Spinner className="inline h-3 w-3" />}
        </Label>
        <select
          className={selectClass}
          value={value.prefecture_id ?? ''}
          onChange={(e) => {
            const opt = prefectures.find((r) => r.id === e.target.value)
            handleChange('prefecture_id', e.target.value, opt?.name ?? '')
          }}
          disabled={disabled || !value.region_id || prefectures.length === 0}
        >
          <option value="">— Sélectionner —</option>
          {prefectures.map((r) => (
            <option key={r.id} value={r.id}>{r.name}</option>
          ))}
        </select>
      </div>

      {/* Commune */}
      {communes.length > 0 || value.commune_id ? (
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">
            Commune {loading === 'commune' && <Spinner className="inline h-3 w-3" />}
          </Label>
          <select
            className={selectClass}
            value={value.commune_id ?? ''}
            onChange={(e) => handleChange('commune_id', e.target.value, '')}
            disabled={disabled || !value.prefecture_id}
          >
            <option value="">— Sélectionner —</option>
            {communes.map((r) => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </select>
        </div>
      ) : null}

      {/* Canton */}
      {cantons.length > 0 || value.canton_id ? (
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">
            Canton {loading === 'canton' && <Spinner className="inline h-3 w-3" />}
          </Label>
          <select
            className={selectClass}
            value={value.canton_id ?? ''}
            onChange={(e) => {
              const opt = cantons.find((r) => r.id === e.target.value)
              handleChange('canton_id', e.target.value, opt?.name ?? '')
            }}
            disabled={disabled || !value.commune_id}
          >
            <option value="">— Sélectionner —</option>
            {cantons.map((r) => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </select>
        </div>
      ) : null}

      {/* Village */}
      {villages.length > 0 || value.village_id ? (
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">
            Village {loading === 'village' && <Spinner className="inline h-3 w-3" />}
          </Label>
          <select
            className={selectClass}
            value={value.village_id ?? ''}
            onChange={(e) => {
              const opt = villages.find((r) => r.id === e.target.value)
              handleChange('village_id', e.target.value, opt?.name ?? '')
            }}
            disabled={disabled || !value.canton_id}
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
