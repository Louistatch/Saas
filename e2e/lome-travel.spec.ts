import { expect, openPlaces, test } from './lome-test'

/**
 * One national world: from Lomé the player opens the Togo map (sourced boundaries), takes
 * the bush taxi to Kara, finds that town's own buildings and actors loaded chunk by chunk
 * around the station, walks, and comes back to the estate untouched. The same street engine
 * serves both towns; no error may reach the console.
 */
type Live = {
  locality: string
  chunks: number
  buildings: number
  estateBuildings: number
  at: { x: number; y: number }
  wallet: number
  hour: number
  lastEvent: string
}
test('travel Lomé → Kara → Lomé inside the single 3D world', async ({ page }, testInfo) => {
  test.setTimeout(240_000)
  const live = () =>
    page.evaluate(() => (window as unknown as { __LOME_CITY?: Live }).__LOME_CITY ?? null)
  /** Hours on the road can raise a life event with choices: answer it like a player would. */
  const settle = async () => {
    const dialog = page.locator('[aria-labelledby="event-title"]')
    for (let i = 0; i < 6 && (await dialog.isVisible().catch(() => false)); i++) {
      await dialog.getByRole('button').first().click()
      await page.waitForTimeout(400)
    }
    await expect(dialog).toBeHidden()
  }
  const openMap = async () => {
    await settle()
    await openPlaces(page)
  }
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => {
    if (m.type() === 'error' && /deleteBuffer|WebGL|GL_INVALID/i.test(m.text()))
      errors.push(m.text())
  })
  // Real coach fares (7 500 FCFA Lomé – Kara) take most of a new game's 8 000 FCFA: the round
  // trip gets fictional savings in the player's own local save; nothing real is involved.
  await page.addInitScript(() => {
    const get = Storage.prototype.getItem
    Storage.prototype.getItem = function (key: string) {
      const v = get.call(this, key)
      if (key !== 'haroolife.lome-city.v1' || !v) return v
      try {
        const s = JSON.parse(v)
        if (s?.life && s.life.wallet < 50000) s.life.wallet = 100000
        return JSON.stringify(s)
      } catch {
        return v
      }
    }
  })
  await page.goto('/haroolife', { waitUntil: 'domcontentloaded' })
  await expect(page.locator('canvas').first()).toBeVisible({ timeout: 30000 })
  await expect.poll(async () => (await live())?.chunks ?? 0).toBeGreaterThan(0)
  const home = await live()
  expect(home?.locality).toBe('lome')
  const estate = home?.estateBuildings ?? 0
  const wallet = home?.wallet ?? 0

  // The Togo map in the Explorer sheet: sourced boundaries, two poles, attribution.
  await openMap()
  const map = page.getByTestId('national-map')
  await expect(map).toBeVisible()
  await expect(map.getByText(/OpenStreetMap/)).toBeVisible()
  await expect(map.getByRole('button', { name: 'Lomé, vous êtes ici' })).toBeVisible()
  await map
    .getByRole('button', { name: /Voyager vers Kara/ })
    .first()
    .click()
  // The real companies of the line, each with its next departure, hours and fare.
  const companies = map.getByTestId('coach-companies')
  await expect(companies).toBeVisible()
  for (const c of ['Solim', 'Nagodé Transfert', 'CTT Rakieta'])
    await expect(
      companies.getByRole('button', { name: `Prendre le car ${c} vers Kara` }),
    ).toBeVisible()
  await expect(companies).toContainText('7 500')
  await companies.getByRole('button', { name: 'Prendre le car Solim vers Kara' }).click()

  // The journey is shown full screen: the map of Togo, the real road from Lomé to Kara.
  const splash = page.getByTestId('travel-splash')
  // Read as soon as it shows: it closes by itself once Kara is drawn (2.6 s at least).
  await expect(splash).toBeVisible()
  const shown = (await splash.textContent()) ?? ''
  expect(shown).toContain('En route vers Kara')
  expect(shown).toContain('Lomé → Kara')
  expect(shown).toContain('Solim')
  expect(shown).toContain('413 km')
  // The towns of the RN1 on the way.
  for (const stop of ['Tsévié', 'Notsé', 'Atakpamé', 'Blitta', 'Sokodé'])
    await expect(splash.locator(`[data-stop="${stop}"]`)).toHaveCount(1)
  await page.screenshot({ path: testInfo.outputPath('travel-splash.png') })

  // Arrival: the locality switched, the sheet closed, Kara's chunks and buildings stream in.
  await expect.poll(async () => (await live())?.locality).toBe('kara')
  await expect(page.getByRole('heading', { name: 'Explorer Lomé' })).toBeHidden()
  await expect.poll(async () => (await live())?.chunks ?? 0, { timeout: 30000 }).toBeGreaterThan(0)
  await expect
    .poll(async () => (await live())?.buildings ?? 0, { timeout: 30000 })
    .toBeGreaterThan(80)
  const kara = await live()
  expect(kara?.wallet).toBe(wallet - 7500)
  expect(kara?.lastEvent).toMatch(/Arrivée à Kara/)
  expect(kara?.estateBuildings).toBe(estate)
  expect(await page.locator('canvas').count()).toBe(1)
  // Once Kara's street is drawn (and the journey seen), the game is back.
  await expect(splash).toBeHidden()
  // Kara's own places appear in the Explorer sheet, none of Lomé's.
  await openMap()
  await expect(page.getByRole('button', { name: /Grand marché de Kara/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /Grand marché d’Assigamé/ })).toHaveCount(0)
  await expect(map.getByRole('button', { name: 'Kara, vous êtes ici' })).toBeVisible()
  await page.getByRole('button', { name: 'Fermer', exact: true }).click()
  // The map is a mode of its own (V3): back to the game to walk.
  const back = page.getByRole('button', { name: 'Retour au jeu' })
  if (await back.isVisible().catch(() => false)) await back.click()

  // A few steps in Kara's streets.
  const before = (await live())?.at
  await page.keyboard.down('ArrowLeft')
  await expect
    .poll(async () => {
      const after = (await live())?.at
      return `${after?.x},${after?.y}` !== `${before?.x},${before?.y}`
    })
    .toBe(true)
  await page.keyboard.up('ArrowLeft')
  await page.waitForTimeout(1500)
  expect(errors, 'no GPU or page error while in Kara').toEqual([])

  // The locality persists through a reload (the save carries the town).
  await page.waitForTimeout(800)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await expect(page.locator('canvas').first()).toBeVisible({ timeout: 30000 })
  await expect.poll(async () => (await live())?.locality).toBe('kara')
  await expect.poll(async () => (await live())?.chunks ?? 0, { timeout: 30000 }).toBeGreaterThan(0)

  // Back home: the estate is as it was.
  await openMap()
  await map
    .getByRole('button', { name: /Voyager vers Lomé/ })
    .first()
    .click()
  await map.getByRole('button', { name: 'Prendre le car CTT Rakieta vers Lomé' }).click()
  await expect(splash).toBeVisible()
  const back2 = (await splash.textContent()) ?? ''
  expect(back2).toContain('En route vers Lomé')
  expect(back2).toContain('CTT Rakieta')
  await expect.poll(async () => (await live())?.locality).toBe('lome')
  expect((await live())?.estateBuildings).toBe(estate)
  await expect.poll(async () => (await live())?.chunks ?? 0, { timeout: 30000 }).toBeGreaterThan(0)
  await expect(splash).toBeHidden()
  await settle()
  await page.waitForTimeout(1000)
  expect(errors).toEqual([])
})
