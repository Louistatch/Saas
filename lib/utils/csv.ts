/**
 * Minimal RFC 4180-ish CSV parser.
 * Supports quoted fields, escaped quotes, and \r\n / \n line endings.
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          cell += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        cell += c
      }
    } else {
      if (c === '"') {
        inQuotes = true
      } else if (c === ',') {
        row.push(cell)
        cell = ''
      } else if (c === '\r') {
        // skip; handled by \n
      } else if (c === '\n') {
        row.push(cell)
        rows.push(row)
        row = []
        cell = ''
      } else {
        cell += c
      }
    }
  }
  if (cell !== '' || row.length > 0) {
    row.push(cell)
    rows.push(row)
  }
  return rows.filter((r) => r.length > 0 && !(r.length === 1 && r[0] === ''))
}

/**
 * Parse a CSV with a header row into typed objects.
 * Headers are case-insensitive and trimmed.
 */
export function parseCsvWithHeaders<T extends Record<string, string | undefined>>(
  text: string,
  expected: readonly string[],
): { rows: T[]; missing: string[] } {
  const grid = parseCsv(text)
  if (grid.length === 0) return { rows: [], missing: [...expected] }
  const headers = grid[0].map((h) => h.trim().toLowerCase())
  const missing = expected.filter(
    (e) => !headers.includes(e.toLowerCase()),
  )
  const rows: T[] = []
  for (let i = 1; i < grid.length; i++) {
    const obj: Record<string, string | undefined> = {}
    grid[i].forEach((value, idx) => {
      const key = headers[idx]
      if (key) obj[key] = value === '' ? undefined : value
    })
    rows.push(obj as T)
  }
  return { rows, missing }
}

/**
 * Convert an array of objects into a CSV string.
 */
export function toCsv<T extends Record<string, unknown>>(
  rows: T[],
  columns: (keyof T)[],
): string {
  const escape = (v: unknown) => {
    const s = v == null ? '' : String(v)
    if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`
    return s
  }
  const lines = [columns.map((c) => String(c)).join(',')]
  for (const row of rows) {
    lines.push(columns.map((c) => escape(row[c])).join(','))
  }
  return lines.join('\n')
}

export function downloadCsv(filename: string, csv: string) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
