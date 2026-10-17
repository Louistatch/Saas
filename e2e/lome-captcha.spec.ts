import { type Page, devices } from '@playwright/test'
import { arriveAsVisitor, expect, test } from './lome-test'

/**
 * With Turnstile on (a bundle built with NEXT_PUBLIC_TURNSTILE_SITE_KEY), every Supabase Auth call
 * made from the browser carries its token, as Supabase's CAPTCHA protection requires:
 *   - the visitor: « Jouer en visiteur » is not held by the check; it appears on the last step of
 *     the arrival, where the account is created; a refused token is replaced by a fresh one and
 *     « Emménager » works again, without starting over;
 *   - sign-in, password reset, confirmation e-mail sent again.
 * challenges.cloudflare.com is out of reach of the test machines: a local double stands in for
 * the Cloudflare script, and the mock Supabase checks the token as Cloudflare would (it accepts
 * the test token XXXX.DUMMY.TOKEN.XXXX only).
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
async function stubTurnstile(page: Page, tokens: string[], failedLoads = 0) {
  const double = `(() => {
    const tokens = ${JSON.stringify(tokens)}
    const t = (window.__turnstile = { renders: 0, resets: 0, removes: 0, live: 0 })
    const widgets = {}
    const solve = (id) =>
      setTimeout(() => {
        const w = widgets[id]
        const next = tokens.length > 1 ? tokens.shift() : tokens[0] ?? ${JSON.stringify(GOOD)}
        if (w && next === 'ERROR') w['error-callback']('110200')
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
  })()`
  let loads = 0
  await page.route('https://challenges.cloudflare.com/turnstile/**', (route) => {
    if (loads++ < failedLoads) return route.abort('failed')
    return route.fulfill({ contentType: 'text/javascript', body: double })
  })
}

type Counts = { renders: number; resets: number; removes: number; live: number }
const counts = (page: Page) =>
  page.evaluate(() => (window as unknown as { __turnstile?: Counts }).__turnstile ?? null)

/** The CAPTCHA token of each call to these Supabase Auth endpoints, in order. */
function sentTokens(page: Page, endpoint: RegExp) {
  const sent: (string | null)[] = []
  page.on('request', (r) => {
    const path = new URL(r.url()).pathname
    if (r.method() !== 'POST' || !endpoint.test(path)) return
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
  const signups = sentTokens(page, /^\/auth\/v1\/signup$/)
  await page.goto('/haroolife', { waitUntil: 'domcontentloaded' })
  await arriveAsVisitor(page, async (step) => {
    if (step !== '5-logement') return
    const home = page.locator('[aria-pressed="true"]').filter({ hasText: 'Tu démarres avec' })
    const before = await home.innerText()
    const retry = page.getByRole('button', { name: 'Relancer la vérification' })
    await expect(retry).toBeVisible()
    await expect(retry).toBeInViewport()
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
    Date.now = () => before() + 300_001
  })
  await button.click()
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
