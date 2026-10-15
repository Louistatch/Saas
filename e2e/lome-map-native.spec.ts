import { expect, openPlaces, test } from './lome-test'

const snapshot = (page: import('@playwright/test').Page) =>
  page.evaluate(
    () =>
      (
        window as unknown as {
          __LOME_CITY: {
            at: { x: number; y: number }
            route: number
            inside: string | null
            wallet: number
            camera: { distance: number }
            detailed: boolean
          }
        }
      ).__LOME_CITY,
  )

/** Zoom factor of the clear map (scale of its ground group). */
const mapScale = (page: import('@playwright/test').Page) =>
  page
    .getByRole('img', { name: 'Carte de la ville par quartiers' })
    .locator('g')
    .first()
    .evaluate((g) => Number(/scale\(([\d.]+)\)/.exec(g.getAttribute('transform') ?? '')?.[1] ?? 0))

test('map gestures, HUD taps and cancellation never move the avatar', async ({ page }, info) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto('/haroolife', { waitUntil: 'domcontentloaded' })
  await expect.poll(async () => (await snapshot(page))?.detailed, { timeout: 60000 }).toBe(true)
  await page
    .getByRole('navigation', { name: 'Navigation du jeu' })
    .getByRole('button', { name: 'Carte' })
    .click()
  const map = page.getByTestId('city-map')
  await expect(map).toBeVisible()
  await expect(page.getByRole('group', { name: 'Catégories de lieux' })).toBeVisible()
  await expect(page.getByRole('application', { name: 'Joystick de déplacement' })).toBeHidden()
  await expect.poll(() => page.locator('[data-place]:visible').count()).toBeGreaterThan(2)
  await page
    .getByRole('group', { name: 'Catégories de lieux' })
    .getByRole('button', { name: 'Santé', exact: true })
    .click()
  await expect.poll(() => page.locator('[data-place]:visible').count()).toBeGreaterThan(0)
  await page
    .getByRole('group', { name: 'Catégories de lieux' })
    .getByRole('button', { name: 'Tous', exact: true })
    .click()
  const original = await snapshot(page)
  // A drag cancelled half-way (a system gesture took the pointer).
  await map.dispatchEvent('pointerdown', {
    pointerId: 501,
    pointerType: 'touch',
    clientX: 175,
    clientY: 400,
  })
  await map.dispatchEvent('pointermove', {
    pointerId: 501,
    pointerType: 'touch',
    clientX: 235,
    clientY: 425,
  })
  await map.dispatchEvent('pointercancel', {
    pointerId: 501,
    pointerType: 'touch',
    clientX: 235,
    clientY: 425,
  })
  // Pinch apart: the map zooms in.
  const beforePinch = await mapScale(page)
  await map.dispatchEvent('pointerdown', {
    pointerId: 601,
    pointerType: 'touch',
    clientX: 140,
    clientY: 410,
  })
  await map.dispatchEvent('pointerdown', {
    pointerId: 602,
    pointerType: 'touch',
    clientX: 240,
    clientY: 410,
  })
  await map.dispatchEvent('pointermove', {
    pointerId: 602,
    pointerType: 'touch',
    clientX: 310,
    clientY: 410,
  })
  await map.dispatchEvent('pointerup', { pointerId: 602, pointerType: 'touch' })
  await map.dispatchEvent('pointerup', { pointerId: 601, pointerType: 'touch' })
  await expect.poll(() => mapScale(page)).toBeGreaterThan(beforePinch)
  await page.getByRole('button', { name: 'Noms', exact: false }).click()
  await page.getByRole('button', { name: 'Zoom arrière sur la carte' }).click()
  await expect.poll(async () => (await snapshot(page)).route).toBe(0)
  expect((await snapshot(page)).at).toEqual(original.at)
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByRole('application', { name: 'Joystick de déplacement' })).toBeHidden()
  for (const marker of await page.locator('[data-place]:visible').all()) {
    const box = await marker.boundingBox()
    expect(box).not.toBeNull()
    if (box) {
      expect(box.x + box.width / 2).toBeGreaterThanOrEqual(0)
      expect(box.x + box.width / 2).toBeLessThanOrEqual(page.viewportSize()!.width)
    }
  }
  await page.screenshot({ path: info.outputPath('map-mobile-or-desktop.png') })
  await page.getByRole('button', { name: 'Retour au jeu' }).click()
  await expect(page.getByRole('application', { name: 'Joystick de déplacement' })).toBeVisible()
  await expect(page.getByRole('group', { name: 'Catégories de lieux' })).toHaveCount(0)
  expect(errors).toEqual([])
})

test('destination drawer closes by gesture; transport charges only after confirmation', async ({
  page,
}, info) => {
  await page.goto('/haroolife', { waitUntil: 'domcontentloaded' })
  await expect.poll(async () => (await snapshot(page))?.detailed, { timeout: 60000 }).toBe(true)
  await openPlaces(page)
  await page
    .getByRole('group', { name: 'Filtrer la ville' })
    .getByRole('button', { name: 'Loisirs' })
    .click()
  await page.getByRole('button', { name: /Salle Fitness Tokoin/ }).click()
  const sheet = page.getByRole('dialog', { name: 'Lieu', exact: true })
  await expect(sheet).toBeVisible()
  const wallet = (await snapshot(page)).wallet
  await sheet.getByRole('button', { name: /Zémidjan/ }).click()
  await expect(sheet.getByRole('button', { name: 'Confirmer le trajet' })).toBeVisible()
  expect((await snapshot(page)).wallet).toBe(wallet)
  expect((await snapshot(page)).route).toBe(0)
  await sheet.getByRole('button', { name: 'Annuler', exact: true }).click()
  await expect(sheet.getByRole('button', { name: 'Confirmer le trajet' })).toHaveCount(0)
  // The existing modal primitive must support a native drag-to-dismiss.
  const title = await sheet.getByLabel('Faire glisser pour fermer').boundingBox()
  if (!title) throw new Error('Missing drawer handle')
  await page.mouse.move(title.x + title.width / 2, title.y + title.height / 2)
  await page.mouse.down()
  await page.mouse.move(title.x + title.width / 2, title.y + title.height / 2 + 420, { steps: 12 })
  await page.mouse.up()
  await expect(sheet).toHaveCount(0)
  expect((await snapshot(page)).wallet).toBe(wallet)
  await openPlaces(page)
  await page.getByRole('button', { name: /Salle Fitness Tokoin/ }).click()
  await sheet.getByRole('button', { name: /Zémidjan/ }).click()
  await sheet.getByRole('button', { name: 'Confirmer le trajet' }).click()
  await expect(page.getByLabel('Trajet en cours')).toBeVisible()
  expect((await snapshot(page)).wallet).toBe(wallet - 350)
  await page.screenshot({ path: info.outputPath('ride-confirmed.png') })
  await page
    .getByLabel('Trajet en cours')
    .getByRole('button', { name: /Passer/ })
    .click()
  await expect.poll(async () => (await snapshot(page)).route).toBe(0)
  await page.getByRole('button', { name: 'Entrer ou sortir' }).click()
  await expect.poll(async () => (await snapshot(page)).inside).not.toBeNull()
  await page.screenshot({ path: info.outputPath('destination-interior.png') })
})
