import { expect, test } from './lome-test'

/**
 * GPU lifecycle regression: the production crash `Cannot read properties of null (reading
 * 'deleteBuffer')` appeared on Android after repeated navigations between the 3D experiences.
 * Client-side transitions unmount one PlayCanvas application and mount another; GPU
 * resources released after the device is gone must never touch a dead WebGL context.
 */
const TRANSITIONS = 10

test('repeated 3D transitions, backgrounding and WebGL context loss never throw', async ({
  page,
}) => {
  test.setTimeout(240_000)
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

  await page.goto('/haroolife/territoire/lome', { waitUntil: 'domcontentloaded' })
  await expect(page.locator('canvas').first()).toBeVisible({ timeout: 30000 })
  await page.waitForTimeout(2500)

  for (let i = 0; i < TRANSITIONS; i++) {
    // Lomé 3D → HarooVille (3D builder) through the in-game link, then back through its link.
    await page.locator('button[role="status"]').first().click() // opens the life journal
    await page.getByRole('link', { name: 'Ouvrir HarooVille' }).click()
    await expect(page).toHaveURL(/\/haroolife\/territoire$/)
    await expect(page.locator('canvas').first()).toBeVisible({ timeout: 30000 })
    await page.waitForTimeout(600)
    expect(await page.locator('canvas').count(), 'one WebGL canvas at a time').toBeLessThanOrEqual(
      1,
    )
    await page
      .getByRole('link', { name: /Lomé Life 3D/ })
      .first()
      .click()
    await expect(page).toHaveURL(/\/haroolife\/territoire\/lome$/)
    await expect(page.locator('canvas').first()).toBeVisible({ timeout: 30000 })
    await page.waitForTimeout(600)
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
    if (i % 3 === 2) {
      // Browser history instead of links.
      await page.goBack()
      await expect(page).toHaveURL(/\/haroolife\/territoire$/)
      await page.waitForTimeout(500)
      await page.goForward()
      await expect(page).toHaveURL(/\/haroolife\/territoire\/lome$/)
      await expect(page.locator('canvas').first()).toBeVisible({ timeout: 30000 })
      await page.waitForTimeout(600)
    }
    expect(errors, `after transition ${i + 1}`).toEqual([])
  }

  // WebGL context lost and restored by the driver while the city is on screen.
  const lost = await page.evaluate(async () => {
    const canvas = document.querySelector('canvas') as HTMLCanvasElement | null
    const gl = canvas?.getContext('webgl2') ?? canvas?.getContext('webgl')
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
  await expect(page.locator('canvas').first()).toBeVisible()
  expect(errors).toEqual([])
})
