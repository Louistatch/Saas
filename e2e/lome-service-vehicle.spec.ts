import type { Page } from '@playwright/test'
import sharp from 'sharp'
import { initialCityLife } from '../lib/haroolife/city/life'
import { expect, test } from './lome-test'

const player = (page: Page) =>
  page.evaluate(
    () =>
      (
        window as unknown as {
          __LOME_PLAYER?: {
            x: number
            z: number
            driving: boolean
            vehicle: { x: number; z: number } | null
            vehicleKind: string | null
            vehicleScreen: { x: number; y: number; width: number; height: number } | null
          }
        }
      ).__LOME_PLAYER,
  )

async function startMoto(page: Page) {
  await page
    .getByRole('navigation', { name: 'Navigation du jeu' })
    .getByRole('button', { name: 'Téléphone' })
    .click()
  await page.getByRole('button', { name: /Métiers/ }).click()
  await page.getByTestId('duty-moto').click()
}

async function expectMotoPixels(page: Page) {
  await expect.poll(async () => (await player(page))?.vehicleKind).toBe('moto')
  const bounds = (await player(page))?.vehicleScreen
  if (!bounds) throw new Error('the rendered moto must project onto the screen')
  const clip = {
    x: Math.floor(bounds.x),
    y: Math.floor(bounds.y),
    width: Math.ceil(bounds.width) + 1,
    height: Math.ceil(bounds.height) + 1,
  }
  const viewport = page.viewportSize()
  if (!viewport) throw new Error('a viewport is required')
  expect(clip.x).toBeGreaterThanOrEqual(0)
  expect(clip.y).toBeGreaterThan(100)
  expect(clip.x + clip.width).toBeLessThan(viewport.width)
  expect(clip.y + clip.height).toBeLessThan(viewport.height - 100)
  const pixels = await sharp(await page.screenshot({ clip, scale: 'css' }))
    .removeAlpha()
    .raw()
    .toBuffer()
  let red = 0
  for (let i = 0; i < pixels.length; i += 3)
    if (pixels[i] > 35 && pixels[i] > pixels[i + 1] * 1.5 && pixels[i] > pixels[i + 2] * 1.5) red++
  expect(red, 'red bodywork pixels are visible in the actual canvas').toBeGreaterThan(5)
}

test('a returning driver can board a parked moto after reload', async ({ page }, info) => {
  const save = initialCityLife()
  save.duty = 'moto'
  save.vehicle = { x: save.at.x, z: save.at.y - 1, heading: 0 }
  save.life.hour = 21
  save.life.wallet = 100
  await page.addInitScript((save) => {
    if (sessionStorage.getItem('service-vehicle-test-seeded')) return
    sessionStorage.setItem('service-vehicle-test-seeded', '1')
    localStorage.setItem('haroolife.lome-city.v1', JSON.stringify(save))
    localStorage.setItem('haroolife.camera-mode', 'close')
  }, save)
  await page.goto('/haroolife')
  await expect.poll(async () => (await player(page))?.vehicleKind).toBe('moto')
  await expect(page.getByRole('button', { name: 'Monter sur le zémidjan' })).toBeVisible()
  await expectMotoPixels(page)
  await page.reload()
  await expect(page.getByRole('button', { name: 'Monter sur le zémidjan' })).toBeVisible()
  await expectMotoPixels(page)
  const marker = page.locator('[data-service-vehicle="moto"]')
  if (info.project.name.startsWith('mobile')) await marker.tap()
  else await marker.click()
  await expect.poll(async () => (await player(page))?.driving).toBe(true)
})

test('an old save with the driver standing over the moto is repaired without losing money', async ({
  page,
}, info) => {
  const save = initialCityLife()
  save.duty = 'moto'
  save.vehicle = { x: save.at.x, z: save.at.y, heading: 0 }
  save.life.hour = 21
  save.life.wallet = 100
  await page.addInitScript((save) => {
    localStorage.setItem('haroolife.lome-city.v1', JSON.stringify(save))
    localStorage.setItem('haroolife.camera-mode', 'close')
  }, save)
  await page.goto('/haroolife')
  await expect
    .poll(async () => {
      const p = await player(page)
      return p?.vehicle ? Math.hypot(p.x - p.vehicle.x, p.z - p.vehicle.z) : 0
    })
    .toBeGreaterThanOrEqual(0.75)
  await expect(page.getByRole('button', { name: 'Monter sur le zémidjan' })).toBeVisible()
  await expectMotoPixels(page)
  await page.screenshot({ path: info.outputPath('old-save-repaired.png') })
  await expect
    .poll(() =>
      page.evaluate(
        () => JSON.parse(localStorage.getItem('haroolife.lome-city.v1') || 'null')?.life.wallet,
      ),
    )
    .toBe(100)
})

test('starting a moto service in Kara really creates a boardable vehicle', async ({
  page,
}, info) => {
  const save = initialCityLife()
  save.locality = 'kara'
  save.at = { x: 72, y: 45 }
  save.life.hour = 21
  await page.addInitScript((save) => {
    localStorage.setItem('haroolife.lome-city.v1', JSON.stringify(save))
  }, save)
  await page.goto('/haroolife')
  await expect.poll(async () => (await player(page))?.x).toBe(72)
  await startMoto(page)
  await expect.poll(async () => (await player(page))?.vehicleKind).toBe('moto')
  await expect(page.getByRole('button', { name: 'Monter sur le zémidjan' })).toBeVisible()
  await expectMotoPixels(page)
  await page.screenshot({ path: info.outputPath('kara-moto.png') })
  const before = await page.evaluate(
    () => (window as unknown as { __LOME_CITY?: { wallet: number } }).__LOME_CITY?.wallet ?? 0,
  )
  await page.getByRole('button', { name: 'Monter sur le zémidjan' }).click()
  await expect
    .poll(
      () =>
        page.evaluate(
          () =>
            (window as unknown as { __LOME_FARE?: { service: { phase: string } } }).__LOME_FARE
              ?.service.phase,
        ),
      { timeout: 60000 },
    )
    .toBe('trip')
  const price = await page.evaluate(
    () =>
      (window as unknown as { __LOME_FARE?: { fare?: { price: number } } }).__LOME_FARE?.fare
        ?.price ?? 0,
  )
  expect(price).toBeGreaterThanOrEqual(200)
  await page.getByRole('button', { name: 'Descendre du zémidjan' }).click()
  await expect.poll(async () => (await player(page))?.driving, { timeout: 90000 }).toBe(false)
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as unknown as { __LOME_CITY?: { wallet: number } }).__LOME_CITY?.wallet,
      ),
    )
    .toBe(before + price)
})

test('a delayed taxi download cannot replace the moto selected in the meantime', async ({
  page,
}) => {
  let release!: () => void
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  let requested!: () => void
  const pending = new Promise<void>((resolve) => {
    requested = resolve
  })
  await page.route('**/car-kit/taxi.glb', async (route) => {
    requested()
    await gate
    await route.continue()
  })
  await page.goto('/haroolife')
  await pending
  await startMoto(page)
  await expect.poll(async () => (await player(page))?.vehicleKind).toBe('moto')
  const delivered = page.waitForResponse('**/car-kit/taxi.glb')
  release()
  await delivered
  // Allow the image decoder and Three.js loader to finish, not just the HTTP download.
  await page.waitForTimeout(1000)
  const taxiLeft = await page.evaluate(() =>
    (window as unknown as { __LOME_SCENE?: { has: (name: string) => boolean } }).__LOME_SCENE?.has(
      'Taxi du joueur',
    ),
  )
  expect(taxiLeft, 'the stale taxi is never attached to the scene').toBe(false)
  await expectMotoPixels(page)
})
