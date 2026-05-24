'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { MarketplaceFilters } from './use-marketplace-filters'

export interface PublicFiche {
  id: string
  title: string
  description: string | null
  culture: string
  type_agriculture: string
  campaign: string | null
  price_non_member: number
  download_count: number
  created_at: string
  cooperative_id: string
  canton_id: string | null
  prefecture_id: string | null
  region_id: string | null
  cooperatives: { name: string; faitiere_name: string | null } | null
}

interface FichesResult {
  fiches: PublicFiche[]
  total: number
  page: number
  pageSize: number
}

interface ReferenceData {
  regions: { id: string; name: string }[]
  prefectures: { id: string; name: string; region_id: string }[]
  cantons: { id: string; name: string; prefecture_id: string }[]
  cultures: { id: string; name: string; icon: string | null; category: string }[]
  cooperatives: { id: string; name: string }[]
}

const PAGE_SIZE = 20

/**
 * Fetches public fiches techniques (comptes d'exploitation) with filters.
 * Used by the public marketplace page.
 */
export function useFichesPublic(filters: MarketplaceFilters) {
  const supabase = useMemo(() => createClient(), [])
  const [data, setData] = useState<FichesResult | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [referenceData, setReferenceData] = useState<ReferenceData>({
    regions: [],
    prefectures: [],
    cantons: [],
    cultures: [],
    cooperatives: [],
  })
  const [refLoading, setRefLoading] = useState(true)

  const cacheRef = useRef<Map<string, { data: FichesResult; ts: number }>>(new Map())
  const abortRef = useRef<AbortController | null>(null)

  // Load reference data once
  useEffect(() => {
    const load = async () => {
      setRefLoading(true)
      const [regRes, prefRes, cantRes, cultRes, coopRes] = await Promise.all([
        supabase.from('regions').select('id, name').order('name'),
        supabase.from('prefectures').select('id, name, region_id').order('name'),
        supabase.from('cantons').select('id, name, prefecture_id').order('name'),
        supabase.from('cultures').select('id, name, icon, category').order('name'),
        supabase.from('cooperatives').select('id, name').order('name'),
      ])
      setReferenceData({
        regions: regRes.data ?? [],
        prefectures: prefRes.data ?? [],
        cantons: cantRes.data ?? [],
        cultures: cultRes.data ?? [],
        cooperatives: coopRes.data ?? [],
      })
      setRefLoading(false)
    }
    load()
  }, [supabase])

  const cacheKey = useMemo(() => JSON.stringify(filters), [filters])

  const fetchFiches = useCallback(async () => {
    const cached = cacheRef.current.get(cacheKey)
    if (cached && Date.now() - cached.ts < 30_000) {
      setData(cached.data)
      setIsLoading(false)
      return
    }

    abortRef.current?.abort()
    abortRef.current = new AbortController()

    setIsLoading(true)
    setError(null)

    try {
      const params = new URLSearchParams()
      if (filters.search) params.set('q', filters.search)
      if (filters.culture) params.set('culture', filters.culture)
      if (filters.region_id) params.set('region_id', filters.region_id)
      if (filters.prefecture_id) params.set('prefecture_id', filters.prefecture_id)
      if (filters.canton_id) params.set('canton_id', filters.canton_id)
      if (filters.cooperative_id) params.set('cooperative_id', filters.cooperative_id)
      if (filters.producer_type) params.set('type_agriculture', filters.producer_type)
      params.set('page', String(filters.page))
      params.set('limit', String(PAGE_SIZE))

      const res = await fetch(`/api/fiches/public?${params.toString()}`, {
        signal: abortRef.current.signal,
        cache: 'no-store',
      })

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`)
      }

      const result = (await res.json()) as FichesResult
      setData(result)
      cacheRef.current.set(cacheKey, { data: result, ts: Date.now() })
    } catch (err: unknown) {
      const e = err as { name?: string; message?: string }
      if (e?.name === 'AbortError') return
      setError(e?.message ?? 'Erreur de chargement')
    } finally {
      setIsLoading(false)
    }
  }, [filters, cacheKey])

  useEffect(() => {
    fetchFiches()
  }, [fetchFiches])

  // Cascade filtering for reference data
  const filteredPrefectures = useMemo(() => {
    if (!filters.region_id) return referenceData.prefectures
    return referenceData.prefectures.filter((p) => p.region_id === filters.region_id)
  }, [referenceData.prefectures, filters.region_id])

  const filteredCantons = useMemo(() => {
    if (!filters.prefecture_id) return referenceData.cantons
    return referenceData.cantons.filter((c) => c.prefecture_id === filters.prefecture_id)
  }, [referenceData.cantons, filters.prefecture_id])

  return {
    fiches: data?.fiches ?? [],
    total: data?.total ?? 0,
    totalPages: Math.max(1, Math.ceil((data?.total ?? 0) / PAGE_SIZE)),
    isLoading,
    error,
    referenceData: {
      ...referenceData,
      prefectures: filteredPrefectures,
      cantons: filteredCantons,
    },
    refLoading,
    refresh: fetchFiches,
  }
}
