import { safeInternalPath } from '../auth/safe-redirect'

/** Navigation intent only. This cookie never grants access or carries an identity. */
export const GAME_RETURN_COOKIE = 'haroolife_return'
export const GAME_ENTERED = 'haroolife.entered.v1'

export function gameReturnPath(raw: string | null | undefined): string | null {
  const safe = safeInternalPath(raw, 'https://faitierehub.invalid', { refuseAuthPages: true })
  return safe && /^\/haroolife(?:\/|\?|#|$)/.test(safe) ? safe : null
}

export function withGameReturn(href: string, returnTo: string | null): string {
  const target = gameReturnPath(returnTo)
  if (!target) return href
  const url = new URL(href, 'https://faitierehub.invalid')
  url.searchParams.set('redirect', target)
  return `${url.pathname}${url.search}${url.hash}`
}

export function gameReturnCookiePath(raw: string | undefined): string | null {
  try {
    return gameReturnPath(raw ? decodeURIComponent(raw) : null)
  } catch {
    return null
  }
}

/** An explicit destination wins over a leftover intent from another registration flow. */
export function resolveGameReturn(next: string | null, cookie: string | undefined): string | null {
  return next !== null ? gameReturnPath(next) : gameReturnCookiePath(cookie)
}

export function rememberGameReturn(path: string): void {
  const safe = gameReturnPath(path)
  if (!safe || typeof document === 'undefined') return
  document.cookie = `${GAME_RETURN_COOKIE}=${encodeURIComponent(safe)}; Path=/; Max-Age=2700; SameSite=Lax${location.protocol === 'https:' ? '; Secure' : ''}`
}

export function clearGameReturn(): void {
  if (typeof document !== 'undefined')
    document.cookie = `${GAME_RETURN_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`
}

export function rememberedGameReturn(): string | null {
  if (typeof document === 'undefined') return null
  try {
    const value = document.cookie
      .split('; ')
      .find((part) => part.startsWith(`${GAME_RETURN_COOKIE}=`))
    return gameReturnPath(
      value ? decodeURIComponent(value.slice(GAME_RETURN_COOKIE.length + 1)) : null,
    )
  } catch {
    return null
  }
}
