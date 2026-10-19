import type { Page } from '@playwright/test'
import { expect, openPlaces, test } from './lome-test'

/**
 * M4 (D4+): endurance of the 3D engines. 20 house entries and exits, then 10
 * locality changes (Lomé ⇄ Kara), with no page error, no WebGL error, one canvas, and GPU objects
 * (textures, buffers) and scene entities that return to their level instead of growing.
 * The fictitious wallet is raised in the player's own local save so ten bus fares fit.
 */
type Live = { inside: string | null; locality: string; chunks: number; route: number }
type Gpu = {
  textures: number
  buffers: number
  vramMB: { tex: number; vb: number; ib: number }
  entities: number
  heapMB: number | null
}
const live = (page: Page) =>
  page.evaluate(() => (window as unknown as { __LOME_CITY?: Live }).__LOME_CITY ?? null)
const gpu = (page: Page) =>
  page.evaluate(() => {
    const scene = (
      window as unknown as { __LOME_SCENE?: import('../lib/haroolife/engine/types').SceneProbe }
    ).__LOME_SCENE
    const mem = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory
    const g = scene?.gpu()
    return {
      textures: g?.textures ?? -1,
      buffers: g?.buffers ?? -1,
      vramMB: g?.vramMB ?? { tex: -1, vb: -1, ib: -1 },
      entities: scene?.count() ?? -1,
      heapMB: mem ? Math.round(mem.usedJSHeapSize / 1048576) : null,
    } satisfies Gpu
  })

test('20 house visits and 10 trips keep one engine and no growing GPU state', async ({
  page,
}, testInfo) => {
  test.skip(/mobile/.test(testInfo.project.name), 'endurance measured once, on desktop')
  test.setTimeout(600_000)
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => {
    if (m.type() === 'error' && /deleteBuffer|WebGL|GL_INVALID|context lost/i.test(m.text()))
      errors.push(m.text())
  })
  await page.goto('/haroolife', { waitUntil: 'domcontentloaded' })
  await expect(page.locator('canvas').first()).toBeVisible({ timeout: 30000 })
  await expect
    .poll(async () => (await live(page))?.chunks ?? 0, { timeout: 30000 })
    .toBeGreaterThan(0)
  // Fictitious savings for the fares: every read of the player's own local save (the entry
  // screen's summary reads it before the game does) gets a fuller (fictional) wallet; nothing
  // real is involved.
  await page.addInitScript(() => {
    const get = Storage.prototype.getItem
    Storage.prototype.getItem = function (key: string) {
      const v = get.call(this, key)
      if (key !== 'haroolife.lome-city.v1' || !v) return v
      try {
        const s = JSON.parse(v)
        if (s?.life && s.life.wallet < 50000) s.life.wallet = 100000
        return JSON.stringify(s)
      } catch {
        return v
      }
    }
  })
  await page.waitForTimeout(2000)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await expect(page.locator('canvas').first()).toBeVisible({ timeout: 30000 })
  await expect
    .poll(async () => (await live(page))?.chunks ?? 0, { timeout: 30000 })
    .toBeGreaterThan(0)
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as unknown as { __LOME_CITY?: { wallet: number } }).__LOME_CITY?.wallet ?? 0,
      ),
    )
    .toBeGreaterThan(50000)

  // Home, by the guided route.
  await page.getByLabel('Afficher les besoins du personnage').click()
  await page.getByRole('button', { name: 'Rentrer chez moi' }).click()
  await expect.poll(async () => (await live(page))?.route ?? 1, { timeout: 60000 }).toBe(0)
  const door = page.getByTestId('door-action')
  await expect(door).toContainText('Maison')
  await page.waitForTimeout(1500)
  const before = await gpu(page)

  const perCycle: number[] = []
  for (let i = 0; i < 20; i++) {
    await door.click()
    await expect.poll(async () => (await live(page))?.inside).toBe('house')
    await door.click()
    await expect.poll(async () => (await live(page))?.inside ?? null).toBe(null)
    await expect(door).toContainText('Maison')
    perCycle.push((await gpu(page)).buffers)
  }
  testInfo.annotations.push({
    type: 'buffers after each door cycle',
    description: JSON.stringify(perCycle),
  })
  await page.waitForTimeout(1500)
  const afterDoors = await gpu(page)

  // Ten trips.
  const settle = async () => {
    const dialog = page.locator('[aria-labelledby="event-title"]')
    for (let i = 0; i < 6 && (await dialog.isVisible().catch(() => false)); i++) {
      await dialog.getByRole('button').first().click()
      await page.waitForTimeout(300)
    }
  }
  for (let i = 0; i < 10; i++) {
    const to = i % 2 === 0 ? 'Kara' : 'Lomé'
    await settle()
    await openPlaces(page)
    await page
      .getByTestId('national-map')
      .getByRole('button', { name: new RegExp(`Voyager vers ${to}`) })
      .first()
      .click()
    await page
      .getByTestId('coach-companies')
      .getByRole('button', { name: /^Prendre le car / })
      .first()
      .click()
    await expect
      .poll(async () => (await live(page))?.locality)
      .toBe(to === 'Kara' ? 'kara' : 'lome')
    await expect
      .poll(async () => (await live(page))?.chunks ?? 0, { timeout: 30000 })
      .toBeGreaterThan(0)
    // The coach's own view (a second canvas on board) closes on arrival: one 3D world is left.
    await expect(page.getByTestId('travel-splash')).toBeHidden()
    expect(await page.locator('canvas').count(), 'one canvas').toBe(1)
  }
  await settle()
  await page.waitForTimeout(3000)
  const afterTrips = await gpu(page)
  testInfo.annotations.push({
    type: 'GPU state (start → after 20 door cycles → after 10 trips, back in Lomé)',
    description: JSON.stringify({ before, afterDoors, afterTrips }),
  })
  // The probe must really read the device (a -1 would make every bound below meaningless).
  expect(before.textures).toBeGreaterThan(0)
  expect(before.buffers).toBeGreaterThan(0)
  // The first visit builds the interior once (measured: +77 buffers); after that every cycle
  // must leave the count flat. A leak would grow it on each of the 20 visits.
  // Streamed street chunks and the walkers near the house move it either way; a leak is a
  // trend. One adult walker (four skinned primitives, a vertex and an index buffer each) is
  // worth 8 buffers, so one walker more or less between two readings is noise, not a leak:
  // a leak of a single buffer per visit would still add 20 over the run. Bone textures are
  // held to +4 whatever happens (that bound caught the PlayCanvas skin-instance leak).
  const FIGURE_BUFFERS = 8
  const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]
  expect(
    median(perCycle.slice(-5)) - median(perCycle.slice(0, 5)),
    'no growth over 20 visits',
  ).toBeLessThanOrEqual(FIGURE_BUFFERS)
  expect(afterDoors.textures).toBeLessThanOrEqual(before.textures + 4)
  expect(afterDoors.buffers).toBeLessThanOrEqual(perCycle[0] + 2 * FIGURE_BUFFERS + 4)
  expect(afterDoors.entities).toBeLessThanOrEqual(before.entities * 1.1 + 20)
  expect(afterTrips.textures).toBeLessThanOrEqual(before.textures * 1.25 + 8)
  // Back in the Lomé street, compared with the start in that street rather than with the
  // door cycles: since the traffic lights and the animated residents, the street alone holds
  // more buffers than the old house-based bound allowed (83 at the start, measured).
  expect(afterTrips.buffers).toBeLessThanOrEqual(before.buffers + 2 * FIGURE_BUFFERS + 4)
  expect(afterTrips.vramMB.tex).toBeLessThanOrEqual(before.vramMB.tex * 1.25 + 8)
  expect(errors).toEqual([])
})
