import fs from 'node:fs'
import path from 'node:path'
import { expect, test } from './lome-test'

// Signed-in administrator against the mock Supabase (e2e/fixtures/mock-supabase.mjs): the
// account is member of COOMARA-Kpalimé (120 members, 40 parcelles) and administers its tree.
const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url')
const UID = '11111111-1111-4111-8111-111111111111'
const user = {
  id: UID,
  aud: 'authenticated',
  role: 'authenticated',
  email: 'admin@test.local',
  app_metadata: { role: 'super_admin' },
  user_metadata: {},
}
const tok = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: UID, role: 'authenticated', aud: 'authenticated', exp: 4102444800 })}.c2ln`
const session = {
  access_token: tok,
  refresh_token: 'r0',
  token_type: 'bearer',
  expires_in: 60,
  expires_at: Math.floor(Date.now() / 1000) + 60,
  user,
}
type Stats = {
  route: number
  inside: string | null
  actor: { id: string; organizations: number } | null
  myCoopLot: string | null
  camera: { tx: number; tz: number }
}
const stats = (page: import('@playwright/test').Page) =>
  page.evaluate(() => (window as unknown as { __LOME_CITY?: Stats }).__LOME_CITY ?? null)

test('« Ma coopérative » : camera, entrance and the spatial dashboard of a real organisation', async ({
  page,
  context,
}, testInfo) => {
  test.setTimeout(150_000)
  await context.addCookies([
    { name: 'sb-127-auth-token', value: 'base64-' + b64(session), domain: '127.0.0.1', path: '/' },
  ])
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  // The mock board starts from the fixture for every run (desktop, then mobile).
  await page.request.post('http://127.0.0.1:54329/__reset')
  const dir = path.join('test-results', 'lome-cooperative')
  fs.mkdirSync(dir, { recursive: true })
  await page.goto('/haroolife/territoire/lome', { waitUntil: 'domcontentloaded' })
  await expect(page.locator('canvas').first()).toBeVisible({ timeout: 30000 })

  // The real actor is loaded (identity adapter) and assigned a house of cooperatives.
  await expect
    .poll(() => stats(page).then((s) => s?.actor?.organizations ?? 0), { timeout: 20000 })
    .toBeGreaterThan(0)
  const before = await stats(page)
  await page.getByRole('button', { name: 'Ma coopérative' }).first().click()
  const lotSheet = page.getByRole('dialog', { name: 'Lieu' })
  await expect(lotSheet).toBeVisible()
  await expect(lotSheet.getByText(/Maison des coopératives/).first()).toBeVisible()
  await expect(lotSheet.getByText(/Ici siège : COOMARA-Kpalimé/)).toBeVisible()
  const after = await stats(page)
  expect(after?.myCoopLot).toBeTruthy()
  // The camera really moved to the building.
  expect(
    Math.abs((after?.camera.tx ?? 0) - (before?.camera.tx ?? 0)) +
      Math.abs((after?.camera.tz ?? 0) - (before?.camera.tz ?? 0)),
  ).toBeGreaterThan(5)
  await page.waitForTimeout(1500)
  await page.screenshot({ path: path.join(dir, `${testInfo.project.name}-building.png`) })

  // Go there by taxi (skip the ride), then enter: the dashboard opens by itself.
  await lotSheet.getByRole('button', { name: /Taxi/ }).click()
  await expect(page.getByLabel('Trajet en cours')).toBeVisible()
  await page
    .getByLabel('Trajet en cours')
    .getByRole('button', { name: /Passer/ })
    .click()
  await expect.poll(() => stats(page).then((s) => s?.route ?? 99), { timeout: 20000 }).toBe(0)
  await page.getByRole('button', { name: 'Entrer ou sortir' }).click()
  await expect
    .poll(() => stats(page).then((s) => s?.inside ?? null), { timeout: 10000 })
    .toBe(after?.myCoopLot)
  const dash = page.getByTestId('cooperative-dashboard')
  await expect(dash).toBeVisible({ timeout: 15000 })
  await expect(page.getByRole('dialog', { name: 'Coopérative' })).toBeVisible()
  await expect(dash.getByText('COOMARA-Kpalimé')).toBeVisible()
  await expect(
    dash.getByText(/Coopérative · Union des coopératives de Kloto · FENOMAT/),
  ).toBeVisible()
  await expect(dash.getByText('120', { exact: true })).toBeVisible()
  await expect(dash.getByText('Principales cultures')).toBeVisible()
  await expect(dash.getByText(/Équipe récolte/)).toBeVisible()
  await expect(dash.getByText('Regroupement maïs 15 ha')).toBeVisible()
  await page.waitForTimeout(600)
  await page.screenshot({ path: path.join(dir, `${testInfo.project.name}-dashboard.png`) })

  // Scenario A: the producer opens a recruitment; the group lands on the board (real command).
  await dash.getByRole('button', { name: 'Recruter une équipe' }).click()
  const recruit = dash.getByRole('form', { name: 'Recruter une équipe' })
  await recruit.getByLabel('Titre').fill('Désherbage parcelles Sud')
  await recruit.getByLabel('Activité').selectOption('desherbage')
  await recruit.getByRole('button', { name: 'Ouvrir le recrutement' }).click()
  await expect(dash.getByRole('status')).toContainText('Désherbage parcelles Sud', {
    timeout: 15000,
  })
  await expect(dash.getByText('Désherbage parcelles Sud', { exact: true })).toHaveCount(1)
  await expect(dash.getByText(/0\/8 · En constitution/)).toBeVisible()
  // The account is not a worker: joining is explained, not offered.
  await expect(dash.getByText('Profil ouvrier requis.').first()).toBeVisible()

  // Scenario B: 2 ha pledged on the 15 ha pool (12,5 → 14,5), then the same pool refuses a second one.
  await dash.getByRole('button', { name: 'Engager une parcelle' }).click()
  const pledge = dash.getByRole('form', {
    name: /Engager une parcelle dans Regroupement maïs 15 ha/,
  })
  await pledge.getByLabel('Parcelle').selectOption({ index: 1 })
  await pledge.getByLabel('Surface engagée').fill('200')
  await pledge.getByLabel('Unité').selectOption('are')
  await expect(pledge.getByText(/Soit 2 ha sur une parcelle de 0,5 ha/)).toBeVisible()
  // Client-side mirror of the database rule: the 0,5 ha parcel cannot pledge 2 ha.
  await pledge.getByRole('button', { name: 'Engager cette surface' }).click()
  await expect(pledge.getByRole('alert')).toContainText('La parcelle ne fait que 0,5 ha.')
  await pledge.getByLabel('Parcelle').selectOption({ index: 4 })
  await expect(pledge.getByText(/Soit 2 ha sur une parcelle de 2 ha/)).toBeVisible()
  await pledge.getByRole('button', { name: 'Engager cette surface' }).click()
  await expect(dash.getByRole('status')).toContainText('14,5 ha sur 15 ha', { timeout: 15000 })
  await expect(dash.getByText(/14,5 ha \/ 15 ha/)).toBeVisible()
  await expect(dash.getByText(/3 participant\(s\).*vous participez/)).toBeVisible()
  await expect(dash.getByRole('button', { name: 'Engager une parcelle' })).toHaveCount(0)
  await page.screenshot({ path: path.join(dir, `${testInfo.project.name}-aggregation.png`) })

  // Paginated member list (server-side, 20 per page) with search.
  await dash.getByRole('button', { name: /Voir les membres \(120\)/ }).click()
  const list = dash.getByRole('list', { name: 'Membres' })
  await expect(list.getByRole('listitem')).toHaveCount(20)
  await expect(dash.getByText(/Page 1 \/ 6 · 120 membres/)).toBeVisible()
  await dash.getByRole('button', { name: 'Suivant' }).click()
  await expect(dash.getByText(/Page 2 \/ 6/)).toBeVisible()
  await expect(list.getByRole('listitem')).toHaveCount(20)
  await dash.getByLabel('Rechercher un membre').fill('Abalo')
  await expect(dash.getByText(/Page 1 \/ 1 · 12 membres/)).toBeVisible()
  await expect(list.getByRole('listitem').first()).toContainText('Abalo')
  // Public names only: first name and an initial, never phone numbers.
  await expect(list).not.toContainText(/\+228|\d{8}/)
  await page.screenshot({ path: path.join(dir, `${testInfo.project.name}-members.png`) })

  // Hierarchy: open the union from the dashboard, boundaries enforced by the API.
  await dash.getByRole('button', { name: /Union des coopératives de Kloto/ }).click()
  await expect(
    page.getByTestId('cooperative-dashboard').getByText('Union des coopératives de Kloto').first(),
  ).toBeVisible({ timeout: 15000 })
  expect(errors).toEqual([])
})

test('the API refuses the member list to an account outside the organisation', async ({
  request,
}) => {
  // No session cookie: the dashboard and the list both require an account.
  const dash = await request.get('/api/haroolife/cooperatives/aaaaaaaa-0000-4000-8000-000000000001')
  expect(dash.status()).toBe(401)
  const members = await request.get(
    '/api/haroolife/cooperatives/aaaaaaaa-0000-4000-8000-000000000001/members',
  )
  expect(members.status()).toBe(401)
  const bad = await request.get('/api/haroolife/cooperatives/not-a-uuid')
  expect(bad.status()).toBe(400)
})

test('the market shows real presales and announcements, never a phone number', async ({
  page,
  context,
}, testInfo) => {
  test.setTimeout(150_000)
  await context.addCookies([
    { name: 'sb-127-auth-token', value: 'base64-' + b64(session), domain: '127.0.0.1', path: '/' },
  ])
  await page.goto('/haroolife/territoire/lome', { waitUntil: 'domcontentloaded' })
  await expect(page.locator('canvas').first()).toBeVisible({ timeout: 30000 })
  const navigation = page.getByRole('navigation', { name: 'Navigation du jeu' })
  await navigation.getByRole('button', { name: 'Carte' }).click()
  await page.getByRole('button', { name: /Grand marché d’Assigamé/ }).click()
  const lotSheet = page.getByRole('dialog', { name: 'Lieu' })
  await lotSheet.getByRole('button', { name: /Taxi/ }).click()
  await page
    .getByLabel('Trajet en cours')
    .getByRole('button', { name: /Passer/ })
    .click({ timeout: 15000, force: true })
    .catch(() => undefined)
  await expect.poll(() => stats(page).then((s) => s?.route ?? 99), { timeout: 20000 }).toBe(0)
  await page.getByRole('button', { name: 'Entrer ou sortir' }).click()
  await expect
    .poll(() => stats(page).then((s) => s?.inside ?? null), { timeout: 10000 })
    .not.toBeNull()
  await page.getByRole('button', { name: 'Activités du lieu' }).click()
  await page.getByRole('button', { name: /Voir les offres de producteurs/ }).click()
  const market = page.getByTestId('market-offers')
  await expect(page.getByRole('dialog', { name: 'Marché' })).toBeVisible()
  const offers = market.getByRole('list', { name: 'Offres' })
  await expect(offers.getByRole('listitem')).toHaveCount(3, { timeout: 15000 })
  await expect(offers).toContainText('Maïs blanc, récolte de novembre')
  await expect(offers).toContainText('12 000 kg')
  await expect(offers).toContainText('180 FCFA/kg')
  await expect(offers).toContainText('Soja de Kpalimé, 800 kg')
  await expect(offers).not.toContainText('Déjà vendu')
  await expect(offers).not.toContainText(/\+228|90 11 22 33/)
  await market.getByRole('button', { name: 'Soja' }).click()
  await expect(offers.getByRole('listitem')).toHaveCount(2)
  await expect(offers).not.toContainText('Maïs blanc')
  const dir = path.join('test-results', 'lome-cooperative')
  fs.mkdirSync(dir, { recursive: true })
  await page.screenshot({ path: path.join(dir, `${testInfo.project.name}-market.png`) })
})
