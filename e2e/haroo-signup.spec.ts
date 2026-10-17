import { expect, test } from '@playwright/test'

const profiles = [
  { choice: 'OUVRIER', type: 'OUVRIER' },
  { choice: 'ACHETEUR', type: 'ACHETEUR' },
  { choice: 'AGRONOME', type: 'AGRONOME', profession: 'agronome' },
  { choice: 'TECHNICIEN', type: 'AGRONOME', profession: 'technicien' },
  { choice: 'CONSEILLER', type: 'AGRONOME', profession: 'conseiller' },
]

for (const [index, profile] of profiles.entries()) {
  test(`${profile.choice} s’inscrit en indépendant via le formulaire et le vrai proxy serveur`, async ({
    page,
    context,
    request,
  }, testInfo) => {
    await context.setExtraHTTPHeaders({ 'x-forwarded-for': `198.51.100.${index + 10}` })
    const catalogueCalls: string[] = []
    page.on('request', (r) => {
      if (r.url().includes('/api/faitieres')) catalogueCalls.push(r.url())
    })
    await page.goto(`/auth/signup/haroo?type=${profile.choice}`)
    await expect(page.locator('#profileType')).toHaveValue(profile.choice)
    await expect(page.getByText('aucune appartenance', { exact: false })).toBeVisible()
    await expect(page.locator('#faitiereId')).toHaveCount(0)
    await page.locator('#firstName').fill('Ama')
    await page.locator('#lastName').fill('Test')
    await page.locator('#phone').fill('+22890000000')
    await page.locator('#email').fill(`${profile.choice.toLowerCase()}@example.test`)
    await page.locator('#password').fill('Fixture-Password-2026')
    if (profile.profession)
      await page.getByRole('button', { name: 'Irrigation', exact: true }).click()
    const submitted = page.waitForResponse(
      (r) => r.url().includes('/api/haroo/auth/register') && r.request().method() === 'POST',
    )
    await page.getByRole('button', { name: /Créer mon compte/ }).click()
    const response = await submitted
    expect(response.status()).toBe(201)
    await expect(page.getByRole('heading', { name: 'Compte Haroo créé !' })).toBeVisible()
    const upstream = await (await request.get('http://127.0.0.1:54377/last')).json()
    expect(upstream.profile_type).toBe(profile.type)
    expect(upstream).not.toHaveProperty('faitiere_id')
    expect(upstream).not.toHaveProperty('cooperative_id')
    expect(upstream).not.toHaveProperty('role')
    if (profile.profession) {
      expect(upstream.profession).toBe(profile.profession)
      expect(upstream.specialisations).toEqual(['Irrigation'])
    }
    expect(catalogueCalls).toEqual([])
    if (profile.choice === 'AGRONOME')
      await page.screenshot({ path: testInfo.outputPath('inscription-independante-reussie.png') })
  })
}

test('le serveur accepte les anciens clients sans affiliation et refuse les rattachements invalides', async ({
  request,
}) => {
  const body = {
    profileType: 'AGRONOME',
    profession: 'technicien',
    firstName: 'Kossi',
    lastName: 'Test',
    phone: '+22890000000',
    email: 'independent@example.test',
    password: 'Fixture-Password-2026',
  }
  for (const [index, faitiereId] of [undefined, null, ''].entries()) {
    const response = await request.post('/api/haroo/auth/register', {
      data: { ...body, faitiereId, role: 'super_admin', badge_valide: true },
      headers: { 'x-forwarded-for': `198.51.100.${40 + index}` },
    })
    expect(response.status()).toBe(201)
    const upstream = await (await request.get('http://127.0.0.1:54377/last')).json()
    expect(upstream).not.toHaveProperty('faitiere_id')
    expect(upstream).not.toHaveProperty('role')
    expect(upstream).not.toHaveProperty('badge_valide')
  }
  const invalid = await request.post('/api/haroo/auth/register', {
    data: { ...body, faitiereId: 'not-a-uuid' },
    headers: { 'x-forwarded-for': '198.51.100.50' },
  })
  expect(invalid.status()).toBe(400)
  expect((await invalid.json()).fields.faitiereId).toBeTruthy()
  const missing = await request.post('/api/haroo/auth/register', {
    data: { ...body, faitiereId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' },
    headers: { 'x-forwarded-for': '198.51.100.51' },
  })
  expect(missing.status()).toBe(400)
  expect((await missing.json()).fields.faitiereId).toBeTruthy()
})
