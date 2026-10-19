import type { BrowserContext, Page } from '@playwright/test'

export const GAME_ACCOUNT_ID = '11111111-1111-4111-8111-111111111111'
export function gameSessionCookie(id = GAME_ACCOUNT_ID) {
  const b64 = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url')
  const session = {
    access_token: `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: id, role: 'authenticated', aud: 'authenticated', exp: 4102444800 })}.c2ln`,
    refresh_token: 'fixture-refresh',
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    user: {
      id,
      aud: 'authenticated',
      role: 'authenticated',
      email: 'admin@test.local',
      app_metadata: { role: 'super_admin' },
      user_metadata: {},
    },
  }
  return {
    name: 'sb-127-auth-token',
    value: `base64-${b64(session)}`,
    domain: '127.0.0.1',
    path: '/',
  }
}

/** A real SDK session against the isolated local Supabase fixture, never a production bypass. */
export async function gameAccount(context: BrowserContext, page?: Page, { entered = true } = {}) {
  await context.addCookies([gameSessionCookie()])
  const seed = (id: string) => {
    localStorage.setItem('haroolife.avatar.chosen', '1')
    if (id) sessionStorage.setItem('haroolife.entered.v1', id)
  }
  if (page) await page.addInitScript(seed, entered ? GAME_ACCOUNT_ID : '')
  else await context.addInitScript(seed, entered ? GAME_ACCOUNT_ID : '')
}
