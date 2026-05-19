/**
 * Normalize errors from Supabase, fetch, zod, etc. into a user-safe message.
 * Never leak SQL fragments or stack traces to the UI.
 */
export interface NormalizedError {
  message: string
  code?: string
}

const FALLBACK = 'Something went wrong. Please try again.'

const FRIENDLY_BY_CODE: Record<string, string> = {
  '23505': 'This entry already exists.',
  '23503': 'Cannot complete: a related record is missing.',
  '23514': 'Some fields are invalid.',
  '42501': 'You do not have permission to perform this action.',
  PGRST116: 'No matching record found.',
}

export function normalizeError(err: unknown): NormalizedError {
  if (!err) return { message: FALLBACK }

  if (typeof err === 'string') return { message: err }

  if (err instanceof Error) {
    return { message: err.message || FALLBACK }
  }

  if (typeof err === 'object') {
    const e = err as { code?: string; message?: string; details?: string }
    if (e.code && FRIENDLY_BY_CODE[e.code]) {
      return { message: FRIENDLY_BY_CODE[e.code], code: e.code }
    }
    if (e.message) {
      return { message: e.message, code: e.code }
    }
  }

  return { message: FALLBACK }
}

export function errorMessage(err: unknown): string {
  return normalizeError(err).message
}
