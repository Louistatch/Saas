'use client'

import { useCallback, useEffect, useMemo, useState, useTransition } from 'react'
import { useSearchParams, useRouter, usePathname } from 'next/navigation'
import { useDebounced } from './use-debounced'

export interface MarketplaceFilters {
  search: string
  category: string
  culture: string
  region_id: string
  prefecture_id: string
  canton_id: string
  cooperative_id: string
  min_price: string
  max_price: string
  certification: string
  season: string
  producer_type: string
  sort_by: string
  sort_order: string
  page: number
}

const DEFAULT_FILTERS: MarketplaceFilters = {
  search: '',
  category: '',
  culture: '',
  region_id: '',
  prefecture_id: '',
  canton_id: '',
  cooperative_id: '',
  min_price: '',
  max_price: '',
  certification: '',
  season: '',
  producer_type: '',
  sort_by: 'created_at',
  sort_order: 'desc',
  page: 1,
}

/**
 * URL-synced marketplace filters with optimistic updates.
 * Filters are stored in URL search params for shareability and back/forward navigation.
 */
export function useMarketplaceFilters() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  const [isPending, startTransition] = useTransition()

  // Parse filters from URL
  const filters: MarketplaceFilters = useMemo(() => ({
    search: searchParams.get('q') ?? '',
    category: searchParams.get('cat') ?? '',
    culture: searchParams.get('culture') ?? '',
    region_id: searchParams.get('region') ?? '',
    prefecture_id: searchParams.get('pref') ?? '',
    canton_id: searchParams.get('canton') ?? '',
    cooperative_id: searchParams.get('coop') ?? '',
    min_price: searchParams.get('pmin') ?? '',
    max_price: searchParams.get('pmax') ?? '',
    certification: searchParams.get('cert') ?? '',
    season: searchParams.get('season') ?? '',
    producer_type: searchParams.get('type') ?? '',
    sort_by: searchParams.get('sort') ?? 'created_at',
    sort_order: searchParams.get('order') ?? 'desc',
    page: parseInt(searchParams.get('page') ?? '1') || 1,
  }), [searchParams])

  // Local search state for instant feedback
  const [localSearch, setLocalSearch] = useState(filters.search)
  const debouncedSearch = useDebounced(localSearch, 300)

  // Sync debounced search to URL
  useEffect(() => {
    if (debouncedSearch !== filters.search) {
      updateFilters({ search: debouncedSearch, page: 1 })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch])

  // Build URL from filters
  const buildUrl = useCallback((newFilters: Partial<MarketplaceFilters>) => {
    const merged = { ...filters, ...newFilters }
    const params = new URLSearchParams()

    if (merged.search) params.set('q', merged.search)
    if (merged.category) params.set('cat', merged.category)
    if (merged.culture) params.set('culture', merged.culture)
    if (merged.region_id) params.set('region', merged.region_id)
    if (merged.prefecture_id) params.set('pref', merged.prefecture_id)
    if (merged.canton_id) params.set('canton', merged.canton_id)
    if (merged.cooperative_id) params.set('coop', merged.cooperative_id)
    if (merged.min_price) params.set('pmin', merged.min_price)
    if (merged.max_price) params.set('pmax', merged.max_price)
    if (merged.certification) params.set('cert', merged.certification)
    if (merged.season) params.set('season', merged.season)
    if (merged.producer_type) params.set('type', merged.producer_type)
    if (merged.sort_by !== 'created_at') params.set('sort', merged.sort_by)
    if (merged.sort_order !== 'desc') params.set('order', merged.sort_order)
    if (merged.page > 1) params.set('page', String(merged.page))

    const qs = params.toString()
    return qs ? `${pathname}?${qs}` : pathname
  }, [filters, pathname])

  // Update filters (optimistic URL push)
  const updateFilters = useCallback((partial: Partial<MarketplaceFilters>) => {
    startTransition(() => {
      router.push(buildUrl(partial), { scroll: false })
    })
  }, [buildUrl, router])

  // Set a single filter
  const setFilter = useCallback(<K extends keyof MarketplaceFilters>(
    key: K,
    value: MarketplaceFilters[K],
  ) => {
    if (key === 'search') {
      setLocalSearch(value as string)
      return
    }
    // Reset page when changing filters
    updateFilters({ [key]: value, page: 1 })
  }, [updateFilters])

  // Reset all filters
  const resetFilters = useCallback(() => {
    setLocalSearch('')
    startTransition(() => {
      router.push(pathname, { scroll: false })
    })
  }, [pathname, router])

  // Count active filters (excluding search, sort, page)
  const activeFilterCount = useMemo(() => {
    let count = 0
    if (filters.category) count++
    if (filters.culture) count++
    if (filters.region_id) count++
    if (filters.prefecture_id) count++
    if (filters.canton_id) count++
    if (filters.cooperative_id) count++
    if (filters.min_price) count++
    if (filters.max_price) count++
    if (filters.certification) count++
    if (filters.season) count++
    if (filters.producer_type) count++
    return count
  }, [filters])

  return {
    filters,
    localSearch,
    setLocalSearch,
    setFilter,
    updateFilters,
    resetFilters,
    activeFilterCount,
    isPending,
  }
}
