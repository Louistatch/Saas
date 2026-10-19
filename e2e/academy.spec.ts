import { expect, test } from '@playwright/test'

// AgriAcademy (J3) contre le mock Supabase (e2e/fixtures/mock-supabase.mjs) : l'admin de test
// a 3 leçons validées, la 4 en cours, la 5 avec le quiz réussi, le cas pratique 3 corrigé.
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
  expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  user,
}
const lesson4 = '258ae45c-3569-43c5-a4b9-4dcb2b7ceb44'

test.beforeEach(async ({ context }) => {
  await context.addCookies([
    { name: 'sb-127-auth-token', value: `base64-${b64(session)}`, domain: '127.0.0.1', path: '/' },
  ])
})

test('Mes formations : reprise en deux actions, état réel, aucun chunk Three.js', async ({
  page,
}) => {
  const scripts: string[] = []
  page.on('response', (r) => {
    if (r.request().resourceType() === 'script') scripts.push(r.url())
  })
  await page.goto('/operator/training')
  await expect(page.getByRole('heading', { name: 'Mes formations' })).toBeVisible()
  await expect(page.getByText('3 / 12 leçons validées')).toBeVisible()
  await expect(page.getByText('Cas pratique 5 à déposer')).toBeVisible()
  await expect(page.getByText('Cas pratique 3 corrigé')).toBeVisible()
  await page.getByRole('link', { name: /^Reprendre : leçon 4/ }).click()
  await expect(page).toHaveURL(new RegExp(`/operator/training/${lesson4}$`))
  await expect(
    page.getByRole('heading', { level: 1, name: 'Gestion des membres et qualité des données' }),
  ).toBeVisible()
  expect(scripts.filter((u) => /three|rapier|fiber/i.test(u))).toEqual([])
})

test('Vue d’ensemble : programme avec états réels et critères', async ({ page }) => {
  await page.goto('/operator/training/cursus')
  await expect(page.getByRole('heading', { name: 'Programme : 12 leçons' })).toBeVisible()
  await expect(page.getByText('3 validées, 9 à valider')).toBeVisible()
  await expect(page.getByText('durée estimée')).toBeVisible()
  await expect(page.getByText('Pour passer à l’évaluation pratique')).toBeVisible()
})

test('Lecteur : cours lisible sans quiz sur la page, texte long mis en forme, média à fournir', async ({
  page,
}) => {
  await page.goto(`/operator/training/${lesson4}`)
  await expect(page.getByRole('heading', { level: 2, name: 'Leçon complète' })).toBeVisible()
  await expect(page.getByRole('heading', { level: 2, name: /Déduplication/ })).toBeVisible()
  await expect(
    page.getByText('Capture du produit, données d’exemple', { exact: false }),
  ).toBeVisible()
  await expect(page.getByRole('img', { name: /Page Membres/ })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Exemple de terrain' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Vérifiez-vous avant le quiz' })).toBeVisible()
  await expect(page.getByText('Média à fournir.')).toHaveCount(0)
  await expect(page.getByRole('radio')).toHaveCount(0)
  await expect(page.getByRole('textbox')).toHaveCount(0)
  await expect(page.getByText('Objectif', { exact: true })).toHaveCount(0)
  const main = page.getByRole('main')
  const width = await main.evaluate((el) => el.scrollWidth <= document.documentElement.clientWidth)
  expect(width).toBe(true)
})

test('Salle d’évaluation : quiz une question à la fois, cas pratique fermé avant le quiz, retour sans perte', async ({
  page,
}) => {
  await page.goto(`/operator/training/${lesson4}/evaluation`)
  await expect(page.getByRole('heading', { level: 2, name: 'Quiz' })).toBeVisible()
  await expect(page.getByText('Le dépôt s’ouvre quand le quiz est réussi')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Messagerie' })).toBeHidden()
  await expect(page.getByText('Question 1 sur 5')).toBeVisible()
  await page.getByRole('radio').or(page.getByRole('checkbox')).first().check()
  await page.getByRole('button', { name: 'Suivante' }).click()
  await expect(page.getByText('Question 2 sur 5')).toBeVisible()
  await page.getByRole('link', { name: 'Cours' }).first().click()
  await expect(page).toHaveURL(new RegExp(`/operator/training/${lesson4}$`))
  await page.goto(`/operator/training/${lesson4}/evaluation`)
  await expect(page.getByRole('heading', { level: 2, name: 'Quiz' })).toBeVisible()
})

test('Exercice : laboratoire 2D sans Three.js, la mission ne valide rien', async ({ page }) => {
  const scripts: string[] = []
  page.on('response', (r) => {
    if (r.request().resourceType() === 'script') scripts.push(r.url())
  })
  await page.goto(`/operator/training/${lesson4}/lab`)
  await expect(page.getByRole('heading', { name: /^Exercice :/ })).toBeVisible()
  await page.getByRole('button', { name: /^Étape faite/ }).click()
  await expect(page.getByText('La mission ne valide pas la leçon.')).toBeVisible()
  expect(scripts.filter((u) => /three|rapier|fiber/i.test(u))).toEqual([])
})

test('Android 390 : sommaire en tiroir, barre d’action de la leçon, pas de débordement', async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  })
  await context.addCookies([
    { name: 'sb-127-auth-token', value: `base64-${b64(session)}`, domain: '127.0.0.1', path: '/' },
  ])
  const page = await context.newPage()
  await page.goto(`/operator/training/${lesson4}`)
  await page.getByText(/^Leçon 4 sur 12$/).click()
  await expect(page.getByRole('link', { name: /5\. Cartes numériques/ }).first()).toBeVisible()
  const nav = page.getByRole('navigation', { name: 'Espaces de la leçon' }).last()
  await expect(nav.getByRole('link', { name: 'Évaluation' })).toBeVisible()
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  )
  expect(overflow).toBe(false)
  await context.close()
})

test('320 px : aucun défilement horizontal sur l’accueil et le cours', async ({ browser }) => {
  const context = await browser.newContext({
    viewport: { width: 320, height: 640 },
    isMobile: true,
    hasTouch: true,
  })
  await context.addCookies([
    { name: 'sb-127-auth-token', value: `base64-${b64(session)}`, domain: '127.0.0.1', path: '/' },
  ])
  const page = await context.newPage()
  for (const url of ['/operator/training', `/operator/training/${lesson4}`]) {
    await page.goto(url)
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    )
    expect(overflow, url).toBe(false)
  }
  await context.close()
})
