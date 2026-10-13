/**
 * Where to send someone after login, from a `?redirect=` value. Internal paths only: « /\evil.com »
 * and « //evil.com » are read by browsers as another host, so the value is resolved against the
 * site's own origin and must stay on it. With `refuseAuthPages`, /auth/* is refused too (the
 * middleware would bounce a signed-in person straight back to it).
 */
export function safeInternalPath(
  raw: string | null | undefined,
  origin: string,
  { refuseAuthPages = false }: { refuseAuthPages?: boolean } = {},
): string | null {
  if (!raw || !raw.startsWith('/') || raw.includes('\\')) return null
  try {
    const url = new URL(raw, origin)
    if (url.origin !== origin) return null
    if (refuseAuthPages && url.pathname.startsWith('/auth/')) return null
    return `${url.pathname}${url.search}${url.hash}`
  } catch {
    return null
  }
}

/** A Haroo-only or operator account never goes to the cooperative dashboard or the admin area. */
export function isOrgOnlyPath(path: string): boolean {
  return /^\/(dashboard|admin)(\/|$|\?|#)/.test(path)
}

/**
 * Query flag set by the client-side guard when the browser has no session although the server
 * let the page through (stale cookie, Supabase unreachable from the phone). The middleware then
 * shows the login form instead of sending the person back, which would loop forever.
 */
export const STALE_SESSION_PARAM = 'stale'
