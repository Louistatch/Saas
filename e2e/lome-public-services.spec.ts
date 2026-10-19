import type { Page } from '@playwright/test'
import { emergencyRoad } from '../lib/haroolife/city/emergency'
import { drivingRoute } from '../lib/haroolife/city/fares'
import { layoutFor } from '../lib/haroolife/city/interiors'
import { enterLot, initialCityLife } from '../lib/haroolife/city/life'
import { PavementGraph, pickupRoad } from '../lib/haroolife/city/pedestrians'
import { WORLD_H, WORLD_W, landmarks } from '../lib/haroolife/city/world'
import { expect, test } from './lome-test'

const saved = (page: Page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem('haroolife.lome-city.v1') ?? '{}'))
const street = (page: Page) =>
  page.evaluate(
    () =>
      (
        window as unknown as {
          __LOME_STREET?: {
            publicServices: {
              ambulance: { x: number; z: number; phase: string } | null
              worksite: unknown
              worker: boolean
            }
            signals: { repaired: boolean }
          }
        }
      ).__LOME_STREET,
  )
async function seed(page: Page, state: ReturnType<typeof initialCityLife>) {
  await page.addInitScript((state) => {
    if (sessionStorage.getItem('public-services-seeded')) return
    sessionStorage.setItem('public-services-seeded', '1')
    localStorage.setItem('haroolife.lome-city.v1', JSON.stringify(state))
    localStorage.setItem('haroolife.quality', 'eco')
  }, state)
}
function patientState() {
  const h = landmarks().find((l) => l.type === 'hospital')
  if (!h) throw new Error('Aucun hôpital de test.')
  const start = pickupRoad({ x: h.door.x, z: h.door.y }, emergencyRoad)
  if (!start) throw new Error('Hôpital sans voie d’accès.')
  let target = start
  find: for (let dx = -4; dx <= 4; dx++)
    for (let dz = -4; dz <= 4; dz++) {
      const x = start.x + dx
      const z = start.z + dz
      if (Math.hypot(dx, dz) < 3 || !emergencyRoad(x, z)) continue
      const route = drivingRoute(start, { x, y: z }, emergencyRoad)
      if (route && route.length >= 4 && route.length <= 8) {
        target = { x, z }
        break find
      }
    }
  const graph = new PavementGraph(emergencyRoad, WORLD_W, WORLD_H)
  const p = graph.nodes[graph.nearest(target)]
  if (!p) throw new Error('Pas de trottoir pour le patient.')
  const s = initialCityLife()
  s.at = { x: target.x, y: target.z }
  s.pose = { x: p.x, z: p.z, heading: 0 }
  s.vehicle = null
  s.life.wallet = 100
  s.life.needs.energy = 10
  s.life.needs.hygiene = 10
  return s
}
async function openServices(page: Page) {
  await page
    .getByRole('navigation', { name: 'Navigation du jeu' })
    .getByRole('button', { name: 'Téléphone' })
    .click()
  await page.getByRole('button', { name: 'Services publics', exact: true }).click()
  await expect(page.getByTestId('public-services')).toBeVisible()
}

test('ambulance: call, real road pickup, visible medic, automatic transport and care exactly once', async ({
  page,
}, info) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  const state = patientState()
  await seed(page, state)
  await page.goto('/haroolife')
  await expect.poll(() => street(page), { timeout: 60000 }).toBeTruthy()
  await openServices(page)
  await page.getByRole('button', { name: 'Appeler l’ambulance du jeu', exact: true }).click()
  await expect(page.getByTestId('ambulance-mission')).toBeVisible()
  await expect.poll(async () => (await saved(page)).emergency?.active?.phase).toBe('dispatch')
  const hospital = (await saved(page)).emergency.active.hospital
  await expect
    .poll(async () => (await saved(page)).emergency?.active?.phase, { timeout: 120000 })
    .toBe('boarding')
  await expect
    .poll(() =>
      page.evaluate(() =>
        (window as unknown as { __LOME_SCENE?: { has(n: string): boolean } }).__LOME_SCENE?.has(
          'Soignante de l’ambulance',
        ),
      ),
    )
    .toBe(true)
  await page.waitForTimeout(1000)
  await page.screenshot({ path: info.outputPath('ambulance-prise-en-charge.png') })
  await expect
    .poll(async () => (await saved(page)).emergency?.active?.phase, { timeout: 30000 })
    .toBe('transport')
  const from = (await street(page))?.publicServices.ambulance
  await expect
    .poll(
      async () => {
        const now = (await street(page))?.publicServices.ambulance
        return !!from && !!now && Math.hypot(now.x - from.x, now.z - from.z) > 0.3
      },
      { timeout: 20000 },
    )
    .toBe(true)
  await page.screenshot({ path: info.outputPath('ambulance-transport.png') })
  await expect
    .poll(async () => (await saved(page)).emergency?.completed, { timeout: 120000 })
    .toBe(1)
  const after = await saved(page)
  expect(after.insideLot).toBe(hospital)
  expect(after.life.wallet).toBe(100)
  expect(after.life.needs.energy).toBe(40)
  expect(after.life.needs.hygiene).toBe(30)
  await expect(page.getByTestId('room-guide')).toBeVisible()
  await page.screenshot({ path: info.outputPath('ambulance-soins-hopital.png') })
  await page.getByRole('button', { name: 'Entrer ou sortir' }).click()
  await expect
    .poll(
      () =>
        page.evaluate(
          () =>
            (
              window as unknown as {
                __LOME_PLAYER?: { camera: { distance: number } }
              }
            ).__LOME_PLAYER?.camera.distance,
        ),
      { timeout: 30000 },
    )
    .toBeCloseTo(8, 1)
  await openServices(page)
  await expect(
    page.getByRole('button', { name: 'Premiers soins reçus aujourd’hui' }),
  ).toBeDisabled()
  await page.getByRole('button', { name: 'Fermer', exact: true }).click()
  await page.reload()
  await expect.poll(async () => (await saved(page)).emergency?.completed).toBe(1)
  expect((await saved(page)).life.wallet).toBe(100)
  expect(errors).toEqual([])
})

test('ambulance: reload resumes a dispatch and cancellation leaves money and needs untouched', async ({
  page,
}) => {
  await seed(page, patientState())
  await page.goto('/haroolife')
  await expect.poll(() => street(page), { timeout: 60000 }).toBeTruthy()
  await openServices(page)
  await page.getByRole('button', { name: 'Appeler l’ambulance du jeu', exact: true }).click()
  await expect.poll(async () => (await saved(page)).emergency?.active?.id).toBeTruthy()
  const id = (await saved(page)).emergency.active.id
  await page.reload()
  await expect(page.getByTestId('ambulance-mission')).toBeVisible({ timeout: 60000 })
  await expect(
    page.getByRole('button', { name: 'Arrêter la prise en charge sans frais' }),
  ).toBeFocused()
  expect((await saved(page)).emergency.active.id).toBe(id)
  await page.getByRole('button', { name: 'Arrêter la prise en charge sans frais' }).click()
  await expect(page.getByTestId('ambulance-mission')).toHaveCount(0)
  await expect.poll(async () => (await saved(page)).emergency?.active).toBeNull()
  expect((await saved(page)).life.wallet).toBe(100)
  expect((await saved(page)).life.needs.energy).toBe(10)
  await expect(page.getByRole('application', { name: 'Joystick de déplacement' })).toBeVisible()
})

test('mayor: a real board starts funded works, a visible crew and automatic repair without the player starting the clock', async ({
  page,
}, info) => {
  const hall = landmarks().find((l) => l.type === 'townhall')
  if (!hall) throw new Error('Mairie introuvable.')
  const state = enterLot(initialCityLife(), hall)
  state.at = { ...hall.door }
  state.life.hour = 8
  state.life.wallet = 100
  const board = layoutFor('hall', hall).props.find((p) => p.action === 'civic-report')
  if (!board) throw new Error('Tableau de signalement absent.')
  await seed(page, state)
  await page.goto('/haroolife')
  await page.locator(`[data-hotspot="${board.id}"]`).click({ timeout: 60000 })
  await expect
    .poll(async () => (await saved(page)).civic?.projects?.lome, { timeout: 45000 })
    .toBeTruthy()
  expect((await saved(page)).life.wallet).toBe(100)
  expect((await saved(page)).life.city.coins).toBe(state.life.city.coins - 250)
  await expect(
    page.getByRole('button', { name: 'Faire avancer le temps', exact: true }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Entrer ou sortir' }).click()
  await expect
    .poll(async () => (await street(page))?.publicServices.worker, { timeout: 20000 })
    .toBe(true)
  await page.screenshot({ path: info.outputPath('maire-chantier.png') })
  await expect
    .poll(async () => (await street(page))?.signals.repaired, { timeout: 35000 })
    .toBe(true)
  await expect.poll(async () => (await street(page))?.publicServices.worksite).toBeNull()
  await openServices(page)
  await expect(page.getByTestId('public-services')).toContainText(
    'tous les feux du quartier fonctionnent',
  )
  await page.waitForTimeout(350)
  await page.screenshot({ path: info.outputPath('maire-travaux-termines.png') })
  expect((await saved(page)).life.wallet).toBe(100)
})
