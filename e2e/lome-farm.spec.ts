import { expect, test } from './lome-test'

/**
 * « Mon champ »: in October in Lomé (the short rainy season), the player sows maize from the
 * phone, passes by the field once that day, comes back when it is ripe, harvests and sells at
 * the price surveyed on Lomé's market (mock survey: 143 FCFA/kg). The month is pinned for the
 * test; the seasons, care and yield rules are covered by tests/haroolife-farm.test.ts.
 */
type City = { wallet: number; day: number }

test('my field: sow in season, tend, harvest and sell at the real market price', async ({
  page,
}, testInfo) => {
  test.setTimeout(150_000)
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.addInitScript(() => {
    localStorage.setItem('haroolife.e2e', '1')
    localStorage.setItem('haroolife.e2e.month', '10')
    // Back in the game after the field was sown: the days have passed and it is morning.
    if (sessionStorage.getItem('farm.ripen') !== '1') return
    const get = Storage.prototype.getItem
    Storage.prototype.getItem = function (key: string) {
      const v = get.call(this, key)
      if (key !== 'haroolife.lome-city.v1' || !v) return v
      try {
        const s = JSON.parse(v)
        if (s?.farm?.field) {
          s.life.day = s.farm.field.sownDay + 4
          s.life.hour = 9
        }
        return JSON.stringify(s)
      } catch {
        return v
      }
    }
  })
  const city = () =>
    page.evaluate(() => (window as unknown as { __LOME_CITY?: City }).__LOME_CITY ?? null)
  const openFarm = async () => {
    await page
      .getByRole('navigation', { name: 'Navigation du jeu' })
      .getByRole('button', { name: 'Téléphone' })
      .click()
    await page.getByRole('button', { name: /Mon champ$/ }).click()
    await expect(page.getByTestId('farm')).toBeVisible()
    return page.getByTestId('farm')
  }

  await page.goto('/haroolife', { waitUntil: 'domcontentloaded' })
  await expect(page.locator('canvas:visible').first()).toBeVisible({ timeout: 30000 })
  let farm = await openFarm()
  await expect(farm).toContainText('C’est la saison : on sème le maïs et le haricot.')
  const start = (await city())?.wallet ?? 0
  await farm.getByRole('button', { name: /Semer le maïs · 3 000 FCFA/ }).click()
  await expect(farm.getByRole('region', { name: 'Mon champ en culture' })).toContainText(
    'Récolte dans 4 jours',
  )
  await expect.poll(async () => (await city())?.wallet).toBe(start - 3000)
  await farm.getByRole('button', { name: 'Passer au champ : désherber, arroser' }).click()
  await expect(farm.getByRole('button', { name: 'Déjà passé au champ aujourd’hui' })).toBeDisabled()
  await page.screenshot({ path: testInfo.outputPath('farm-growing.png') })

  // Four days later (the save read back with the days gone by): ripe, harvested, sold.
  await page.goto('/robots.txt')
  await page.evaluate(() => sessionStorage.setItem('farm.ripen', '1'))
  await page.goto('/haroolife', { waitUntil: 'domcontentloaded' })
  await expect(page.locator('canvas:visible').first()).toBeVisible({ timeout: 30000 })
  farm = await openFarm()
  await farm.getByRole('button', { name: 'Récolter' }).click()
  // Tended one day out of four: 40 % + 60 % × ¼ of 70 kg.
  const kg = Math.round(70 * (0.4 + 0.6 * 0.25))
  const sale = farm.getByRole('button', { name: /Vendre à 143 FCFA\/kg/ })
  await expect(sale).toBeVisible()
  await expect(farm).toContainText(`${kg} kg de maïs`)
  const before = (await city())?.wallet ?? 0
  await sale.click()
  await expect.poll(async () => (await city())?.wallet).toBe(before + kg * 143)
  await expect(farm.locator('output')).toContainText(`Vendu : ${kg} kg de maïs à 143 FCFA le kg`)
  await expect(farm.getByRole('region', { name: 'Ma récolte' })).toHaveCount(0)
  await page.screenshot({ path: testInfo.outputPath('farm-sold.png') })
  expect(errors).toEqual([])
})
