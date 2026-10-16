import { expect, openPlaces, test } from './lome-test'
import { initialCityLife } from '../lib/haroolife/city/life'
import { setLocality } from '../lib/haroolife/city/locality'
import { employerLot } from '../lib/haroolife/city/employment'
import { landmarks } from '../lib/haroolife/city/world'

const key = 'haroolife.lome-city.v1'
const save = (page: import('@playwright/test').Page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem('haroolife.lome-city.v1')!))
async function seed(
  page: import('@playwright/test').Page,
  state: ReturnType<typeof initialCityLife>,
) {
  await page.addInitScript(
    ({ key, state }) => {
      if (sessionStorage.getItem('regional-seeded')) return
      sessionStorage.setItem('regional-seeded', '1')
      localStorage.setItem(key, JSON.stringify(state))
    },
    { key, state },
  )
}

test('mobile: all requested regions open through the national map, preserving the estate', async ({
  page,
}, info) => {
  test.setTimeout(240000)
  setLocality('lome')
  const state = initialCityLife()
  state.life.wallet = 100000
  await seed(page, state)
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto('/haroolife')
  await expect(page.locator('canvas').first()).toBeVisible({ timeout: 45000 })
  for (const [id, name] of [
    ['dapaong', 'Dapaong'],
    ['sokode', 'Sokodé'],
    ['kpalime', 'Kpalimé'],
    ['atakpame', 'Atakpamé'],
  ] as const) {
    await openPlaces(page)
    await page
      .getByTestId('national-map')
      .getByRole('button', { name: `Voyager vers ${name}`, exact: true })
      .last()
      .click()
    // Every town is reached by coach now: the companies are listed, the first one is taken.
    await page
      .getByTestId('coach-companies')
      .getByRole('button', { name: /^Prendre le car / })
      .first()
      .click()
    await expect.poll(async () => (await save(page)).locality).toBe(id)
    await expect(page.getByTestId('travel-splash')).toBeHidden({ timeout: 45000 })
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            (window as unknown as { __LOME_STREET?: { buildings: number } }).__LOME_STREET
              ?.buildings ?? 0,
        ),
      )
      .toBeGreaterThan(20)
    expect((await save(page)).life.city.buildings).toEqual(state.life.city.buildings)
    const dialog = page.locator('[aria-labelledby="event-title"]')
    for (let n = 0; n < 6 && (await dialog.isVisible()); n++)
      await dialog.getByRole('button').first().click()
    await page.screenshot({ path: info.outputPath(`${id}-street.png`) })
  }
  expect(errors).toEqual([])
})

for (const employer of ['mixx', 'moov'] as const)
  test(`mobile: ${employer} kiosk pays by the hour and leaving stops the shift`, async ({
    page,
  }, info) => {
    setLocality('lome')
    const state = initialCityLife()
    const lot = employerLot(employer)!
    state.insideLot = lot.id
    state.at = lot.door
    state.target = lot.id
    await seed(page, state)
    await page.goto('/haroolife')
    const panel = page.getByTestId(`employer-${employer}`)
    await expect(panel).toBeVisible({ timeout: 45000 })
    await panel.getByRole('button', { name: /Commencer chez/ }).click()
    await expect(panel).toContainText('En service')
    await expect
      .poll(async () => (await save(page)).employment?.hoursToday, { timeout: 20000 })
      .toBe(1)
    expect((await save(page)).life.wallet).toBe(state.life.wallet + 1200)
    await page.screenshot({ path: info.outputPath(`${employer}-paid.png`) })
    await panel.getByRole('button', { name: 'Terminer le service' }).click()
    await expect.poll(async () => (await save(page)).employment?.shift).toBeNull()
    const amount = (await save(page)).life.wallet
    await page.reload()
    await expect(panel).toBeVisible({ timeout: 45000 })
    expect((await save(page)).life.wallet).toBe(amount)
  })

test('mobile: fictional aviation boards at the terminal, charges once and arrives in Kara', async ({
  page,
}, info) => {
  setLocality('lome')
  const state = initialCityLife()
  const lot = landmarks().find((l) => /aéroport/i.test(l.name ?? ''))!
  state.insideLot = lot.id
  state.at = lot.door
  state.target = lot.id
  state.life.wallet = 50000
  await seed(page, state)
  await page.goto('/haroolife')
  await page.getByRole('button', { name: /Embarquer vers Kara/ }).click({ timeout: 45000 })
  await expect.poll(async () => (await save(page)).locality).toBe('kara')
  await expect(page.getByTestId('travel-splash')).toContainText('de vol')
  await page.screenshot({ path: info.outputPath('aviation.png') })
  await expect(page.getByTestId('travel-splash')).toBeHidden({ timeout: 45000 })
  expect((await save(page)).life.wallet).toBe(32000)
  await page.reload()
  await expect.poll(async () => (await save(page)).locality).toBe('kara')
  expect((await save(page)).life.wallet).toBe(32000)
})

test('mobile: visible cars and motos move while the player stays still', async ({ page }, info) => {
  setLocality('lome')
  await seed(page, initialCityLife())
  await page.goto('/haroolife')
  type Traffic = { id: number; kind: string; x: number; z: number }
  const traffic = () =>
    page.evaluate(
      () =>
        (window as unknown as { __LOME_STREET?: { traffic: Traffic[] } }).__LOME_STREET?.traffic ??
        [],
    )
  await expect.poll(async () => (await traffic()).length, { timeout: 45000 }).toBeGreaterThan(5)
  const before = await traffic()
  expect(before.some((c) => c.kind === 'moto')).toBe(true)
  expect(before.some((c) => c.kind === 'taxi')).toBe(true)
  await expect
    .poll(async () => {
      const after = await traffic()
      return after.filter((c) => {
        const b = before.find((b) => b.id === c.id)
        return b && Math.hypot(c.x - b.x, c.z - b.z) > 0.4
      }).length
    })
    .toBeGreaterThan(3)
  await page.screenshot({ path: info.outputPath('traffic.png') })
  await page.getByRole('button', { name: 'Voir les joueurs en ligne' }).click()
  await expect(page.getByRole('region', { name: 'Joueurs en ligne' })).toContainText(
    'Aucun statut en ligne ne peut être confirmé',
  )
})

test('mobile: gym cycling uses a real skeletal animation on the saddle', async ({ page }, info) => {
  setLocality('lome')
  const state = initialCityLife()
  const lot = landmarks().find((l) => l.type === 'sport')!
  state.insideLot = lot.id
  state.at = lot.door
  state.target = lot.id
  await seed(page, state)
  await page.goto('/haroolife')
  await page.locator('[data-hotspot="bike-1"]').click({ timeout: 45000 })
  await expect.poll(async () => (await save(page)).activity?.anim, { timeout: 30000 }).toBe('cycle')
  expect((await save(page)).life.wallet).toBe(state.life.wallet - 500)
  expect((await save(page)).fitness).toBe(4)
  await page.screenshot({ path: info.outputPath('cycling.png') })
})
