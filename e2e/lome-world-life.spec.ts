import fs from 'node:fs'
import path from 'node:path'
import { expect, test } from './lome-test'

/**
 * Phase 2 — the living world. One complete outing, end to end, on desktop and Android:
 * home in Tokoin → map → the gym → a zémidjan ride → inside → the equipment and the other
 * characters → the treadmill → animation, energy down, fitness up → back out in the city.
 * Also checks the city is dressed with real models (not boxes), that it keeps moving on its
 * own, and records performance figures.
 */
type Stats = {
  chunks: number
  buildings: number
  tris: number
  detailed: boolean
  drawCalls: number
  fps: number
  at: { x: number; y: number }
  route: number
  inside: string | null
  interiorProps: number
  npcs: number
  activity: { prop: string; anim: string } | null
  fitness: number
  energy: number
  hour: number
}
const stats = (page: import('@playwright/test').Page) =>
  page.evaluate(() => (window as unknown as { __LOME_CITY?: Stats }).__LOME_CITY ?? null)

test('a day in Lomé: from home to the gym, a workout on real equipment, and back', async ({
  page,
}, testInfo) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  const dir = path.join('test-results', 'lome-world')
  fs.mkdirSync(dir, { recursive: true })
  const shot = (name: string) =>
    page.screenshot({ path: path.join(dir, `${testInfo.project.name}-${name}.png`) })

  // 1. I am at home in Tokoin: the HUD names the district, the city is around me.
  await page.goto('/haroolife/territoire/lome', { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('navigation', { name: 'Navigation du jeu' })).toBeVisible()
  await expect(page.locator('canvas').first()).toBeVisible({ timeout: 30000 })
  // Home is the estate gate in Tokoin (the district label is shown on wide screens only).
  await expect
    .poll(() => stats(page).then((s) => s?.at ?? null), { timeout: 30000 })
    .toEqual({ x: 48, y: 34 })
  await expect
    .poll(() => stats(page).then((s) => (s?.detailed && s.chunks >= 20 ? s.buildings : 0)), {
      timeout: 60000,
    })
    .toBeGreaterThanOrEqual(250)
  await page.waitForTimeout(3500) // let near chunks finish and characters load
  const city = (await stats(page))!
  testInfo.annotations.push({ type: 'city', description: JSON.stringify(city) })
  expect(city.tris, 'near chunks carry real baked models').toBeGreaterThan(150000)
  expect(city.drawCalls, 'merged chunks keep draw calls low').toBeLessThan(400)
  await shot('01-home-tokoin')

  // The city moves on its own: traffic advances while the player stands still.
  const stepA = await page.evaluate(
    () => JSON.parse(localStorage.getItem('haroolife.lome-city.v1') ?? '{}').life?.trafficStep,
  )
  await page.waitForTimeout(2200)
  const stepB = await page.evaluate(
    () => JSON.parse(localStorage.getItem('haroolife.lome-city.v1') ?? '{}').life?.trafficStep,
  )
  expect(stepB, 'traffic step advances without input').toBeGreaterThan(stepA)

  // Category chips over the city filter the place labels.
  const chips = page.getByRole('group', { name: 'Catégories de lieux' })
  await chips.getByRole('button', { name: 'Loisirs' }).click()
  // Labels off-screen are kept in the DOM but hidden, so count by title rather than by role.
  await expect(page.locator('button[title="Marché de Tokoin"]')).toHaveCount(0)
  await expect(page.locator('button[title="Salle Fitness Tokoin"]')).toHaveCount(1)
  await chips.getByRole('button', { name: 'Tous' }).click()
  await expect(page.locator('button[title="Marché de Tokoin"]')).toHaveCount(1)

  // 2–3. Open the map and select the gym.
  const navigation = page.getByRole('navigation', { name: 'Navigation du jeu' })
  await navigation.getByRole('button', { name: 'Carte' }).click()
  await page
    .getByRole('group', { name: 'Filtrer la ville' })
    .getByRole('button', { name: 'Loisirs' })
    .click()
  await page.getByRole('button', { name: /Salle Fitness Tokoin/ }).click()
  const sheet = page.getByRole('dialog', { name: 'Lieu' })
  await expect(sheet).toBeVisible()
  await expect(sheet.getByText('Tapis de course')).toBeVisible()
  await expect(sheet.getByText('Personnages sur place')).toBeVisible()
  await expect(sheet.getByText(/personnages du jeu/)).toBeVisible()
  await shot('02-place-sheet')

  // 4–5. Take a zémidjan: the ride scene plays, then we land at the door.
  const walletBefore = await page.evaluate(
    () => JSON.parse(localStorage.getItem('haroolife.lome-city.v1') ?? '{}').life?.wallet,
  )
  await sheet.getByRole('button', { name: /Zémidjan/ }).click()
  await expect(page.getByLabel('Trajet en cours')).toBeVisible()
  await shot('03-ride')
  await expect.poll(() => stats(page).then((s) => s?.route ?? 99), { timeout: 20000 }).toBe(0)
  await expect
    .poll(() =>
      page.evaluate(
        () => JSON.parse(localStorage.getItem('haroolife.lome-city.v1') ?? '{}').life?.wallet,
      ),
    )
    .toBe(walletBefore - 350)

  // 6–7. Enter: the gym is furnished and staffed.
  await page.getByRole('button', { name: 'Entrer ou sortir' }).click()
  await expect
    .poll(() => stats(page).then((s) => s?.inside ?? null), { timeout: 10000 })
    .not.toBeNull()
  const room = (await stats(page))!
  expect(room.interiorProps).toBeGreaterThanOrEqual(20)
  expect(room.npcs).toBeGreaterThanOrEqual(5)
  await page.waitForTimeout(3500) // characters and furniture load
  await shot('04-gym-inside')

  // 8–10. Pick the treadmill from the activities: the run animation starts, energy drops,
  // fitness rises, the fee is paid.
  const before = (await stats(page))!
  await page.getByRole('button', { name: /Activités du lieu|Activités · / }).click()
  await page
    .getByRole('dialog', { name: 'Lieu' })
    .getByRole('button', { name: 'Tapis de course' })
    .click()
  await expect
    .poll(() => stats(page).then((s) => s?.activity?.anim ?? null), { timeout: 5000 })
    .toBe('run')
  await page.waitForTimeout(900)
  await shot('05-treadmill-running')
  const after = (await stats(page))!
  expect(after.fitness).toBe(before.fitness + 6)
  expect(after.energy).toBe(before.energy - 15)
  await expect
    .poll(() => stats(page).then((s) => s?.activity ?? null), { timeout: 8000 })
    .toBeNull()

  // 11. Leave: back in the city at the gym's door, state persisted.
  await page.getByRole('button', { name: 'Entrer ou sortir' }).click()
  await expect.poll(() => stats(page).then((s) => s?.inside ?? null)).toBeNull()
  await page.waitForTimeout(1500)
  await shot('06-back-outside')
  const saved = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('haroolife.lome-city.v1') ?? '{}'),
  )
  expect(saved.fitness).toBe(after.fitness)
  expect(saved.activity).toBeNull()

  // Performance snapshot for the report.
  const perf = (await stats(page))!
  testInfo.annotations.push({
    type: 'perf',
    description: JSON.stringify({ drawCalls: perf.drawCalls, fps: perf.fps, tris: perf.tris }),
  })
  expect(errors, 'No uncaught client runtime errors').toEqual([])
})

test('night falls on the city and the sky changes', async ({ page }) => {
  await page.goto('/haroolife/territoire/lome', { waitUntil: 'domcontentloaded' })
  await expect(page.locator('canvas').first()).toBeVisible({ timeout: 30000 })
  await expect
    .poll(() => stats(page).then((s) => s?.chunks ?? 0), { timeout: 30000 })
    .toBeGreaterThan(10)
  const world = page.getByTestId('city-world')
  const day = await world.evaluate((el) => getComputedStyle(el).backgroundColor)
  // Force a night save (22h) before the app boots again, so no autosave can overwrite it.
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('haroolife.lome-city.v1') !== null), {
      timeout: 30000,
    })
    .toBe(true)
  await page.addInitScript(() => {
    const raw = JSON.parse(localStorage.getItem('haroolife.lome-city.v1') ?? 'null')
    if (raw && raw.life.hour !== 22) {
      raw.life.hour = 22
      localStorage.setItem('haroolife.lome-city.v1', JSON.stringify(raw))
    }
  })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await expect(page.locator('canvas').first()).toBeVisible({ timeout: 30000 })
  await expect.poll(() => stats(page).then((s) => s?.hour ?? null), { timeout: 30000 }).toBe(22)
  const night = await world.evaluate((el) => getComputedStyle(el).backgroundColor)
  expect(night).not.toBe(day)
  const lum = (c: string) => {
    const m = c.match(/\d+/g)!.map(Number)
    return 0.2126 * m[0] + 0.7152 * m[1] + 0.0722 * m[2]
  }
  expect(lum(night)).toBeLessThan(lum(day) * 0.6)
})
