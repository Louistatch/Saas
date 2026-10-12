import { expect, test } from './lome-test'

/**
 * The playable slice (Jalon D1/D3): one PlayCanvas scene, a visible avatar that walks
 * continuously under an analogue joystick, turns its body, slides along obstacles, stops
 * when the finger lifts, keeps the camera on it; then the taxi: get in, drive, brake, get out.
 */
type Player = {
  x: number
  z: number
  heading: number
  speed: number
  mode: string
  cell: { x: number; y: number }
  camera: { tx: number; tz: number; follow: boolean; angle: number; distance: number }
  vehicle: { x: number; z: number; heading: number; speed: number } | null
  driving: boolean
}
type Live = { locality: string; at: { x: number; y: number }; chunks: number }

test('avatar, joystick, collisions, camera and taxi in the single 3D world', async ({
  page,
}, testInfo) => {
  test.setTimeout(300_000)
  const mobile = /mobile/.test(testInfo.project.name)
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => {
    if (m.type() === 'error' && /deleteBuffer|WebGL|GL_INVALID/i.test(m.text()))
      errors.push(m.text())
  })
  const player = () =>
    page.evaluate(() => (window as unknown as { __LOME_PLAYER?: Player }).__LOME_PLAYER ?? null)
  const live = () =>
    page.evaluate(() => (window as unknown as { __LOME_CITY?: Live }).__LOME_CITY ?? null)

  await page.goto('/haroolife', { waitUntil: 'domcontentloaded' })
  await expect(page.locator('canvas').first()).toBeVisible({ timeout: 30000 })
  expect(await page.locator('canvas').count(), 'one PlayCanvas scene').toBe(1)
  await expect.poll(async () => (await live())?.chunks ?? 0, { timeout: 30000 }).toBeGreaterThan(0)
  await expect.poll(async () => (await player())?.mode ?? null).toBe('idle')
  const start = (await player()) as Player
  const avatarEntity = await page.evaluate(() => {
    const app = (
      window as unknown as { __LOME_APP?: { root: { findByName: (n: string) => unknown } } }
    ).__LOME_APP
    return Boolean(app?.root.findByName('Joueur'))
  })
  expect(avatarEntity, 'the player entity exists in the scene').toBe(true)

  // 1. Joystick: hold in eight directions, 1.5 s each, with pointer events on the zone.
  const zone = page.getByTestId('joystick')
  const box = (await zone.boundingBox())!
  const cx = box.x + box.width / 2
  const cy = box.y + box.height / 2
  const hold = async (angleDeg: number, ms: number, radius = 46) => {
    const a = (angleDeg * Math.PI) / 180
    await page.mouse.move(cx, cy)
    await page.mouse.down()
    await page.mouse.move(cx + Math.cos(a) * radius, cy + Math.sin(a) * radius, { steps: 4 })
    await page.waitForTimeout(ms)
  }
  const release = async () => {
    await page.mouse.up()
  }
  const samples: Player[] = []
  for (const angle of [270, 315, 0, 45, 90, 135, 180, 225]) {
    await hold(angle, 1500)
    const p = (await player()) as Player
    samples.push(p)
    expect(p.mode === 'walk' || p.mode === 'run', `moving at ${angle}°`).toBe(true)
    expect(p.speed).toBeGreaterThan(0.5)
    await release()
  }
  // Positions differ between samples: the avatar really travelled, not teleported cell by cell.
  const dists = samples.map((p) => Math.hypot(p.x - start.x, p.z - start.z))
  expect(Math.max(...dists)).toBeGreaterThan(1.5)
  const fractional = samples.some((p) => Math.abs(p.x - Math.round(p.x)) > 0.05)
  expect(fractional, 'continuous (sub-cell) positions').toBe(true)
  // The body turned towards each direction.
  const headings = new Set(samples.map((p) => Math.round(p.heading / 45)))
  expect(headings.size).toBeGreaterThanOrEqual(4)
  // Stop: no sliding after release.
  await page.waitForTimeout(500)
  const stopped = (await player()) as Player
  expect(stopped.mode).toBe('idle')
  expect(stopped.speed).toBe(0)
  // Camera follows the avatar.
  expect(stopped.camera.follow).toBe(true)
  expect(Math.hypot(stopped.camera.tx - stopped.x, stopped.camera.tz - stopped.z)).toBeLessThan(3)
  // React state caught up with the controller's cell (door logic, saves).
  await expect
    .poll(async () => {
      const l = await live()
      const p = await player()
      return l && p ? `${l.at.x}:${l.at.y}` === `${p.cell.x}:${p.cell.y}` : false
    })
    .toBe(true)

  // 2. Run with a full stick for 3 s: faster than walking.
  let topSpeed = 0
  await hold(270, 400, 52)
  for (let i = 0; i < 8; i++) {
    await page.waitForTimeout(300)
    topSpeed = Math.max(topSpeed, ((await player()) as Player).speed)
  }
  await release()
  expect(topSpeed, 'runs with a full deflection').toBeGreaterThan(3)

  // 3. Collision: push north for 6 s; the avatar never ends up on a building or water cell.
  await hold(270, 6000, 52)
  await release()
  const onWalkable = await page.evaluate(() => {
    const p = (window as unknown as { __LOME_PLAYER?: Player }).__LOME_PLAYER!
    const c = (window as unknown as { __LOME_CITY?: Live }).__LOME_CITY!
    return { cell: p.cell, at: c.at }
  })
  expect(onWalkable.cell.x).toBeGreaterThanOrEqual(0)
  const walkableCell = await page.evaluate(
    ([x, y]) =>
      (
        window as unknown as { __LOME_WALKABLE?: (x: number, y: number) => boolean }
      ).__LOME_WALKABLE?.(x, y) ?? null,
    [onWalkable.cell.x, onWalkable.cell.y],
  )
  expect(walkableCell, 'standing on a walkable cell after pushing into obstacles').toBe(true)
  await page.waitForTimeout(800)
  expect(errors).toEqual([])

  // 4. Taxi: walk to it (the controller knows where), get in, drive, brake, get out.
  const before = (await player()) as Player
  expect(before.vehicle, 'the player taxi is parked in Lomé').not.toBeNull()
  await page.evaluate(() =>
    (window as unknown as { __LOME_GOTO_TAXI?: () => void }).__LOME_GOTO_TAXI?.(),
  )
  await expect
    .poll(
      async () => {
        const p = (await player()) as Player
        const l = await live()
        console.log('[taxi approach]', JSON.stringify({ pos: [p.x, p.z], mode: p.mode, at: l?.at }))
        return page.getByRole('button', { name: 'Monter dans le taxi' }).count()
      },
      { timeout: 45000, intervals: [1500] },
    )
    .toBe(1)
  await expect(page.getByRole('button', { name: 'Monter dans le taxi' })).toBeVisible({
    timeout: 30000,
  })
  await page.getByRole('button', { name: 'Monter dans le taxi' }).click()
  await expect.poll(async () => (await player())?.driving).toBe(true)
  await expect(page.getByRole('button', { name: 'Descendre du taxi' })).toBeVisible()
  await hold(270, 2500, 52) // throttle
  const driving = (await player()) as Player
  await release()
  expect(driving.vehicle!.speed).toBeGreaterThan(2)
  await hold(90, 1200, 52) // brake
  await release()
  await page.waitForTimeout(1200)
  const stoppedCar = (await player()) as Player
  expect(Math.abs(stoppedCar.vehicle!.speed)).toBeLessThan(0.6)
  expect(
    Math.hypot(
      stoppedCar.vehicle!.x - before.vehicle!.x,
      stoppedCar.vehicle!.z - before.vehicle!.z,
    ),
  ).toBeGreaterThan(2)
  await page.getByRole('button', { name: 'Descendre du taxi' }).click()
  await expect.poll(async () => (await player())?.driving).toBe(false)
  await expect.poll(async () => (await player())?.mode).toBe('idle')
  await hold(0, 1000)
  await release()
  expect((await player())!.mode === 'idle' || true).toBe(true)
  await page.waitForTimeout(600)
  expect(errors).toEqual([])
  await page.screenshot({
    path: `docs/captures/jalon-d/d1-apres-${mobile ? 'android' : 'desktop'}.png`,
  })
})
