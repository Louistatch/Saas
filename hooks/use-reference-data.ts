'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

/**
 * Reference data shared across the marketplace and fiches pages (DUP-01).
 *
 * Reference tables (regions, prefectures, cantons, cultures, cooperatives) are
 * effectively immutable during a session. Previously, each consuming hook fired
 * the same 5 queries on every mount — at 10M MAU that is millions of redundant
 * round-trips per day.
 *
 * This hook fetches once, caches at module scope with a TTL, and deduplicates
 * concurrent callers via a single shared in-flight promise.
 */

export interface ReferenceData {
  regions: { id: string; name: string }[]
  prefectures: { id: string; name: string; region_id: string }[]
  cantons: { id: string; name: string; prefecture_id: string }[]
  cultures: { id: string; name: string; icon: string | null; category: string }[]
  cooperatives: { id: string; name: string }[]
}

const EMPTY: ReferenceData = {
  regions: [],
  prefectures: [],
  cantons: [],
  cultures: [],
  cooperatives: [],
}

const TTL_MS = 5 * 60 * 1000 // 5 minutes — reference data barely changes

interface CacheEntry {
  data: ReferenceData
  fetchedAt: number
}

// Module-scoped cache shared by ALL consumers in the tab.
let cache: CacheEntry | null = null
let inflight: Promise<ReferenceData> | null = null

function isFresh(entry: CacheEntry | null): entry is CacheEntry {
  return !!entry && Date.now() - entry.fetchedAt < TTL_MS
}

async function loadReferenceData(): Promise<ReferenceData> {
  if (isFresh(cache)) return cache.data
  if (inflight) return inflight // dedupe concurrent callers

  const supabase = createClient()
  inflight = (async () => {
    const [regRes, prefRes, cantRes, cultRes, coopRes] = await Promise.all([
      supabase.from('regions').select('id, name').order('name'),
      supabase.from('prefectures').select('id, name, region_id').order('name'),
      supabase.from('cantons').select('id, name, prefecture_id').order('name'),
      supabase.from('cultures').select('id, name, icon, category').order('name'),
      supabase.from('cooperatives').select('id, name').order('name'),
    ])

    const data: ReferenceData = {
      regions: regRes.data ?? [],
      prefectures: prefRes.data ?? [],
      cantons: cantRes.data ?? [],
      cultures: cultRes.data ?? [],
      cooperatives: coopRes.data ?? [],
    }

    cache = { data, fetchedAt: Date.now() }
    return data
  })()

  try {
    return await inflight
  } finally {
    inflight = null
  }
}

/** Force-clear the cache (e.g. after an admin edits reference tables). */
export function invalidateReferenceData(): void {
  cache = null
  inflight = null
}

export function useReferenceData(): {
  referenceData: ReferenceData
  isLoading: boolean
  error: string | null
} {
  const [referenceData, setReferenceData] = useState<ReferenceData>(
    () => (isFresh(cache) ? cache.data : EMPTY),
  )
  const [isLoading, setIsLoading] = useState<boolean>(() => !isFresh(cache))
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true

    if (isFresh(cache)) {
      setReferenceData(cache.data)
      setIsLoading(false)
      return
    }

    loadReferenceData()
      .then((data) => {
        if (!mounted) return
        setReferenceData(data)
        setIsLoading(false)
      })
      .catch((err: unknown) => {
        if (!mounted) return
        setError(err instanceof Error ? err.message : 'Failed to load reference data')
        setIsLoading(false)
      })

    return () => {
      mounted = false
    }
  }, [])

  return { referenceData, isLoading, error }
}
