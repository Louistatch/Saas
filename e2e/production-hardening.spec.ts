import { expect, test } from '@playwright/test'

test('accord facultatif, refus persistant, modification et retrait', async ({ page, context }) => {
  const visits: string[] = []
  const audience: string[] = []
  await page.route('http://127.0.0.1:54330/**', async route => {
    audience.push(route.request().url())
    await route.fulfill({status: 200, contentType: 'application/json', body: '{}'})
  })
  await page.route('**/api/track-visit', async (route) => {
    visits.push(route.request().method())
    await route.fulfill({ status: 204 })
  })
  await page.route('**/_vercel/insights/**', (route) => route.fulfill({ status: 200, body: '' }))
  await page.goto('/legal/cookies')
  await expect(page.getByRole('button', { name: 'Refuser', exact: true })).toBeVisible()
  expect(visits).toHaveLength(0)
  expect(audience).toHaveLength(0)
  await page.getByRole('button', { name: 'Refuser', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Accepter', exact: true })).toHaveCount(0)
  await page.reload()
  await expect(page.getByRole('button', { name: 'Accepter', exact: true })).toHaveCount(0)
  expect(visits.filter((x) => x === 'POST')).toHaveLength(0)
  await page.getByRole('button', { name: 'Modifier mon choix de mesure d’audience' }).click()
  await page.getByRole('button', { name: 'Accepter', exact: true }).click()
  await expect.poll(() => audience.length).toBeGreaterThan(0)
  await expect.poll(() => visits.filter((x) => x === 'POST').length).toBeGreaterThan(0)
  expect((await context.cookies()).find((c) => c.name === 'fhub_analytics_v1')?.value).toBe(
    'granted',
  )
  await page.getByRole('button', { name: 'Modifier mon choix de mesure d’audience' }).click()
  await page.getByRole('button', { name: 'Refuser', exact: true }).click()
  const count = visits.filter((x) => x === 'POST').length
  const audienceCount = audience.length
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Politique cookies', exact: true })).toBeVisible()
  expect(visits.filter((x) => x === 'POST')).toHaveLength(count)
  expect(audience).toHaveLength(audienceCount)
  expect((await context.cookies()).find((c) => c.name === 'fhub_analytics_v1')?.value).toBe(
    'denied',
  )
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  )
})

test('membres : page serveur de vingt lignes et navigation suivante', async ({ page, context }) => {
  const b64 = (x: unknown) => Buffer.from(JSON.stringify(x)).toString('base64url')
  const uid = '11111111-1111-4111-8111-111111111111'
  const user = {
    id: uid,
    aud: 'authenticated',
    role: 'authenticated',
    email: 'admin@test.local',
    app_metadata: { role: 'super_admin' },
    user_metadata: {},
  }
  const token = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: uid, role: 'authenticated', aud: 'authenticated', exp: 4102444800 })}.c2ln`
  const session = {
    access_token: token,
    refresh_token: 'r0',
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    user,
  }
  await context.addCookies([
    { name: 'sb-127-auth-token', value: `base64-${b64(session)}`, domain: '127.0.0.1', path: '/' },
  ])
  const requests: string[] = []
  page.on('request', (r) => {
    if (r.url().includes('/api/members?')) requests.push(r.url())
  })
  await page.goto('/dashboard/members')
  await page.getByRole('button', { name: 'Refuser', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Membres', exact: true })).toBeVisible()
  await expect(page.locator('tbody tr')).toHaveCount(20)
  expect(requests.some((url) => new URL(url).searchParams.get('page') === '1')).toBe(true)
  const next = page.getByRole('button', { name: /suivante/i })
  await next.click()
  await expect
    .poll(() => requests.some((url) => new URL(url).searchParams.get('page') === '2'))
    .toBe(true)
  await expect(page.locator('tbody tr')).toHaveCount(20)
})
