import { expect, openPlaces, test } from './lome-test'

/**
 * One national world: from Lomé the player opens the Togo map (sourced boundaries), takes
 * the bush taxi to Kara, finds that town's own buildings and actors loaded chunk by chunk
 * around the station, walks, and comes back to the estate untouched. The same street engine
 * serves both towns; no error may reach the console.
 */
type Live = {
  locality: string
  chunks: number
  buildings: number
  estateBuildings: number
  at: { x: number; y: number }
  wallet: number
  hour: number
  lastEvent: string
}
test('travel Lomé → Kara → Lomé inside the single 3D world', async ({ page }) => {
  test.setTimeout(240_000)
  const live = () =>
    page.evaluate(() => (window as unknown as { __LOME_CITY?: Live }).__LOME_CITY ?? null)
  /** Hours on the road can raise a life event with choices: answer it like a player would. */
  const settle = async () => {
    const dialog = page.locator('[aria-labelledby="event-title"]')
    for (let i = 0; i < 6 && (await dialog.isVisible().catch(() => false)); i++) {
      await dialog.getByRole('button').first().click()
      await page.waitForTimeout(400)
    }
    await expect(dialog).toBeHidden()
  }
  const openMap = async () => {
    await settle()
    await openPlaces(page)
  }
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => {
    if (m.type() === 'error' && /deleteBuffer|WebGL|GL_INVALID/i.test(m.text()))
      errors.push(m.text())
  })
  await page.goto('/haroolife', { waitUntil: 'domcontentloaded' })
  await expect(page.locator('canvas').first()).toBeVisible({ timeout: 30000 })
  await expect.poll(async () => (await live())?.chunks ?? 0).toBeGreaterThan(0)
  const home = await live()
  expect(home?.locality).toBe('lome')
  const estate = home?.estateBuildings ?? 0
  const wallet = home?.wallet ?? 0

  // The Togo map in the Explorer sheet: sourced boundaries, two poles, attribution.
  await openMap()
  const map = page.getByTestId('national-map')
  await expect(map).toBeVisible()
  await expect(map.getByText(/OpenStreetMap/)).toBeVisible()
  await expect(map.getByRole('button', { name: 'Lomé, vous êtes ici' })).toBeVisible()
  await map
    .getByRole('button', { name: /Voyager vers Kara/ })
    .first()
    .click()

  // Arrival: the locality switched, the sheet closed, Kara's chunks and buildings stream in.
  await expect.poll(async () => (await live())?.locality).toBe('kara')
  await expect(page.getByRole('heading', { name: 'Explorer Lomé' })).toBeHidden()
  await expect.poll(async () => (await live())?.chunks ?? 0, { timeout: 30000 }).toBeGreaterThan(0)
  await expect
    .poll(async () => (await live())?.buildings ?? 0, { timeout: 30000 })
    .toBeGreaterThan(80)
  const kara = await live()
  expect(kara?.wallet).toBe(wallet - 4000)
  expect(kara?.lastEvent).toMatch(/Arrivée à Kara/)
  expect(kara?.estateBuildings).toBe(estate)
  expect(await page.locator('canvas').count()).toBe(1)
  // Kara's own places appear in the Explorer sheet, none of Lomé's.
  await openMap()
  await expect(page.getByRole('button', { name: /Grand marché de Kara/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /Grand marché d’Assigamé/ })).toHaveCount(0)
  await expect(map.getByRole('button', { name: 'Kara, vous êtes ici' })).toBeVisible()
  await page.getByRole('button', { name: 'Fermer', exact: true }).click()
  // The map is a mode of its own (V3): back to the game to walk.
  const back = page.getByRole('button', { name: 'Retour au jeu' })
  if (await back.isVisible().catch(() => false)) await back.click()

  // A few steps in Kara's streets.
  const before = (await live())?.at
  await page.keyboard.down('ArrowLeft')
  await expect
    .poll(async () => {
      const after = (await live())?.at
      return `${after?.x},${after?.y}` !== `${before?.x},${before?.y}`
    })
    .toBe(true)
  await page.keyboard.up('ArrowLeft')
  await page.waitForTimeout(1500)
  expect(errors, 'no GPU or page error while in Kara').toEqual([])

  // The locality persists through a reload (the save carries the town).
  await page.waitForTimeout(800)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await expect(page.locator('canvas').first()).toBeVisible({ timeout: 30000 })
  await expect.poll(async () => (await live())?.locality).toBe('kara')
  await expect.poll(async () => (await live())?.chunks ?? 0, { timeout: 30000 }).toBeGreaterThan(0)

  // Back home: the estate is as it was.
  await openMap()
  await map
    .getByRole('button', { name: /Voyager vers Lomé/ })
    .first()
    .click()
  await expect.poll(async () => (await live())?.locality).toBe('lome')
  expect((await live())?.estateBuildings).toBe(estate)
  await expect.poll(async () => (await live())?.chunks ?? 0, { timeout: 30000 }).toBeGreaterThan(0)
  await settle()
  await page.waitForTimeout(1000)
  expect(errors).toEqual([])
})
