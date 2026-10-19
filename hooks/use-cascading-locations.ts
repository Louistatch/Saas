'use client'

import { createClient } from '@/lib/supabase/client'
import {
  type LocationFetcher,
  type LocationRow,
  type UseCascadingLocationsOptions,
  type UseCascadingLocationsResult,
  useCascadingLocationsWith,
} from './cascading-locations-core'

export type {
  CascadingLocationLevel,
  CascadingLocationSelection,
  LocationOption,
  UseCascadingLocationsOptions,
  UseCascadingLocationsResult,
} from './cascading-locations-core'

/**
 * Lecture Supabase d'une table de localités. Fonction de module : son identité
 * ne change jamais, les effets du hook ne se relancent donc pas à chaque rendu.
 * Le client n'est créé qu'au moment de la lecture (dans un effet), jamais au rendu.
 */
const fetchLocationRows: LocationFetcher = async ({ table, columns, parent }) => {
  let query = createClient().from(table).select(columns)
  if (parent) query = query.eq(parent.column, parent.id)
  const { data, error } = await query.order('name')
  if (error) throw error
  return (data ?? []) as unknown as LocationRow[]
}

/**
 * Encapsulates the région → préfecture → commune → canton → village cascade:
 * - holds the selection state for each enabled level
 * - loads the options for each level from Supabase as parent levels change
 * - resets child levels whenever a parent level changes
 *
 * Options may be written inline (`levels: ['region_id', …]`): the hook keys
 * them by content, never by array identity, so a new array on every render
 * does not trigger any fetch. See hooks/cascading-locations-core.ts.
 */
export function useCascadingLocations(
  opts: UseCascadingLocationsOptions = {},
): UseCascadingLocationsResult {
  return useCascadingLocationsWith(fetchLocationRows, opts)
}
