import { initialCityLife } from '../lib/haroolife/city/life'
import { setLocality } from '../lib/haroolife/city/locality'
import { expect, openPlaces, test } from './lome-test'

/**
 * Going anywhere with the transport of one's choice: every town is listed with its coaches
 * (real companies, official ceilings and observed fares) and, between Lomé and Kara, the plane
 * (Lomé – Niamtougou, 65 000 FCFA). Booking the flight away from the airport takes a taxi to the
 * terminal, then boards: the player lands in Kara.
 */
type Live = { locality: string; wallet: number }

test('choose coach or plane: the flight to Kara from the street', async ({ page }, info) => {
  test.setTimeout(200_000)
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  setLocality('lome')
  const state = initialCityLife()
  state.life.wallet = 100000
  await page.addInitScript((state) => {
    if (sessionStorage.getItem('transport-seeded')) return
    sessionStorage.setItem('transport-seeded', '1')
    localStorage.setItem('haroolife.lome-city.v1', JSON.stringify(state))
  }, state)
  const live = () =>
    page.evaluate(() => (window as unknown as { __LOME_CITY?: Live }).__LOME_CITY ?? null)
  await page.goto('/haroolife', { waitUntil: 'domcontentloaded' })
  await expect(page.locator('canvas:visible').first()).toBeVisible({ timeout: 30000 })

  await openPlaces(page)
  const map = page.getByTestId('national-map')
  // Every other town is reachable; the coaches' cheapest fare and the plane are shown.
  for (const name of ['Kpalimé', 'Atakpamé', 'Sokodé', 'Kara', 'Dapaong'])
    await expect(
      map.getByRole('button', { name: new RegExp(`Voyager vers ${name} Car dès`) }),
    ).toBeVisible()
  await expect(map.getByRole('button', { name: /Voyager vers Kara Car dès/ })).toContainText(
    'Avion 1 h, 65 000 FCFA',
  )
  await map.getByRole('button', { name: /Voyager vers Kara Car dès/ }).click()
  const choices = page.getByTestId('coach-companies')
  await expect(choices.getByRole('button', { name: /^Prendre le car / })).toHaveCount(5)
  await page.screenshot({ path: info.outputPath('choices.png') })
  await choices.getByRole('button', { name: 'Prendre l’avion vers Kara' }).click()

  // A taxi to the terminal, then the flight: the player is in Kara, the ticket paid once.
  await expect.poll(async () => (await live())?.locality, { timeout: 120000 }).toBe('kara')
  // Inside the plane: the player seated by a porthole, other passengers, the sky outside.
  const cabin = page.getByTestId('cabin')
  await expect(cabin).toHaveAttribute('data-mode', 'plane')
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const c = (
            window as unknown as {
              __LOME_CABIN?: { seated: boolean; passengers: number; windows: number }
            }
          ).__LOME_CABIN
          return c ? `${c.seated}:${c.passengers > 1}:${c.windows > 4}` : null
        }),
      { timeout: 30000 },
    )
    .toBe('true:true:true')
  await page.waitForTimeout(1500)
  await page.screenshot({ path: info.outputPath('plane-cabin.png') })
  const after = (await live())?.wallet ?? 0
  expect(after).toBeLessThanOrEqual(100000 - 65000)
  expect(after).toBeGreaterThan(100000 - 65000 - 2000)
  expect(errors).toEqual([])
})

test('the coach: seated by the window on the way to Kpalimé', async ({ page }, info) => {
  test.setTimeout(150_000)
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto('/haroolife', { waitUntil: 'domcontentloaded' })
  await expect(page.locator('canvas:visible').first()).toBeVisible({ timeout: 30000 })
  await openPlaces(page)
  await page
    .getByTestId('national-map')
    .getByRole('button', { name: /Voyager vers Kpalimé Car dès 2 000 FCFA/ })
    .click()
  await page
    .getByTestId('coach-companies')
    .getByRole('button', { name: 'Prendre le car Minibus de la gare routière vers Kpalimé' })
    .click()
  await expect(page.getByTestId('cabin')).toHaveAttribute('data-mode', 'coach')
  await expect
    .poll(
      () =>
        page.evaluate(
          () => (window as unknown as { __LOME_CABIN?: { seated: boolean } }).__LOME_CABIN?.seated,
        ),
      { timeout: 30000 },
    )
    .toBe(true)
  await page.waitForTimeout(1500)
  await page.screenshot({ path: info.outputPath('coach-cabin.png') })
  // Arrived: the trip ends by itself once Kpalimé is drawn (or by « Descendre du car »).
  await expect(page.getByTestId('travel-splash')).toHaveCount(0, { timeout: 45000 })
  expect(errors).toEqual([])
})

test('in Lomé: the SOTRAL bus, seated inside, at its fare by distance', async ({ page }, info) => {
  test.setTimeout(150_000)
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto('/haroolife', { waitUntil: 'domcontentloaded' })
  await expect(page.locator('canvas:visible').first()).toBeVisible({ timeout: 30000 })
  const wallet = () =>
    page.evaluate(
      () => (window as unknown as { __LOME_CITY?: { wallet: number } }).__LOME_CITY?.wallet ?? 0,
    )
  await openPlaces(page)
  await page
    .getByRole('group', { name: 'Filtrer la ville' })
    .getByRole('button', { name: 'Éducation' })
    .click()
  await page
    .getByRole('button', { name: /Université de Lomé/ })
    .first()
    .click()
  const sheet = page.getByRole('dialog', { name: 'Lieu' })
  const options = sheet.getByRole('group', { name: 'Comment y aller' })
  // Four ways in Lomé: on foot, zémidjan, taxi and the SOTRAL bus (100 to 300 FCFA).
  await expect(options.getByRole('button')).toHaveCount(4)
  const bus = options.getByRole('button', { name: /Bus/ })
  const fare = Number(((await bus.textContent()) ?? '').replace(/\D+FCFA.*$|[^\d]/g, ''))
  expect([100, 150, 200, 250, 300]).toContain(fare)
  const before = await wallet()
  await bus.click()
  await expect(sheet).toContainText('Ticket SOTRAL')
  await sheet.getByRole('button', { name: 'Confirmer le trajet' }).click()
  await expect(page.getByTestId('cabin')).toHaveAttribute('data-mode', 'bus')
  await expect.poll(wallet).toBe(before - fare)
  await expect
    .poll(
      () =>
        page.evaluate(
          () => (window as unknown as { __LOME_CABIN?: { seated: boolean } }).__LOME_CABIN?.seated,
        ),
      { timeout: 30000 },
    )
    .toBe(true)
  await page.screenshot({ path: info.outputPath('bus-cabin.png') })
  expect(errors).toEqual([])
})
