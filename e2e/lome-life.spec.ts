import fs from 'node:fs'
import path from 'node:path'
import { expect, test } from './lome-test'

test('immersive 3D Lomé life completes navigation, shopping, meals and work on desktop and Android', async ({
  page,
}, testInfo) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/haroolife/territoire/lome', { waitUntil: 'domcontentloaded' })
  const navigation = page.getByRole('navigation', { name: 'Navigation du jeu' })
  await expect(navigation).toBeVisible()
  await expect(navigation.getByRole('button', { name: 'Maison' })).toBeVisible()
  await expect(navigation.getByRole('button', { name: 'Acheter' })).toBeVisible()
  await expect(navigation.getByRole('button', { name: 'Carte' })).toBeVisible()
  await expect(navigation.getByRole('button', { name: 'Téléphone' })).toBeVisible()
  const webgl2 = await page.evaluate(() => !!document.createElement('canvas').getContext('webgl2'))
  expect(webgl2, 'Chromium QA must provide a true WebGL2 device').toBe(true)
  await expect(page.locator('canvas').first()).toBeVisible({ timeout: 30000 })

  // Direct control: one step on the on-screen pad moves the character to a neighbouring road tile.
  const before = await page.evaluate(
    () => JSON.parse(localStorage.getItem('haroolife.lome-city.v1') ?? '{}').at,
  )
  await page
    .getByRole('group', { name: 'Déplacer le personnage' })
    .getByRole('button', { name: 'Reculer' })
    .click()
  await expect
    .poll(() =>
      page.evaluate(() => JSON.parse(localStorage.getItem('haroolife.lome-city.v1') ?? '{}').at),
    )
    .toEqual({ x: before.x, y: before.y + 1 })
  await page.keyboard.press('ArrowUp')
  await expect
    .poll(() =>
      page.evaluate(() => JSON.parse(localStorage.getItem('haroolife.lome-city.v1') ?? '{}').at),
    )
    .toEqual(before)

  // Paid rides: the travel scene opens on the boulevard; "Passer" lands at destination.
  // First a taxi to a distant place from its sheet (the ride starts at once), then "Chez
  // moi" from there: the way home is long enough for the map's zémidjan button to find a
  // route still in progress whatever the pace of the machine.
  await navigation.getByRole('button', { name: 'Carte' }).click()
  await page.getByRole('button', { name: /Grand marché d’Assigamé/ }).click()
  await page.getByRole('dialog', { name: 'Lieu' }).getByRole('button', { name: /Taxi/ }).click()
  await expect(page.getByLabel('Trajet en cours')).toBeVisible()
  await page
    .getByLabel('Trajet en cours')
    .getByRole('button', { name: /Passer/ })
    .click({ timeout: 15000, force: true })
    .catch(() => undefined)
  await expect(page.getByLabel('Trajet en cours')).toBeHidden()
  await navigation.getByRole('button', { name: 'Carte' }).click()
  await page.getByRole('button', { name: /Chez moi/ }).click()
  await navigation.getByRole('button', { name: 'Carte' }).click()
  await page.getByRole('button', { name: /Moto/ }).click()
  const ride = page.getByLabel('Trajet en cours')
  await expect(ride).toBeVisible()
  await expect(ride.getByText('Boulevard du Mono')).toBeVisible()
  await expect(page.locator('canvas').first()).toBeVisible({ timeout: 20000 })
  await page.waitForTimeout(1500)
  const rideShot = path.join('test-results', 'lome-visual', testInfo.project.name + '-ride.png')
  fs.mkdirSync(path.dirname(rideShot), { recursive: true })
  await page.screenshot({ path: rideShot })
  // Short ride: under heavy CPU load it can end by itself before the click lands (the overlay
  // unmounts), and the boulevard label re-centres the button row while it is shown.
  await ride
    .getByRole('button', { name: /Passer/ })
    .click({ timeout: 15000, force: true })
    .catch(() => undefined)
  await expect(ride).toBeHidden()
  await navigation.getByRole('button', { name: 'Carte' }).click()
  await expect(page.getByRole('dialog', { name: 'Explorer Lomé' })).toBeVisible()
  // Named city: filters narrow the destinations, districts are listed.
  await page
    .getByRole('group', { name: 'Filtrer la carte' })
    .getByRole('button', { name: 'Commerces' })
    .click()
  await expect(page.getByRole('button', { name: /Chez moi/ })).toBeHidden()
  await page
    .getByRole('group', { name: 'Filtrer la carte' })
    .getByRole('button', { name: 'Tout' })
    .click()
  await expect(page.getByText(/Les quartiers de Lomé/)).toBeVisible()
  await expect(page.getByRole('dialog').getByText('Tokoin').first()).toBeVisible()
  // The other towns are reached by travelling on the Togo map (lome-travel.spec.ts), not renamed.
  await expect(page.getByTestId('national-map').getByText(/OpenStreetMap/)).toBeVisible()
  await expect(page.getByRole('button', { name: /Voyager vers Kara/ }).first()).toBeVisible()
  // Monetisation surfaces: a billboard sheet from the map, partner slots in the phone.
  await page.getByRole('button', { name: /Adidogomé · Disponible/ }).click()
  await expect(page.getByRole('dialog', { name: 'Panneau publicitaire' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Réserver ce panneau' })).toHaveAttribute(
    'href',
    /contact/,
  )
  await page.getByRole('button', { name: 'Fermer', exact: true }).click()
  await navigation.getByRole('button', { name: 'Téléphone' }).click()
  await expect(page.getByText('Services et partenaires')).toBeVisible()
  await expect(
    page.getByRole('link', { name: /Partenaire.*50 000 FCFA\/mois/ }).first(),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Fermer', exact: true }).click()
  await navigation.getByRole('button', { name: 'Carte' }).click()
  await page.getByRole('button', { name: /Marché de quartier/ }).click()
  // Automatic road movement must reach market without pressing +1 hour per tile.
  await expect
    .poll(
      async () => {
        return page.evaluate(() => {
          const save = localStorage.getItem('haroolife.lome-city.v1')
          const c = (window as unknown as { __LOME_CITY?: Record<string, unknown> }).__LOME_CITY
          // One string so a failure prints the whole state (riding, transport, inside…).
          // The route comes from the live state: the autosave is throttled, so the save may
          // still hold the previous (empty) route when the walk has just started.
          return JSON.stringify({
            route: c?.route ?? 99,
            saved: save ? JSON.parse(save).route.length : 99,
            riding: c?.riding,
            transport: c?.transport,
            inside: c?.inside,
            panel: c?.panel,
            at: c?.at,
            walk: (window as unknown as { __LOME_WALK?: unknown }).__LOME_WALK,
            visible: document.visibilityState,
          })
        })
      },
      { timeout: 15000 },
    )
    .toContain('"route":0,')
  await navigation.getByRole('button', { name: 'Acheter' }).click()
  await expect(page.getByRole('dialog', { name: 'Marché & commerces' })).toBeVisible()
  await page.getByRole('button', { name: /Acheter un repas · 650 FCFA/ }).click()
  // The engine answers every action with a message; the purchase must be the last one.
  await expect
    .poll(() =>
      page.evaluate(() => {
        const v = JSON.parse(localStorage.getItem('haroolife.lome-city.v1') ?? 'null')
        const c = (window as unknown as { __LOME_CITY?: Record<string, unknown> }).__LOME_CITY
        return JSON.stringify({
          last: v?.life.lastEvent,
          pos: v?.life.pos,
          inside: v?.life.inside,
          memWallet: c?.wallet,
          memLast: c?.lastEvent,
        })
      }),
    )
    .toContain('repas acheté')
  await page.getByRole('button', { name: /Manger ·/ }).click()
  await page.getByRole('button', { name: 'Fermer', exact: true }).click()

  await navigation.getByRole('button', { name: 'Téléphone' }).click()
  await page.getByRole('button', { name: 'Métiers' }).click()
  await page.getByRole('button', { name: 'Faire mon service' }).click()
  await page.getByRole('button', { name: 'Fermer', exact: true }).click()
  await page.getByRole('button', { name: 'Voir mon argent' }).click()
  await expect
    .poll(async () =>
      page.evaluate(() => {
        const save = localStorage.getItem('haroolife.lome-city.v1')
        const v = save ? JSON.parse(save) : null
        const c = (window as unknown as { __LOME_CITY?: Record<string, unknown> }).__LOME_CITY
        return JSON.stringify({
          wallet: v?.life.wallet,
          pos: v?.life.pos,
          at: c?.at,
          food: v?.life.city.food,
          earned: v?.life.earned,
          spent: v?.life.spent,
          meals: v?.life.meals,
          lastEvent: v?.life.lastEvent,
          inside: c?.inside,
        })
      }),
    )
    .toContain('"wallet":9500,')
  await page.getByRole('button', { name: 'Fermer', exact: true }).click()
  await navigation.getByRole('button', { name: 'Maison' }).click()
  await page.getByRole('button', { name: 'Entrer', exact: true }).click()
  await expect
    .poll(async () =>
      page.evaluate(() => {
        const save = localStorage.getItem('haroolife.lome-city.v1')
        return save ? JSON.parse(save).life.inside : null
      }),
    )
    .toBe('market')
  await expect(page.locator('canvas').first()).toBeVisible()
  await page.waitForTimeout(1200)
  const indoors = path.join('test-results', 'lome-visual', testInfo.project.name + '-interior.png')
  fs.mkdirSync(path.dirname(indoors), { recursive: true })
  await page.screenshot({ path: indoors, fullPage: true })
  await navigation.getByRole('button', { name: 'Maison' }).click()
  await page.getByRole('button', { name: 'Sortir', exact: true }).click()

  await page.getByRole('button', { name: 'Ouvrir les outils de construction' }).click()
  await expect(page.getByRole('dialog', { name: 'Construire' })).toBeVisible()
  await page.getByRole('button', { name: /Maison.*85 FCFA/ }).click()
  await expect(page.getByText(/Pose Maison en touchant un terrain/)).toBeVisible()
  // Return to free travel; selection is still connected to the existing construction engine.
  await page.getByRole('button', { name: 'Terminer' }).click()

  await expect(page.locator('canvas').first()).toBeVisible()
  const screenshot = path.join('test-results', 'lome-visual', testInfo.project.name + '.png')
  fs.mkdirSync(path.dirname(screenshot), { recursive: true })
  await page.screenshot({ path: screenshot, fullPage: true })
  expect(errors, 'No uncaught client runtime errors').toEqual([])
})
