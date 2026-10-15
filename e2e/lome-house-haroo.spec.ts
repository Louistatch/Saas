import type { Page } from '@playwright/test'
import { expect, openPlaces, test } from './lome-test'

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

/**
 * Pushes the stick in a direction (screen axes, x right, y up): touch joystick on Android, keys
 * on desktop. Resolves once the stick is held; call the returned function to release it.
 */
async function press(
  page: Page,
  mobile: boolean,
  x: number,
  y: number,
): Promise<() => Promise<void>> {
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
    return async () => {
      await touch('touchEnd', cx, cy)
      await cdp.detach()
    }
  }
  const keys = [
    ...(y > 0 ? ['ArrowUp'] : y < 0 ? ['ArrowDown'] : []),
    ...(x > 0 ? ['ArrowRight'] : x < 0 ? ['ArrowLeft'] : []),
  ]
  for (const k of keys) await page.keyboard.down(k)
  return async () => {
    for (const k of keys) await page.keyboard.up(k)
  }
}

test('HarooLife house: walk, eat, sleep, save, leave and come back', async ({ page }, testInfo) => {
  test.setTimeout(240_000)
  const mobile = testInfo.project.name.startsWith('mobile')
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))

  await page.goto('/haroolife', { waitUntil: 'domcontentloaded' })
  await expect(page.locator('canvas:visible').first()).toBeVisible({ timeout: 30000 })
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
    const release = await press(page, mobile, x, y)
    // The walk clip while the stick is held (sampled once it is pushed, not while pushing).
    await expect
      .poll(async () => (await interior(page))?.anim, { message: `stick (${x}, ${y}): walk clip` })
      .toBe('Walk')
    await page.waitForTimeout(400)
    // Facing is read while the stick is held: keys are released one after the other, and in
    // between the player rightly turns towards the one still pressed.
    const held = (await interior(page)) as Interior
    await release()
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
    const facing = (Math.sin(held.heading) * want.x + Math.cos(held.heading) * want.z) / wl
    expect(facing, `${label}: facing forward, no moonwalk`).toBeGreaterThan(0.95)
    await page.waitForTimeout(250)
  }

  // Eat: the 🍲 point walks the player to the stove; the game applies the meal once.
  const before = (await needs(page)) as Needs
  await page.locator('[data-hotspot="eat"]').click()
  await expect.poll(async () => (await interior(page))?.goal).toBe('stove')
  await expect
    .poll(async () => (await live(page))?.lastEvent, { timeout: 30000 })
    .toMatch(/Tu as mangé/)
  // The save is throttled (400 ms): wait for the written value.
  await expect.poll(async () => (await needs(page))?.hunger).toBeGreaterThan(before.hunger)
  const fed = (await needs(page)) as Needs
  await page.waitForTimeout(2000)
  expect((await needs(page))?.hunger, 'one meal, one effect').toBe(fed.hunger)

  // Sleep: the 🌙 point walks the player to the bed; energy is restored.
  await page.locator('[data-hotspot="sleep"]').click()
  await expect.poll(async () => (await interior(page))?.goal).toBe('bed')
  await expect.poll(async () => (await live(page))?.lastEvent, { timeout: 30000 }).toMatch(/reposé/)
  await expect.poll(async () => (await needs(page))?.energy).toBeGreaterThan(before.energy)
  const rested = (await needs(page)) as Needs
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
    expect(await page.locator('canvas').count(), 'one engine at a time: the house only').toBe(1)
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

test('HarooLife market: travel, buy a meal once, talk to the seller, leave', async ({ page }) => {
  test.setTimeout(240_000)
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  const save = () =>
    page.evaluate(
      () =>
        JSON.parse(localStorage.getItem('haroolife.lome-city.v1') || 'null')?.life as {
          wallet: number
          meals: number
        },
    )
  await page.goto('/haroolife', { waitUntil: 'domcontentloaded' })
  await expect(page.locator('canvas:visible').first()).toBeVisible({ timeout: 30000 })
  await openPlaces(page)
  await page
    .getByRole('group', { name: 'Filtrer la ville' })
    .getByRole('button', { name: 'Commerces' })
    .click()
  await page
    .getByRole('button', { name: /^\S+ Marché de Tokoin/ })
    .first()
    .click()
  const sheet = page.getByRole('dialog', { name: 'Lieu' })
  await sheet.getByRole('button', { name: /Zémidjan/ }).click()
  await sheet.getByRole('button', { name: 'Confirmer le trajet' }).click()
  await expect
    .poll(
      async () => {
        const c = await live(page)
        return c ? (c as unknown as { route: number }).route : 99
      },
      { timeout: 60000 },
    )
    .toBe(0)
  const back = page.getByRole('button', { name: 'Retour au jeu' })
  if (await back.isVisible().catch(() => false)) await back.click()
  await page.getByRole('button', { name: 'Entrer ou sortir' }).click()
  await expect
    .poll(
      () =>
        page.evaluate(
          () =>
            (window as unknown as { __LOME_INTERIOR?: { scene?: string } }).__LOME_INTERIOR
              ?.scene ?? null,
        ),
      { timeout: 60000 },
    )
    .toBe('market')

  // Buy from the activities: the player walks to the counter, the rule applies once.
  const before = await save()
  await page.getByRole('button', { name: /Activités du lieu|Activités · / }).click()
  await sheet
    .getByRole('button', { name: /Acheter un repas/ })
    .first()
    .click()
  await expect
    .poll(async () => (await live(page))?.lastEvent ?? '', { timeout: 30000 })
    .toMatch(/Un repas acheté/)
  await expect.poll(async () => (await save()).wallet).toBe(before.wallet - 650)
  const bought = await save()
  expect(bought.meals).toBe(before.meals + 1)
  await page.waitForTimeout(1500)
  expect((await save()).wallet, 'one purchase, one payment').toBe(bought.wallet)

  // The seller is a character of the game: reaching them opens the conversation.
  await page.locator('[data-hotspot="npc:seller"]').click()
  await expect(page.getByLabel('Conversation')).toBeVisible({ timeout: 30000 })
  await expect(page.getByLabel('Conversation')).toContainText('PNJ')
  await page.getByLabel('Conversation').getByRole('button', { name: 'Fermer' }).click()

  await page.getByRole('button', { name: 'Entrer ou sortir' }).click()
  await expect.poll(async () => (await live(page))?.inside ?? null).toBeNull()
  expect(errors).toEqual([])
})

test('HarooLife street and clear map: walk, places without overlap, sheet, route on foot', async ({
  page,
}) => {
  test.setTimeout(180_000)
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  // Every script the page loads, to prove the PlayCanvas engine is never downloaded.
  const scripts: Promise<boolean>[] = []
  page.on('response', (r) => {
    if (r.request().resourceType() === 'script')
      scripts.push(
        r
          .text()
          .then((t) => t.includes('playcanvas.com/engine'))
          .catch(() => false),
      )
  })
  type Player = { x: number; z: number; heading: number; mode: string; camera: { angle: number } }
  const player = () =>
    page.evaluate(() => (window as unknown as { __LOME_PLAYER?: Player }).__LOME_PLAYER ?? null)
  await page.goto('/haroolife', { waitUntil: 'domcontentloaded' })
  await expect
    .poll(
      () =>
        page.evaluate(
          () =>
            (window as unknown as { __LOME_STREET?: { engine: string; buildings: number } })
              .__LOME_STREET ?? null,
        ),
      { timeout: 60000 },
    )
    .toMatchObject({ engine: 'haroo' })
  // One engine draws the street: one canvas.
  expect(await page.locator('canvas').count()).toBe(1)

  // Screen up walks away from the camera, facing forward.
  const a = (await player()) as Player
  await page.keyboard.down('ArrowUp')
  await expect.poll(async () => (await player())?.mode).toMatch(/walk|run/)
  await page.waitForTimeout(600)
  const held = (await player()) as Player
  await page.keyboard.up('ArrowUp')
  const yaw = (a.camera.angle * Math.PI) / 180
  const fwd = { x: -Math.sin(yaw), z: -Math.cos(yaw) }
  const dx = held.x - a.x
  const dz = held.z - a.z
  const d = Math.hypot(dx, dz)
  expect(d).toBeGreaterThan(0.3)
  expect((dx * fwd.x + dz * fwd.z) / d).toBeGreaterThan(0.85)
  const h = (held.heading * Math.PI) / 180
  expect(Math.sin(h) * fwd.x + Math.cos(h) * fwd.z).toBeGreaterThan(0.85)

  // The clear map: districts, places that never overlap, a sheet with the trip.
  await page
    .getByRole('navigation', { name: 'Navigation du jeu' })
    .getByRole('button', { name: 'Carte' })
    .click()
  await expect(page.getByTestId('city-map')).toBeVisible()
  const places = await page.locator('[data-place]').evaluateAll((els) =>
    els.map((e) => {
      const r = e.getBoundingClientRect()
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 }
    }),
  )
  expect(places.length).toBeGreaterThan(5)
  for (let i = 0; i < places.length; i++)
    for (let j = i + 1; j < places.length; j++)
      expect(
        Math.hypot(places[i].x - places[j].x, places[i].y - places[j].y),
        'markers never overlap',
      ).toBeGreaterThanOrEqual(36)
  await page.locator('[data-place]').first().click()
  const sheet = page.getByRole('dialog', { name: 'Lieu' })
  await expect(sheet).toBeVisible()
  await expect(sheet.getByRole('button', { name: /À pied/ })).toBeVisible()
  await sheet.getByRole('button', { name: /À pied/ }).click()
  const confirm = sheet.getByRole('button', { name: 'Confirmer le trajet' })
  if (await confirm.isVisible().catch(() => false)) await confirm.click()
  // A real route is walked in the street, the map gives way to the game.
  await expect(page.getByTestId('city-map')).toBeHidden({ timeout: 10000 })
  await expect
    .poll(async () => (await live(page)) as unknown as { route: number } | null)
    .not.toBeNull()
  // The street, its map and the walk never loaded PlayCanvas (only ?engine=playcanvas does).
  const playcanvas = (await Promise.all(scripts)).filter(Boolean).length
  expect(scripts.length, 'scripts observed').toBeGreaterThan(0)
  expect(playcanvas, 'PlayCanvas engine chunks downloaded').toBe(0)
  expect(errors).toEqual([])
})

test('HarooLife street billboards: built near, read, learn more, statistics', async ({
  page,
  context,
}, testInfo) => {
  test.setTimeout(180_000)
  const mobile = /mobile/.test(testInfo.project.name)
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  type Ads = { built: string[]; showing: Record<string, string>; impressions: number }
  const ads = () =>
    page.evaluate(() => (window as unknown as { __LOME_ADS?: Ads }).__LOME_ADS ?? null)
  type P = { x: number; z: number; camera: { angle: number } }
  const me = () =>
    page.evaluate(() => (window as unknown as { __LOME_PLAYER?: P }).__LOME_PLAYER ?? null)
  await page.goto('/haroolife', { waitUntil: 'domcontentloaded' })
  await expect
    .poll(
      () =>
        page.evaluate(
          () => (window as unknown as { __LOME_STREET?: { engine: string } }).__LOME_STREET?.engine,
        ),
      { timeout: 60000 },
    )
    .toBe('haroo')
  // Both supports near the arrival are built, each with its poster, at a small geometric cost.
  await expect.poll(async () => (await ads())?.built.length ?? 0, { timeout: 15000 }).toBe(2)
  const own = await page.evaluate(() => {
    const s = (
      window as unknown as { __LOME_SCENE?: import('../lib/haroolife/engine/types').SceneProbe }
    ).__LOME_SCENE
    return {
      g: s?.geometry('^Panneau (lome|kara)-') ?? { matches: 0, triangles: 0 },
      names: ['Panneau lome-avenue', 'Affiche lome-avenue', 'Panneau lome-jardin'].map((n) =>
        Boolean(s?.has(n)),
      ),
    }
  })
  expect(own.names).toEqual([true, true, true])
  expect(own.g.matches).toBe(2)
  expect(own.g.triangles / own.g.matches, 'triangles per support').toBeLessThan(100)

  // Walk next to the avenue support: « Lire l'annonce » appears.
  const read = page.getByTestId('ad-read')
  for (let i = 0; i < 80; i++) {
    const p = await me()
    if (!p) break
    const dx = 48.1 - p.x
    const dz = 36.2 - p.z
    if (Math.hypot(dx, dz) < 0.35) break
    const a = (p.camera.angle * Math.PI) / 180
    const up = -dx * Math.sin(a) - dz * Math.cos(a)
    const right = dx * Math.cos(a) - dz * Math.sin(a)
    const key =
      Math.abs(up) > Math.abs(right)
        ? up > 0
          ? 'ArrowUp'
          : 'ArrowDown'
        : right > 0
          ? 'ArrowRight'
          : 'ArrowLeft'
    await page.keyboard.down(key)
    await page.waitForTimeout(140)
    await page.keyboard.up(key)
  }
  await expect(read).toBeVisible({ timeout: 5000 })
  await page.screenshot({ path: testInfo.outputPath('haroo-billboard-street.png') })
  await (mobile ? read.tap() : read.click())
  await expect(page.getByTestId('ad-focus')).toBeVisible()
  const popup = context.waitForEvent('page')
  await page.getByTestId('ad-learn-more').click()
  const tab = await popup
  expect(new URL(tab.url()).pathname).toMatch(/^\/(marche|haroo|contact)/)
  await tab.close()
  await page.getByRole('button', { name: 'Retour au jeu' }).click()

  // Aggregated statistics: the click is counted, nothing personal is sent.
  const sent = page.waitForRequest(
    (r) => r.url().endsWith('/api/haroolife/ads/events') && r.method() === 'POST',
  )
  await page.evaluate(() =>
    (window as unknown as { __LOME_ADS_FLUSH?: () => void }).__LOME_ADS_FLUSH?.(),
  )
  const body = (await sent).postDataJSON() as {
    items: { placement: string; clicks: number }[]
  }
  expect(body.items.some((i) => i.placement === 'lome-avenue' && i.clicks === 1)).toBe(true)
  expect(JSON.stringify(body)).not.toMatch(/@|user|email|phone/)
  expect(errors).toEqual([])
})

test('HarooLife street taxi: walk to it, get in, drive, brake, get out', async ({
  page,
}, testInfo) => {
  test.setTimeout(180_000)
  const mobile = /mobile/.test(testInfo.project.name)
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  type V = { x: number; z: number; heading: number; speed: number }
  type P = { x: number; z: number; mode: string; driving: boolean; vehicle: V | null }
  const me = () =>
    page.evaluate(() => (window as unknown as { __LOME_PLAYER?: P }).__LOME_PLAYER ?? null)
  const scene = (fn: string) =>
    page.evaluate((name) => {
      const s = (
        window as unknown as { __LOME_SCENE?: import('../lib/haroolife/engine/types').SceneProbe }
      ).__LOME_SCENE
      return s?.childNames(name) ?? null
    }, fn)
  await page.goto('/haroolife', { waitUntil: 'domcontentloaded' })
  await expect
    .poll(
      () =>
        page.evaluate(
          () => (window as unknown as { __LOME_STREET?: { engine: string } }).__LOME_STREET?.engine,
        ),
      { timeout: 60000 },
    )
    .toBe('haroo')
  const before = (await me()) as P
  expect(before.vehicle, 'the player taxi is parked in Lomé').not.toBeNull()
  // The Kenney taxi model (not a placeholder volume), with its four wheels.
  await expect.poll(() => scene('Taxi du joueur'), { timeout: 20000 }).not.toBeNull()
  const wheels = await page.evaluate(() => {
    const s = (
      window as unknown as { __LOME_SCENE?: import('../lib/haroolife/engine/types').SceneProbe }
    ).__LOME_SCENE
    return ['wheel-front-left', 'wheel-front-right', 'wheel-back-left', 'wheel-back-right'].every(
      (n) => s?.has(n),
    )
  })
  expect(wheels, 'taxi model with its wheels').toBe(true)

  // Walk to it (the controller's own route), get in.
  await page.evaluate(() =>
    (window as unknown as { __LOME_GOTO_TAXI?: () => void }).__LOME_GOTO_TAXI?.(),
  )
  const getIn = page.getByRole('button', { name: 'Monter dans le taxi' })
  await expect(getIn).toBeVisible({ timeout: 45000 })
  await (mobile ? getIn.tap() : getIn.click())
  await expect.poll(async () => (await me())?.driving).toBe(true)
  await expect(page.getByRole('button', { name: 'Descendre du taxi' })).toBeVisible()
  // Seated: the walking figure is not drawn beside the car.
  expect(
    await page.evaluate(() => {
      const s = (
        window as unknown as { __LOME_SCENE?: import('../lib/haroolife/engine/types').SceneProbe }
      ).__LOME_SCENE
      return s?.has('Joueur')
    }),
  ).toBe(true)

  // Throttle (screen up), then brake (screen down).
  await page.keyboard.down('ArrowUp')
  await expect
    .poll(async () => (await me())?.vehicle?.speed ?? 0, { timeout: 8000 })
    .toBeGreaterThan(2)
  // Keep the throttle a moment at speed (2.5 s in all).
  await page.waitForTimeout(1200)
  await page.screenshot({ path: testInfo.outputPath('haroo-taxi-driving.png') })
  await page.keyboard.up('ArrowUp')
  // Brake a moment (held longer, the same key reverses), then the car coasts to a stop.
  await page.keyboard.down('ArrowDown')
  await page.waitForTimeout(500)
  await page.keyboard.up('ArrowDown')
  await expect
    .poll(async () => Math.abs((await me())?.vehicle?.speed ?? 9), { timeout: 8000 })
    .toBeLessThan(0.6)
  const stopped = (await me()) as P
  expect(
    Math.hypot(stopped.vehicle!.x - before.vehicle!.x, stopped.vehicle!.z - before.vehicle!.z),
    'the taxi drove',
  ).toBeGreaterThan(2)

  // Get out: on foot again, beside the car.
  await page.getByRole('button', { name: 'Descendre du taxi' }).click()
  await expect.poll(async () => (await me())?.driving).toBe(false)
  await expect.poll(async () => (await me())?.mode).toBe('idle')
  const out = (await me()) as P
  expect(Math.hypot(out.x - stopped.vehicle!.x, out.z - stopped.vehicle!.z)).toBeLessThan(2)
  expect(errors).toEqual([])
})
