import fs from 'node:fs'
import type { Locator, Page } from '@playwright/test'
import { initialCityLife } from '../lib/haroolife/city/life'
import { expect, test } from './lome-test'

const street = (page: Page) =>
  page.evaluate(
    () =>
      (
        window as unknown as {
          __LOME_STREET?: {
            rendererId: string
            pendingTiles: number
            contactShadows: number
            traffic: { x: number; z: number }[]
          }
        }
      ).__LOME_STREET,
  )

/** The control must be inside the actual viewport and win hit testing over the canvas. */
async function reachable(button: Locator) {
  await expect(button).toBeVisible()
  expect(
    await button.evaluate((el) => {
      const r = el.getBoundingClientRect()
      const at = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)
      return (
        r.width >= 40 &&
        r.height >= 40 &&
        r.x >= 0 &&
        r.y >= 0 &&
        r.right <= innerWidth + 1 &&
        r.bottom <= innerHeight + 1 &&
        !!at &&
        el.contains(at)
      )
    }),
  ).toBe(true)
}

test('interface: readable street, reachable controls, live traffic and compact viewports', async ({
  page,
}, info) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => {
    if (m.type() === 'error' && /WebGL|Shader Error|GL_INVALID|context lost/i.test(m.text()))
      errors.push(m.text())
  })
  const save = initialCityLife()
  save.life.hour = 14
  await page.addInitScript((save) => {
    localStorage.setItem('haroolife.lome-city.v1', JSON.stringify(save))
    localStorage.setItem('haroolife.quality', 'eco')
  }, save)
  await page.goto('/haroolife')
  await expect.poll(async () => (await street(page))?.pendingTiles, { timeout: 60000 }).toBe(0)
  await expect.poll(async () => (await street(page))?.contactShadows ?? 0).toBeGreaterThan(0)
  const initial = await street(page)
  if (!initial) throw new Error('La rue ne publie pas son état.')
  expect(initial.contactShadows).toBeLessThanOrEqual(64)
  const renderer = initial.rendererId
  const cars = JSON.stringify(initial.traffic)
  // Traffic remains alive after removing the obsolete React trafficStep timer.
  await expect.poll(async () => JSON.stringify((await street(page))?.traffic)).not.toBe(cars)
  const nav = page.getByRole('navigation', { name: 'Navigation du jeu' })
  for (const button of await nav.getByRole('button').all()) await reachable(button)
  await reachable(page.getByRole('button', { name: 'Voir mon argent' }))
  await reachable(page.getByRole('button', { name: 'Voir les joueurs en ligne' }))
  fs.mkdirSync('docs/captures/interface-2026-10-18', { recursive: true })
  await page.screenshot({
    path: `docs/captures/interface-2026-10-18/after-${info.project.name}.png`,
  })
  await nav.getByRole('button', { name: 'Carte', exact: true }).click()
  await expect(page.getByTestId('city-map')).toBeVisible()
  const header = await page.locator('.hl-header').boundingBox()
  const categories = await page.getByRole('group', { name: 'Catégories de lieux' }).boundingBox()
  if (!categories || !header) throw new Error('Les commandes de la carte sont absentes.')
  expect(categories.y).toBeGreaterThanOrEqual(header.y + header.height)
  await page.getByRole('button', { name: 'Retour au jeu' }).click()
  expect((await street(page))?.rendererId).toBe(renderer)
  await page.getByRole('button', { name: 'Afficher les besoins du personnage' }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.getByRole('button', { name: 'Fermer', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  if (info.project.name === 'mobile-android') {
    for (const viewport of [
      { width: 320, height: 640 },
      { width: 915, height: 412 },
    ]) {
      await page.setViewportSize(viewport)
      await expect
        .poll(() => page.locator('.haroolife-screen').evaluate((el) => el.clientHeight))
        .toBe(viewport.height)
      for (const button of await nav.getByRole('button').all()) await reachable(button)
      await reachable(page.getByRole('button', { name: /Changer de caméra/ }))
      await reachable(page.getByRole('button', { name: 'Voir mon argent' }))
      await reachable(page.getByRole('button', { name: 'Voir les joueurs en ligne' }))
      await page.screenshot({ path: info.outputPath(`interface-${viewport.width}.png`) })
    }
  }
  expect(errors).toEqual([])
})
