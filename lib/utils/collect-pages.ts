type PageResult<T> = { data: T[] | null; error: { message: string } | null }

/** Complete exports/reports; callers must supply a stable unique ordering. */
export async function collectPages<T>(
  read: (from: number, to: number) => PromiseLike<PageResult<T>>,
  pageSize = 500,
): Promise<PageResult<T>> {
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 1000)
    throw new RangeError('Invalid page size')
  const rows: T[] = []
  for (let from = 0; from < 200_000; from += pageSize) {
    const result = await read(from, from + pageSize - 1)
    if (result.error) return { data: null, error: result.error }
    rows.push(...(result.data ?? []))
    if (!result.data || result.data.length < pageSize) return { data: rows, error: null }
  }
  return {
    data: null,
    error: { message: 'Volume trop important pour cet export. Réduisez le périmètre.' },
  }
}
