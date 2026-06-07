import { MAX_CSV_IMPORT_SIZE_BYTES } from '@/lib/constants'

/** MIME types that browsers commonly report for .csv files. */
const ACCEPTED_CSV_MIME_TYPES = new Set([
  'text/csv',
  'application/vnd.ms-excel',
  'text/plain',
  'application/csv',
  'text/x-csv',
  'application/x-csv',
  '', // some browsers/OSes send an empty type for .csv
])

/**
 * Validate that a File looks like a CSV: correct extension, a plausible
 * MIME type (clearly non-CSV types like images or executables are rejected),
 * and a reasonable size. Returns an error message in French, or null if OK.
 */
export function validateCsvFile(file: File): string | null {
  const name = file.name.toLowerCase()
  if (!name.endsWith('.csv')) {
    return 'Le fichier doit être au format CSV (.csv)'
  }
  if (file.type && !ACCEPTED_CSV_MIME_TYPES.has(file.type.toLowerCase())) {
    return 'Type de fichier invalide : seuls les fichiers CSV sont acceptés'
  }
  if (file.size > MAX_CSV_IMPORT_SIZE_BYTES) {
    return `Le fichier ne doit pas dépasser ${Math.floor(MAX_CSV_IMPORT_SIZE_BYTES / (1024 * 1024))} Mo`
  }
  return null
}

/**
 * Neutralize potential CSV/Excel formula injection by prefixing cell values
 * that start with =, +, -, @ (or tab/CR) with an apostrophe so spreadsheet
 * applications treat them as plain text rather than formulas.
 */
export function sanitizeCsvCell(value: string | undefined): string | undefined {
  if (value == null) return value
  if (/^[=+\-@\t\r]/.test(value)) {
    return `'${value}`
  }
  return value
}

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
      if (key) obj[key] = sanitizeCsvCell(value === '' ? undefined : value)
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
