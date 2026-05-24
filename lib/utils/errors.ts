/**
 * Normalize errors from Supabase, fetch, zod, etc. into a user-safe message.
 * Never leak SQL fragments or stack traces to the UI.
 */
export interface NormalizedError {
  message: string
  code?: string
}

const FALLBACK = 'Something went wrong. Please try again.'

/** Auth-specific error messages — generic to prevent user enumeration */
const AUTH_ERROR_MAP: Record<string, string> = {
  'Invalid login credentials': 'Email ou mot de passe incorrect.',
  'Email not confirmed': 'Veuillez confirmer votre email avant de vous connecter.',
  'User not found': 'Email ou mot de passe incorrect.',
  'Invalid email or password': 'Email ou mot de passe incorrect.',
  'Email rate limit exceeded': 'Trop de tentatives. Réessayez dans quelques minutes.',
  'User already registered': 'Un compte existe déjà avec cet email.',
  'Signup requires a valid password': 'Le mot de passe est invalide.',
  'User banned': 'Ce compte a été désactivé. Contactez l\'administrateur.',
}

const FRIENDLY_BY_CODE: Record<string, string> = {
  '23505': 'This entry already exists.',
  '23503': 'Cannot complete: a related record is missing.',
  '23514': 'Some fields are invalid.',
  '42501': 'You do not have permission to perform this action.',
  PGRST116: 'No matching record found.',
}

export function normalizeError(err: unknown): NormalizedError {
  if (!err) return { message: FALLBACK }

  if (typeof err === 'string') {
    // Check auth error map first
    if (AUTH_ERROR_MAP[err]) return { message: AUTH_ERROR_MAP[err] }
    return { message: err }
  }

  if (err instanceof Error) {
    // Check auth error map for Supabase AuthError messages
    if (AUTH_ERROR_MAP[err.message]) {
      return { message: AUTH_ERROR_MAP[err.message] }
    }
    return { message: err.message || FALLBACK }
  }

  if (typeof err === 'object') {
    const e = err as { code?: string; message?: string; details?: string }
    if (e.code && FRIENDLY_BY_CODE[e.code]) {
      return { message: FRIENDLY_BY_CODE[e.code], code: e.code }
    }
    if (e.message) {
      // Check auth error map
      if (AUTH_ERROR_MAP[e.message]) {
        return { message: AUTH_ERROR_MAP[e.message], code: e.code }
      }
      return { message: e.message, code: e.code }
    }
  }

  return { message: FALLBACK }
}

export function errorMessage(err: unknown): string {
  return normalizeError(err).message
}
