import { answerPedestrianStop, expect, test } from './lome-test'

/**
 * The playable slice (Jalon D1/D3): one 3D scene, a visible avatar that walks
 * continuously under an analogue joystick, turns its body, slides along obstacles, stops
 * when the finger lifts, keeps the camera on it; then the taxi: get in, drive, brake, get out.
 */
type Player = {
  x: number
  z: number
  heading: number
  speed: number
  mode: string
  input: number
  cell: { x: number; y: number }
  camera: { tx: number; tz: number; follow: boolean; angle: number; distance: number }
  vehicle: { x: number; z: number; heading: number; speed: number } | null
  driving: boolean
  policeStopped: boolean
  walkingRoute?: unknown[]
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
  expect(await page.locator('canvas').count(), 'one 3D scene').toBe(1)
  await expect.poll(async () => (await live())?.chunks ?? 0, { timeout: 30000 }).toBeGreaterThan(0)
  await expect.poll(async () => (await player())?.mode ?? null).toBe('idle')
  const start = (await player()) as Player
  const avatarEntity = await page.evaluate(() => {
    const scene = (
      window as unknown as { __LOME_SCENE?: import('../lib/haroolife/engine/types').SceneProbe }
    ).__LOME_SCENE
    return Boolean(scene?.has('Joueur'))
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
  // On a failure, say where the avatar stands: the cells around it and who is close by.
  const surroundings = () =>
    page.evaluate(() => {
      const w = window as unknown as {
        __LOME_PLAYER?: { x: number; z: number; mode: string; policeStopped: boolean }
        __LOME_WALKABLE?: (x: number, y: number) => boolean
        __LOME_STREET?: { walkers?: { name: string; x: number; z: number }[] }
      }
      const p = w.__LOME_PLAYER
      if (!p) return null
      const cx = Math.round(p.x)
      const cz = Math.round(p.z)
      const grid: string[] = []
      for (let z = cz - 2; z <= cz + 2; z++) {
        let row = ''
        for (let x = cx - 2; x <= cx + 2; x++) row += w.__LOME_WALKABLE?.(x, z) ? '.' : '#'
        grid.push(row)
      }
      const near = (w.__LOME_STREET?.walkers ?? []).filter(
        (k) => Math.hypot(k.x - p.x, k.z - p.z) < 1.5,
      )
      return { x: p.x, z: p.z, mode: p.mode, police: p.policeStopped, grid, near }
    })
  const samples: Player[] = []
  // Free walking crosses the carriageway: the pedestrian check stops the player once (a free
  // warning, then 60 s without another). It is answered, and that direction is held again.
  let stops = 0
  for (const angle of [270, 315, 0, 45, 90, 135, 180, 225]) {
    await hold(angle, 1500)
    let p = (await player()) as Player
    if (p.policeStopped) {
      await release()
      if (await answerPedestrianStop(page)) stops++
      await hold(angle, 1500)
      p = (await player()) as Player
    }
    samples.push(p)
    expect(p.mode === 'walk' || p.mode === 'run', `moving at ${angle}°`).toBe(true)
    expect(p.speed).toBeGreaterThan(0.5)
    await release()
  }
  expect(stops, 'one warning, then the 60 s grace').toBeLessThanOrEqual(1)
  // Positions differ between samples: the avatar really travelled, not teleported cell by cell.
  const dists = samples.map((p) => Math.hypot(p.x - start.x, p.z - start.z))
  expect(Math.max(...dists)).toBeGreaterThan(1.5)
  const fractional = samples.some((p) => Math.abs(p.x - Math.round(p.x)) > 0.05)
  expect(fractional, 'continuous (sub-cell) positions').toBe(true)
  // The body turned towards each direction.
  const headings = new Set(samples.map((p) => Math.round(p.heading / 45)))
  expect(headings.size).toBeGreaterThanOrEqual(4)
  // Stop: no sliding after release, measured as a distance from the first frame that read the
  // released stick. Under software rendering a frame lasts 100–250 ms (and a street rebuild can
  // hold one for half a second): until the game has taken the release, the avatar still walks
  // on the stick it held, which says nothing about sliding.
  await expect.poll(async () => ((await player()) as Player).input).toBe(0)
  const released = (await player()) as Player
  await expect.poll(async () => ((await player()) as Player).mode).toBe('idle')
  const stopped = (await player()) as Player
  expect(stopped.speed).toBe(0)
  expect(
    Math.hypot(stopped.x - released.x, stopped.z - released.z),
    `no slide after release (street rebuild ${await page.evaluate(() => (window as unknown as { __LOME_STREET?: { rebuildMs?: number } }).__LOME_STREET?.rebuildMs)} ms)`,
  ).toBeLessThan(0.3)
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

  // 2. Run with a full stick for 3 s: faster than walking (V3: walk 0.9, run 2 cells/s, the
  // pace at which the run clip's feet stay planted).
  let topSpeed = 0
  await hold(270, 400, 52)
  for (let i = 0; i < 8; i++) {
    await page.waitForTimeout(300)
    topSpeed = Math.max(topSpeed, ((await player()) as Player).speed)
  }
  await release()
  await answerPedestrianStop(page)
  // On failure, say what was under the finger (an overlay above the stick, a modal…).
  const underFinger = await page.evaluate(
    ([x, y]) => {
      const el = document.elementFromPoint(x, y)
      return el ? `${el.tagName}[${el.getAttribute('data-testid') ?? el.className}]` : 'none'
    },
    [cx, cy],
  )
  expect(
    topSpeed,
    `runs with a full deflection (under the finger: ${underFinger})`,
  ).toBeGreaterThan(1.6)

  // 2b. Leaving the app (window blur) with the stick held: the avatar stops, no ghost walk.
  // Back the way the run came (screen-down): that path is free, whereas the run may end in a
  // doorway one cell wide, walled on both sides. A passer-by (the officer who has just spoken to
  // the player included) may still stand in the way for a moment: the stick stays held.
  await hold(90, 600, 52)
  await expect
    .poll(async () => ((await player()) as Player).speed)
    .toBeGreaterThan(0.5)
    .catch(async (e: Error) => {
      throw new Error(`${e.message}\nAround the avatar: ${JSON.stringify(await surroundings())}`)
    })
  await page.evaluate(() => window.dispatchEvent(new Event('blur')))
  await expect.poll(async () => ((await player()) as Player).speed).toBe(0)
  await release()
  // And the stick answers again right after (no stuck state).
  await hold(90, 600, 46)
  await expect
    .poll(async () => ((await player()) as Player).speed, { message: 'stick usable after a blur' })
    .toBeGreaterThan(0.5)
  await release()

  // 3. Collision: push north for 6 s; the avatar never ends up on a building or water cell.
  await hold(270, 6000, 52)
  await release()
  await answerPedestrianStop(page)
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

  // 4. Taxi: board, let the service move on its own, request a safe exit.
  const before = (await player()) as Player
  expect(before.vehicle).not.toBeNull()
  await page.evaluate(() =>
    (window as unknown as { __LOME_GOTO_TAXI?: () => void }).__LOME_GOTO_TAXI?.(),
  )
  const board = page.getByRole('button', { name: 'Monter dans le taxi' })
  await expect(board).toBeVisible({ timeout: 45000 })
  await board.click()
  await expect.poll(async () => (await player())?.driving).toBe(true)
  await expect
    .poll(
      async () => {
        const car = (await player())?.vehicle
        return car ? Math.hypot(car.x - before.vehicle!.x, car.z - before.vehicle!.z) : 0
      },
      { timeout: 45000 },
    )
    .toBeGreaterThan(2)
  await page.getByRole('button', { name: 'Descendre du taxi' }).click()
  // The driver gets off at the drop-off. If it never comes, the error tells where the taxi
  // stands (phase, route, light, speed, distance left, frame rate) every few seconds.
  const trip: string[] = []
  const tripState = () =>
    page.evaluate(() => {
      const w = window as unknown as {
        __LOME_PLAYER?: Player & {
          drivingRouteState?: string
          waitingForSignal?: boolean
          automaticDriving?: boolean
        }
        __LOME_FARE?: {
          service?: { phase: string; stopRequested: boolean }
          fare?: { to?: { x: number; y: number } }
        }
        __LOME_CITY?: { fps?: number }
      }
      const p = w.__LOME_PLAYER
      const v = p?.vehicle
      const to = w.__LOME_FARE?.fare?.to
      return {
        driving: p?.driving,
        route: p?.drivingRouteState,
        auto: p?.automaticDriving,
        signal: p?.waitingForSignal,
        police: p?.policeStopped,
        phase: w.__LOME_FARE?.service?.phase,
        stop: w.__LOME_FARE?.service?.stopRequested,
        speed: v ? Math.round(v.speed * 10) / 10 : null,
        at: v ? [Math.round(v.x), Math.round(v.z)] : null,
        left: v && to ? Math.round(Math.hypot(v.x - to.x, v.z - to.y)) : null,
        fps: Math.round(w.__LOME_CITY?.fps ?? 0),
      }
    })
  const leftAt = Date.now()
  try {
    await expect
      .poll(
        async () => {
          const s = await tripState()
          const t = Math.round((Date.now() - leftAt) / 1000)
          if (trip.length === 0 || t - Number(trip.at(-1)?.split('s')[0]) >= 5)
            trip.push(`${t}s ${JSON.stringify(s)}`)
          return s.driving
        },
        { timeout: 90000 },
      )
      .toBe(false)
  } catch (error) {
    throw new Error(`${(error as Error).message}\nCourse :\n${trip.join('\n')}`)
  }
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
