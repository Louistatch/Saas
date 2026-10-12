import { expect, test } from './lome-test'

/**
 * GPU lifecycle regression: the production crash `Cannot read properties of null (reading
 * 'deleteBuffer')` appeared on Android after repeated navigations between the 3D experiences.
 * Since the unification the HarooLife layout mounts a single PlayCanvas application and the
 * addresses (/haroolife, /haroolife/territoire, /haroolife/territoire/lome) are modules of
 * that one world: a client-side transition must keep the same canvas alive, a full reload or
 * a dead WebGL context must release GPU resources without touching a dead device.
 */
test('repeated 3D transitions, backgrounding and WebGL context loss never throw', async ({
  page,
}, testInfo) => {
  const transitions = /mobile/.test(testInfo.project.name) ? 20 : 10
  test.setTimeout(420_000)
  const errors: string[] = []
  page.on('pageerror', (e) => {
    errors.push(e.message)
    console.log('[pageerror]', e.stack)
  })
  page.on('console', (m) => {
    if (m.type() === 'error' && /deleteBuffer|WebGL|GL_INVALID/i.test(m.text()))
      errors.push(m.text())
    if (m.type() === 'error' && process.env.PW_GPU_DEBUG) {
      for (const a of m.args())
        a.evaluate((v: unknown) => (v instanceof Error ? v.stack : String(v)))
          .then((t) => console.log('[console.error]', t))
          .catch(() => {})
    }
  })
  const canvas = page.locator('canvas')
  /** Marks the live canvas so a later check can tell a surviving engine from a remount. */
  const tag = (token: string) =>
    canvas.first().evaluate((c, t) => {
      ;(c as HTMLCanvasElement).dataset.engine = t
    }, token)
  const engineOf = () => canvas.first().getAttribute('data-engine')

  await page.goto('/haroolife', { waitUntil: 'domcontentloaded' })
  await expect(canvas.first()).toBeVisible({ timeout: 30000 })
  await page.waitForTimeout(2500)
  await tag('first')

  for (let i = 0; i < transitions; i++) {
    // Lomé → module « Construire » through the in-game link: same world, same canvas.
    await page.locator('button[role="status"]').first().click() // opens the life journal
    await page.getByRole('link', { name: 'Ouvrir HarooVille' }).click()
    await expect(page).toHaveURL(/\/haroolife\/territoire$/)
    await expect(page.getByRole('heading', { name: 'Construire' })).toBeVisible()
    expect(await canvas.count(), 'one WebGL canvas at a time').toBe(1)
    expect(await engineOf(), 'the engine survives the route change').toBe('first')
    // Back to the walk through the browser history.
    await page.goBack()
    await expect(page).toHaveURL(/\/haroolife$/)
    await expect(page.getByRole('heading', { name: 'Construire' })).toBeHidden()
    expect(await engineOf()).toBe('first')
    await page.waitForTimeout(400)
    if (i % 3 === 1) {
      // Android: app sent to the background and brought back.
      await page.evaluate(() => {
        Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true })
        document.dispatchEvent(new Event('visibilitychange'))
      })
      await page.waitForTimeout(300)
      await page.evaluate(() => {
        Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
        document.dispatchEvent(new Event('visibilitychange'))
      })
    }
    if (i % 5 === 4) {
      // A full reload at the old Lomé address: the previous application is torn down with
      // the document, a new one starts, and the old URL still lands in the same world.
      await page.goto('/haroolife/territoire/lome', { waitUntil: 'domcontentloaded' })
      await expect(canvas.first()).toBeVisible({ timeout: 30000 })
      await page.waitForTimeout(1500)
      await tag('first')
      await page.goBack()
      await expect(page).toHaveURL(/\/haroolife$/)
      await expect(canvas.first()).toBeVisible({ timeout: 30000 })
      await page.waitForTimeout(800)
      await tag('first')
    }
    expect(errors, `after transition ${i + 1}`).toEqual([])
  }

  // WebGL context lost and restored by the driver while the city is on screen.
  const lost = await page.evaluate(async () => {
    const c = document.querySelector('canvas') as HTMLCanvasElement | null
    const gl = c?.getContext('webgl2') ?? c?.getContext('webgl')
    const ext = gl?.getExtension('WEBGL_lose_context')
    if (!ext) return 'no-extension'
    ext.loseContext()
    await new Promise((r) => setTimeout(r, 800))
    ext.restoreContext()
    await new Promise((r) => setTimeout(r, 2500))
    return gl?.isContextLost() ? 'still-lost' : 'restored'
  })
  expect(lost).toBe('restored')
  await page.waitForTimeout(1500)
  await expect(canvas.first()).toBeVisible()
  expect(errors).toEqual([])
})

test('HarooVille constructions are brought into the 3D world once', async ({ page }) => {
  await page.goto('/haroolife', { waitUntil: 'domcontentloaded' })
  await expect(page.locator('canvas').first()).toBeVisible({ timeout: 30000 })
  const before = await page.evaluate(
    () =>
      (window as unknown as { __LOME_CITY?: { estateBuildings: number } }).__LOME_CITY
        ?.estateBuildings,
  )
  expect(before).toBeGreaterThan(0)
  // An old HarooVille save: the initial estate plus two houses on free cells.
  await page.evaluate(() => {
    localStorage.removeItem('haroolife.lome-city.v1')
    localStorage.removeItem('haroolife.citybuilder.imported')
    const save = {
      version: 1,
      day: 9,
      coins: 1200,
      wood: 40,
      maize: 10,
      flour: 4,
      food: 20,
      population: 14,
      happiness: 70,
      buildings: [
        { x: 11, y: 10, type: 'hall' },
        { x: 3, y: 3, type: 'house' },
        { x: 4, y: 3, type: 'house' },
        { x: 3, y: 4, type: 'road' },
      ],
      log: [],
    }
    localStorage.setItem('haroolife.citybuilder.v1', JSON.stringify(save))
  })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await expect(page.locator('canvas').first()).toBeVisible({ timeout: 30000 })
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as unknown as { __LOME_CITY?: { estateBuildings: number } }).__LOME_CITY
            ?.estateBuildings,
      ),
    )
    .toBe((before as number) + 3)
  expect(
    await page.evaluate(() => localStorage.getItem('haroolife.citybuilder.imported')),
  ).not.toBeNull()
  expect(await page.evaluate(() => localStorage.getItem('haroolife.citybuilder.v1'))).not.toBeNull()
  // A second load does not import twice.
  await page.reload({ waitUntil: 'domcontentloaded' })
  await expect(page.locator('canvas').first()).toBeVisible({ timeout: 30000 })
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as unknown as { __LOME_CITY?: { estateBuildings: number } }).__LOME_CITY
            ?.estateBuildings,
      ),
    )
    .toBe((before as number) + 3)
})
