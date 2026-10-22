import { type Route, expect, test } from '@playwright/test'
import { summarizeHaroo } from '../lib/admin/haroo-overview'

// Centre de pilotage super_admin, section Haroo, contre le mock Supabase et un `next start` sur
// 127.0.0.1:3000 (même montage que les consoles PAYG). Le comptage est prouvé par
// tests/admin-haroo-overview.test.ts ; ici on vérifie que l'écran le dit, et que la vraie route
// répond pour un super_admin sans jamais renvoyer de téléphone.

const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url')
const UID = '11111111-1111-4111-8111-111111111111'
const tok = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: UID, role: 'authenticated', aud: 'authenticated', exp: 4102444800 })}.c2ln`
const session = {
  access_token: tok,
  refresh_token: 'r0',
  token_type: 'bearer',
  expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  user: {
    id: UID,
    aud: 'authenticated',
    role: 'authenticated',
    email: 'admin@test.local',
    app_metadata: { role: 'super_admin' },
    user_metadata: {},
  },
}

const json = (route: Route, body: unknown, status = 200) =>
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })

const FAITIERE = 'f0000000-0000-4000-8000-000000000001'
const person = (user: string, first: string, last: string, extra = {}) => ({
  user_id: user,
  first_name: first,
  last_name: last,
  card_number: null,
  created_at: '2026-10-01T10:00:00Z',
  ...extra,
})

const OVERVIEW = summarizeHaroo({
  ouvriers: [
    person('o1', 'Komla', 'ADZO', { disponible: true }),
    person('o2', 'Démo', 'Ouvrier', { created_at: '2026-09-19T10:00:00Z' }),
  ],
  acheteurs: [person('a1', 'Afi', 'MENSAH', { type_acheteur: 'GROSSISTE' })],
  agronomes: [
    person('g1', 'Kodjo', 'AGBEKO', {
      statut_validation: 'VALIDE',
      card_number: 'AGR-304345',
      faitiere_id: FAITIERE,
      created_at: '2026-10-04T10:00:00Z',
    }),
    person('g2', 'Sena', 'KPOGO', { statut_validation: 'VALIDE' }),
    person('g3', 'Yawa', 'DOSSOU', { statut_validation: 'EN_ATTENTE' }),
  ],
  demoUserIds: new Set(['o2']),
  cards: [
    {
      card_number: 'AGR-304345',
      status: 'active',
      expiry_date: '2028-10-11',
      revoked_at: null,
      created_at: '2026-10-11T09:00:00Z',
    },
  ],
  faitieres: new Map([[FAITIERE, 'FENOMAT']]),
  missions: [
    { statut: 'DEMANDE', accepted_at: null, created_at: '2026-10-20T10:00:00Z' },
    { statut: 'EN_COURS', accepted_at: '2026-06-12T10:00:00Z', created_at: '2026-06-11T10:00:00Z' },
  ],
  jobsOpen: 2,
  presalesOpen: 2,
  announcements: [{ type: 'prevente' }],
  now: new Date('2026-10-22T08:00:00Z'),
})

const INBOX = {
  items: [],
  vitals: { coops: 3, members: 120, activeCards: 80, users: 40, pros: 2 },
  haroolife: null,
}

test.beforeEach(async ({ context }) => {
  await context.addCookies([
    { name: 'sb-127-auth-token', value: `base64-${b64(session)}`, domain: '127.0.0.1', path: '/' },
  ])
})

test('centre de pilotage : inscrits, titulaires de carte, activité et alertes Haroo', async ({
  page,
}, info) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.route('**/api/admin/inbox', (r) => json(r, INBOX))
  await page.route('**/api/admin/haroo-overview', (r) => json(r, OVERVIEW))
  await page.goto('/admin')

  const haroo = page.getByTestId('admin-haroo')
  await expect(haroo.getByRole('heading', { name: 'Haroo', exact: true })).toBeVisible()
  await expect(haroo).toContainText('2Ouvriersdont 1 de démo')
  await expect(haroo).toContainText('1Acheteursaucun compte de démo')
  await expect(haroo).toContainText('3Agronomes2 validés · 1 en attente')
  await expect(haroo).toContainText('1Cartes émises1 active')

  // Qui a la carte : nom, numéro, statut, date d'émission, faîtière.
  const holders = haroo.getByTestId('haroo-holders')
  await expect(holders).toContainText('Kodjo AGBEKO')
  await expect(holders).toContainText('AGR-304345')
  await expect(holders).toContainText('Active')
  await expect(holders).toContainText('Émise le 11/10/2026 · FENOMAT')

  // Ce qui attend une action, relié à l'écran où on la traite.
  for (const text of [
    '1 dossier d’agronome attend votre validation.',
    '1 agronome validé n’a pas encore de carte.',
    '1 mission est « en cours » depuis plus de 30 jours.',
  ]) {
    await expect(haroo.getByRole('link', { name: text })).toHaveAttribute('href', '/admin/haroo')
  }
  await expect(haroo).toContainText('dont 1 bloquée')
  await expect(haroo).toContainText('Annonces actives1 prévente')

  // Tous les inscrits, les vrais comptes d'abord, le compte de démo signalé et en dernier.
  const people = haroo.getByTestId('haroo-people').getByRole('listitem')
  await expect(people).toHaveCount(6)
  await expect(people.first()).toContainText('Kodjo AGBEKO')
  await expect(people.last()).toContainText('Démo Ouvrierdémo')
  await expect(haroo).not.toContainText('+228')

  await expect(haroo.getByRole('link', { name: 'Gérer les professionnels' })).toHaveAttribute(
    'href',
    '/admin/haroo',
  )
  await haroo.scrollIntoViewIfNeeded()
  await page.screenshot({ path: info.outputPath('admin-haroo.png'), fullPage: true })
  expect(errors).toEqual([])
})

test('la vraie route répond au super_admin, sans téléphone ni e-mail', async ({ page }) => {
  const res = await page.request.get('/api/admin/haroo-overview')
  expect(res.status()).toBe(200)
  const body = await res.json()
  expect(body.totals).toEqual({
    ouvrier: { all: 0, demo: 0 },
    acheteur: { all: 0, demo: 0 },
    agronome: { all: 0, demo: 0 },
  })
  expect(Array.isArray(body.people)).toBe(true)
  expect(JSON.stringify(body)).not.toMatch(/phone|email/i)
})

test('sans session, la route refuse', async ({ browser }) => {
  const anonymous = await browser.newContext()
  const res = await anonymous.request.get('http://127.0.0.1:3000/api/admin/haroo-overview')
  expect([401, 403]).toContain(res.status())
  await anonymous.close()
})

test('lecture impossible : un message clair, le reste du centre de pilotage s’affiche', async ({
  page,
}) => {
  await page.route('**/api/admin/inbox', (r) => json(r, INBOX))
  await page.route('**/api/admin/haroo-overview', (r) =>
    json(r, { error: 'Les données Haroo n’ont pas pu être lues.' }, 503),
  )
  await page.goto('/admin')
  await expect(page.getByTestId('admin-haroo').getByRole('alert')).toHaveText(
    'La section Haroo n’a pas pu se charger. Actualisez dans un instant.',
  )
  await expect(page.getByRole('heading', { name: 'Vue d’ensemble' })).toBeVisible()
})
