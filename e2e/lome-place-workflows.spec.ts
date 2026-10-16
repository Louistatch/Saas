import { expect, test } from './lome-test'
import { initialCityLife } from '../lib/haroolife/city/life'
import { landmarks } from '../lib/haroolife/city/world'
import { vehicleCare } from '../lib/haroolife/city/vehicle-economy'

test('market: touch the counter, buy and eat, speak to a resident, preserve the conversation', async ({
  page,
}, info) => {
  test.setTimeout(180000)
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  const state = initialCityLife()
  const market = landmarks().find((l) => l.type === 'market')!
  state.insideLot = market.id
  state.target = market.id
  state.at = { ...market.door }
  state.life.wallet = 1000
  state.life.needs.hunger = 10
  await page.addInitScript((state) => {
    if (sessionStorage.getItem('place-seeded')) return
    sessionStorage.setItem('place-seeded', '1')
    localStorage.setItem('haroolife.lome-city.v1', JSON.stringify(state))
  }, state)
  const saved = () =>
    page.evaluate(() => JSON.parse(localStorage.getItem('haroolife.lome-city.v1')!))
  await page.goto('/haroolife')
  await page.locator('[data-hotspot="counter"]').click({ timeout: 45000 })
  const marketUi = page.getByTestId('game-market')
  await expect(marketUi).toBeVisible({ timeout: 45000 })
  const meal = page.getByTestId('goods-ayimolou')
  await meal.getByRole('button', { name: 'Acheter · 500' }).click()
  await expect.poll(async () => (await saved()).life.wallet).toBe(500)
  await expect.poll(async () => (await saved()).commerce.inventory.ayimolou).toBe(1)
  expect((await saved()).life.needs.hunger).toBe(10)
  await meal.getByRole('button', { name: 'Manger', exact: true }).click()
  await expect.poll(async () => (await saved()).life.needs.hunger).toBe(45)
  await expect.poll(async () => (await saved()).commerce.inventory.ayimolou).toBe(0)
  await page.screenshot({ path: info.outputPath('market-purchases.png') })
  await page.keyboard.press('Escape')
  await page.locator('[data-hotspot="npc:seller"]').click()
  const conversation = page.getByLabel('Conversation', { exact: true })
  await expect(conversation).toBeVisible({ timeout: 45000 })
  await conversation.getByRole('button', { name: 'Bonjour !', exact: true }).click()
  await conversation.getByRole('button', { name: 'Comment travailler ?', exact: true }).click()
  await expect(conversation.getByRole('log')).toContainText('véhicule est fourni')
  await expect
    .poll(
      async () =>
        Object.values((await saved()).social as Record<string, { affinity: number }>)[0]?.affinity,
    )
    .toBe(10)
  await page.screenshot({ path: info.outputPath('resident-profile.png') })
  await page.reload()
  await page.locator('[data-hotspot="npc:seller"]').click({ timeout: 45000 })
  await expect(conversation.getByRole('log')).toContainText('véhicule est fourni', {
    timeout: 45000,
  })
  expect((await saved()).life.wallet).toBe(500)
  expect(errors).toEqual([])
})

test('returning taxi: paid ride, automatic fuel, garage and police stops, then next customer', async ({
  page,
}, info) => {
  test.setTimeout(360000)
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  const state = initialCityLife()
  state.duty = 'taxi'
  state.vehicle = { x: state.at.x, z: state.at.y - 1, heading: 0 }
  state.fleet = {
    taxi: {
      ...vehicleCare(state, 'taxi'),
      fuelMl: 950,
      fuelReserve: 3000,
      maintenanceReserve: 100,
      sinceMaintenanceKm: 9,
      courses: 2,
    },
  }
  state.life.wallet = 100
  state.life.hour = 21
  await page.addInitScript((state) => {
    if (sessionStorage.getItem('support-seeded')) return
    sessionStorage.setItem('support-seeded', '1')
    localStorage.setItem('haroolife.lome-city.v1', JSON.stringify(state))
  }, state)
  const probe = () =>
    page.evaluate(
      () =>
        (
          window as unknown as {
            __LOME_FARE?: {
              service: { phase: string; stop?: { service: string } }
              care: {
                refills: number
                services: number
                checks: number
                lastReceipt?: { net: number }
              }
            }
          }
        ).__LOME_FARE,
    )
  const wallet = () =>
    page.evaluate(
      () => (window as unknown as { __LOME_CITY?: { wallet: number } }).__LOME_CITY?.wallet,
    )
  await page.goto('/haroolife')
  await page
    .getByRole('button', { name: 'Monter dans le taxi', exact: true })
    .click({ timeout: 45000 })
  await expect
    .poll(async () => (await probe())?.care.lastReceipt?.net, { timeout: 90000 })
    .toBeGreaterThan(0)
  const net = (await probe())!.care.lastReceipt!.net
  await expect.poll(wallet).toBe(100 + net)
  await expect.poll(async () => (await probe())?.care.refills, { timeout: 90000 }).toBe(1)
  expect(await wallet(), 'the prepaid refill does not debit twice').toBe(100 + net)
  await expect.poll(async () => (await probe())?.care.services, { timeout: 90000 }).toBe(1)
  expect(await wallet(), 'the maintenance reserve is not debited twice').toBe(100 + net)
  await expect.poll(async () => (await probe())?.care.checks, { timeout: 90000 }).toBe(1)
  expect(await wallet(), 'the road-safety check is free').toBe(100 + net)
  await page.screenshot({ path: info.outputPath('automatic-support-complete.png') })
  await expect.poll(async () => (await probe())?.service.phase, { timeout: 60000 }).toBe('trip')
  await page.getByRole('button', { name: 'Descendre du taxi', exact: true }).click()
  await expect
    .poll(
      () =>
        page.evaluate(
          () =>
            (window as unknown as { __LOME_PLAYER?: { driving: boolean } }).__LOME_PLAYER?.driving,
        ),
      { timeout: 90000 },
    )
    .toBe(false)
  await page.getByRole('button', { name: 'Voir mon argent' }).click()
  await expect(page.getByTestId('vehicle-ledger-taxi')).toContainText('Net gagné')
  await page.screenshot({ path: info.outputPath('vehicle-expense-receipt.png') })
  expect(errors).toEqual([])
})

test('the original estate well has a visible, usable washing point', async ({ page }) => {
  const state = initialCityLife()
  state.life.inside = 'well'
  state.life.needs.hygiene = 10
  await page.addInitScript(
    (state) => localStorage.setItem('haroolife.lome-city.v1', JSON.stringify(state)),
    state,
  )
  await page.goto('/haroolife')
  await page
    .getByRole('button', { name: 'Se laver au puits', exact: true })
    .click({ timeout: 45000 })
  await expect
    .poll(
      () =>
        page.evaluate(
          () =>
            JSON.parse(localStorage.getItem('haroolife.lome-city.v1') ?? '{}').life?.needs.hygiene,
        ),
      { timeout: 45000 },
    )
    .toBe(100)
})
