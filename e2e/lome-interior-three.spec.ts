import type { Page } from '@playwright/test'
import type { SceneProbe } from '../lib/haroolife/engine/types'
import { expect, openPlaces, test } from './lome-test'

/**
 * Jalon J1: the gym drawn by React Three Fiber (`?engine=three`) with Rapier collisions.
 * The player walks inside under the joystick, cannot cross walls or equipment, uses a
 * treadmill, walks out of the open front, and the HarooLife street comes back. A second run
 * checks that repeated visits do not accumulate GPU resources, and that an old `?engine=playcanvas`
 * address (PlayCanvas removed) still opens the game.
 */
type Interior = { x: number; z: number; anim: string; using: string | null; left: boolean }
type Live = {
  chunks: number
  detailed: boolean
  route: number
  inside: string | null
  activity: { prop: string; anim: string } | null
}

const scene = (page: Page) =>
  page.evaluate(() => {
    const s = (window as unknown as { __LOME_SCENE?: SceneProbe }).__LOME_SCENE
    return s ? { engine: s.engine, joueur: s.childNames('Joueur'), gpu: s.gpu() } : null
  })
const inside = (page: Page) =>
  page.evaluate(() => (window as unknown as { __LOME_INTERIOR?: Interior }).__LOME_INTERIOR ?? null)
const live = (page: Page) =>
  page.evaluate(() => (window as unknown as { __LOME_CITY?: Live }).__LOME_CITY ?? null)

/** From the street: map → gym → taxi (skipped) → door. */
async function enterGym(page: Page) {
  await openPlaces(page)
  await page
    .getByRole('group', { name: 'Filtrer la ville' })
    .getByRole('button', { name: 'Loisirs' })
    .click()
  await page.getByRole('button', { name: /Salle Fitness Tokoin/ }).click()
  const sheet = page.getByRole('dialog', { name: 'Lieu' })
  await sheet.getByRole('button', { name: /Taxi/ }).click()
  await sheet.getByRole('button', { name: 'Confirmer le trajet' }).click()
  await page
    .getByLabel('Trajet en cours')
    .getByRole('button', { name: /Passer/ })
    .click()
  await expect.poll(async () => (await live(page))?.route ?? -1, { timeout: 20000 }).toBe(0)
  await page.getByRole('button', { name: 'Entrer ou sortir' }).click()
  await expect.poll(async () => (await live(page))?.inside ?? null).not.toBeNull()
  await expect.poll(async () => (await scene(page))?.engine, { timeout: 30000 }).toBe('three')
  await expect.poll(async () => (await inside(page))?.x ?? null, { timeout: 30000 }).not.toBeNull()
}

/** Hold the joystick towards a screen direction (degrees, 0 = right, 90 = down). */
async function hold(page: Page, angleDeg: number, ms: number, reach = 46) {
  const box = (await page.getByTestId('joystick').boundingBox())!
  const cx = box.x + box.width / 2
  const cy = box.y + box.height / 2
  const a = (angleDeg * Math.PI) / 180
  await page.mouse.move(cx, cy)
  await page.mouse.down()
  await page.mouse.move(cx + Math.cos(a) * reach, cy + Math.sin(a) * reach, { steps: 4 })
  await page.waitForTimeout(ms)
  await page.mouse.up()
}

test('R3F gym: walk, collide, use a treadmill, walk out', async ({ page }, testInfo) => {
  test.setTimeout(300_000)
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => {
    if (m.type() === 'error' && /WebAssembly|WebGL|GL_INVALID|rapier/i.test(m.text()))
      errors.push(m.text())
  })
  await page.goto('/haroolife/territoire/lome?engine=three', { waitUntil: 'domcontentloaded' })
  await expect
    .poll(async () => (await live(page))?.chunks ?? 0, { timeout: 60000 })
    .toBeGreaterThan(0)
  expect((await scene(page))?.engine, 'the street is the HarooLife engine').toBe('haroo')
  await enterGym(page)

  const s = await scene(page)
  expect(s?.joueur, 'the chosen figure is drawn indoors').toContain('figure')
  await page.screenshot({ path: testInfo.outputPath('three-gym.png') })

  // Joystick: the player really walks, with the walk or run clip.
  const start = (await inside(page))!
  await hold(page, 270, 1200)
  const moved = (await inside(page))!
  expect(Math.hypot(moved.x - start.x, moved.z - start.z), 'walked indoors').toBeGreaterThan(0.8)
  await page.waitForTimeout(400)
  expect((await inside(page))?.anim, 'idle again once released').toBe('idle')

  // Collisions: pushing towards the back wall for a long time never crosses it (gym: 11 × 9).
  for (const angle of [270, 225, 315]) await hold(page, angle, 2500)
  const pushed = (await inside(page))!
  expect(pushed.z, 'stopped by the back wall').toBeGreaterThan(-4.5)
  expect(pushed.x, 'stopped by the side walls').toBeGreaterThan(-5.5)

  // An activity: the player takes the treadmill; walking away ends the pose (not the game state).
  await page.getByRole('button', { name: /Activités/ }).click()
  await page
    .getByRole('dialog', { name: 'Lieu' })
    .getByRole('button', { name: 'Tapis de course' })
    .click()
  await expect.poll(async () => (await live(page))?.activity?.prop ?? null).toMatch(/treadmill/)
  await expect.poll(async () => (await inside(page))?.using ?? null).toMatch(/treadmill/)
  await page.screenshot({ path: testInfo.outputPath('three-gym-treadmill.png') })
  await hold(page, 90, 600)
  await expect.poll(async () => (await inside(page))?.using ?? null).toBeNull()

  // Run out of an open side (full stick: V3 walks at a realistic 1 u/s, running is 2 u/s):
  // the building is left and the street is back.
  for (let i = 0; i < 6 && (await live(page))?.inside; i++) await hold(page, 90, 2000, 60)
  await expect.poll(async () => (await live(page))?.inside ?? null, { timeout: 20000 }).toBeNull()
  await expect.poll(async () => (await scene(page))?.engine).toBe('haroo')
  expect(errors).toEqual([])
})

test('R3F interior: repeated visits keep GPU resources flat; an old PlayCanvas address still opens', async ({
  page,
}) => {
  test.setTimeout(300_000)
  await page.goto('/haroolife/territoire/lome?engine=three', { waitUntil: 'domcontentloaded' })
  await expect
    .poll(async () => (await live(page))?.chunks ?? 0, { timeout: 60000 })
    .toBeGreaterThan(0)
  await enterGym(page)
  const counts: { textures: number; buffers: number }[] = []
  for (let i = 0; i < 3; i++) {
    await page.waitForTimeout(1500)
    const g = (await scene(page))!.gpu
    counts.push({ textures: g.textures, buffers: g.buffers })
    await page.getByRole('button', { name: 'Entrer ou sortir' }).click()
    await expect.poll(async () => (await scene(page))?.engine).toBe('haroo')
    await page.getByRole('button', { name: 'Entrer ou sortir' }).click()
    await expect.poll(async () => (await scene(page))?.engine, { timeout: 30000 }).toBe('three')
  }
  // Each visit builds a fresh renderer: the same resources, not more and more.
  expect(counts.at(-1)!.textures).toBeLessThanOrEqual(counts[0].textures + 2)
  expect(counts.at(-1)!.buffers).toBeLessThanOrEqual(counts[0].buffers + 4)
  expect(await page.locator('canvas').count(), 'one canvas per engine at most').toBeLessThanOrEqual(
    2,
  )

  // PlayCanvas is gone: an old ?engine=playcanvas address keeps the remembered renderer. The
  // save brings the player back inside the gym, drawn by React Three Fiber.
  await page.goto('/haroolife/territoire/lome?engine=playcanvas', { waitUntil: 'domcontentloaded' })
  await expect.poll(async () => (await scene(page))?.engine, { timeout: 60000 }).toBe('three')
  expect(await page.evaluate(() => localStorage.getItem('haroolife.engine'))).toBe('three')
})
