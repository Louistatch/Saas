'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { MarketplaceFilters } from './use-marketplace-filters'
import { useReferenceData } from './use-reference-data'

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
  /** NULL = compte d'exploitation vendu par la plateforme FaîtiereHub. */
  cooperative_id: string | null
  is_free_for_members: boolean
  cover_url: string | null
  canton_id: string | null
  prefecture_id: string | null
  region_id: string | null
  cooperatives: { name: string; faitiere_name: string | null } | null
  // Joined locality names returned by /api/fiches/public
  region: { id: string; name: string } | null
  prefecture: { id: string; name: string } | null
  canton: { id: string; name: string } | null
  /** Contenu vendu, sans chemin de stockage : nombre et type/taille des fichiers. */
  files_count?: number
  files_summary?: { type: string; size: number | null }[]
}

interface FichesResult {
  fiches: PublicFiche[]
  total: number
  page: number
  pageSize: number
}

const PAGE_SIZE = 20
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Fetches public fiches techniques (comptes d'exploitation) with filters.
 * Used by the public marketplace page.
 *
 * `ficheId` (lien /marketplace?fiche=<id>) : cette fiche seule, filtres ignorés.
 */
export function useFichesPublic(filters: MarketplaceFilters, ficheId?: string | null) {
  const [data, setData] = useState<FichesResult | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // DUP-01 / OPT-04: shared cached reference data instead of per-mount fetch.
  const { referenceData, isLoading: refLoading } = useReferenceData()

  const cacheRef = useRef<Map<string, { data: FichesResult; ts: number }>>(new Map())
  const abortRef = useRef<AbortController | null>(null)

  const cacheKey = useMemo(() => JSON.stringify([filters, ficheId ?? null]), [filters, ficheId])

  const fetchFiches = useCallback(async () => {
    const cached = cacheRef.current.get(cacheKey)
    if (cached && Date.now() - cached.ts < 30_000) {
      setData(cached.data)
      setIsLoading(false)
      return
    }

    abortRef.current?.abort()
    abortRef.current = new AbortController()

    // Lien abîmé (id tronqué) : aucune fiche, sans requête ni « erreur réseau ».
    if (ficheId && !UUID_RE.test(ficheId)) {
      setData({ fiches: [], total: 0, page: 1, pageSize: PAGE_SIZE })
      setError(null)
      setIsLoading(false)
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      const params = new URLSearchParams()
      if (ficheId) params.set('id', ficheId)
      else if (filters.search) params.set('q', filters.search)
      if (!ficheId) {
        if (filters.culture) params.set('culture', filters.culture)
        if (filters.region_id) params.set('region_id', filters.region_id)
        if (filters.prefecture_id) params.set('prefecture_id', filters.prefecture_id)
        if (filters.canton_id) params.set('canton_id', filters.canton_id)
        if (filters.cooperative_id) params.set('cooperative_id', filters.cooperative_id)
        if (filters.producer_type) params.set('type_agriculture', filters.producer_type)
      }
      params.set('page', ficheId ? '1' : String(filters.page))
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
  }, [filters, ficheId, cacheKey])

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
