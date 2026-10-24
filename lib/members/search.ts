/** Escape user values before entering PostgREST's OR expression grammar. */
export function memberSearchFilters(search: string): string[] {
  return search.trim().split(/\s+/).filter(Boolean).slice(0, 8).map((word) => {
    const value = word.replace(/[(),"]/g, '').replace(/[\\%_]/g, '\\$&')
    return ['first_name', 'last_name', 'email', 'phone']
      .map((column) => `${column}.ilike.%${value}%`).join(',')
  })
}
