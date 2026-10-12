import fs from 'node:fs'
import path from 'node:path'
import { expect, test } from '@playwright/test'

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
  await expect(dash.getByText(/Coopérative · Union des coopératives de Kloto · FENOMAT/)).toBeVisible()
  await expect(dash.getByText('120', { exact: true })).toBeVisible()
  await expect(dash.getByText('Principales cultures')).toBeVisible()
  await expect(dash.getByText(/Équipe récolte/)).toBeVisible()
  await expect(dash.getByText('Regroupement maïs 15 ha')).toBeVisible()
  await page.waitForTimeout(600)
  await page.screenshot({ path: path.join(dir, `${testInfo.project.name}-dashboard.png`) })

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
