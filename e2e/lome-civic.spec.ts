import type { Page } from '@playwright/test'
import { layoutFor } from '../lib/haroolife/city/interiors'
import { enterLot, initialCityLife } from '../lib/haroolife/city/life'
import { landmarks } from '../lib/haroolife/city/world'
import { expect, openPlaces, test } from './lome-test'

async function seed(page: Page, state: ReturnType<typeof initialCityLife>) {
  await page.addInitScript((state) => {
    if (sessionStorage.getItem('civic-seeded')) return
    sessionStorage.setItem('civic-seeded', '1')
    localStorage.setItem('haroolife.lome-city.v1', JSON.stringify(state))
    localStorage.setItem('haroolife.engine', 'three')
  }, state)
}
const saved = (page: Page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem('haroolife.lome-city.v1')!))
const player = (page: Page) =>
  page.evaluate(
    () =>
      (
        window as unknown as {
          __LOME_PLAYER?: {
            x: number
            z: number
            policeStopped: boolean
            waitingForSignal: boolean
            walkingRoute: { x: number; z: number }[]
          }
        }
      ).__LOME_PLAYER,
  )
test.afterEach(async ({ page }, info) => {
  if (info.status === info.expectedStatus) return
  const probes = await page
    .evaluate(() => {
      const w = window as unknown as Record<string, unknown>
      return {
        player: w.__LOME_PLAYER,
        street: w.__LOME_STREET,
        interior: w.__LOME_INTERIOR,
        city: w.__LOME_CITY,
      }
    })
    .catch(() => null)
  await info.attach('civic-state', {
    body: JSON.stringify(probes, null, 2),
    contentType: 'application/json',
  })
})

test('university: remembered R3F choice retains bubbles, object guide and a reachable timetable', async ({
  page,
}, info) => {
  const lot = landmarks().find((l) => l.type === 'university')!
  const state = enterLot(initialCityLife(), lot)
  state.life.hour = 8
  state.life.wallet = 5000
  await seed(page, state)
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto('/haroolife')
  const guide = page.getByTestId('room-guide')
  await expect(guide).toBeVisible({ timeout: 45000 })
  await expect(page.locator('[data-hotspot="timetable"]')).toBeVisible()
  await expect(page.locator('[data-hotspot="npc:secretary"]')).toBeVisible()
  await page.screenshot({ path: info.outputPath('universite-bulles.png') })
  await guide.getByRole('button', { name: /Objets et personnes/ }).click()
  await expect(guide.getByRole('button', { name: /Suivre le cours : Agronomie/ })).toBeVisible()
  await guide.getByRole('button', { name: /Consulter l’emploi du temps/ }).click()
  await expect(page.getByTestId('timetable')).toBeVisible({ timeout: 45000 })
  expect((await saved(page)).life.wallet).toBe(5000)
  await page.keyboard.press('Escape')
  await page.locator('[data-hotspot="seat-0-1"]').click()
  await expect.poll(async () => (await saved(page)).life.wallet, { timeout: 45000 }).toBe(4000)
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as unknown as { __LOME_INTERIOR?: { posture?: { phase: string } } })
            .__LOME_INTERIOR?.posture?.phase,
      ),
    )
    .toBe('idle')
  await page.screenshot({ path: info.outputPath('universite-cours-assis.png') })
  expect(errors).toEqual([])
})

test('town hall: speak to the fictional mayor, submit a free report and complete the repair', async ({
  page,
}, info) => {
  const lot = landmarks().find((l) => l.type === 'townhall')!
  const state = enterLot(initialCityLife(), lot)
  state.life.hour = 8
  const prop = layoutFor('hall', lot).props.find((p) => p.action === 'civic-report')!
  await seed(page, state)
  await page.goto('/haroolife')
  await page.locator(`[data-hotspot="${prop.id}"]`).click({ timeout: 45000 })
  await expect
    .poll(async () => (await saved(page)).civic?.reports?.lome, { timeout: 45000 })
    .toBe(8)
  expect((await saved(page)).life.wallet).toBe(state.life.wallet)
  await page
    .getByTestId('room-guide')
    .getByRole('button', { name: /Objets et personnes/ })
    .click()
  await page
    .getByTestId('room-guide')
    .getByRole('button', { name: /Parler : Maire Agbavi/ })
    .click()
  const conversation = page.getByLabel('Conversation', { exact: true })
  await expect(conversation).toBeVisible({ timeout: 45000 })
  await conversation.getByRole('button', { name: 'Les promesses du maire ?' }).click()
  await expect(conversation.getByRole('log')).toContainText('moins de rubans, plus de boulons')
  await page.screenshot({ path: info.outputPath('maire-fictif.png') })
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Faire avancer le temps', exact: true }).click()
  await expect
    .poll(async () => (await saved(page)).life.hour, { timeout: 30000 })
    .toBeGreaterThanOrEqual(10)
  await page.getByRole('button', { name: 'Mettre en pause', exact: true }).click()
  await page.getByRole('button', { name: /^Activités/ }).click()
  await expect(page.getByRole('dialog', { name: 'Lieu' })).toContainText(
    'tous les feux du quartier fonctionnent',
  )
  await page.screenshot({ path: info.outputPath('mairie-feux-repares.png') })
})

test('street: manual jaywalking prompts a warning and offers an automatic return to the kerb', async ({
  page,
}, info) => {
  const state = initialCityLife()
  state.vehicle = null
  await seed(page, state)
  await page.goto('/haroolife')
  await expect.poll(async () => (await player(page))?.x, { timeout: 45000 }).toBe(state.at.x)
  await page.bringToFront()
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as unknown as { __LOME_STREET?: { signals: { seconds: number } } }).__LOME_STREET
            ?.signals.seconds ?? 0,
      ),
    )
    .toBeGreaterThanOrEqual(3)
  const keyboard = info.project.name === 'firefox-mobile'
  if (keyboard) {
    // Firefox's headed cloud window does not dispatch mouse drag capture reliably.
    // Exercise the real keyboard locomotion; Chromium covers the analogue touch zone.
    await page.keyboard.down('ArrowDown')
    await page.keyboard.down('ArrowLeft')
  } else {
    const box = await page.getByTestId('joystick').boundingBox()
    if (!box) throw new Error('joystick absent')
    const cx = box.x + box.width / 2
    const cy = box.y + box.height / 2
    const radius = Math.min(box.width, box.height) / 2
    await page.mouse.move(cx, cy)
    await page.mouse.down()
    await page.mouse.move(
      cx - Math.sin((35 * Math.PI) / 180) * radius * 0.8,
      cy + Math.cos((35 * Math.PI) / 180) * radius * 0.8,
    )
  }
  await expect(page.getByRole('dialog', { name: 'Contrôle piéton' })).toBeVisible({
    timeout: 15000,
  })
  if (keyboard) {
    await page.keyboard.up('ArrowDown')
    await page.keyboard.up('ArrowLeft')
  } else await page.mouse.up()
  await page.keyboard.press('e')
  expect((await saved(page)).insideLot).toBeNull()
  await expect(page.getByRole('dialog', { name: 'Contrôle piéton' })).toContainText(
    'avertissement, aucun paiement',
  )
  expect((await saved(page)).life.wallet).toBe(state.life.wallet)
  await page.screenshot({ path: info.outputPath('police-pieton.png') })
  await page.getByRole('button', { name: 'Rejoindre le trottoir', exact: true }).click()
  await expect.poll(async () => (await player(page))?.policeStopped).toBe(false)
  await expect
    .poll(async () => (await player(page))?.walkingRoute.length, { timeout: 15000 })
    .toBe(0)
  expect((await saved(page)).civic.warnings).toBe(1)
})

test('street: choose a destination and walk automatically on pavements with working 3D signals', async ({
  page,
}, info) => {
  const state = initialCityLife()
  state.vehicle = null
  await seed(page, state)
  await page.goto('/haroolife')
  await expect.poll(async () => (await player(page))?.x, { timeout: 45000 }).toBe(state.at.x)
  await openPlaces(page)
  await page.getByRole('button', { name: /Mixx by Yas · Lomé/ }).click()
  await page.getByRole('button', { name: /À pied/ }).click()
  await page.getByRole('button', { name: 'Confirmer le trajet', exact: true }).click()
  await expect.poll(async () => (await player(page))?.walkingRoute.length).toBeGreaterThan(0)
  await expect
    .poll(async () => (await player(page))?.walkingRoute.length, { timeout: 90000 })
    .toBe(0)
  const lot = landmarks().find((l) => /Mixx by Yas/.test(l.name ?? ''))!
  const p = await player(page)
  expect(p && Math.hypot(p.x - lot.door.x, p.z - lot.door.y)).toBeLessThan(1.5)
  expect((await saved(page)).civic?.warnings ?? 0).toBe(0)
  await expect
    .poll(async () => (await saved(page)).life.lastEvent)
    .toContain('Tu es arrivé devant Mixx by Yas')
  await expect(page.getByRole('button', { name: 'Entrer ou sortir' })).toBeVisible()
  await page.screenshot({ path: info.outputPath('rue-trottoirs-et-feux.png') })
  await page.reload()
  await expect
    .poll(
      async () => {
        const restored = await player(page)
        return restored && p ? Math.hypot(restored.x - p.x, restored.z - p.z) : 999
      },
      { timeout: 45000 },
    )
    .toBeLessThan(0.2)
})
