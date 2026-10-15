import type { Page } from '@playwright/test'
import { expect, test } from './lome-test'

/**
 * M0 (D4+): « je ne peux pas entrer dans ma maison depuis mon téléphone ».
 * Real continuous movement (touch joystick on the Android profile, mouse on desktop), one tap
 * on « Entrer — Maison », back out in front of the same door, as many times as wanted; also
 * after « Rentrer chez moi », after the taxi, across a reload, and with key E on a PC.
 */
type Player = {
  x: number
  z: number
  heading: number
  mode: string
  camera: { angle: number }
  driving: boolean
}
type Live = { inside: string | null; at: { x: number; y: number }; chunks: number; route: number }
// The player's house: estate building (9, 9) = world cell (58, 31).
const HOUSE = { x: 58, z: 31 }

const player = (page: Page) =>
  page.evaluate(() => (window as unknown as { __LOME_PLAYER?: Player }).__LOME_PLAYER ?? null)
const live = (page: Page) =>
  page.evaluate(() => (window as unknown as { __LOME_CITY?: Live }).__LOME_CITY ?? null)

async function stick(page: Page, mobile: boolean) {
  const box = (await page.getByTestId('joystick').boundingBox()) as {
    x: number
    y: number
    width: number
    height: number
  }
  const cx = box.x + box.width / 2
  const cy = box.y + box.height / 2
  const cdp = mobile ? await page.context().newCDPSession(page) : null
  const send = async (type: 'start' | 'move' | 'end', x = cx, y = cy) => {
    if (cdp) {
      await cdp.send('Input.dispatchTouchEvent', {
        type: type === 'start' ? 'touchStart' : type === 'move' ? 'touchMove' : 'touchEnd',
        touchPoints: type === 'end' ? [] : [{ x, y, id: 1 }],
      })
    } else if (type === 'start') {
      await page.mouse.move(x, y)
      await page.mouse.down()
    } else if (type === 'move') await page.mouse.move(x, y)
    else await page.mouse.up()
  }
  /** Steer the avatar towards a world point with the joystick (closed loop on its pose). */
  return async (tx: number, tz: number, tol = 0.2) => {
    await send('start')
    for (let i = 0; i < 500; i++) {
      const p = (await player(page)) as Player
      const dx = tx - p.x
      const dz = tz - p.z
      const d = Math.hypot(dx, dz)
      if (d < tol) break
      const a = (p.camera.angle * Math.PI) / 180
      const iy = (dx * -Math.sin(a) + dz * -Math.cos(a)) / d
      const ix = (dx * Math.cos(a) + dz * -Math.sin(a)) / d
      const r = d < 1 ? 22 : 44
      await send('move', cx + ix * r, cy - iy * r)
      await page.waitForTimeout(50)
    }
    await send('end')
    await expect.poll(async () => (await player(page))?.mode).toBe('idle')
  }
}

test('enter and leave my house with continuous movement, taxi and reload', async ({
  page,
}, testInfo) => {
  test.setTimeout(300_000)
  const mobile = /mobile/.test(testInfo.project.name)
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
  await expect.poll(async () => (await player(page))?.mode ?? null).toBe('idle')
  await page.evaluate(() => {
    const w = window as unknown as { __LOST?: number }
    w.__LOST = 0
    document.querySelector('canvas')?.addEventListener('webglcontextlost', () => {
      w.__LOST = (w.__LOST ?? 0) + 1
    })
  })
  const door = page.getByTestId('door-action')
  // The spawn cell on the avenue is the door of an apartment block: offered, by name.
  await expect(door).toContainText('Immeuble')

  // 1. New game, across the lawn to the west wall of the house (the case that failed).
  const walk = await stick(page, mobile)
  await walk(52, 33)
  await walk(56.4, 31.2)
  await walk(HOUSE.x - 0.75, HOUSE.z, 0.15)
  await expect(door).toBeVisible()
  await expect(door).toContainText('Entrer')
  await expect(door).toContainText('Maison')
  await page.screenshot({ path: testInfo.outputPath('door-west-lawn.png') })
  const before = (await player(page)) as Player

  // 2. One tap in, one tap out, five times: back in front of the same door each time.
  for (let i = 0; i < 5; i++) {
    await (mobile ? door.tap() : door.click())
    await expect.poll(async () => (await live(page))?.inside).toBe('house')
    await expect(door).toContainText('Sortir')
    if (i === 0) await page.screenshot({ path: testInfo.outputPath('door-inside.png') })
    await (mobile ? door.tap() : door.click())
    await expect.poll(async () => (await live(page))?.inside ?? null).toBe(null)
    await expect.poll(async () => (await player(page))?.mode ?? null).toBe('idle')
    const p = (await player(page)) as Player
    expect(Math.hypot(p.x - before.x, p.z - before.z), 'back at the same door').toBeLessThan(0.3)
    await expect(door).toContainText('Entrer')
  }

  // 3. A sheet opened and closed does not cover or break the button.
  await page.getByLabel('Afficher les besoins du personnage').click()
  await page.keyboard.press('Escape')
  await expect(door).toBeVisible()

  // 4. Leave the door, the button disappears; « Rentrer chez moi » guides back to it.
  // Out on the estate lawn, far from any door: no « Entrer » button at all.
  await walk(52, 33)
  await expect(door).toHaveCount(0)
  await page.getByLabel('Afficher les besoins du personnage').click()
  await page.getByRole('button', { name: 'Rentrer chez moi' }).click()
  await expect.poll(async () => (await live(page))?.route ?? 1, { timeout: 60000 }).toBe(0)
  await expect.poll(async () => (await player(page))?.mode).toBe('idle')
  // The button works on arrival, without selecting the building again.
  await expect(door).toContainText('Maison')
  await (mobile ? door.tap() : door.click())
  await expect.poll(async () => (await live(page))?.inside).toBe('house')

  // 5. Reload while inside: still inside, then out in front of the door.
  await page.reload({ waitUntil: 'domcontentloaded' })
  await expect
    .poll(async () => (await live(page))?.inside ?? null, { timeout: 30000 })
    .toBe('house')
  await (mobile ? door.tap() : door.click())
  await expect.poll(async () => (await live(page))?.inside ?? null).toBe(null)
  await expect.poll(async () => (await player(page))?.mode ?? null).toBe('idle')
  const out = (await player(page)) as Player
  expect(Math.abs(out.x - HOUSE.x), 'out by the house').toBeLessThan(1.6)
  expect(Math.abs(out.z - HOUSE.z), 'out by the house').toBeLessThan(1.6)

  // 6. Taxi: walk to it, drive a little, get out, come home, enter.
  await page.evaluate(() =>
    (window as unknown as { __LOME_GOTO_TAXI?: () => void }).__LOME_GOTO_TAXI?.(),
  )
  await expect.poll(async () => (await live(page))?.route ?? 1, { timeout: 60000 }).toBe(0)
  const board = page.getByRole('button', { name: 'Monter dans le taxi' })
  await expect(board).toBeVisible()
  await board.click()
  await expect.poll(async () => (await player(page))?.driving).toBe(true)
  // No door while driving.
  await expect(door).toHaveCount(0)
  await page.getByRole('button', { name: 'Descendre du taxi' }).click()
  await expect.poll(async () => (await player(page))?.driving).toBe(false)
  await page.getByLabel('Afficher les besoins du personnage').click()
  await page.getByRole('button', { name: 'Rentrer chez moi' }).click()
  await expect.poll(async () => (await live(page))?.route ?? 1, { timeout: 60000 }).toBe(0)
  await expect(door).toContainText('Maison')
  if (mobile) await door.tap()
  else await page.keyboard.press('e') // 7. key E on a PC
  await expect.poll(async () => (await live(page))?.inside).toBe('house')
  // Back out (key E on a PC, the door button on a phone): the interior renderer is torn down.
  if (mobile) await door.tap()
  else await page.keyboard.press('e')
  await expect.poll(async () => (await live(page))?.inside ?? null).toBe(null)

  await expect.poll(() => page.locator('canvas').count(), 'one canvas').toBe(1)
  expect(await page.evaluate(() => (window as unknown as { __LOST?: number }).__LOST ?? 0)).toBe(0)
  expect(errors).toEqual([])
})
