import fs from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'
import { expect, openPlaces, test } from './lome-test'

/**
 * The city must dominate the screen: a dense 3D Lomé, not a small plateau in an empty sea.
 * Pixel check: in the central 70 % of the frame, sky/water blue must stay a minority and
 * the frame must hold many distinct colours (buildings, roads, roofs).
 */
async function cityDensity(file: string) {
  const img = sharp(file)
  const { width, height } = await img.metadata()
  const w = width ?? 0
  const h = height ?? 0
  const left = Math.round(w * 0.15)
  const top = Math.round(h * 0.2)
  const cw = Math.round(w * 0.7)
  const ch = Math.round(h * 0.55)
  const { data } = await img
    .extract({ left, top, width: cw, height: ch })
    .raw()
    .toBuffer({ resolveWithObject: true })
  let blue = 0
  let green = 0
  let built = 0
  const palette = new Set<number>()
  const n = data.length / 3
  for (let i = 0; i < n; i++) {
    const r = data[i * 3]
    const g = data[i * 3 + 1]
    const b = data[i * 3 + 2]
    if (b > r + 25 && b > g) blue++
    else if (g > r + 15 && g > b + 15) green++
    else built++
    palette.add(((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4))
  }
  return { blue: blue / n, green: green / n, built: built / n, colours: palette.size }
}

type CityStats = {
  chunks: number
  buildings: number
  at: { x: number; y: number }
  route: number
  inside: string | null
}
const stats = (page: import('@playwright/test').Page) =>
  page.evaluate(() => (window as unknown as { __LOME_CITY?: CityStats }).__LOME_CITY ?? null)

test('Lomé Life 3D opens on a dense, explorable city and completes a full outing', async ({
  page,
}, testInfo) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto('/haroolife/territoire/lome', { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('navigation', { name: 'Navigation du jeu' })).toBeVisible()
  await expect(page.locator('canvas').first()).toBeVisible({ timeout: 30000 })
  expect(await page.evaluate(() => !!document.createElement('canvas').getContext('webgl2'))).toBe(
    true,
  )

  // 1. Streaming: the building tiles around the player are built (start cell: 16 tiles of
  // 8 × 8 cells, 211 city buildings) with the Kenney models.
  await expect
    .poll(() => stats(page).then((s) => s?.chunks ?? 0), { timeout: 30000 })
    .toBeGreaterThanOrEqual(9)
  const first = await stats(page)
  expect(first?.buildings ?? 0).toBeGreaterThanOrEqual(150)
  await expect
    .poll(
      () => stats(page).then((s) => (s as unknown as { detailed?: boolean })?.detailed ?? false),
      {
        timeout: 60000,
      },
    )
    .toBe(true)
  await page.waitForTimeout(3500) // let the baked chunks, agents and estate models land
  const dir = path.join('test-results', 'lome-city')
  fs.mkdirSync(dir, { recursive: true })
  const shot = path.join(dir, `${testInfo.project.name}-city.png`)
  await page.screenshot({ path: shot })

  // 2. Anti-plateau: the centre of the frame is mostly city, not sky or sea.
  const density = await cityDensity(shot)
  testInfo.annotations.push({ type: 'density', description: JSON.stringify(density) })
  expect(density.blue, 'sky/water must not dominate the centre').toBeLessThan(0.3)
  expect(density.built, 'roads and buildings must fill the frame').toBeGreaterThan(0.3)
  expect(density.colours, 'a city has many colours').toBeGreaterThan(60)

  // 3. The city map: zoom out, recentre on me, back to the game.
  await page
    .getByRole('navigation', { name: 'Navigation du jeu' })
    .getByRole('button', { name: 'Carte' })
    .click()
  await expect(page.getByTestId('city-map')).toBeVisible()
  await page.getByRole('button', { name: 'Zoom arrière sur la carte' }).click()
  await page.getByRole('button', { name: 'Centrer la carte sur moi' }).click()
  await page.screenshot({ path: path.join(dir, `${testInfo.project.name}-overview.png`) })
  await page.getByRole('button', { name: 'Retour au jeu' }).click()
  await expect(page.getByTestId('city-map')).toBeHidden()

  // 4. Places: filter, open a sheet from the map, go there by zémidjan, enter the interior.
  await openPlaces(page)
  await page
    .getByRole('group', { name: 'Filtrer la ville' })
    .getByRole('button', { name: 'Éducation' })
    .click()
  await expect(page.getByRole('button', { name: /Université de Lomé/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /Grand marché d’Assigamé/ })).toBeHidden()
  await page
    .getByRole('group', { name: 'Filtrer la ville' })
    .getByRole('button', { name: 'Loisirs' })
    .click()
  await page.getByRole('button', { name: /^🏋️ Salle Fitness Tokoin/ }).click()
  await expect(page.getByRole('dialog', { name: 'Lieu' })).toBeVisible()
  await expect(page.getByText('S’entraîner')).toBeVisible()
  await page.getByRole('button', { name: /Zémidjan/ }).click()
  await page.getByRole('button', { name: 'Confirmer le trajet' }).click()
  await expect(page.getByLabel('Trajet en cours')).toBeVisible()
  await page
    .getByLabel('Trajet en cours')
    .getByRole('button', { name: /Passer/ })
    .click()
  await expect.poll(() => stats(page).then((s) => s?.route ?? 99), { timeout: 15000 }).toBe(0)
  await page.getByRole('button', { name: 'Entrer ou sortir' }).click()
  await expect
    .poll(() => stats(page).then((s) => s?.inside ?? null), { timeout: 10000 })
    .not.toBeNull()
  await page.waitForTimeout(1200)
  await page.screenshot({ path: path.join(dir, `${testInfo.project.name}-gym.png`) })
  await openPlaces(page)
  await page
    .getByRole('group', { name: 'Filtrer la ville' })
    .getByRole('button', { name: 'Loisirs' })
    .click()
  await page.getByRole('button', { name: /^🏋️ Salle Fitness Tokoin/ }).click()
  const wallet = await page.evaluate(
    () => JSON.parse(localStorage.getItem('haroolife.lome-city.v1') ?? '{}').life?.wallet,
  )
  await page.getByRole('button', { name: /S’entraîner/ }).click()
  await expect
    .poll(() =>
      page.evaluate(
        () => JSON.parse(localStorage.getItem('haroolife.lome-city.v1') ?? '{}').life?.wallet,
      ),
    )
    .toBe(wallet - 500)
  // The place sheet closes once the activity starts: the door button leaves the room.
  const door = page.getByRole('button', { name: 'Entrer ou sortir' })
  await expect(door).toHaveAttribute('data-door', 'inside')
  await door.click()
  await expect.poll(() => stats(page).then((s) => s?.inside ?? null)).toBeNull()

  // 5. A second interior type (a place of worship) and a third (a clinic) are reachable.
  for (const [filter, name] of [
    ['Cultes', /Grande mosquée de Lomé/],
    ['Santé', /CHU de Tokoin/],
  ] as const) {
    await openPlaces(page)
    await page
      .getByRole('group', { name: 'Filtrer la ville' })
      .getByRole('button', { name: filter })
      .click()
    await page.getByRole('button', { name }).click()
    await page.getByRole('button', { name: /Taxi/ }).click()
    await page.getByRole('button', { name: 'Confirmer le trajet' }).click()
    await page
      .getByLabel('Trajet en cours')
      .getByRole('button', { name: /Passer/ })
      .click()
    await expect.poll(() => stats(page).then((s) => s?.route ?? 99), { timeout: 15000 }).toBe(0)
    await page.getByRole('button', { name: 'Entrer ou sortir' }).click()
    await expect
      .poll(() => stats(page).then((s) => s?.inside ?? null), { timeout: 10000 })
      .not.toBeNull()
    await page.getByRole('button', { name: 'Entrer ou sortir' }).click()
  }

  // 6. Persistence: reload lands at the same world position with the same wallet.
  const before = await stats(page)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await expect(page.locator('canvas').first()).toBeVisible({ timeout: 30000 })
  await expect
    .poll(() => stats(page).then((s) => s?.at ?? null), { timeout: 30000 })
    .toEqual(before?.at)

  expect(errors, 'No uncaught client runtime errors').toEqual([])
})
