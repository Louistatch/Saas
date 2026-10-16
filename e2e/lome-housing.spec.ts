import { defaultHousing } from '../lib/haroolife/city/housing'
import { initialCityLife } from '../lib/haroolife/city/life'
import { expect, test } from './lome-test'

/**
 * « Mon logement »: a chambre-salon in Tokoin (55 000 FCFA, observed), rent late by 12 days so the
 * landlord has cut the power; paying the rent and the CEET and TdE bills from the phone; a friend
 * received in the evening; moving to Agoè at its own rent.
 */
type Live = { wallet: number }

test('my home: late rent, bills, a guest and a move', async ({ page }, info) => {
  test.setTimeout(150_000)
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  const state = initialCityLife()
  state.life.day = 133
  state.life.hour = 19
  state.life.wallet = 600000
  state.social = { 'npc:Kossi': { affinity: 6, rewardedDay: 0, history: [] } }
  state.housing = {
    ...defaultHousing(1),
    prepaid: 0,
    month: 4,
    debt: { rent: 55000, ceet: 4195, tde: 1140 },
    lateSince: 121,
    step: 2,
  }
  await page.addInitScript((state) => {
    if (sessionStorage.getItem('housing-seeded')) return
    sessionStorage.setItem('housing-seeded', '1')
    localStorage.setItem('haroolife.lome-city.v1', JSON.stringify(state))
  }, state)
  const wallet = () =>
    page.evaluate(() => (window as unknown as { __LOME_CITY?: Live }).__LOME_CITY?.wallet ?? 0)
  await page.goto('/haroolife', { waitUntil: 'domcontentloaded' })
  await expect(page.locator('canvas:visible').first()).toBeVisible({ timeout: 30000 })
  await page
    .getByRole('navigation', { name: 'Navigation du jeu' })
    .getByRole('button', { name: 'Téléphone' })
    .click()
  await page.getByRole('button', { name: /Logement$/ }).click()
  const home = page.getByTestId('housing')
  await expect(home).toContainText('Chambre-salon · Tokoin, Lomé')
  await expect(home).toContainText('Loyer 55 000 FCFA par mois')
  await expect(home.getByRole('alert')).toContainText('12 jours de retard')
  await expect(home.getByRole('alert')).toContainText('Le courant est coupé')
  await page.screenshot({ path: info.outputPath('housing-late.png') })

  const before = await wallet()
  await home.getByRole('button', { name: /Payer le loyer/ }).click()
  await expect.poll(wallet).toBe(before - 55000)
  await home.getByRole('button', { name: /Payer l’électricité \(CEET\)/ }).click()
  await home.getByRole('button', { name: /Payer l’eau \(TdE\)/ }).click()
  await expect.poll(wallet).toBe(before - 55000 - 4195 - 1140)
  await expect(home).toContainText('Tout est payé.')
  await expect(home.getByRole('alert')).toHaveCount(0)

  // A friend in the evening.
  await home.getByRole('button', { name: 'Inviter Kossi' }).click()
  await expect.poll(wallet).toBe(before - 55000 - 4195 - 1140 - 1000)

  // Moving to Agoè, a chambre simple at 18 000 (observed): 7 months in, the old caution back.
  await home.getByRole('button', { name: 'Déménager' }).click()
  const afterGuest = await wallet()
  await home.getByRole('button', { name: 'Louer Chambre simple à Agoè' }).click()
  await expect(home).toContainText('Chambre simple · Agoè, Lomé')
  await expect.poll(wallet).toBe(afterGuest - 7 * 18000 + 3 * 55000)
  await page.screenshot({ path: info.outputPath('housing-moved.png') })
  expect(errors).toEqual([])
})
