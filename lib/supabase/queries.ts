/**
 * Typed Supabase query helpers.
 * These provide server-side pagination and search via PostgREST .range() + .ilike().
 */
import type { Member, Exploitation, MemberCard } from '@/types/domain'

export interface PaginatedResponse<T> {
  data: T[]
  total: number
}

export interface QueryOptions {
  page?: number
  pageSize?: number
  search?: string
  orderBy?: string
  ascending?: boolean
}

/**
 * Build a paginated members query.
 * Uses .or() for multi-column search (first_name, last_name, email).
 */
export function buildMembersQuery(
  supabase: ReturnType<typeof import('@/lib/supabase/client').createClient>,
  cooperativeId: string,
  opts: QueryOptions = {},
) {
  const { page = 1, pageSize = 20, search, orderBy = 'last_name', ascending = true } = opts

  let query = supabase
    .from('members')
    .select('*', { count: 'exact' })
    .eq('cooperative_id', cooperativeId)
    .order(orderBy, { ascending })

  if (search && search.trim()) {
    const term = `%${search.trim()}%`
    query = query.or(`first_name.ilike.${term},last_name.ilike.${term},email.ilike.${term}`)
  }

  const from = (page - 1) * pageSize
  const to = from + pageSize - 1
  query = query.range(from, to)

  return query
}

/**
 * Build a paginated fiches_techniques query.
 */
export function buildFichesQuery(
  supabase: ReturnType<typeof import('@/lib/supabase/client').createClient>,
  cooperativeId: string,
  opts: QueryOptions = {},
) {
  const { page = 1, pageSize = 20, search, orderBy = 'created_at', ascending = false } = opts

  let query = supabase
    .from('fiches_techniques')
    .select('*', { count: 'exact' })
    .eq('cooperative_id', cooperativeId)
    .eq('status', 'published')
    .order(orderBy, { ascending })

  if (search && search.trim()) {
    const term = `%${search.trim()}%`
    query = query.or(`title.ilike.${term},culture.ilike.${term}`)
  }

  const from = (page - 1) * pageSize
  const to = from + pageSize - 1
  query = query.range(from, to)

  return query
}

/**
 * Build a paginated member_cards query with member join.
 */
export function buildCardsQuery(
  supabase: ReturnType<typeof import('@/lib/supabase/client').createClient>,
  cooperativeId: string,
  opts: QueryOptions & { search?: string } = {},
) {
  const { page = 1, pageSize = 20, search, orderBy = 'created_at', ascending = false } = opts

  let query = supabase
    .from('member_cards')
    .select(
      '*, member:members(first_name, last_name, email, phone, photo_url, prefecture, region, village, canton, faitiere)',
      { count: 'exact' },
    )
    .eq('cooperative_id', cooperativeId)
    .order(orderBy, { ascending })

  // Card search is on card_number (member name search would require a join filter)
  if (search && search.trim()) {
    query = query.ilike('card_number', `%${search.trim()}%`)
  }

  const from = (page - 1) * pageSize
  const to = from + pageSize - 1
  query = query.range(from, to)

  return query
}
