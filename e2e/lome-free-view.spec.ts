import fs from 'node:fs'
import path from 'node:path'
import { expect, test } from './lome-test'

/**
 * « Vue libre », after Slop New York's chase camera (mrdoob, MIT): chosen in the phone's settings,
 * the street is seen from behind the player, the camera swings back behind them as they walk, and
 * the stick stays camera-relative (forward walks away from the camera). The classic view stays
 * the default and comes back from the same setting; the choice survives a reload.
 */
type Player = { x: number; z: number; heading: number; mode: string; camera: { angle: number } }
type SceneProbe = import('../lib/haroolife/engine/types').SceneProbe

const player = (page: import('@playwright/test').Page) =>
  page.evaluate(() => (window as unknown as { __LOME_PLAYER?: Player }).__LOME_PLAYER ?? null)
const view = (page: import('@playwright/test').Page) =>
  page.evaluate(
    () => (window as unknown as { __LOME_SCENE?: SceneProbe }).__LOME_SCENE?.view?.() ?? null,
  )

test('free view: the camera follows behind the player and the stick walks away from it', async ({
  page,
}, testInfo) => {
  test.setTimeout(240_000)
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => {
    if (m.type() === 'error' && /Shader Error|WebGLProgram|GL_INVALID/.test(m.text()))
      errors.push(m.text())
  })
  const dir = path.join('test-results', 'lome-free-view')
  fs.mkdirSync(dir, { recursive: true })
  const shot = (name: string) =>
    page.screenshot({ path: path.join(dir, `${testInfo.project.name}-${name}.png`) })

  await page.addInitScript(() => {
    if (!sessionStorage.getItem('free-view-set')) {
      localStorage.setItem('haroolife.view', 'free')
      sessionStorage.setItem('free-view-set', '1')
    }
  })
  await page.goto('/haroolife/territoire/lome', { waitUntil: 'domcontentloaded' })
  await expect(page.locator('canvas').first()).toBeVisible({ timeout: 30000 })
  await expect.poll(async () => (await player(page))?.mode ?? null, { timeout: 30000 }).toBe('idle')
  await expect.poll(async () => (await view(page))?.kind ?? null).toBe('perspective')
  await page.waitForTimeout(2500)
  await shot('start')

  // Forward on the stick: the player walks away from the camera.
  const before = (await player(page)) as Player
  const zone = page.getByTestId('joystick')
  const box = (await zone.boundingBox()) as { x: number; y: number; width: number; height: number }
  const cx = box.x + box.width / 2
  const cy = box.y + box.height / 2
  await page.mouse.move(cx, cy)
  await page.mouse.down()
  await page.mouse.move(cx, cy - 46, { steps: 4 })
  await page.waitForTimeout(2500)
  await page.mouse.up()
  const after = (await player(page)) as Player
  const a = (before.camera.angle * Math.PI) / 180
  const moved = { x: after.x - before.x, z: after.z - before.z }
  const away = moved.x * -Math.sin(a) + moved.z * -Math.cos(a)
  expect(Math.hypot(moved.x, moved.z), 'the player walked').toBeGreaterThan(0.3)
  expect(away, 'forward walks away from the camera').toBeGreaterThan(0.25)
  // The camera has swung behind the player.
  await expect
    .poll(async () => {
      const p = (await player(page)) as Player
      const d = ((((p.camera.angle - (p.heading + 180)) % 360) + 540) % 360) - 180
      return Math.abs(d)
    })
    .toBeLessThan(30)
  // Straight ahead can mean the roadway: the neighbourhood brigade may stop the player.
  const stop = page.getByRole('dialog', { name: 'Contrôle piéton' })
  await stop.waitFor({ timeout: 4000 }).catch(() => {})
  if (await stop.isVisible().catch(() => false))
    await stop.getByRole('button', { name: 'Rejoindre le trottoir' }).click()
  await expect(stop).toBeHidden()
  await page.waitForTimeout(800)
  await shot('walked')

  // Back to the classic view from the phone's settings, then free again.
  const nav = page.getByRole('navigation', { name: 'Navigation du jeu' })
  await nav.getByRole('button', { name: 'Téléphone' }).click()
  await page.getByRole('button', { name: 'Réglages', exact: true }).click()
  const choice = page.getByRole('group', { name: 'Vue' })
  await expect(choice.getByRole('button', { name: 'Libre' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await choice.getByRole('button', { name: 'Classique' }).click()
  await expect.poll(async () => (await view(page))?.kind ?? null).toBe('orthographic')
  await choice.getByRole('button', { name: 'Libre' }).click()
  await expect.poll(async () => (await view(page))?.kind ?? null).toBe('perspective')
  await page.getByRole('button', { name: 'Fermer', exact: true }).click()

  // The choice is kept on this device.
  await page.reload({ waitUntil: 'domcontentloaded' })
  await expect(page.locator('canvas').first()).toBeVisible({ timeout: 30000 })
  await expect
    .poll(async () => (await view(page))?.setting ?? null, { timeout: 30000 })
    .toBe('free')
  expect(errors).toEqual([])
})
