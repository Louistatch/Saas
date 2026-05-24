/**
 * useKoboSubmissions — Server-side paginated hook for kobo_submissions.
 *
 * Fetches submissions from Supabase with filters (status, search, date range).
 * Uses stable useCallback references to avoid unnecessary re-renders.
 *
 * Usage:
 *   const { submissions, totalCount, isLoading, error, refetch } = useKoboSubmissions({
 *     cooperativeId,
 *     page: 1,
 *     pageSize: 25,
 *     status: 'matched',
 *     search: 'FEN-001',
 *   })
 */
'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import type {
  KoboSubmissionRow,
  KoboSubmissionStatus,
  UseKoboSubmissionsOptions,
  UseKoboSubmissionsReturn,
} from '@/lib/kobo/types'

export function useKoboSubmissions(
  options: UseKoboSubmissionsOptions,
): UseKoboSubmissionsReturn {
  const { cooperativeId, page, pageSize, status, search, dateFrom, dateTo } = options

  const [submissions, setSubmissions] = useState<KoboSubmissionRow[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const abortRef = useRef<AbortController | null>(null)

  const fetchSubmissions = useCallback(async () => {
    if (!cooperativeId) {
      setSubmissions([])
      setTotalCount(0)
      return
    }

    // Cancel previous request
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    setIsLoading(true)
    setError(null)

    try {
      const supabase = createClient()

      // Calculate range for pagination
      const from = (page - 1) * pageSize
      const to = from + pageSize - 1

      // Build query
      let query = supabase
        .from('kobo_submissions')
        .select(
          'id, cooperative_id, member_id, kobo_instance_id, kobo_form_id, member_card_number, status, error_message, matched_at, processed_at, submitted_at, created_at, updated_at',
          { count: 'exact' },
        )
        .eq('cooperative_id', cooperativeId)
        .order('submitted_at', { ascending: false })
        .range(from, to)

      // Apply filters
      if (status) {
        query = query.eq('status', status)
      }

      if (search) {
        // Search by card number (sanitize ILIKE wildcards)
        const sanitized = search.replace(/[%_\\]/g, '\\$&')
        query = query.ilike('member_card_number', `%${sanitized}%`)
      }

      if (dateFrom) {
        query = query.gte('submitted_at', dateFrom)
      }

      if (dateTo) {
        query = query.lte('submitted_at', dateTo)
      }

      const { data, count, error: queryError } = await query

      // Check if request was aborted
      if (controller.signal.aborted) return

      if (queryError) {
        throw new Error(queryError.message)
      }

      setSubmissions((data as KoboSubmissionRow[]) ?? [])
      setTotalCount(count ?? 0)
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') return
      const message = err instanceof Error ? err.message : 'Erreur de chargement'
      setError(message)
      setSubmissions([])
      setTotalCount(0)
    } finally {
      if (!controller.signal.aborted) {
        setIsLoading(false)
      }
    }
  }, [cooperativeId, page, pageSize, status, search, dateFrom, dateTo])

  // Fetch on mount and when dependencies change
  useEffect(() => {
    fetchSubmissions()

    return () => {
      abortRef.current?.abort()
    }
  }, [fetchSubmissions])

  const refetch = useCallback(() => {
    fetchSubmissions()
  }, [fetchSubmissions])

  return { submissions, totalCount, isLoading, error, refetch }
}

/**
 * useKoboSubmissionDetail — Fetch a single submission's full payload.
 * Used when clicking a row to view the raw JSON.
 */
export function useKoboSubmissionDetail(submissionId: string | null) {
  const [data, setData] = useState<Record<string, unknown> | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!submissionId) {
      setData(null)
      return
    }

    let cancelled = false
    setIsLoading(true)
    setError(null)

    const fetchDetail = async () => {
      try {
        const supabase = createClient()
        const { data: submission, error: queryError } = await supabase
          .from('kobo_submissions')
          .select('raw_payload, processed_payload, error_message')
          .eq('id', submissionId)
          .single()

        if (cancelled) return

        if (queryError) {
          throw new Error(queryError.message)
        }

        setData(submission?.raw_payload as Record<string, unknown> ?? null)
      } catch (err: unknown) {
        if (cancelled) return
        const message = err instanceof Error ? err.message : 'Erreur'
        setError(message)
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }

    fetchDetail()

    return () => {
      cancelled = true
    }
  }, [submissionId])

  return { data, isLoading, error }
}
