import type { Page } from '@playwright/test'
import { expect, test } from './lome-test'

/**
 * Refonte, jalon 1: the house drawn by the HarooLife engine (imperative Three.js) on the normal
 * /haroolife. A clothed avatar walks the way the stick points (four directions and the
 * diagonals, facing forward, walk clip); the 🍲 and 🌙 points walk the player to the stove and
 * the bed, and the game applies each effect once; the save survives a reload; leaving and
 * entering again keeps one engine and flat GPU state.
 */
type Interior = {
  engine: string
  x: number
  z: number
  heading: number
  speed: number
  anim: string
  goal: string | null
}
type Needs = { hunger: number; energy: number }
type Live = { inside: string | null; lastEvent: string }

/** Camera bearing of the house (radians): screen up walks away from it. */
const YAW = 0.74
const FWD = { x: -Math.sin(YAW), z: -Math.cos(YAW) }
const RIGHT = { x: Math.cos(YAW), z: -Math.sin(YAW) }

const interior = (page: Page) =>
  page.evaluate(() => (window as unknown as { __LOME_INTERIOR?: Interior }).__LOME_INTERIOR ?? null)
const live = (page: Page) =>
  page.evaluate(() => (window as unknown as { __LOME_CITY?: Live }).__LOME_CITY ?? null)
const needs = (page: Page) =>
  page.evaluate(() => {
    const save = JSON.parse(localStorage.getItem('haroolife.lome-city.v1') || 'null')
    return (save?.life?.needs ?? null) as Needs | null
  })
const houseReady = (page: Page) =>
  expect
    .poll(
      () =>
        page.evaluate(() => {
          const s = (
            window as unknown as {
              __LOME_SCENE?: import('../lib/haroolife/engine/types').SceneProbe
            }
          ).__LOME_SCENE
          return s?.engine === 'haroo' && s.has('Joueur')
        }),
      { message: 'the HarooLife engine draws the house', timeout: 60000 },
    )
    .toBe(true)

/** Holds a direction (screen axes, x right, y up): touch joystick on Android, keys on desktop. */
async function hold(page: Page, mobile: boolean, x: number, y: number, ms: number) {
  if (mobile) {
    const box = await page.getByTestId('joystick').boundingBox()
    if (!box) throw new Error('no joystick')
    const cx = box.x + box.width / 2
    const cy = box.y + box.height / 2
    // Two thirds of the radius: a walk, not a run (the rim runs).
    const r = (box.width / 2) * 0.66
    const n = Math.hypot(x, y)
    const cdp = await page.context().newCDPSession(page)
    const touch = (type: 'touchStart' | 'touchMove' | 'touchEnd', px: number, py: number) =>
      cdp.send('Input.dispatchTouchEvent', {
        type,
        touchPoints: type === 'touchEnd' ? [] : [{ x: px, y: py, id: 1 }],
      })
    await touch('touchStart', cx, cy)
    for (let i = 1; i <= 4; i++)
      await touch('touchMove', cx + ((x / n) * r * i) / 4, cy - ((y / n) * r * i) / 4)
    await page.waitForTimeout(ms)
    await touch('touchEnd', cx, cy)
    await cdp.detach()
    return
  }
  const keys = [
    ...(y > 0 ? ['ArrowUp'] : y < 0 ? ['ArrowDown'] : []),
    ...(x > 0 ? ['ArrowRight'] : x < 0 ? ['ArrowLeft'] : []),
  ]
  for (const k of keys) await page.keyboard.down(k)
  await page.waitForTimeout(ms)
  for (const k of keys) await page.keyboard.up(k)
}

test('HarooLife house: walk, eat, sleep, save, leave and come back', async ({ page }, testInfo) => {
  test.setTimeout(240_000)
  const mobile = testInfo.project.name.startsWith('mobile')
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))

  await page.goto('/haroolife', { waitUntil: 'domcontentloaded' })
  await expect(page.locator('canvas').first()).toBeVisible({ timeout: 30000 })
  await page.getByRole('button', { name: 'Maison', exact: true }).click()
  await page.getByRole('button', { name: 'Rentrer chez moi' }).click()
  await expect
    .poll(async () => (await live(page))?.lastEvent ?? '', { timeout: 60000 })
    .toMatch(/Tu es devant|Destination atteinte/)
  await page.getByRole('button', { name: 'Entrer ou sortir' }).click()
  await houseReady(page)
  await expect(page.locator('[data-hotspot]')).toHaveCount(7)
  await page.screenshot({ path: testInfo.outputPath('house.png') })

  // Four directions and the diagonals, each followed by its opposite (back near the start).
  const dirs: [number, number][] = [
    [0, 1],
    [0, -1],
    [-1, 0],
    [1, 0],
    [1, 1],
    [-1, -1],
    [-1, 1],
    [1, -1],
  ]
  for (const [x, y] of dirs) {
    const a = (await interior(page)) as Interior
    const sample = hold(page, mobile, x, y, 700)
    await page.waitForTimeout(450)
    const mid = (await interior(page)) as Interior
    await sample
    const b = (await interior(page)) as Interior
    const want = { x: RIGHT.x * x + FWD.x * y, z: RIGHT.z * x + FWD.z * y }
    const wl = Math.hypot(want.x, want.z)
    const dx = b.x - a.x
    const dz = b.z - a.z
    const d = Math.hypot(dx, dz)
    const label = `stick (${x}, ${y})`
    expect(d, `${label}: the player moves`).toBeGreaterThan(0.15)
    expect(
      (dx * want.x + dz * want.z) / (d * wl),
      `${label}: the way the stick points`,
    ).toBeGreaterThan(0.95)
    const facing = (Math.sin(b.heading) * want.x + Math.cos(b.heading) * want.z) / wl
    expect(facing, `${label}: facing forward, no moonwalk`).toBeGreaterThan(0.95)
    expect(mid.anim, `${label}: walk clip while walking`).toBe('Walk')
    await page.waitForTimeout(250)
  }

  // Eat: the 🍲 point walks the player to the stove; the game applies the meal once.
  const before = (await needs(page)) as Needs
  await page.locator('[data-hotspot="eat"]').click()
  await expect.poll(async () => (await interior(page))?.goal).toBe('stove')
  await expect
    .poll(async () => (await live(page))?.lastEvent, { timeout: 30000 })
    .toMatch(/Tu as mangé/)
  const fed = (await needs(page)) as Needs
  expect(fed.hunger).toBeGreaterThan(before.hunger)
  await page.waitForTimeout(2000)
  expect((await needs(page))?.hunger, 'one meal, one effect').toBe(fed.hunger)

  // Sleep: the 🌙 point walks the player to the bed; energy is restored.
  await page.locator('[data-hotspot="sleep"]').click()
  await expect.poll(async () => (await interior(page))?.goal).toBe('bed')
  await expect.poll(async () => (await live(page))?.lastEvent, { timeout: 30000 }).toMatch(/reposé/)
  const rested = (await needs(page)) as Needs
  expect(rested.energy).toBeGreaterThan(before.energy)
  await page.screenshot({ path: testInfo.outputPath('house-sleep.png') })

  // The save survives a reload: still at home, needs as left.
  await page.reload({ waitUntil: 'domcontentloaded' })
  await houseReady(page)
  expect((await live(page))?.inside).toBe('house')
  expect(await needs(page)).toMatchObject({ hunger: fed.hunger, energy: rested.energy })

  // Out by the door point and back in: one engine, the same GPU state, no stray markers.
  const gpu: string[] = []
  for (let i = 0; i < 3; i++) {
    await page.locator('[data-hotspot="exit"]').click()
    await expect.poll(async () => (await live(page))?.inside ?? null, { timeout: 30000 }).toBeNull()
    await expect(page.locator('[data-hotspot]')).toHaveCount(0)
    await page.getByRole('button', { name: 'Entrer ou sortir' }).click()
    await houseReady(page)
    expect(await page.locator('canvas').count(), 'street engine (paused) + house engine').toBe(2)
    await expect(page.locator('[data-hotspot]')).toHaveCount(7)
    gpu.push(
      await page.evaluate(() =>
        JSON.stringify(
          (
            window as unknown as {
              __LOME_SCENE: import('../lib/haroolife/engine/types').SceneProbe
            }
          ).__LOME_SCENE.gpu(),
        ),
      ),
    )
  }
  expect(new Set(gpu).size, `GPU state stays flat: ${gpu.join(' | ')}`).toBe(1)
  expect(errors).toEqual([])
})
