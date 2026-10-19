import { type Page, devices } from '@playwright/test'
import { arriveAsVisitor, expect, test } from './lome-test'

/**
 * With Turnstile on (a bundle built with NEXT_PUBLIC_TURNSTILE_SITE_KEY), every Supabase Auth call
 * made from the browser carries its token, as Supabase's CAPTCHA protection requires:
 *   - the visitor: « Jouer en visiteur » is not held by the check; it appears on the last step of
 *     the arrival, where the account is created; a refused token is replaced by a fresh one and
 *     « Emménager » works again, without starting over;
 *   - sign-in, password reset, confirmation e-mail sent again.
 * A local double keeps CI deterministic; the real library is checked separately with its
 * official test key. The mock Supabase accepts XXXX.DUMMY.TOKEN.XXXX only.
 */
test.skip(
  !process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY,
  'bundle built without NEXT_PUBLIC_TURNSTILE_SITE_KEY: the check is off',
)

const GOOD = 'XXXX.DUMMY.TOKEN.XXXX'

/**
 * Each check solves itself with the next token of `tokens` (the last one repeats); « ERROR »
 * stands for Cloudflare refusing the check (a wrong key or domain).
 */
async function stubTurnstile(page: Page, tokens: string[], failedLoads = 0, readyDelay = 0) {
  const double = `(() => {
    const source = new URL(document.currentScript.src)
    const initialize = () => {
    const tokens = ${JSON.stringify(tokens)}
    const t = (window.__turnstile = { renders: 0, resets: 0, removes: 0, live: 0 })
    const widgets = {}
    const solve = (id) =>
      setTimeout(() => {
        const w = widgets[id]
        const next = tokens.length > 1 ? tokens.shift() : tokens[0] ?? ${JSON.stringify(GOOD)}
        if (w && next.startsWith('ERROR')) w['error-callback'](next.split(':')[1] || '110200')
        else if (w && next !== 'PENDING') w.callback(next)
      }, 300)
    window.turnstile = {
      render(el, opts) {
        const id = 'w' + ++t.renders
        widgets[id] = opts
        t.live++
        el.setAttribute('data-turnstile', opts.sitekey)
        // Drawn as when Cloudflare needs the person (a 300 × 65 box), the case to keep in view.
        const box = document.createElement('div')
        box.style.cssText = 'width:300px;height:65px;background:#e8e8e8'
        el.replaceChildren(box)
        opts.el = el
        solve(id)
        return id
      },
      reset(id) {
        t.resets++
        solve(id)
      },
      remove(id) {
        if (widgets[id]) {
          t.live--
          widgets[id].el.replaceChildren()
        }
        t.removes++
        delete widgets[id]
      },
    }
    t.expire = () => Object.values(widgets).forEach(w => w['expired-callback']())
    t.solve = () => Object.values(widgets).forEach(w => w.callback(${JSON.stringify(GOOD)}))
    const onload = source.searchParams.get('onload')
    if (onload) window[onload]?.()
    }
    if (${readyDelay} > 0) setTimeout(initialize, ${readyDelay})
    else initialize()
  })()`
  let loads = 0
  await page.route('https://challenges.cloudflare.com/turnstile/**', (route) => {
    if (loads++ < failedLoads) return route.abort('failed')
    return route.fulfill({
      contentType: 'text/javascript',
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: double,
    })
  })
}

type Counts = { renders: number; resets: number; removes: number; live: number }
const counts = (page: Page) =>
  page.evaluate(() => (window as unknown as { __turnstile?: Counts }).__turnstile ?? null)

/** The CAPTCHA token of each call to these Supabase Auth endpoints, in order. */
function sentTokens(page: Page, endpoint: RegExp) {
  const sent: (string | null)[] = []
  page.on('request', (r) => {
    const url = new URL(r.url())
    const path = url.pathname
    if (r.method() !== 'POST' || !endpoint.test(path)) return
    // Session refresh is exempt from CAPTCHA; only password sign-in is protected at /token.
    if (path === '/auth/v1/token' && url.searchParams.get('grant_type') !== 'password') return
    const body = r.postDataJSON() as { gotrue_meta_security?: { captcha_token?: string } } | null
    sent.push(body?.gotrue_meta_security?.captcha_token ?? null)
  })
  return sent
}

test('the visitor arrival carries the anti-robot token, and gets a fresh one after a refusal', async ({
  browser,
  baseURL,
}, testInfo) => {
  test.setTimeout(150_000)
  const device = /mobile/.test(testInfo.project.name)
    ? { ...devices['Pixel 7'], viewport: { width: 412, height: 915 } }
    : { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } }
  const context = await browser.newContext({ ...device, baseURL })
  const page = await context.newPage()
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  // The first token is refused (as Cloudflare would refuse a forged or replayed one).
  await stubTurnstile(page, ['BAD.TOKEN', GOOD])
  const signups = sentTokens(page, /^\/auth\/v1\/signup$/)
  await page.goto('/haroolife', { waitUntil: 'domcontentloaded' })

  // The entry screen: the script is fetched ahead, but no check holds « Jouer en visiteur ».
  await expect.poll(() => counts(page)).not.toBeNull()
  await expect(page.getByRole('button', { name: 'Jouer en visiteur' })).toBeEnabled()
  expect((await counts(page))?.renders).toBe(0)

  await arriveAsVisitor(page, async (step) => {
    // No check before the last step: nothing is created before « Emménager ».
    if (step !== '5-logement') expect((await counts(page))?.live).toBe(0)
    else await expect.poll(async () => (await counts(page))?.live).toBe(1)
  })
  // The refused token: said plainly and on screen (below the homes on a phone), the step kept,
  // a fresh check under way, its box above « Emménager ».
  const alert = page.getByTestId('arrival').getByRole('alert')
  await expect(alert).toContainText('Vérification anti-robot à refaire')
  await expect(alert).toBeInViewport()
  await expect(page.getByTestId('arrival')).toHaveAttribute('data-step', '4')
  await expect.poll(async () => (await counts(page))?.resets).toBe(1)
  await expect(page.locator('[data-turnstile]')).toBeInViewport()
  await expect(page.getByRole('button', { name: 'Emménager' })).toBeEnabled()
  await page.screenshot({
    path: testInfo.outputPath(`captcha-refuse-${testInfo.project.name}.png`),
  })
  await page.getByRole('button', { name: 'Emménager' }).click()

  await expect(page.locator('canvas:visible').first()).toBeVisible({ timeout: 30000 })
  expect(signups).toEqual(['BAD.TOKEN', GOOD])
  // The check left with the arrival.
  await expect.poll(async () => (await counts(page))?.live).toBe(0)
  expect(errors).toEqual([])
  await context.close()
})

test('the official ready callback can arrive after the script load event', async ({
  browser,
  baseURL,
}) => {
  const context = await browser.newContext({ baseURL })
  const page = await context.newPage()
  await stubTurnstile(page, [GOOD], 0, 700)
  await page.goto('/auth/login', { waitUntil: 'domcontentloaded' })
  await expect(page.getByText('Vérification anti-robot réussie.')).toBeVisible()
  await expect(page.getByRole('button', { name: /^Se connecter$/ })).toBeEnabled()
  await expect(page.getByRole('button', { name: 'Relancer la vérification' })).toHaveCount(0)
  expect(await page.locator('script[src*="turnstile/v0/api.js"]').getAttribute('crossorigin')).toBe(
    'anonymous',
  )
  await context.close()
})

test('a warm scanner worker excludes third-party checks and clears its old cache', async ({
  browser,
  baseURL,
}) => {
  const context = await browser.newContext({ baseURL })
  const page = await context.newPage()
  await stubTurnstile(page, [GOOD])
  await page.goto('/robots.txt')
  await page.evaluate(async () => {
    const old = await caches.open('coopscan-v1')
    await old.put(
      'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit',
      new Response('/* unusable cached script */'),
    )
    await caches.open('game-assets-kept')
    await navigator.serviceWorker.register('/sw.js')
    await navigator.serviceWorker.ready
  })
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true)
  const keys = await page.evaluate(() => caches.keys())
  expect(keys).not.toContain('coopscan-v1')
  expect(keys).toContain('game-assets-kept')
  await page.goto('/auth/login', { waitUntil: 'domcontentloaded' })
  await expect(page.getByText('Vérification anti-robot réussie.')).toBeVisible()
  await expect(page.getByRole('button', { name: /^Se connecter$/ })).toBeEnabled()
  expect(await page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true)
  await context.close()
})

test('sign-in, password reset and the confirmation e-mail carry the anti-robot token', async ({
  browser,
  baseURL,
}) => {
  const context = await browser.newContext({ baseURL })
  const page = await context.newPage()
  await stubTurnstile(page, [GOOD])

  // Password reset: the button waits for the check, then the token goes with the request.
  const recover = sentTokens(page, /^\/auth\/v1\/recover$/)
  await page.goto('/auth/forgot-password', { waitUntil: 'domcontentloaded' })
  await page.getByLabel('Adresse email').fill('kossi@example.tg')
  await page.getByRole('button', { name: 'Envoyer le lien de réinitialisation' }).click()
  await expect.poll(() => recover).toEqual([GOOD])

  // The confirmation e-mail sent again.
  const resend = sentTokens(page, /^\/auth\/v1\/resend$/)
  await page.goto('/auth/verify-email?email=kossi%40example.tg', { waitUntil: 'domcontentloaded' })
  await page.getByRole('button', { name: "Renvoyer l'email" }).click()
  await expect(page.getByText('Email renvoyé.')).toBeVisible()
  expect(resend).toEqual([GOOD])

  // Sign-in (grant « password »).
  const signIn = sentTokens(page, /^\/auth\/v1\/token$/)
  await page.goto('/auth/login', { waitUntil: 'domcontentloaded' })
  await page.getByLabel('Adresse email').fill('kossi@example.tg')
  await page.getByLabel('Mot de passe', { exact: true }).fill('un-mot-de-passe-de-test')
  await page.getByRole('button', { name: /^Se connecter$/ }).click()
  await expect.poll(() => signIn[0]).toBe(GOOD)
  await context.close()
})

test('a failed check blocks account creation and can be retried without losing the arrival choices', async ({
  browser,
  baseURL,
}) => {
  const context = await browser.newContext({ baseURL })
  const page = await context.newPage()
  await stubTurnstile(page, ['ERROR', GOOD])
  const reports: { message: string; route: string; digest: string | null }[] = []
  await page.route('**/api/errors', (route) => {
    reports.push(route.request().postDataJSON())
    return route.fulfill({ json: { ok: true } })
  })
  const signups = sentTokens(page, /^\/auth\/v1\/signup$/)
  await page.goto('/haroolife', { waitUntil: 'domcontentloaded' })
  await arriveAsVisitor(page, async (step) => {
    if (step !== '5-logement') return
    const home = page.locator('[aria-pressed="true"]').filter({ hasText: 'Tu démarres avec' })
    const before = await home.innerText()
    const retry = page.getByRole('button', { name: 'Relancer la vérification' })
    await expect(retry).toBeVisible()
    await expect(retry).toBeInViewport()
    await expect(page.getByText('Code du contrôle : 110200')).toBeVisible()
    await expect(page.getByText(/n’est pas autorisé pour ce site/)).toBeVisible()
    await expect
      .poll(() => reports)
      .toEqual([{ message: 'Turnstile domain: 110200', route: '/haroolife', digest: null }])
    await expect(page.getByRole('button', { name: 'Emménager' })).toBeDisabled()
    expect(signups).toEqual([])
    await retry.click()
    await expect(page.getByText('Vérification anti-robot réussie.')).toBeVisible()
    expect(await home.innerText()).toBe(before)
  })
  await expect(page.getByTestId('arrival')).toHaveCount(0)
  expect(signups).toEqual([GOOD])
  await context.close()
})

test('a slow mobile script download is not rejected after only fifteen seconds', async ({
  browser,
  baseURL,
}) => {
  const context = await browser.newContext({ baseURL })
  const page = await context.newPage()
  await page.clock.install()
  await stubTurnstile(page, [GOOD])
  let release = () => {}
  const downloading = new Promise<void>((resolve) => {
    release = resolve
  })
  let requested = false
  await page.route('https://challenges.cloudflare.com/turnstile/**', async (route) => {
    requested = true
    await downloading
    await route.fallback()
  })
  await page.goto('/auth/login', { waitUntil: 'domcontentloaded' })
  await expect.poll(() => requested).toBe(true)
  await page.clock.fastForward(16_000)
  await expect(page.getByText('Vérification anti-robot en cours…')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Relancer la vérification' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: /^Se connecter$/ })).toBeDisabled()
  release()
  await expect.poll(async () => (await counts(page))?.live).toBe(1)
  await page.clock.runFor(400)
  await expect(page.getByRole('button', { name: /^Se connecter$/ })).toBeEnabled()
  await context.close()
})

test('a blocked script can be loaded again and Enter never submits without a token', async ({
  browser,
  baseURL,
}) => {
  const context = await browser.newContext({ baseURL })
  const page = await context.newPage()
  await stubTurnstile(page, [GOOD], 1)
  const signIn = sentTokens(page, /^\/auth\/v1\/token$/)
  await page.goto('/auth/login', { waitUntil: 'domcontentloaded' })
  await page.getByLabel('Adresse email').fill('kossi@example.tg')
  await page.getByLabel('Mot de passe', { exact: true }).fill('un-mot-de-passe-de-test')
  const button = page.getByRole('button', { name: /^Se connecter$/ })
  const retry = page.getByRole('button', { name: 'Relancer la vérification' })
  await expect(retry).toBeVisible()
  await expect(button).toBeDisabled()
  // A native form submission can bypass a disabled button; the handler must guard it too.
  await page.locator('form').dispatchEvent('submit')
  await expect(
    page.getByText('Terminez la vérification anti-robot ci-dessous avant de vous connecter.'),
  ).toBeVisible()
  expect(signIn).toEqual([])
  await retry.click()
  await expect(button).toBeEnabled()
  await button.click()
  await expect.poll(() => signIn.length).toBe(1)
  expect(signIn).toEqual([GOOD])
  await context.close()
})

test('an expired token is renewed before a protected submission', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ baseURL })
  const page = await context.newPage()
  await stubTurnstile(page, [GOOD, 'PENDING'])
  const recover = sentTokens(page, /^\/auth\/v1\/recover$/)
  await page.goto('/auth/forgot-password', { waitUntil: 'domcontentloaded' })
  await page.getByLabel('Adresse email').fill('kossi@example.tg')
  const button = page.getByRole('button', { name: 'Envoyer le lien de réinitialisation' })
  await expect(button).toBeEnabled()
  await page.evaluate(() => {
    const t = (window as unknown as { __turnstile: { expire: () => void } }).__turnstile
    t.expire()
  })
  await expect(button).toBeDisabled()
  await expect.poll(async () => (await counts(page))?.resets).toBe(1)
  expect(recover).toEqual([])
  await page.evaluate(() => {
    ;(window as unknown as { __turnstile: { solve: () => void } }).__turnstile.solve()
  })
  await button.click()
  await expect.poll(() => recover).toEqual([GOOD])
  await context.close()
})

test('a token older than five minutes is rejected even before its expiry callback runs', async ({
  browser,
  baseURL,
}) => {
  const context = await browser.newContext({ baseURL })
  const page = await context.newPage()
  await stubTurnstile(page, [GOOD, 'PENDING'])
  const signIn = sentTokens(page, /^\/auth\/v1\/token$/)
  await page.goto('/auth/login', { waitUntil: 'domcontentloaded' })
  await page.getByLabel('Adresse email').fill('kossi@example.tg')
  await page.getByLabel('Mot de passe', { exact: true }).fill('un-mot-de-passe-de-test')
  const button = page.getByRole('button', { name: /^Se connecter$/ })
  await expect(button).toBeEnabled()
  await page.evaluate(() => {
    const before = Date.now
    try {
      Date.now = () => before() + 300_001
      document
        .querySelector('form')
        ?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    } finally {
      // Keep Auth's session refresh clock real; the stale read is the synchronous submit guard.
      Date.now = before
    }
  })
  await expect(button).toBeDisabled()
  await expect.poll(async () => (await counts(page))?.resets).toBe(1)
  expect(signIn).toEqual([])
  await page.evaluate(() => {
    ;(window as unknown as { __turnstile: { solve: () => void } }).__turnstile.solve()
  })
  await button.click()
  await expect.poll(() => signIn).toEqual([GOOD])
  await context.close()
})
