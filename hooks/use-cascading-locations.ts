'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export interface LocationOption {
  id: string
  name: string
}

export interface CascadingLocationSelection {
  region_id: string
  prefecture_id: string
  commune_id: string
  canton_id: string
  village_id: string
}

const EMPTY_SELECTION: CascadingLocationSelection = {
  region_id: '',
  prefecture_id: '',
  commune_id: '',
  canton_id: '',
  village_id: '',
}

export type CascadingLocationLevel = keyof CascadingLocationSelection

/**
 * Order of cascade levels — each level resets all levels to its right when it
 * changes, and (when `mode` allows) loads the options for the level to its right.
 */
const LEVEL_ORDER: CascadingLocationLevel[] = [
  'region_id',
  'prefecture_id',
  'commune_id',
  'canton_id',
  'village_id',
]

const TABLE_BY_LEVEL: Record<CascadingLocationLevel, string> = {
  region_id: 'regions',
  prefecture_id: 'prefectures',
  commune_id: 'communes',
  canton_id: 'cantons',
  village_id: 'villages',
}

const PARENT_COLUMN_BY_LEVEL: Partial<Record<CascadingLocationLevel, string>> = {
  prefecture_id: 'region_id',
  commune_id: 'prefecture_id',
  canton_id: 'prefecture_id', // Au Togo, les cantons sont rattachés directement aux préfectures
  village_id: 'canton_id',
}

export interface UseCascadingLocationsOptions {
  /** Levels to enable, in cascade order. Default: region → prefecture → canton. */
  levels?: CascadingLocationLevel[]
  /**
   * Initial selection (e.g. when editing an existing record). Only the keys
   * present in `levels` are used.
   */
  initialSelection?: Partial<CascadingLocationSelection>
  /**
   * 'query' (default): each level's options are fetched from Supabase, scoped
   * to the parent selection (`.eq(parentColumn, parentId)`), exactly like
   * `LocationPicker`.
   *
   * 'prefetch-filter': all options for every level are fetched once up-front
   * and child levels are derived by client-side filtering against the parent
   * selection (used by the marketplace "create fiche" form, which preloads
   * `regions` + `prefectures` together and only queries `cantons` lazily).
   */
  mode?: 'query' | 'prefetch-filter'
  /**
   * Only used in 'prefetch-filter' mode: levels whose options should be
   * fetched once up-front (and filtered client-side) rather than re-queried
   * on every parent change. Defaults to the first two levels.
   */
  prefetchLevels?: CascadingLocationLevel[]
}

export interface UseCascadingLocationsResult {
  selection: CascadingLocationSelection
  /** Replace the whole selection at once (e.g. when loading an existing record). */
  setSelection: (selection: Partial<CascadingLocationSelection>) => void
  /**
   * Update a single level. Automatically resets every level below it in the
   * cascade (region → prefecture → commune → canton → village).
   */
  setLevel: (level: CascadingLocationLevel, id: string) => void
  /** Options available for each level, already scoped to the parent selection. */
  options: Record<CascadingLocationLevel, LocationOption[]>
  /** Which level is currently being loaded from Supabase (or null). */
  loadingLevel: CascadingLocationLevel | null
  /** Active levels, in cascade order (mirrors the `levels` option). */
  levels: CascadingLocationLevel[]
}

/**
 * Encapsulates the région → préfecture → commune → canton → village cascade:
 * - holds the selection state for each enabled level
 * - loads the options for each level from Supabase as parent levels change
 * - resets child levels whenever a parent level changes
 *
 * This consolidates logic that used to be duplicated between `LocationPicker`
 * and the marketplace "create fiche" location form.
 */
export function useCascadingLocations(
  opts: UseCascadingLocationsOptions = {},
): UseCascadingLocationsResult {
  const supabase = useMemo(() => createClient(), [])

  const levels = useMemo(
    () => opts.levels ?? (['region_id', 'prefecture_id', 'canton_id'] as CascadingLocationLevel[]),
    [opts.levels],
  )
  const mode = opts.mode ?? 'query'
  const prefetchLevels = useMemo(
    () => opts.prefetchLevels ?? levels.slice(0, 2),
    [opts.prefetchLevels, levels],
  )

  const [selection, setSelectionState] = useState<CascadingLocationSelection>(() => ({
    ...EMPTY_SELECTION,
    ...opts.initialSelection,
  }))

  const [optionsByLevel, setOptionsByLevel] = useState<Record<CascadingLocationLevel, LocationOption[]>>(
    () => ({
      region_id: [],
      prefecture_id: [],
      commune_id: [],
      canton_id: [],
      village_id: [],
    }),
  )
  const [prefetched, setPrefetched] = useState<Record<string, LocationOption[]>>({})
  const [loadingLevel, setLoadingLevel] = useState<CascadingLocationLevel | null>(null)

  const isEnabled = useCallback((level: CascadingLocationLevel) => levels.includes(level), [levels])

  // Reset every level after `level` (exclusive) in the cascade order.
  const resetChildrenOf = useCallback(
    (level: CascadingLocationLevel, base: CascadingLocationSelection): CascadingLocationSelection => {
      const idx = LEVEL_ORDER.indexOf(level)
      const next = { ...base }
      for (let i = idx + 1; i < LEVEL_ORDER.length; i++) {
        next[LEVEL_ORDER[i]] = ''
      }
      return next
    },
    [],
  )

  const setSelection = useCallback((partial: Partial<CascadingLocationSelection>) => {
    setSelectionState((prev) => ({ ...prev, ...partial }))
  }, [])

  const setLevel = useCallback(
    (level: CascadingLocationLevel, id: string) => {
      setSelectionState((prev) => resetChildrenOf(level, { ...prev, [level]: id }))
    },
    [resetChildrenOf],
  )

  // --- 'query' mode: load each level's options from Supabase whenever its
  // parent selection changes, scoped via `.eq(parentColumn, parentId)`. ---
  useEffect(() => {
    if (mode !== 'query') return

    let cancelled = false

    levels.forEach((level) => {
      const table = TABLE_BY_LEVEL[level]
      const parentColumn = PARENT_COLUMN_BY_LEVEL[level]

      if (!parentColumn) {
        // Top-level: load once.
        if (optionsByLevel[level].length > 0) return
        supabase
          .from(table)
          .select('id, name')
          .order('name')
          .then(({ data }) => {
            if (cancelled) return
            setOptionsByLevel((prev) => ({ ...prev, [level]: data ?? [] }))
          })
        return
      }

      // The parent level is whichever cascade level holds the id referenced
      // by `parentColumn` (e.g. cantons reference `prefecture_id`, not the
      // immediately-preceding `commune_id` level — Togo cantons attach
      // directly to préfectures).
      const parentLevel = parentColumn as CascadingLocationLevel
      const parentId = selection[parentLevel]

      if (!parentId) {
        setOptionsByLevel((prev) => (prev[level].length === 0 ? prev : { ...prev, [level]: [] }))
        return
      }

      setLoadingLevel(level)
      supabase
        .from(table)
        .select('id, name')
        .eq(parentColumn, parentId)
        .order('name')
        .then(({ data }) => {
          if (cancelled) return
          setOptionsByLevel((prev) => ({ ...prev, [level]: data ?? [] }))
          setLoadingLevel((curr) => (curr === level ? null : curr))
        })
    })

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    mode,
    supabase,
    levels,
    selection.region_id,
    selection.prefecture_id,
    selection.commune_id,
    selection.canton_id,
  ])

  // --- 'prefetch-filter' mode: load `prefetchLevels` once up-front, derive
  // their options + the first prefetched level's children by client-side
  // filtering, and lazily query the remaining levels from Supabase. ---
  useEffect(() => {
    if (mode !== 'prefetch-filter') return
    let cancelled = false

    prefetchLevels.forEach((level) => {
      const table = TABLE_BY_LEVEL[level]
      supabase
        .from(table)
        .select('id, name, ' + (PARENT_COLUMN_BY_LEVEL[level] ?? 'id'))
        .order('name')
        .then(({ data }) => {
          if (cancelled) return
          setPrefetched((prev) => ({ ...prev, [level]: (data ?? []) as unknown as LocationOption[] }))
        })
    })

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, supabase, prefetchLevels])

  useEffect(() => {
    if (mode !== 'prefetch-filter') return

    levels.forEach((level) => {
      const parentColumn = PARENT_COLUMN_BY_LEVEL[level]
      const isPrefetched = prefetchLevels.includes(level)

      if (!parentColumn) {
        const all = (prefetched[level] ?? []) as LocationOption[]
        setOptionsByLevel((prev) => (prev[level] === all ? prev : { ...prev, [level]: all }))
        return
      }

      const parentLevel = parentColumn as CascadingLocationLevel
      const parentId = selection[parentLevel]
      const all = (prefetched[level] ?? []) as (LocationOption & Record<string, string>)[]

      if (isPrefetched) {
        const filtered = parentId ? all.filter((o) => o[parentColumn] === parentId) : all
        setOptionsByLevel((prev) => ({ ...prev, [level]: filtered }))
        return
      }

      if (!parentId) {
        setOptionsByLevel((prev) => (prev[level].length === 0 ? prev : { ...prev, [level]: [] }))
        return
      }

      setLoadingLevel(level)
      supabase
        .from(TABLE_BY_LEVEL[level])
        .select('id, name')
        .eq(parentColumn, parentId)
        .order('name')
        .then(({ data }) => {
          setOptionsByLevel((prev) => ({ ...prev, [level]: data ?? [] }))
          setLoadingLevel((curr) => (curr === level ? null : curr))
        })
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    mode,
    supabase,
    levels,
    prefetchLevels,
    prefetched,
    selection.region_id,
    selection.prefecture_id,
    selection.commune_id,
    selection.canton_id,
  ])

  return {
    selection,
    setSelection,
    setLevel,
    options: optionsByLevel,
    loadingLevel,
    levels,
  }
}
