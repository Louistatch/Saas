import fs from 'node:fs'
import path from 'node:path'
import { expect, test } from '@playwright/test'

// Signed-in session against the mock Supabase used by the HarooLife SVG village tests.
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

test('signed-in players see real residents of their canton and can speak on the place', async ({
  page,
  context,
}, testInfo) => {
  await context.addCookies([
    { name: 'sb-127-auth-token', value: 'base64-' + b64(session), domain: '127.0.0.1', path: '/' },
  ])
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/haroolife/territoire/lome', { waitUntil: 'domcontentloaded' })
  const navigation = page.getByRole('navigation', { name: 'Navigation du jeu' })
  await expect(navigation).toBeVisible()
  await expect(page.locator('canvas').first()).toBeVisible({ timeout: 30000 })
  // Residents of the canton are counted in the HUD once the world API answers.
  await expect(page.getByTitle(/Habitants de .* présents dans le quartier/)).toBeVisible({
    timeout: 20000,
  })

  // Walk to the market (two buyers stand there in the fixture) and go in: "Ici maintenant" lists them.
  await navigation.getByRole('button', { name: 'Carte' }).click()
  await page.getByRole('button', { name: /Marché de quartier/ }).click()
  await expect
    .poll(
      () =>
        page.evaluate(
          () => JSON.parse(localStorage.getItem('haroolife.lome-city.v1') ?? '{}').route?.length,
        ),
      { timeout: 15000 },
    )
    .toBe(0)
  await page.getByRole('button', { name: 'Entrer ou sortir' }).click()
  await expect(page.getByText('Ici maintenant')).toBeVisible()
  await page.waitForTimeout(1200)
  const shot = path.join('test-results', 'lome-visual', testInfo.project.name + '-presence.png')
  fs.mkdirSync(path.dirname(shot), { recursive: true })
  await page.screenshot({ path: shot })

  // The place: real messages from the world payload, and posting goes to /api/haroolife/say.
  await navigation.getByRole('button', { name: 'Téléphone' }).click()
  await page.getByRole('button', { name: 'Messages' }).click()
  await expect(page.getByText(/La place de /)).toBeVisible()
  await page.getByLabel('Parler sur la place').fill('Bonjour le quartier')
  const said = page.waitForRequest(
    (r) => r.url().endsWith('/api/haroolife/say') && r.method() === 'POST',
  )
  await page.getByRole('button', { name: 'Envoyer sur la place' }).click()
  await said
  expect(errors, 'No uncaught client runtime errors').toEqual([])
})
