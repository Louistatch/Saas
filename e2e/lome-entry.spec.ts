import { test, expect, type Page } from '@playwright/test'
import { initialCityLife } from '../lib/haroolife/city/life'
import { gameAccount, GAME_ACCOUNT_ID } from './fixtures/game-account'

test.use({ actionTimeout: 15000 })

async function seedProgress(page: Page) {
  const state = initialCityLife()
  state.life.wallet = 5432
  await page.addInitScript((save) => {
    if (sessionStorage.getItem('entry-fixture-seeded')) return
    sessionStorage.setItem('entry-fixture-seeded', '1')
    localStorage.setItem('haroolife.lome-city.v1', JSON.stringify(save))
    localStorage.setItem('haroolife.avatar.chosen', '1')
  }, state)
}

test('anonymous visitors see the FaîtiereHub welcome on every game address, with no 3D assets loaded', async ({
  page,
}) => {
  const models: string[] = []
  page.on('request', (r) => {
    if (/\.(glb|bin)(\?|$)/.test(r.url())) models.push(r.url())
  })
  await page.addInitScript(() =>
    sessionStorage.setItem('haroolife.entered.v1', '11111111-1111-4111-8111-111111111111'),
  )
  for (const path of [
    '/haroolife',
    '/haroolife/territoire/lome',
    '/haroolife/territoire/carte?engine=three',
  ]) {
    await page.goto(path)
    const login = page.getByRole('link', { name: 'Se connecter avec FaîtiereHub' })
    await expect(login).toBeVisible()
    await expect(page.locator('canvas')).toHaveCount(0)
    await expect(page.getByRole('navigation', { name: 'Navigation du jeu' })).toHaveCount(0)
    expect(
      new URL((await login.getAttribute('href')) ?? '', 'https://fixture.test').searchParams.get(
        'redirect',
      ),
    ).toBe(path)
  }
  expect(models).toEqual([])
})

test('the normal FaîtiereHub login returns to the requested game, preserves progress and requires Continue', async ({
  page,
  context,
}, info) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await seedProgress(page)
  await page.goto('/haroolife?engine=haroo')
  await page.getByRole('link', { name: 'Se connecter avec FaîtiereHub' }).click()
  await expect(page.getByRole('heading', { name: 'Retrouvez HarooLife' })).toBeVisible()
  await page.getByLabel('Adresse email', { exact: true }).fill('admin@test.local')
  await page.getByLabel('Mot de passe', { exact: true }).fill('FixturePassword123!')
  await page.getByRole('button', { name: 'Se connecter', exact: true }).click()
  await expect(page).toHaveURL(/\/haroolife\?engine=haroo$/)
  await expect(page.getByRole('heading', { name: 'Bonjour, Admin' })).toBeVisible()
  await expect(page.getByTestId('saved-game-summary')).toContainText('5')
  await expect(page.locator('canvas')).toHaveCount(0)
  await page.screenshot({ path: info.outputPath('accueil-connecte.png') })
  await page.getByRole('button', { name: 'Continuer ma partie' }).click()
  await expect(page.getByRole('navigation', { name: 'Navigation du jeu' })).toBeVisible()
  expect(await page.evaluate(() => sessionStorage.getItem('haroolife.entered.v1'))).toBe(
    GAME_ACCOUNT_ID,
  )
  await page.reload()
  await expect(page.getByRole('navigation', { name: 'Navigation du jeu' })).toBeVisible()
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem('haroolife.lome-city.v1') ?? '{}').life.wallet,
    ),
  ).toBe(5432)
  // A remembered entry is not an identity. Expired/removed cookies return to the welcome.
  await context.clearCookies()
  await page.reload()
  await expect(page.getByRole('link', { name: 'Se connecter avec FaîtiereHub' })).toBeVisible()
  await expect(page.locator('canvas')).toHaveCount(0)
  expect(errors).toEqual([])
})

test('registration retains the game destination through the existing Haroo and operator choices', async ({
  page,
}) => {
  await page.goto('/auth/signup?redirect=%2Fharoolife%3Fengine%3Dthree')
  await page.getByRole('button', { name: /^Haroo Opportunités/ }).click()
  await page.getByRole('button', { name: /^Technicien agricole/ }).click()
  await expect(page).toHaveURL(/type=TECHNICIEN.*redirect=/)
  const login = page.getByRole('link', { name: 'Se connecter', exact: true })
  await expect(login).toHaveAttribute('href', /redirect=%2Fharoolife%3Fengine%3Dthree/)
  await page.goto('/auth/signup?redirect=%2Fharoolife')
  await page.getByRole('button', { name: /^FaîtiereHub Organisations/ }).click()
  await expect(page).toHaveURL(/signup\/operator\?redirect=%2Fharoolife$/)
})

test('email confirmation returns to HarooLife and consumes only its navigation cookie', async ({
  context,
}) => {
  await context.addCookies([
    {
      name: 'haroolife_return',
      value: encodeURIComponent('/haroolife?engine=three'),
      domain: '127.0.0.1',
      path: '/',
    },
  ])
  const response = await context.request.get('/auth/confirm?token_hash=fixture&type=signup', {
    maxRedirects: 0,
  })
  expect(response.status()).toBe(307)
  expect(new URL(response.headers().location).pathname).toBe('/haroolife')
  expect(new URL(response.headers().location).searchParams.get('engine')).toBe('three')
  expect(response.headers()['set-cookie']).toContain('haroolife_return=;')
})

test('the four bottom actions remain clickable when browser chrome shortens the visible viewport', async ({
  page,
  context,
}, info) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await gameAccount(context, page)
  await page.addInitScript(() => {
    const w = window as unknown as { __visibleHeight: number }
    w.__visibleHeight = 640
    if (window.visualViewport)
      Object.defineProperty(window.visualViewport, 'height', {
        get: () => w.__visibleHeight,
        configurable: true,
      })
  })
  await page.goto('/haroolife')
  const nav = page.getByRole('navigation', { name: 'Navigation du jeu' })
  await expect(nav).toBeVisible()
  await expect(page.getByText('Préparation de l’affichage 3D…', { exact: true })).toHaveCount(0)
  const withoutGraphics = await page
    .getByRole('button', { name: 'Réessayer l’affichage' })
    .isVisible()
  await expect.poll(async () => Math.round((await nav.boundingBox())?.y ?? 9999)).toBeLessThan(640)
  for (const label of ['Maison', 'Aménager', 'Carte', 'Téléphone']) {
    const button = nav.getByRole('button', { name: label, exact: true })
    const box = await button.boundingBox()
    expect(box).toBeTruthy()
    expect((box?.y ?? 9999) + (box?.height ?? 0)).toBeLessThanOrEqual(640)
    expect(box?.height).toBeGreaterThanOrEqual(44)
    const reachable = await button.evaluate((el) => {
      const r = el.getBoundingClientRect()
      return el.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2))
    })
    expect(reachable, label).toBe(true)
    await button.click()
    if (label === 'Carte') {
      if (withoutGraphics) {
        await expect(page.getByRole('dialog', { name: /^Explorer/ })).toBeVisible()
        await page.keyboard.press('Escape')
        await expect(page.getByRole('dialog')).toHaveCount(0)
      } else {
        await expect(page.getByRole('button', { name: 'Lieux et villes' })).toBeVisible()
        await button.click()
      }
    } else if (label === 'Téléphone') {
      await expect(page.getByRole('region', { name: 'Mon téléphone' })).toBeVisible()
      await page
        .getByRole('region', { name: 'Mon téléphone' })
        .getByRole('button', { name: 'Fermer', exact: true })
        .click()
    } else {
      await expect(page.getByRole('dialog')).toBeVisible()
      await expect
        .poll(async () => {
          const b = await page.getByRole('dialog').boundingBox()
          return Math.ceil((b?.y ?? 9999) + (b?.height ?? 0))
        })
        .toBeLessThanOrEqual(640)
      await page.keyboard.press('Escape')
      await expect(page.getByRole('dialog')).toHaveCount(0)
    }
  }
  await page.evaluate(() => {
    ;(window as unknown as { __visibleHeight: number }).__visibleHeight = 520
    window.visualViewport?.dispatchEvent(new Event('resize'))
  })
  await expect
    .poll(async () => {
      const b = await nav.boundingBox()
      return Math.round((b?.y ?? 9999) + (b?.height ?? 0))
    })
    .toBeLessThanOrEqual(520)
  await page.screenshot({ path: info.outputPath('navigation-viewport-reduit.png') })
  await page.setViewportSize({ width: 800, height: 412 })
  await page.evaluate(() => {
    ;(window as unknown as { __visibleHeight: number }).__visibleHeight = 360
    window.visualViewport?.dispatchEvent(new Event('resize'))
  })
  await expect
    .poll(async () => {
      const b = await nav.boundingBox()
      return Math.round((b?.y ?? 9999) + (b?.height ?? 0))
    })
    .toBeLessThanOrEqual(360)
  expect(errors).toEqual([])
})

test('a graphics error keeps the menu available and never replaces the saved balance', async ({
  page,
  context,
}) => {
  await gameAccount(context, page)
  await seedProgress(page)
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext
    HTMLCanvasElement.prototype.getContext = function (
      this: HTMLCanvasElement,
      type: string,
      ...args: unknown[]
    ) {
      if (type === 'webgl2') throw new Error('Graphics unavailable in fixture')
      return Reflect.apply(original, this, [type, ...args])
    } as typeof original
  })
  await page.goto('/haroolife')
  await expect(page.getByRole('button', { name: 'Réessayer l’affichage' })).toBeVisible()
  await expect(page.getByRole('navigation', { name: 'Navigation du jeu' })).toBeVisible()
  await page
    .getByRole('navigation', { name: 'Navigation du jeu' })
    .getByRole('button', { name: 'Carte' })
    .click()
  await expect(page.getByRole('dialog', { name: /^Explorer/ })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect
    .poll(() =>
      page.evaluate(
        () => JSON.parse(localStorage.getItem('haroolife.lome-city.v1') ?? '{}').life.wallet,
      ),
    )
    .toBe(5432)
  await page
    .getByRole('navigation', { name: 'Navigation du jeu' })
    .getByRole('button', { name: 'Téléphone' })
    .click()
  await expect(page.getByRole('region', { name: 'Mon téléphone' })).toBeVisible()
})

test('leaving the game returns to the signed-in welcome; changing account keeps the game destination and save', async ({
  page,
  context,
}) => {
  await gameAccount(context, page, { entered: false })
  await seedProgress(page)
  await page.goto('/haroolife')
  await page.getByRole('button', { name: 'Continuer ma partie' }).click()
  await page
    .getByRole('navigation', { name: 'Navigation du jeu' })
    .getByRole('button', { name: 'Téléphone' })
    .click()
  await page.getByRole('button', { name: /Réglages/ }).click()
  await page.getByRole('button', { name: 'Accueil HarooLife · Compte FaîtiereHub' }).click()
  await expect(page.getByRole('button', { name: 'Continuer ma partie' })).toBeVisible()
  await expect(page.locator('canvas')).toHaveCount(0)
  await page.getByRole('button', { name: 'Changer de compte' }).click()
  await expect(page).toHaveURL(/auth\/login\?redirect=%2Fharoolife$/)
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem('haroolife.lome-city.v1') ?? '{}').life.wallet,
    ),
  ).toBe(5432)
})
