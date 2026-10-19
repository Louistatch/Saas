'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

/**
 * Cœur de la cascade région → préfecture → commune → canton → village, sans
 * dépendance à Supabase : `useCascadingLocations` (hooks/use-cascading-locations)
 * lui fournit la lecture des tables, les tests une lecture simulée.
 *
 * Règle qui empêche toute boucle de rendu, quel que soit l'appelant :
 *   - les listes de niveaux sont réduites à une clé texte (`levelListKey`) :
 *     un tableau écrit en ligne (`levels: ['region_id', …]`) est neuf à chaque
 *     rendu, sa clé ne change pas ;
 *   - les effets ne dépendent que de chaînes (clé des niveaux, plan des
 *     requêtes) et de la fonction de lecture ;
 *   - aucun effet n'appelle `setState` de façon synchrone : les options sont
 *     calculées pendant le rendu (`deriveOptions`), seul le résultat d'une
 *     lecture est rangé dans l'état ;
 *   - chaque couple (niveau, parent) n'est lu qu'une fois par montage, sauf
 *     une lecture en échec : elle est relancée au choix suivant ou par
 *     `retry()` (ex. à l'ouverture d'un formulaire), jamais en boucle.
 */

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

export type CascadingLocationLevel = keyof CascadingLocationSelection

/** Ligne lue : `id`, `name` et, pour un niveau préchargé, la colonne parente. */
export type LocationRow = LocationOption & { [column: string]: string | null | undefined }

/** Lecture d'une table de localités, triée par nom. Lève une erreur en cas d'échec. */
export type LocationFetcher = (request: {
  table: string
  columns: string
  parent?: { column: string; id: string }
}) => Promise<LocationRow[]>

export const EMPTY_SELECTION: CascadingLocationSelection = {
  region_id: '',
  prefecture_id: '',
  commune_id: '',
  canton_id: '',
  village_id: '',
}

/**
 * Ordre de la cascade : changer un niveau vide tous ceux à sa droite.
 */
export const LEVEL_ORDER: readonly CascadingLocationLevel[] = [
  'region_id',
  'prefecture_id',
  'commune_id',
  'canton_id',
  'village_id',
]

export const DEFAULT_LEVELS: readonly CascadingLocationLevel[] = [
  'region_id',
  'prefecture_id',
  'canton_id',
]

export const TABLE_BY_LEVEL: Record<CascadingLocationLevel, string> = {
  region_id: 'regions',
  prefecture_id: 'prefectures',
  commune_id: 'communes',
  canton_id: 'cantons',
  village_id: 'villages',
}

export const PARENT_COLUMN_BY_LEVEL: Partial<
  Record<CascadingLocationLevel, CascadingLocationLevel>
> = {
  prefecture_id: 'region_id',
  commune_id: 'prefecture_id',
  canton_id: 'prefecture_id', // Au Togo, les cantons sont rattachés directement aux préfectures
  village_id: 'canton_id',
}

export interface UseCascadingLocationsOptions {
  /** Levels to enable, in cascade order. Default: region → prefecture → canton. */
  levels?: readonly CascadingLocationLevel[]
  /**
   * Initial selection (e.g. when editing an existing record). Read once, on
   * mount; use `setSelection` to change it afterwards.
   */
  initialSelection?: Partial<CascadingLocationSelection>
  /**
   * 'query' (default): each level's options are fetched from Supabase, scoped
   * to the parent selection (`.eq(parentColumn, parentId)`).
   *
   * 'prefetch-filter': the `prefetchLevels` are fetched once up-front and
   * filtered client-side against the parent selection; the other levels are
   * queried lazily, like in 'query' mode.
   */
  mode?: 'query' | 'prefetch-filter'
  /**
   * Only used in 'prefetch-filter' mode: levels fetched once up-front. Defaults
   * to the first two levels.
   */
  prefetchLevels?: readonly CascadingLocationLevel[]
}

export interface UseCascadingLocationsResult {
  selection: CascadingLocationSelection
  /** Replace part or all of the selection at once (e.g. when loading an existing record). */
  setSelection: (selection: Partial<CascadingLocationSelection>) => void
  /**
   * Update a single level. Automatically resets every level below it in the
   * cascade (region → prefecture → commune → canton → village).
   */
  setLevel: (level: CascadingLocationLevel, id: string) => void
  /** Options available for each level, already scoped to the parent selection. */
  options: Record<CascadingLocationLevel, LocationOption[]>
  /** Which level is waiting for its options (or null). */
  loadingLevel: CascadingLocationLevel | null
  /** Active levels, in cascade order (mirrors the `levels` option). */
  levels: CascadingLocationLevel[]
  /**
   * Niveaux dont la lecture a échoué (liste vide affichée) : à signaler à
   * l'utilisateur, avec `retry`.
   */
  failedLevels: CascadingLocationLevel[]
  /**
   * Relit les niveaux en échec, sans attendre un nouveau choix. Sans effet
   * (aucun rendu) quand rien n'a échoué : peut être appelé à chaque ouverture.
   */
  retry: () => void
}

const isLevel = (value: string): value is CascadingLocationLevel =>
  (LEVEL_ORDER as readonly string[]).includes(value)

/**
 * Clé texte d'une liste de niveaux : deux tableaux de même contenu donnent la
 * même clé, quelle que soit leur identité. Les valeurs inconnues et les
 * doublons sont écartés, l'ordre de la cascade est imposé.
 */
export function levelListKey(levels: readonly string[]): string {
  return LEVEL_ORDER.filter((level) => levels.includes(level)).join(',')
}

export function parseLevelListKey(key: string): CascadingLocationLevel[] {
  return key.split(',').filter(isLevel)
}

/** Clé de cache d'une lecture : `canton_id:<id préfecture>`, `region_id:` ou `prefecture_id:*`. */
const PREFETCH_ALL = '*'
const cacheKey = (level: CascadingLocationLevel, parentId: string) => `${level}:${parentId}`

export interface LocationRequest {
  level: CascadingLocationLevel
  /** '' pour un niveau sans parent, '*' pour un préchargement complet. */
  parentId: string
}

/**
 * Lectures nécessaires pour la sélection courante. Un niveau enfant sans
 * parent choisi n'a rien à lire.
 */
export function planRequests(
  mode: 'query' | 'prefetch-filter',
  levels: readonly CascadingLocationLevel[],
  prefetchLevels: readonly CascadingLocationLevel[],
  selection: CascadingLocationSelection,
): LocationRequest[] {
  const requests: LocationRequest[] = []
  for (const level of levels) {
    if (mode === 'prefetch-filter' && prefetchLevels.includes(level)) {
      requests.push({ level, parentId: PREFETCH_ALL })
      continue
    }
    const parentLevel = PARENT_COLUMN_BY_LEVEL[level]
    if (!parentLevel) {
      requests.push({ level, parentId: '' })
      continue
    }
    const parentId = selection[parentLevel]
    if (parentId) requests.push({ level, parentId })
  }
  return requests
}

export function requestPlanKey(requests: readonly LocationRequest[]): string {
  return requests.map((r) => cacheKey(r.level, r.parentId)).join('|')
}

export function parseRequestPlanKey(key: string): LocationRequest[] {
  if (!key) return []
  return key.split('|').flatMap((part) => {
    const at = part.indexOf(':')
    const level = part.slice(0, at)
    return isLevel(level) ? [{ level, parentId: part.slice(at + 1) }] : []
  })
}

const EMPTY_OPTIONS: LocationOption[] = []

/**
 * Options de chaque niveau, calculées à partir des lectures déjà rangées et de
 * la sélection. Fonction pure : aucune lecture, aucun `setState`.
 */
export function deriveOptions(
  mode: 'query' | 'prefetch-filter',
  levels: readonly CascadingLocationLevel[],
  prefetchLevels: readonly CascadingLocationLevel[],
  cache: Readonly<Record<string, LocationRow[]>>,
  selection: CascadingLocationSelection,
): Record<CascadingLocationLevel, LocationOption[]> {
  const out = {} as Record<CascadingLocationLevel, LocationOption[]>
  for (const level of LEVEL_ORDER) {
    out[level] = EMPTY_OPTIONS
    if (!levels.includes(level)) continue
    const parentLevel = PARENT_COLUMN_BY_LEVEL[level]
    const parentId = parentLevel ? selection[parentLevel] : ''

    if (mode === 'prefetch-filter' && prefetchLevels.includes(level)) {
      const all = cache[cacheKey(level, PREFETCH_ALL)] ?? EMPTY_OPTIONS
      // Sans parent choisi, tout le niveau reste proposé.
      out[level] =
        parentLevel && parentId
          ? (all as LocationRow[]).filter((row) => row[parentLevel] === parentId)
          : all
      continue
    }
    if (parentLevel && !parentId) continue
    out[level] = cache[cacheKey(level, parentId)] ?? EMPTY_OPTIONS
  }
  return out
}

/** Premier niveau enfant dont la lecture est attendue. */
export function pendingLevel(
  requests: readonly LocationRequest[],
  cache: Readonly<Record<string, LocationRow[]>>,
): CascadingLocationLevel | null {
  for (const r of requests) {
    if (r.parentId === '' || r.parentId === PREFETCH_ALL) continue
    if (!(cacheKey(r.level, r.parentId) in cache)) return r.level
  }
  return null
}

/** Niveaux de la sélection courante dont la lecture est en échec. */
export function failedLevelsOf(
  requests: readonly LocationRequest[],
  failed: ReadonlySet<string>,
): CascadingLocationLevel[] {
  return requests.flatMap((r) => (failed.has(cacheKey(r.level, r.parentId)) ? [r.level] : []))
}

/** Vide tous les niveaux à droite de `level`. */
export function resetChildrenOf(
  level: CascadingLocationLevel,
  base: CascadingLocationSelection,
): CascadingLocationSelection {
  const next = { ...base }
  for (let i = LEVEL_ORDER.indexOf(level) + 1; i < LEVEL_ORDER.length; i++) {
    next[LEVEL_ORDER[i]] = ''
  }
  return next
}

const sameSelection = (a: CascadingLocationSelection, b: CascadingLocationSelection) =>
  LEVEL_ORDER.every((level) => a[level] === b[level])

/**
 * Implémentation de `useCascadingLocations`, la lecture des tables étant
 * fournie par `fetchRows` (identité stable attendue : fonction de module).
 */
export function useCascadingLocationsWith(
  fetchRows: LocationFetcher,
  opts: UseCascadingLocationsOptions = {},
): UseCascadingLocationsResult {
  const mode = opts.mode ?? 'query'
  // Clés texte : un tableau écrit en ligne par l'appelant ne relance rien.
  const levelsKey = levelListKey(opts.levels ?? DEFAULT_LEVELS)
  const levels = useMemo(() => parseLevelListKey(levelsKey), [levelsKey])
  const prefetchKey = levelListKey(opts.prefetchLevels ?? levels.slice(0, 2))
  const prefetchLevels = useMemo(() => parseLevelListKey(prefetchKey), [prefetchKey])

  const [selection, setSelectionState] = useState<CascadingLocationSelection>(() => ({
    ...EMPTY_SELECTION,
    ...opts.initialSelection,
  }))
  const [cache, setCache] = useState<Record<string, LocationRow[]>>({})

  // Une même sélection ne crée pas de nouvel objet : pas de rendu inutile.
  const setSelection = useCallback((partial: Partial<CascadingLocationSelection>) => {
    setSelectionState((prev) => {
      const next = { ...prev, ...partial }
      return sameSelection(prev, next) ? prev : next
    })
  }, [])

  const setLevel = useCallback((level: CascadingLocationLevel, id: string) => {
    setSelectionState((prev) => {
      const next = resetChildrenOf(level, { ...prev, [level]: id })
      return sameSelection(prev, next) ? prev : next
    })
  }, [])

  const requests = planRequests(mode, levels, prefetchLevels, selection)
  const planKey = requestPlanKey(requests)

  // Lectures déjà lancées pour ce montage : chacune n'a lieu qu'une fois.
  const requested = useRef(new Set<string>())
  // Lectures en échec (clés de cache). L'état sert l'affichage ; la référence,
  // tenue à jour au même moment, permet à `retry` de ne rien faire quand tout
  // a été lu.
  const [failed, setFailed] = useState<ReadonlySet<string>>(() => new Set())
  const failedKeys = useRef(new Set<string>())
  // Incrémenté par `retry` : relance l'effet de lecture sans changer le plan.
  const [attempt, setAttempt] = useState(0)

  const markFailed = useCallback((key: string, isFailed: boolean) => {
    if (failedKeys.current.has(key) === isFailed) return
    if (isFailed) failedKeys.current.add(key)
    else failedKeys.current.delete(key)
    setFailed(new Set(failedKeys.current))
  }, [])

  // biome-ignore lint/correctness/useExhaustiveDependencies: `attempt` ne sert qu'à relancer la lecture des clés en échec (voir `retry`)
  useEffect(() => {
    for (const { level, parentId } of parseRequestPlanKey(planKey)) {
      const key = cacheKey(level, parentId)
      if (requested.current.has(key)) continue
      requested.current.add(key)

      const parentLevel = PARENT_COLUMN_BY_LEVEL[level]
      const prefetch = parentId === PREFETCH_ALL
      fetchRows({
        table: TABLE_BY_LEVEL[level],
        columns: prefetch && parentLevel ? `id, name, ${parentLevel}` : 'id, name',
        parent: parentLevel && !prefetch ? { column: parentLevel, id: parentId } : undefined,
      })
        .then((rows) => {
          setCache((prev) => ({ ...prev, [key]: rows }))
          markFailed(key, false)
        })
        .catch(() => {
          // Liste vide affichée et signalée (`failedLevels`) ; la lecture est
          // retentée au prochain choix ou par `retry`.
          requested.current.delete(key)
          setCache((prev) => ({ ...prev, [key]: [] }))
          markFailed(key, true)
        })
    }
  }, [planKey, fetchRows, attempt, markFailed])

  const retry = useCallback(() => {
    if (failedKeys.current.size > 0) setAttempt((n) => n + 1)
  }, [])

  const options = useMemo(
    () => deriveOptions(mode, levels, prefetchLevels, cache, selection),
    [mode, levels, prefetchLevels, cache, selection],
  )
  const failedLevels = useMemo(
    () => failedLevelsOf(parseRequestPlanKey(planKey), failed),
    [planKey, failed],
  )

  return {
    selection,
    setSelection,
    setLevel,
    options,
    loadingLevel: pendingLevel(requests, cache),
    levels,
    failedLevels,
    retry,
  }
}
