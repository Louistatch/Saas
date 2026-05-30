'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useReferenceData } from './use-reference-data'
import type { MarketplaceFilters } from './use-marketplace-filters'

export interface MarketplaceProduct {
  id: string
  name: string
  description: string | null
  category: string
  culture: string | null
  price: number | null
  currency: string
  unit: string | null
  quantity_available: number | null
  images: { url: string; alt?: string }[]
  certification: string[]
  season: string | null
  available: boolean
  producer_type: string | null
  tags: string[]
  views_count: number
  orders_count: number
  created_at: string
  cooperative_name: string | null
  region_name: string | null
  prefecture_name: string | null
}

interface MarketplaceResult {
  products: MarketplaceProduct[]
  total: number
  page: number
  page_size: number
  total_pages: number
}

const PAGE_SIZE = 20

/**
 * Fetches marketplace data with server-side filtering via Supabase RPC.
 * Includes client-side caching and optimistic loading states.
 */
export function useMarketplaceData(filters: MarketplaceFilters) {
  const supabase = useMemo(() => createClient(), [])
  const [data, setData] = useState<MarketplaceResult | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // DUP-01 / OPT-04: reference data comes from the shared cached hook,
  // not a per-mount 5-query fetch.
  const { referenceData, isLoading: refLoading } = useReferenceData()

  // Cache for marketplace query results (filter-keyed)
  const cacheRef = useRef<Map<string, { data: MarketplaceResult; ts: number }>>(new Map())
  const abortRef = useRef<AbortController | null>(null)

  // Build cache key from filters
  const cacheKey = useMemo(() => JSON.stringify(filters), [filters])

  // Fetch products
  const fetchProducts = useCallback(async () => {
    // Check cache (valid for 30s)
    const cached = cacheRef.current.get(cacheKey)
    if (cached && Date.now() - cached.ts < 30_000) {
      setData(cached.data)
      setIsLoading(false)
      return
    }

    // Abort previous request
    abortRef.current?.abort()
    abortRef.current = new AbortController()

    setIsLoading(true)
    setError(null)

    try {
      const { data: result, error: rpcError } = await supabase.rpc('search_marketplace', {
        search_query: filters.search || null,
        filter_category: filters.category || null,
        filter_culture: filters.culture || null,
        filter_region_id: filters.region_id || null,
        filter_prefecture_id: filters.prefecture_id || null,
        filter_canton_id: filters.canton_id || null,
        filter_cooperative_id: filters.cooperative_id || null,
        filter_available: true,
        filter_min_price: filters.min_price ? parseFloat(filters.min_price) : null,
        filter_max_price: filters.max_price ? parseFloat(filters.max_price) : null,
        filter_certification: filters.certification || null,
        filter_season: filters.season || null,
        filter_producer_type: filters.producer_type || null,
        sort_by: filters.sort_by,
        sort_order: filters.sort_order,
        page_number: filters.page,
        page_size: PAGE_SIZE,
      })

      if (rpcError) throw rpcError

      const parsed = result as MarketplaceResult
      setData(parsed)
      cacheRef.current.set(cacheKey, { data: parsed, ts: Date.now() })
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') return
      setError(err instanceof Error ? err.message : 'Erreur de chargement')
    } finally {
      setIsLoading(false)
    }
  }, [supabase, filters, cacheKey])

  useEffect(() => {
    fetchProducts()
  }, [fetchProducts])

  // Filtered reference data based on cascade
  const filteredPrefectures = useMemo(() => {
    if (!filters.region_id) return referenceData.prefectures
    return referenceData.prefectures.filter(p => p.region_id === filters.region_id)
  }, [referenceData.prefectures, filters.region_id])

  const filteredCantons = useMemo(() => {
    if (!filters.prefecture_id) return referenceData.cantons
    return referenceData.cantons.filter(c => c.prefecture_id === filters.prefecture_id)
  }, [referenceData.cantons, filters.prefecture_id])

  return {
    products: data?.products ?? [],
    total: data?.total ?? 0,
    totalPages: data?.total_pages ?? 1,
    isLoading,
    error,
    referenceData: {
      ...referenceData,
      prefectures: filteredPrefectures,
      cantons: filteredCantons,
    },
    refLoading,
    refresh: fetchProducts,
  }
}
