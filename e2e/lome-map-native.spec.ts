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

test('map gestures, HUD taps and cancellation never move the avatar', async ({ page }, info) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto('/haroolife', { waitUntil: 'domcontentloaded' })
  await expect.poll(async () => (await snapshot(page))?.detailed, { timeout: 60000 }).toBe(true)
  await page
    .getByRole('navigation', { name: 'Navigation du jeu' })
    .getByRole('button', { name: 'Carte' })
    .click()
  await expect(page.getByRole('group', { name: 'Catégories de lieux' })).toBeVisible()
  await expect(page.getByRole('application', { name: 'Joystick de déplacement' })).toBeHidden()
  await expect.poll(() => page.locator('button[data-lot]:visible').count()).toBeGreaterThan(2)
  await page
    .getByRole('group', { name: 'Catégories de lieux' })
    .getByRole('button', { name: 'Maisons', exact: true })
    .click()
  await expect.poll(() => page.locator('button[data-lot^="l-"]:visible').count()).toBeGreaterThan(0)
  await page
    .getByRole('group', { name: 'Catégories de lieux' })
    .getByRole('button', { name: 'Tous', exact: true })
    .click()
  const original = await snapshot(page)
  const canvas = page.locator('canvas').first()
  await canvas.dispatchEvent('pointerdown', {
    pointerId: 501,
    pointerType: 'touch',
    clientX: 175,
    clientY: 400,
  })
  await page.evaluate(() =>
    window.dispatchEvent(
      new PointerEvent('pointermove', {
        pointerId: 501,
        pointerType: 'touch',
        clientX: 235,
        clientY: 425,
      }),
    ),
  )
  await page.waitForTimeout(250)
  await page.evaluate(() =>
    window.dispatchEvent(
      new PointerEvent('pointercancel', {
        pointerId: 501,
        pointerType: 'touch',
        clientX: 235,
        clientY: 425,
      }),
    ),
  )
  const beforePinch = (await snapshot(page)).camera.distance
  await canvas.dispatchEvent('pointerdown', {
    pointerId: 601,
    pointerType: 'touch',
    clientX: 140,
    clientY: 410,
  })
  await canvas.dispatchEvent('pointerdown', {
    pointerId: 602,
    pointerType: 'touch',
    clientX: 240,
    clientY: 410,
  })
  await page.evaluate(() => {
    window.dispatchEvent(
      new PointerEvent('pointermove', {
        pointerId: 602,
        pointerType: 'touch',
        clientX: 310,
        clientY: 410,
      }),
    )
    window.dispatchEvent(
      new PointerEvent('pointerup', {
        pointerId: 602,
        pointerType: 'touch',
        clientX: 310,
        clientY: 410,
      }),
    )
    window.dispatchEvent(
      new PointerEvent('pointerup', {
        pointerId: 601,
        pointerType: 'touch',
        clientX: 140,
        clientY: 410,
      }),
    )
  })
  await expect.poll(async () => (await snapshot(page)).camera.distance).toBeLessThan(beforePinch)
  await page.getByRole('button', { name: 'Noms', exact: false }).click()
  await page.getByRole('button', { name: 'Zoom arrière' }).click()
  await expect.poll(async () => (await snapshot(page)).route).toBe(0)
  expect((await snapshot(page)).at).toEqual(original.at)
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.getByRole('button', { name: 'Vue de la ville' }).click()
  await expect(page.getByRole('application', { name: 'Joystick de déplacement' })).toBeHidden()
  for (const marker of await page.locator('button[data-lot]:visible').all()) {
    const box = await marker.boundingBox()
    expect(box).not.toBeNull()
    if (box) {
      expect(box.x).toBeGreaterThanOrEqual(0)
      expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize()!.width)
    }
  }
  await page.screenshot({ path: info.outputPath('map-mobile-or-desktop.png') })
  await page.getByRole('button', { name: 'Recentrer sur moi' }).click()
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
