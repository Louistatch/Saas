import { initialCityLife } from '../lib/haroolife/city/life'
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
  await expect(farm).toContainText(
    'C’est la saison : on sème le maïs, le haricot, le manioc, la tomate, le piment et le gombo.',
  )
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
  await expect(farm.getByRole('region', { name: 'Mon grenier' })).toHaveCount(0)
  await page.screenshot({ path: testInfo.outputPath('farm-sold.png') })
  expect(errors).toEqual([])
})

test('my field: the game says when it is ripe', async ({ page }, info) => {
  test.setTimeout(150_000)
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  // Sown on day 2 (4 days for maize), late on day 5: ripe when day 6 begins.
  const save = initialCityLife()
  save.life.day = 5
  save.life.hour = 23
  save.farm = {
    field: { locality: 'lome', crop: 'mais', sownDay: 2, tended: 2, lastTendDay: 3 },
    stock: {},
  }
  await page.addInitScript((save) => {
    if (sessionStorage.getItem('farm.ripe-seeded')) return
    sessionStorage.setItem('farm.ripe-seeded', '1')
    localStorage.setItem('haroolife.lome-city.v1', JSON.stringify(save))
  }, save)
  await page.goto('/haroolife', { waitUntil: 'domcontentloaded' })
  await expect(page.locator('canvas:visible').first()).toBeVisible({ timeout: 30000 })
  await page.getByRole('button', { name: 'Faire avancer le temps' }).click()
  await expect(page.getByText('Ton maïs est mûr : récolte-le dans Mon champ.').first()).toBeVisible(
    { timeout: 90000 },
  )
  await page.screenshot({ path: info.outputPath('farm-ripe.png') })
  expect(errors).toEqual([])
})

test('my granary: weevils eat what is left out, a bag protects it, every price says where it comes from', async ({
  page,
}, info) => {
  test.setTimeout(150_000)
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  // Maize harvested on day 2 and left in the open until day 10; yams and coffee just harvested.
  const save = initialCityLife()
  save.locality = 'lome'
  save.life.day = 10
  save.life.hour = 9
  save.life.wallet = 20000
  save.farm = {
    field: null,
    stock: { mais: 70, igname: 40, cafe: 10 },
    since: { mais: 2, igname: 9, cafe: 9 },
    checked: 2,
  }
  await page.addInitScript((save) => {
    if (sessionStorage.getItem('farm.granary-seeded')) return
    sessionStorage.setItem('farm.granary-seeded', '1')
    localStorage.setItem('haroolife.lome-city.v1', JSON.stringify(save))
  }, save)
  const city = () =>
    page.evaluate(() => (window as unknown as { __LOME_CITY?: City }).__LOME_CITY ?? null)
  await page.goto('/haroolife', { waitUntil: 'domcontentloaded' })
  await expect(page.locator('canvas:visible').first()).toBeVisible({ timeout: 30000 })
  await page
    .getByRole('navigation', { name: 'Navigation du jeu' })
    .getByRole('button', { name: 'Téléphone' })
    .click()
  await page.getByRole('button', { name: /Mon champ$/ }).click()
  const granary = page.getByTestId('farm').getByRole('region', { name: 'Mon grenier' })
  // Five days past its three days of grace, in the open: 70 → 63 kg.
  const maize = granary.locator('[data-crop="mais"]')
  await expect(maize).toContainText('63 kg de maïs')
  await expect(maize).toContainText('À l’air : les charançons en mangent chaque jour.')
  await expect(maize.getByRole('button', { name: /Vendre à 143 FCFA\/kg/ })).toBeVisible()
  // The survey's dearest and cheapest months of the year (mock: 231 three months ago, 143 now).
  const month = (d: Date) => d.toLocaleDateString('fr-FR', { month: 'long', timeZone: 'UTC' })
  const then = new Date(Date.now() - 92 * 24 * 3600 * 1000)
  await expect(maize).toContainText(
    `jusqu’à 231 FCFA/kg en ${month(then)}, 143 FCFA/kg au plus bas en ${month(new Date())}`,
  )
  // No price surveyed lately: the region's reference, then the game's own, each said so.
  const yams = granary.locator('[data-crop="igname"]')
  await expect(yams.getByRole('button', { name: /Vendre à 330 FCFA\/kg/ })).toBeVisible()
  await expect(yams).toContainText('prix de référence de la région, non daté')
  const coffee = granary.locator('[data-crop="cafe"]')
  await expect(coffee.getByRole('button', { name: /Vendre à 1200 FCFA\/kg/ })).toBeVisible()
  await expect(coffee).toContainText('prix indicatif du jeu')
  // A triple-layer bag: 1 500 FCFA, and the maize is safe.
  const before = (await city())?.wallet ?? 0
  await granary.getByRole('button', { name: /Acheter un sac triple fond/ }).click()
  await expect.poll(async () => (await city())?.wallet).toBe(before - 1500)
  await expect(maize).toContainText('En sac triple fond : à l’abri des charançons.')
  await expect(granary.getByTestId('bags')).toContainText('Sacs triple fond : 1 · 100 kg')
  await page.screenshot({ path: info.outputPath('farm-granary.png') })
  expect(errors).toEqual([])
})
