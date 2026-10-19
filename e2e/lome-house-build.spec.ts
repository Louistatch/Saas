import { STAGES, plotsForSale } from '../lib/haroolife/city/homebuild'
import { defaultHousing } from '../lib/haroolife/city/housing'
import { type CityLife, initialCityLife } from '../lib/haroolife/city/life'
import { worldLots } from '../lib/haroolife/city/world'
import { expect, test } from './lome-test'

/**
 * « Ma maison »: from the phone, the player buys a free plot in Tokoin, pays the foundations,
 * and the street draws the plot, its sign, the slab and the mason's scaffolding; days later the
 * foundations are done. A house finished stage by stage stands painted in the street, and moving
 * in ends the rent. The rules (prices, stages, the landlord) are covered by
 * tests/haroolife-homebuild.test.ts.
 */
type Live = { wallet: number }
type Drawn = { lotId: string; name: string; built: number; working: boolean; parts: number }

const tokoin = plotsForSale(worldLots()).find((o) => o.quartier === 'tokoin')
if (!tokoin) throw new Error('no plot for sale in Tokoin')
const door = tokoin.lot.door

/** A player standing at the plot's gate, morning, with the means to build. */
function standingAtThePlot(): CityLife {
  const s = initialCityLife()
  s.locality = 'lome'
  s.at = { x: door.x, y: door.y }
  s.pose = { x: door.x, z: door.y, heading: 0 }
  s.life.day = 5
  s.life.hour = 9
  s.life.wallet = 40_000_000
  s.housing = defaultHousing(5)
  return s
}

async function seed(page: import('@playwright/test').Page, save: CityLife) {
  await page.addInitScript((save) => {
    if (!sessionStorage.getItem('house.seeded')) {
      sessionStorage.setItem('house.seeded', '1')
      localStorage.setItem('haroolife.lome-city.v1', JSON.stringify(save))
    }
    // Later in the game (the days the mason works): the save is read back with this patch.
    const patch = sessionStorage.getItem('house.patch')
    if (!patch) return
    const get = Storage.prototype.getItem
    Storage.prototype.getItem = function (key: string) {
      const v = get.call(this, key)
      if (key !== 'haroolife.lome-city.v1' || !v) return v
      try {
        const s = JSON.parse(v)
        const p = JSON.parse(patch)
        if (typeof p.day === 'number') {
          s.life.day = p.day
          s.life.hour = 9
        }
        if (p.plot) s.plot = { ...s.plot, ...p.plot }
        return JSON.stringify(s)
      } catch {
        return v
      }
    }
  }, save)
}

const drawn = (page: import('@playwright/test').Page) =>
  page.evaluate(
    () => (window as unknown as { __LOME_STREET?: { plot: Drawn | null } }).__LOME_STREET?.plot,
  )
const wallet = (page: import('@playwright/test').Page) =>
  page.evaluate(() => (window as unknown as { __LOME_CITY?: Live }).__LOME_CITY?.wallet ?? 0)

async function openHousing(page: import('@playwright/test').Page) {
  await page
    .getByRole('navigation', { name: 'Navigation du jeu' })
    .getByRole('button', { name: 'Téléphone' })
    .click()
  await page.getByRole('button', { name: /Logement$/ }).click()
  await expect(page.getByTestId('housing')).toBeVisible()
  return page.getByTestId('house-build')
}

test('my house: buy a plot, pay the foundations, the street draws the work until it is done', async ({
  page,
}, info) => {
  test.setTimeout(150_000)
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await seed(page, standingAtThePlot())
  await page.goto('/haroolife', { waitUntil: 'domcontentloaded' })
  await expect(page.locator('canvas:visible').first()).toBeVisible({ timeout: 30000 })
  await expect.poll(() => drawn(page)).toBeNull()

  let build = await openHousing(page)
  await build.getByRole('button', { name: 'Voir les terrains à vendre' }).click()
  await build
    .getByRole('button', { name: /Acheter le terrain à Tokoin/ })
    .first()
    .click()
  await expect(build.locator('output')).toContainText('Ce terrain n’est pas à vendre')
  await expect.poll(() => wallet(page)).toBe(40_000_000 - tokoin.price)
  await expect(build).toContainText('Mon terrain · Tokoin')
  // The street: the plot, its sign, a heap of sand; its door named for the player.
  await expect.poll(async () => (await drawn(page))?.lotId, { timeout: 20000 }).toBe(tokoin.lot.id)
  expect((await drawn(page))?.built).toBe(0)
  await expect(page.locator(`[data-door="${tokoin.lot.id}"]`)).toHaveAttribute(
    'aria-label',
    'Mon terrain',
  )

  // The foundations: paid, the mason at work (scaffolding up), the stage under way.
  await build.getByRole('button', { name: /Payer : Fondations/ }).click()
  await expect.poll(() => wallet(page)).toBe(40_000_000 - tokoin.price - STAGES[0].cost)
  await expect(build.locator('[data-stage="fondations"]')).toHaveAttribute('data-state', 'en-cours')
  await expect.poll(async () => (await drawn(page))?.working).toBe(true)
  await expect(page.locator(`[data-door="${tokoin.lot.id}"]`)).toHaveAttribute(
    'aria-label',
    'Mon chantier',
  )
  await page.screenshot({ path: info.outputPath('house-foundations-work.png') })

  // Three days later: the foundations are done, the slab stands, the next stage is offered.
  await page.evaluate(
    (day) => sessionStorage.setItem('house.patch', JSON.stringify({ day })),
    5 + STAGES[0].days,
  )
  await page.reload({ waitUntil: 'domcontentloaded' })
  await expect(page.locator('canvas:visible').first()).toBeVisible({ timeout: 30000 })
  await expect.poll(async () => (await drawn(page))?.built, { timeout: 20000 }).toBe(1)
  expect((await drawn(page))?.working).toBe(false)
  build = await openHousing(page)
  await expect(build.locator('[data-stage="fondations"]')).toHaveAttribute('data-state', 'fait')
  await expect(build.getByRole('button', { name: /Payer : Élévation des murs/ })).toBeVisible()
  expect(errors).toEqual([])
})

test('my house: the walls, then the finished house, and moving in ends the rent', async ({
  page,
}, info) => {
  test.setTimeout(150_000)
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  const save = standingAtThePlot()
  save.plot = { lot: tokoin.lot.id, quartier: 'tokoin', bought: 1, built: 2, work: { until: 9 } }
  await seed(page, save)
  await page.goto('/haroolife', { waitUntil: 'domcontentloaded' })
  await expect(page.locator('canvas:visible').first()).toBeVisible({ timeout: 30000 })
  // Grey block walls, rebar waiting for the roof, the scaffolding of the roofers.
  await expect.poll(async () => (await drawn(page))?.built, { timeout: 20000 }).toBe(2)
  const walls = await drawn(page)
  expect(walls?.working).toBe(true)
  await page.screenshot({ path: info.outputPath('house-walls.png') })

  // Every stage paid and done: the house, painted.
  await page.evaluate(
    (built) =>
      sessionStorage.setItem('house.patch', JSON.stringify({ plot: { built, work: null } })),
    STAGES.length,
  )
  await page.reload({ waitUntil: 'domcontentloaded' })
  await expect(page.locator('canvas:visible').first()).toBeVisible({ timeout: 30000 })
  await expect.poll(async () => (await drawn(page))?.built, { timeout: 20000 }).toBe(STAGES.length)
  await expect(page.locator(`[data-door="${tokoin.lot.id}"]`)).toHaveAttribute(
    'aria-label',
    'Ma maison',
  )
  await page.screenshot({ path: info.outputPath('house-finished.png') })

  // Moving in: the rented room's caution comes back; no more rent.
  const build = await openHousing(page)
  const before = await wallet(page)
  await build.getByRole('button', { name: 'Emménager chez moi' }).click()
  await expect(page.getByTestId('housing')).toContainText('Pas de loyer : la maison est à toi.')
  await expect.poll(() => wallet(page)).toBe(before + defaultHousing(5).caution)
  await expect(build).toContainText('Tu habites chez toi')
  await page.screenshot({ path: info.outputPath('house-moved-in.png') })
  expect(errors).toEqual([])
})
