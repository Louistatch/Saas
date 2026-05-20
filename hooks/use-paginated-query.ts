'use client'

import { useState, useCallback, useEffect, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useToast } from '@/hooks/use-toast'
import { errorMessage } from '@/lib/utils/errors'

interface UsePaginatedQueryOptions<T> {
  /** Supabase table name */
  table: string
  /** Columns to select (PostgREST syntax) */
  select: string
  /** Filter: { column: value } pairs applied with .eq() */
  filters?: Record<string, string | boolean | number>
  /** Column to order by */
  orderBy?: string
  /** Order direction */
  ascending?: boolean
  /** Page size */
  pageSize?: number
  /** Whether to run the query (set false to disable) */
  enabled?: boolean
  /** Search column (for ilike filter) */
  searchColumn?: string
  /** Search term */
  searchTerm?: string
}

interface PaginatedResult<T> {
  data: T[]
  page: number
  pageSize: number
  total: number
  totalPages: number
  isLoading: boolean
  setPage: (page: number) => void
  refresh: () => void
}

/**
 * Server-side paginated query hook using Supabase `.range()`.
 * Fetches only the rows needed for the current page.
 */
export function usePaginatedQuery<T = Record<string, unknown>>(
  opts: UsePaginatedQueryOptions<T>,
): PaginatedResult<T> {
  const {
    table,
    select,
    filters = {},
    orderBy = 'created_at',
    ascending = false,
    pageSize = 20,
    enabled = true,
    searchColumn,
    searchTerm,
  } = opts

  const supabase = useMemo(() => createClient(), [])
  const { toast } = useToast()
  const [data, setData] = useState<T[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [isLoading, setIsLoading] = useState(true)

  // Reset page when filters/search change
  useEffect(() => {
    setPage(1)
  }, [searchTerm, JSON.stringify(filters)])

  const fetchPage = useCallback(async () => {
    if (!enabled) {
      setData([])
      setTotal(0)
      setIsLoading(false)
      return
    }

    setIsLoading(true)

    try {
      // Build query
      let query = supabase
        .from(table)
        .select(select, { count: 'exact' })

      // Apply filters
      for (const [col, val] of Object.entries(filters)) {
        query = query.eq(col, val)
      }

      // Apply search
      if (searchColumn && searchTerm && searchTerm.trim().length > 0) {
        query = query.ilike(searchColumn, `%${searchTerm.trim()}%`)
      }

      // Order
      query = query.order(orderBy, { ascending })

      // Pagination via .range()
      const from = (page - 1) * pageSize
      const to = from + pageSize - 1
      query = query.range(from, to)

      const { data: rows, error, count } = await query

      if (error) throw error

      setData((rows ?? []) as T[])
      setTotal(count ?? 0)
    } catch (err) {
      toast({
        title: 'Error loading data',
        description: errorMessage(err),
        variant: 'destructive',
      })
      setData([])
      setTotal(0)
    } finally {
      setIsLoading(false)
    }
  }, [table, select, JSON.stringify(filters), orderBy, ascending, page, pageSize, enabled, searchColumn, searchTerm, supabase, toast])

  useEffect(() => {
    fetchPage()
  }, [fetchPage])

  return {
    data,
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
    isLoading,
    setPage,
    refresh: fetchPage,
  }
}
