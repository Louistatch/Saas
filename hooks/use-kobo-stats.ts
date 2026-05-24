/**
 * useKoboStats — Polling hook for KoboCollect submission statistics.
 *
 * Fetches stats from GET /api/integrations/kobo?cooperativeId=...&stats
 * Auto-refreshes every 30 seconds. Exposes refetch for manual refresh.
 *
 * Usage:
 *   const { stats, isLoading, error, refetch } = useKoboStats(cooperativeId)
 */
'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import type { KoboStatsResponse, UseKoboStatsReturn } from '@/lib/kobo/types'

const POLL_INTERVAL_MS = 30_000

export function useKoboStats(cooperativeId: string | null): UseKoboStatsReturn {
  const [stats, setStats] = useState<KoboStatsResponse | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const fetchStats = useCallback(async () => {
    if (!cooperativeId) return

    // Cancel any in-flight request
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    setIsLoading(true)
    setError(null)

    try {
      const url = `/api/integrations/kobo?cooperativeId=${encodeURIComponent(cooperativeId)}&stats`
      const response = await fetch(url, {
        signal: controller.signal,
        headers: { Accept: 'application/json' },
      })

      if (!response.ok) {
        const body = await response.json().catch(() => ({}))
        throw new Error(
          (body as { error?: string }).error ?? `HTTP ${response.status}`,
        )
      }

      const data = (await response.json()) as KoboStatsResponse
      setStats(data)
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') return
      const message = err instanceof Error ? err.message : 'Erreur de chargement'
      setError(message)
    } finally {
      setIsLoading(false)
    }
  }, [cooperativeId])

  // Initial fetch + polling
  useEffect(() => {
    if (!cooperativeId) {
      setStats(null)
      return
    }

    // Fetch immediately
    fetchStats()

    // Set up polling
    intervalRef.current = setInterval(fetchStats, POLL_INTERVAL_MS)

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
      abortRef.current?.abort()
    }
  }, [cooperativeId, fetchStats])

  const refetch = useCallback(() => {
    fetchStats()
  }, [fetchStats])

  return { stats, isLoading, error, refetch }
}
