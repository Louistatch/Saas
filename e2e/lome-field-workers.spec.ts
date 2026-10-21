import type { Locator, Page, Route } from '@playwright/test'
import { initialCityLife } from '../lib/haroolife/city/life'
import { expect, test } from './lome-test'

/**
 * « Mon champ » → recruit a worker (game money). The database functions are answered here (their
 * rules are covered by tests/haroolife-field-work.test.mjs): a real Haroo worker accepts two days,
 * the pay leaves the wallet once and the worker tends the field; with nobody available, the
 * fictional neighbours refuse; a player who is an ouvrier answers a proposal.
 */
type City = { wallet: number; day: number }
const OFFER = '00000000-0000-4000-8000-000000000777'
const WORKER = '00000000-0000-4000-8000-000000000051'

const offer = (status: string, extra: Record<string, unknown> = {}) => ({
  id: OFFER,
  status,
  reason: null,
  days: 2,
  pay: 3000,
  crop: 'mais',
  locality: 'lome',
  created_at: new Date().toISOString(),
  expires_at: new Date(Date.now() + 86_400_000).toISOString(),
  answered_at: status === 'pending' ? null : new Date().toISOString(),
  seen: false,
  worker: 'Komla',
  employer: '@ama_be',
  ...extra,
})

/** A field of maize sown this morning (day 2), not tended yet, and 20 000 FCFA in the wallet. */
async function seedField(page: Page) {
  const save = initialCityLife()
  save.life.day = 2
  save.life.hour = 9
  save.life.wallet = 20000
  save.farm = {
    field: { locality: 'lome', crop: 'mais', sownDay: 2, tended: 0, lastTendDay: -1 },
    stock: {},
  }
  await page.addInitScript((save) => {
    localStorage.setItem('haroolife.e2e', '1')
    localStorage.setItem('haroolife.e2e.month', '10')
    if (sessionStorage.getItem('workers.seeded')) return
    sessionStorage.setItem('workers.seeded', '1')
    localStorage.setItem('haroolife.lome-city.v1', JSON.stringify(save))
  }, save)
}

/**
 * Screenshot as a player sees it. To bring an element into view, Playwright also scrolls the game
 * sheet itself (overflow hidden), which a finger never does: that offset is undone first.
 */
async function shot(page: Page, path: string, focus?: Locator) {
  await page.evaluate(() => {
    for (const sheet of document.querySelectorAll<HTMLElement>('.hl-sheet')) sheet.scrollTop = 0
  })
  // Then the sheet's own list is scrolled to what the test looks at, as a finger would.
  await focus?.evaluate((el) => {
    let list = el.parentElement
    while (list && getComputedStyle(list).overflowY !== 'auto') list = list.parentElement
    if (list)
      list.scrollTop += el.getBoundingClientRect().top - list.getBoundingClientRect().top - 16
  })
  await page.screenshot({ path, animations: 'disabled' })
}

const json = (route: Route, body: unknown) =>
  route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })

const city = (page: Page) =>
  page.evaluate(() => (window as unknown as { __LOME_CITY?: City }).__LOME_CITY ?? null)

async function openFarm(page: Page) {
  // Opening again remounts the farm: the panel is closed first (the game bar is under it).
  const close = page.getByRole('button', { name: 'Fermer', exact: true })
  if (await close.isVisible().catch(() => false)) await close.click()
  await page
    .getByRole('navigation', { name: 'Navigation du jeu' })
    .getByRole('button', { name: 'Téléphone' })
    .click()
  await page.getByRole('button', { name: /Mon champ$/ }).click()
  await expect(page.getByTestId('farm')).toBeVisible()
  return page.getByTestId('farm')
}

async function openGame(page: Page) {
  await page.goto('/haroolife', { waitUntil: 'domcontentloaded' })
  await expect(page.locator('canvas:visible').first()).toBeVisible({ timeout: 30000 })
}

test('recruit a real worker: two days proposed, accepted, paid once, the field is tended', async ({
  page,
}, info) => {
  test.setTimeout(150_000)
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await seedField(page)
  let phase: 'none' | 'pending' | 'accepted' = 'none'
  let proposed: unknown = null
  let seen = 0
  await page.route('**/rest/v1/rpc/haroolife_field_*', (route) => {
    const fn = new URL(route.request().url()).pathname.split('/').pop()
    if (fn === 'haroolife_field_workers')
      return json(route, [
        {
          ref: WORKER,
          name: 'Komla',
          skills: ['désherbage', 'labour', 'récolte'],
          note: 4.5,
          reviews: 12,
          nearby: true,
        },
      ])
    if (fn === 'haroolife_field_offer') {
      proposed = route.request().postDataJSON()
      phase = 'pending'
      return json(route, offer('pending'))
    }
    if (fn === 'haroolife_field_offers_mine')
      return json(route, { hired: phase === 'none' ? [] : [offer(phase)], asked: [] })
    if (fn === 'haroolife_field_seen') {
      seen++
      return json(route, true)
    }
    return json(route, null)
  })

  await openGame(page)
  let farm = await openFarm(page)
  const recruit = farm.getByRole('region', { name: 'Recruter un ouvrier' })
  await recruit.getByRole('button', { name: /Recruter un ouvrier · 1\s500 FCFA par jour/ }).click()
  await recruit.getByRole('button', { name: /^2 j · 3\s000 FCFA$/ }).click()
  const komla = recruit.getByTestId('field-worker')
  await expect(komla).toContainText('Komla')
  await expect(komla).toContainText('Dans ta région')
  await expect(komla).toContainText('★ 4,5 · 12 avis · désherbage, labour, récolte')
  await shot(page, info.outputPath('workers-list.png'), recruit)
  const start = (await city(page))?.wallet ?? 0
  await komla.getByRole('button', { name: /Proposer 2 jours à Komla · 3\s000 FCFA/ }).click()
  await expect(recruit.getByTestId('field-pending')).toContainText(
    /Proposition envoyée à Komla : 2 jours au champ, 3\s000 FCFA\./,
  )
  expect(proposed).toEqual({ p_worker: WORKER, p_days: 2, p_crop: 'mais', p_locality: 'lome' })
  // Nothing is paid while the worker has not answered.
  expect((await city(page))?.wallet).toBe(start)
  await shot(page, info.outputPath('workers-pending.png'), recruit)

  // Komla accepts (in the game or on the dashboard); the farm reads the answer when it opens.
  phase = 'accepted'
  farm = await openFarm(page)
  await expect.poll(async () => (await city(page))?.wallet).toBe(start - 3000)
  await expect(farm.getByTestId('field-helper')).toContainText(
    'Komla s’occupe de ton champ aujourd’hui (encore 1 jour ensuite).',
  )
  await expect(farm.getByRole('button', { name: 'Komla s’en occupe aujourd’hui' })).toBeDisabled()
  await expect(farm.locator('output').first()).toContainText(
    /Komla a accepté : 2 jours au champ\. −3\s000 FCFA\./,
  )
  await expect.poll(() => seen).toBeGreaterThan(0)
  await shot(page, info.outputPath('workers-accepted.png'))

  // Read again (the server still says « accepted »): never paid twice.
  const calls = seen
  await openFarm(page)
  await expect.poll(() => seen).toBeGreaterThan(calls)
  expect((await city(page))?.wallet).toBe(start - 3000)
  expect(errors).toEqual([])
})

test('nobody available: the neighbours refuse with an excuse, real workers are invited', async ({
  page,
}, info) => {
  test.setTimeout(150_000)
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await seedField(page)
  await page.route('**/rest/v1/rpc/haroolife_field_*', (route) => {
    const fn = new URL(route.request().url()).pathname.split('/').pop()
    if (fn === 'haroolife_field_workers') return json(route, [])
    if (fn === 'haroolife_field_offers_mine') return json(route, { hired: [], asked: [] })
    return json(route, null)
  })
  await openGame(page)
  const farm = await openFarm(page)
  await farm.getByRole('button', { name: /Recruter un ouvrier/ }).click()
  const village = farm.getByTestId('field-neighbours')
  await expect(village).toContainText('Aucun ouvrier de Haroo n’est disponible pour l’instant.')
  await village.getByRole('button', { name: 'Lui demander' }).first().click()
  await expect(farm.getByTestId('neighbour-excuse')).toContainText(/« .+ »/)
  const invite = farm.getByRole('link', { name: 'Inviter un ouvrier sur WhatsApp' })
  await expect(invite).toHaveAttribute('href', /^https:\/\/wa\.me\/\?text=/)
  await expect(invite).toHaveAttribute('href', /auth%2Fsignup%2Fharoo%3Ftype%3Douvrier/)
  // Asking the neighbours never pays anything.
  expect((await city(page))?.wallet).toBe(20000)
  await shot(page, info.outputPath('workers-neighbours.png'), village)
  expect(errors).toEqual([])
})

test('a player who is an ouvrier accepts a proposal from the farm', async ({ page }, info) => {
  test.setTimeout(150_000)
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await seedField(page)
  let answered: unknown = null
  await page.route('**/rest/v1/rpc/haroolife_field_*', (route) => {
    const fn = new URL(route.request().url()).pathname.split('/').pop()
    if (fn === 'haroolife_field_offers_mine')
      return json(route, { hired: [], asked: answered ? [] : [offer('pending')] })
    if (fn === 'haroolife_field_answer') {
      answered = route.request().postDataJSON()
      return json(route, offer('accepted'))
    }
    if (fn === 'haroolife_field_workers') return json(route, [])
    return json(route, null)
  })
  await openGame(page)
  const farm = await openFarm(page)
  const asked = farm.getByTestId('field-asked')
  await expect(asked).toContainText(
    /@ama_be te propose 2 jours au champ de maïs à Lomé · 3\s000 FCFA du jeu\./,
  )
  await shot(page, info.outputPath('workers-asked.png'), asked)
  await asked.getByRole('button', { name: 'Accepter' }).click()
  await expect(
    farm.getByText(/Accepté : 3\s000 FCFA du jeu arrivent dans ton portefeuille\./),
  ).toBeVisible()
  expect(answered).toEqual({ p_offer: OFFER, p_accept: true })
  await expect(farm.getByTestId('field-asked')).toHaveCount(0)
  expect(errors).toEqual([])
})
