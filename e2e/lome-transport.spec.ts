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
  await expect(
    map.getByRole('button', { name: /Voyager vers Kara Car dès/ }),
  ).toContainText('Avion 1 h, 65 000 FCFA')
  await map.getByRole('button', { name: /Voyager vers Kara Car dès/ }).click()
  const choices = page.getByTestId('coach-companies')
  await expect(choices.getByRole('button', { name: /^Prendre le car / })).toHaveCount(5)
  await page.screenshot({ path: info.outputPath('choices.png') })
  await choices.getByRole('button', { name: 'Prendre l’avion vers Kara' }).click()

  // A taxi to the terminal, then the flight: the player is in Kara, the ticket paid once.
  await expect.poll(async () => (await live())?.locality, { timeout: 120000 }).toBe('kara')
  const after = (await live())?.wallet ?? 0
  expect(after).toBeLessThanOrEqual(100000 - 65000)
  expect(after).toBeGreaterThan(100000 - 65000 - 2000)
  expect(errors).toEqual([])
})
