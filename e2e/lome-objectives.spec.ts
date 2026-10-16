import { expect, test } from './lome-test'

/**
 * « Travailler & gagner » and « Mes objectifs » lead to the real actions: choosing a job closes
 * the sheet and walks the player to the workplace, where the service is paid; the « Construire »
 * objective opens the build sheet, which builds on the free road-side plot nearest the player.
 */
type City = { wallet: number; route: number; panel: string | null; estateBuildings: number }

test('choose a job, get paid there, then build from the objectives', async ({ page }, testInfo) => {
  test.setTimeout(120_000)
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  const city = () =>
    page.evaluate(() => (window as unknown as { __LOME_CITY?: City }).__LOME_CITY ?? null)
  const nav = page.getByRole('navigation', { name: 'Navigation du jeu' })

  await page.goto('/haroolife', { waitUntil: 'domcontentloaded' })
  await expect(page.locator('canvas:visible').first()).toBeVisible({ timeout: 30000 })
  await nav.getByRole('button', { name: 'Téléphone' }).click()
  await page.getByRole('button', { name: /Métiers$/ }).click()
  await page.getByRole('button', { name: /Agent communal/ }).click()

  // The sheet closes and the player is already on the way (the Mairie is close by).
  await expect.poll(async () => (await city())?.panel).toBeNull()
  await expect.poll(async () => (await city())?.route, { timeout: 20000 }).toBe(0)
  const service = page.getByRole('button', { name: /Faire mon service/ })
  await expect(service).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('job-arrived.png') })
  const before = (await city())?.wallet ?? 0
  await service.click()
  await expect.poll(async () => (await city())?.wallet).toBe(before + 3900)

  // The objectives: the work one is done, « Construire » opens the build sheet.
  await page.getByRole('button', { name: 'Ouvrir les objectifs' }).click()
  await expect(page.getByTestId('mission-1').getByRole('button')).toHaveCount(0)
  await page.getByTestId('mission-2').getByRole('button', { name: 'Construire' }).click()
  const built = (await city())?.estateBuildings ?? 0
  await page.getByRole('button', { name: /Maison.*85 FCFA/ }).click()
  await expect.poll(async () => (await city())?.estateBuildings).toBe(built + 1)
  await expect(page.getByText(/Chantier achevé/).first()).toBeVisible()
  await page.getByRole('button', { name: 'Ouvrir les objectifs' }).click()
  await expect(page.getByTestId('mission-2').getByRole('button')).toHaveCount(0)
  await page.screenshot({ path: testInfo.outputPath('objectives-done.png') })
  expect(errors).toEqual([])
})
