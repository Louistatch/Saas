import type { Page } from '@playwright/test'
import { initialCityLife } from '../lib/haroolife/city/life'
import { landmarks } from '../lib/haroolife/city/world'
import { expect, test } from './lome-test'

const interior = (page: Page) =>
  page.evaluate(
    () =>
      (
        window as unknown as {
          __LOME_INTERIOR?: {
            x: number
            y: number
            z: number
            anim: string
            mealProps: boolean
            posture: { id: string; phase: string } | null
          }
        }
      ).__LOME_INTERIOR,
  )
const save = (page: Page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem('haroolife.lome-city.v1')!))
async function seed(page: Page, state: ReturnType<typeof initialCityLife>, avatar = 'afi') {
  await page.addInitScript(
    ({ state, avatar }) => {
      if (sessionStorage.getItem('daily-seeded')) return
      sessionStorage.setItem('daily-seeded', '1')
      localStorage.setItem('haroolife.lome-city.v1', JSON.stringify(state))
      localStorage.setItem('haroolife.avatar.v1', JSON.stringify({ v: 1, model: avatar, pagne: 1 }))
    },
    { state, avatar },
  )
}

for (const avatar of ['afi', 'abra', 'kossi', 'koffi'])
  test(`${avatar}: sit on the house chair, stay seated, stand then walk`, async ({
    page,
  }, info) => {
    const avatarRequests: string[] = []
    page.on('request', (request) => {
      if (request.url().includes('/vendor/quaternius/')) avatarRequests.push(request.url())
    })
    const state = initialCityLife()
    state.life.inside = 'house'
    await seed(page, state, avatar)
    await page.goto('/haroolife')
    await page.locator('[data-hotspot="sit"]').click({ timeout: 45000 })
    await expect
      .poll(async () => (await interior(page))?.posture?.phase, { timeout: 30000 })
      .toBe('idle')
    await expect.poll(async () => (await interior(page))?.anim).toBe('HarooSitIdle')
    expect(avatarRequests.some((url) => new URL(url).searchParams.get('daily') === '1')).toBe(true)
    await expect(page.getByRole('button', { name: 'Se lever', exact: true })).toBeVisible()
    const p = await interior(page)
    if (!p) throw new Error('Le personnage n’est pas affiché.')
    await page.waitForTimeout(avatar === 'afi' ? 31000 : 4000)
    expect((await interior(page))?.posture?.phase).toBe('idle')
    expect((await interior(page))?.x).toBeCloseTo(p.x, 2)
    await page.screenshot({ path: info.outputPath(`${avatar}-assis.png`) })
    await page.getByRole('button', { name: 'Se lever', exact: true }).click()
    await expect.poll(async () => (await interior(page))?.posture).toBeNull()
    await expect.poll(async () => (await interior(page))?.y).toBe(0)
    const before = await interior(page)
    await page.keyboard.down('ArrowLeft')
    await page.waitForTimeout(650)
    await page.keyboard.up('ArrowLeft')
    const after = await interior(page)
    if (!before || !after) throw new Error('Le personnage a disparu après son relevage.')
    expect(Math.hypot(after.x - before.x, after.z - before.z)).toBeGreaterThan(0.15)
    await page.screenshot({ path: info.outputPath(`${avatar}-debout.png`) })
  })

test('market: order once, walk to a seat, visibly eat and keep the remaining stock after reload', async ({
  page,
}, info) => {
  const state = initialCityLife()
  const market = landmarks().find((l) => l.type === 'market')!
  state.insideLot = market.id
  state.at = market.door
  state.target = market.id
  state.life.wallet = 1000
  state.life.needs.hunger = 10
  await seed(page, state)
  await page.goto('/haroolife')
  await page.locator('[data-hotspot="counter"]').click({ timeout: 45000 })
  const ayimolou = page.getByTestId('goods-ayimolou')
  await ayimolou.getByRole('button', { name: 'Commander et manger ici · 500 FCFA' }).click()
  await expect(page.getByTestId('daily-action')).toBeVisible()
  await expect.poll(async () => (await save(page)).life.wallet).toBe(500)
  expect((await save(page)).commerce.inventory.ayimolou).toBe(1)
  await expect.poll(async () => (await interior(page))?.mealProps, { timeout: 45000 }).toBe(true)
  await expect.poll(async () => (await interior(page))?.anim).toBe('HarooEatSeated')
  await page.screenshot({ path: info.outputPath('ayimolou-a-table.png') })
  await expect.poll(async () => (await save(page)).life.needs.hunger).toBe(45)
  await expect.poll(async () => (await save(page)).meal, { timeout: 20000 }).toBeUndefined()
  expect((await save(page)).commerce.inventory.ayimolou).toBe(0)
  expect((await save(page)).life.wallet).toBe(500)
  await expect(page.getByRole('button', { name: 'Se lever', exact: true })).toBeVisible()
  await page.screenshot({ path: info.outputPath('repas-termine.png') })
  await page.reload()
  await expect.poll(async () => (await interior(page))?.anim).toBe('Idle')
  expect((await save(page)).life.wallet).toBe(500)
  expect((await save(page)).commerce.inventory.ayimolou).toBe(0)
})

test('bag: eating in the street has a visible bowl and no second purchase', async ({
  page,
}, info) => {
  const state = initialCityLife()
  state.life.needs.hunger = 10
  state.life.wallet = 100
  state.commerce = { inventory: { ayimolou: 1 }, boughtMeals: 1 }
  await seed(page, state)
  await page.goto('/haroolife')
  await page
    .getByRole('navigation', { name: 'Navigation du jeu' })
    .getByRole('button', { name: 'Aménager' })
    .click()
  await page
    .getByTestId('goods-ayimolou')
    .getByRole('button', { name: 'Manger', exact: true })
    .click()
  await expect(page.getByTestId('daily-action')).toBeVisible()
  await expect.poll(async () => (await save(page)).meal?.phase, { timeout: 45000 }).toBe('eating')
  await page.screenshot({ path: info.outputPath('repas-dans-la-rue.png') })
  await expect.poll(async () => (await save(page)).life.needs.hunger).toBe(45)
  await expect.poll(async () => (await save(page)).meal, { timeout: 20000 }).toBeUndefined()
  expect((await save(page)).life.wallet).toBe(100)
  expect((await save(page)).commerce.inventory.ayimolou).toBe(0)
})
