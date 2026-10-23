'use client'

/**
 * Région → préfecture → canton, en trois listes natives : sur un Android d'entrée de gamme,
 * le sélecteur du système est plus rapide et plus lisible qu'une liste déroulante dessinée.
 * Choisir un niveau vide les niveaux en dessous (useCascadingLocations).
 */
import { useCascadingLocations } from '@/hooks/use-cascading-locations'
import { useEffect, useRef } from 'react'

export interface ZoneValue {
  regionId: string
  prefectureId: string
  cantonId: string
}

export const EMPTY_ZONE: ZoneValue = { regionId: '', prefectureId: '', cantonId: '' }

const SELECT =
  'h-11 w-full min-w-0 rounded-lg border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50'

export function ZoneSelect({
  value,
  onChange,
  idPrefix = 'zone',
  labels = 'visible',
}: {
  value: ZoneValue
  onChange: (zone: ZoneValue) => void
  idPrefix?: string
  /** 'visible' sous chaque liste (formulaire) ; 'hidden' pour une barre de filtres. */
  labels?: 'visible' | 'hidden'
}) {
  const { selection, setSelection, setLevel, options, loadingLevel } = useCascadingLocations({
    initialSelection: {
      region_id: value.regionId,
      prefecture_id: value.prefectureId,
      canton_id: value.cantonId,
    },
  })

  // Une zone imposée de l'extérieur (profil chargé, lien partagé) remplace la sélection.
  const external = `${value.regionId}|${value.prefectureId}|${value.cantonId}`
  const last = useRef(external)
  useEffect(() => {
    if (external === last.current) return
    last.current = external
    setSelection({
      region_id: value.regionId,
      prefecture_id: value.prefectureId,
      canton_id: value.cantonId,
    })
  }, [external, value.regionId, value.prefectureId, value.cantonId, setSelection])

  const pick = (level: 'region_id' | 'prefecture_id' | 'canton_id', id: string) => {
    setLevel(level, id)
    const next: ZoneValue =
      level === 'region_id'
        ? { regionId: id, prefectureId: '', cantonId: '' }
        : level === 'prefecture_id'
          ? { regionId: selection.region_id, prefectureId: id, cantonId: '' }
          : { regionId: selection.region_id, prefectureId: selection.prefecture_id, cantonId: id }
    last.current = `${next.regionId}|${next.prefectureId}|${next.cantonId}`
    onChange(next)
  }

  const label =
    labels === 'visible' ? 'mb-1 block text-xs font-medium text-muted-foreground' : 'sr-only'

  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
      <div className="min-w-0">
        <label htmlFor={`${idPrefix}-region`} className={label}>
          Région
        </label>
        <select
          id={`${idPrefix}-region`}
          className={SELECT}
          value={selection.region_id}
          onChange={(e) => pick('region_id', e.target.value)}
        >
          <option value="">Tout le Togo</option>
          {options.region_id.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>
      </div>
      <div className="min-w-0">
        <label htmlFor={`${idPrefix}-prefecture`} className={label}>
          Préfecture
        </label>
        <select
          id={`${idPrefix}-prefecture`}
          className={SELECT}
          value={selection.prefecture_id}
          disabled={!selection.region_id || loadingLevel === 'prefecture_id'}
          onChange={(e) => pick('prefecture_id', e.target.value)}
        >
          <option value="">{selection.region_id ? 'Toute la région' : 'Préfecture'}</option>
          {options.prefecture_id.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>
      </div>
      <div className="min-w-0">
        <label htmlFor={`${idPrefix}-canton`} className={label}>
          Canton
        </label>
        <select
          id={`${idPrefix}-canton`}
          className={SELECT}
          value={selection.canton_id}
          disabled={!selection.prefecture_id || loadingLevel === 'canton_id'}
          onChange={(e) => pick('canton_id', e.target.value)}
        >
          <option value="">{selection.prefecture_id ? 'Toute la préfecture' : 'Canton'}</option>
          {options.canton_id.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>
      </div>
    </div>
  )
}
