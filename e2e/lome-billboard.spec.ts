import type { Page } from '@playwright/test'
import { expect, test } from './lome-test'

/**
 * M2 (D4+): billboards stand in the 3D streets of Lomé, show internal notices (offline too) or an
 * approved partner campaign marked « Promotion », are read by a deliberate tap, open their link
 * only on « En savoir plus », count exposure and clicks as aggregates, hide expired campaigns, and
 * cost little to render. The partner below is a fictional demo creative injected by the test.
 */
type Ads = { built: string[]; showing: Record<string, string>; impressions: number }
type Perf = {
  drawCalls: number
  triangles: number
  heapMB: number | null
  frame: { p50: number; p95: number }
}
const ads = (page: Page) =>
  page.evaluate(() => (window as unknown as { __LOME_ADS?: Ads }).__LOME_ADS ?? null)
const perf = (page: Page) =>
  page.evaluate(() => (window as unknown as { __LOME_PERF?: Perf }).__LOME_PERF ?? null)
const player = (page: Page) =>
  page.evaluate(
    () =>
      (
        window as unknown as {
          __LOME_PLAYER?: { x: number; z: number; mode: string; camera: { angle: number } }
        }
      ).__LOME_PLAYER ?? null,
  )
const DEMO = {
  id: '0d000000-0000-4000-8000-00000000de30',
  advertiser: { name: 'Démonstration (fictif)', kind: 'partner' },
  creative: {
    title: 'Créatif de démonstration',
    body: 'Annonceur fictif pour tester la mise en page, pas une offre réelle.',
    cta: 'Voir la page partenaires',
    href: '/contact?sujet=haroolife-partenaire',
    palette: ['#5b21b6', '#ffffff', '#fbbf24'],
  },
  status: 'active',
  locality: 'lome',
  placements: ['lome-avenue'],
  startsAt: '2026-01-01T00:00:00Z',
  endsAt: '2099-01-01T00:00:00Z',
  weight: 5,
  version: 1,
}
const EXPIRED = {
  ...DEMO,
  id: '0d000000-0000-4000-8000-00000000de31',
  endsAt: '2026-01-02T00:00:00Z',
}

async function open(page: Page, campaigns: 'live' | 'off' | 'demo') {
  await page.route('**/api/haroolife/ads?**', async (route) => {
    if (campaigns === 'live') return route.continue()
    if (campaigns === 'off') return route.fulfill({ json: { enabled: false, campaigns: [] } })
    const res = await route.fetch()
    const body = await res.json()
    return route.fulfill({ json: { ...body, campaigns: [...body.campaigns, DEMO, EXPIRED] } })
  })
  await page.goto('/haroolife', { waitUntil: 'domcontentloaded' })
  await expect(page.locator('canvas').first()).toBeVisible({ timeout: 30000 })
  await expect.poll(async () => (await player(page))?.mode ?? null, { timeout: 30000 }).toBe('idle')
}
async function settledPerf(page: Page) {
  await page.waitForTimeout(4000)
  await page.evaluate(() =>
    (window as unknown as { __LOME_PERF_RESET?: () => void }).__LOME_PERF_RESET?.(),
  )
  await page.waitForTimeout(5000)
  return (await perf(page)) as Perf
}

test('billboards in the street: build, read, learn more, statistics, expiry, cost', async ({
  page,
  context,
}, testInfo) => {
  test.setTimeout(240_000)
  const mobile = /mobile/.test(testInfo.project.name)
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))

  // Cost first: the same arrival scene without, then with billboards, each in a fresh page.
  const bare = await context.newPage()
  await open(bare, 'off')
  const off = await settledPerf(bare)
  expect((await ads(bare))?.built ?? [], 'kill switch: nothing built').toEqual([])
  await bare.close()
  await open(page, 'demo')
  await expect.poll(async () => (await ads(page))?.built.length ?? 0, { timeout: 15000 }).toBe(2)
  const on = await settledPerf(page)
  testInfo.annotations.push({
    type: 'billboards cost (SwiftShader)',
    description: JSON.stringify({
      drawCalls: [off.drawCalls, on.drawCalls],
      triangles: [off.triangles, on.triangles],
      heapMB: [off.heapMB, on.heapMB],
      p50ms: [off.frame.p50, on.frame.p50],
      p95ms: [off.frame.p95, on.frame.p95],
    }),
  })
  expect(on.drawCalls - off.drawCalls, 'a few draw calls per support').toBeLessThanOrEqual(12)
  // The supports' own geometry, counted exactly (scene totals move with pedestrians and traffic).
  const own = await page.evaluate(() => {
    type E = {
      name: string
      render?: { meshInstances: { mesh: { primitive: { count: number }[] } }[] }
      children: E[]
    }
    const app = (window as unknown as { __LOME_APP?: { root: E } }).__LOME_APP
    let tris = 0
    let boards = 0
    const walk = (e: E, inside: boolean) => {
      const mine = /^Panneau (lome|kara)-/.test(e.name)
      const here = inside || mine
      if (mine) boards++
      if (here && e.render)
        for (const mi of e.render.meshInstances) tris += Math.floor(mi.mesh.primitive[0].count / 3)
      for (const c of e.children) walk(c, here)
    }
    if (app) walk(app.root, false)
    return { tris, boards }
  })
  testInfo.annotations.push({ type: 'billboards own geometry', description: JSON.stringify(own) })
  expect(own.boards).toBe(2)
  expect(own.tris / own.boards, 'triangles per support').toBeLessThan(100)

  // Physical supports exist in the scene, with their poster.
  const inScene = await page.evaluate(() => {
    const app = (
      window as unknown as { __LOME_APP?: { root: { findByName: (n: string) => unknown } } }
    ).__LOME_APP
    return ['Panneau lome-avenue', 'Affiche lome-avenue', 'Panneau lome-jardin'].map((n) =>
      Boolean(app?.root.findByName(n)),
    )
  })
  expect(inScene).toEqual([true, true, true])
  // The expired campaign never shows; the demo partner shares the avenue panel by weight.
  const shown = new Set<string>()
  for (let i = 0; i < 3; i++) {
    const a = await ads(page)
    if (a) for (const v of Object.values(a.showing)) shown.add(v)
    if (i < 2) await page.waitForTimeout(1000)
  }
  expect([...shown]).not.toContain(EXPIRED.id)

  // Walk next to the avenue panel (keyboard on desktop, the joystick is covered by lome-door).
  const read = page.getByTestId('ad-read')
  await expect(read).toHaveCount(0)
  const goto = async (tx: number, tz: number) => {
    for (let i = 0; i < 80; i++) {
      const p = await player(page)
      if (!p) break
      const dx = tx - p.x
      const dz = tz - p.z
      if (Math.hypot(dx, dz) < 0.35) break
      // Camera azimuth 35°: screen-up is (−sin, −cos). Pick the key closest to the wanted direction.
      const a = (p.camera.angle * Math.PI) / 180
      const up = -dx * Math.sin(a) - dz * Math.cos(a)
      const right = dx * Math.cos(a) - dz * Math.sin(a)
      const key =
        Math.abs(up) > Math.abs(right)
          ? up > 0
            ? 'ArrowUp'
            : 'ArrowDown'
          : right > 0
            ? 'ArrowRight'
            : 'ArrowLeft'
      await page.keyboard.down(key)
      await page.waitForTimeout(140)
      await page.keyboard.up(key)
    }
  }
  await goto(48.1, 36.2)
  await expect(read).toBeVisible({ timeout: 5000 })
  await page.screenshot({ path: testInfo.outputPath('billboard-street.png') })

  // A deliberate tap reads it; the link opens only on « En savoir plus », in a new tab.
  await (mobile ? read.tap() : read.click())
  const focus = page.getByTestId('ad-focus')
  await expect(focus).toBeVisible()
  const title = (await focus.locator('p').nth(1).textContent()) ?? ''
  const sponsored = title === DEMO.creative.title
  if (sponsored) await expect(focus).toContainText('Promotion')
  else await expect(focus).not.toContainText('Promotion')
  await page.screenshot({ path: testInfo.outputPath('billboard-focus.png') })
  const popup = context.waitForEvent('page')
  await page.getByTestId('ad-learn-more').click()
  const tab = await popup
  expect(new URL(tab.url()).pathname).toMatch(/^\/(marche|haroo|contact)/)
  await tab.close()
  await page.getByRole('button', { name: 'Retour au jeu' }).click()
  await expect(focus).toHaveCount(0)

  // Aggregated statistics: counts only, sent to the API.
  const sent = page.waitForRequest(
    (r) => r.url().endsWith('/api/haroolife/ads/events') && r.method() === 'POST',
  )
  await page.evaluate(() =>
    (window as unknown as { __LOME_ADS_FLUSH?: () => void }).__LOME_ADS_FLUSH?.(),
  )
  const req = await sent
  const body = req.postDataJSON() as {
    items: { campaign: string; placement: string; impressions: number; clicks: number }[]
  }
  expect(body.items.some((i) => i.placement === 'lome-avenue' && i.clicks === 1)).toBe(true)
  expect(JSON.stringify(body)).not.toMatch(/@|user|email|phone/)
  testInfo.annotations.push({ type: 'stats batch', description: JSON.stringify(body) })

  expect(await page.locator('canvas').count()).toBe(1)
  expect(errors).toEqual([])
})

test('admin console: draft with preview, review circuit, rights gate, statistics', async ({
  browser,
}, testInfo) => {
  test.skip(/mobile/.test(testInfo.project.name), 'admin console checked on desktop')
  // The console calls Supabase from the browser; production CSP allows *.supabase.co, not the
  // local stand-in on :54329, so this context alone bypasses CSP to reach the stand-in.
  const context = await browser.newContext({ bypassCSP: true, baseURL: 'http://127.0.0.1:3000' })
  const page = await context.newPage()
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url')
  const uid = '11111111-1111-4111-8111-111111111111'
  const tok = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: uid, role: 'authenticated', aud: 'authenticated', exp: 4102444800 })}.c2ln`
  const session = {
    access_token: tok,
    refresh_token: 'r0',
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    user: {
      id: uid,
      aud: 'authenticated',
      role: 'authenticated',
      email: 'admin@test.local',
      app_metadata: { role: 'super_admin' },
      user_metadata: {},
    },
  }
  await page.request.post('http://127.0.0.1:54329/__reset')
  await context.addCookies([
    { name: 'sb-127-auth-token', value: `base64-${b64(session)}`, domain: '127.0.0.1', path: '/' },
  ])
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto('/admin/haroolife-panneaux', { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('heading', { name: 'Panneaux HarooLife' })).toBeVisible({
    timeout: 30000,
  })
  // Statistics with the exposure definition written next to them.
  await expect(page.getByText('Approximation sans test d’occlusion')).toBeVisible()
  await expect(page.getByRole('cell', { name: 'Le marché FaîtiereHub' })).toBeVisible()
  // The preview redraws as the form is filled (same drawing as in the street).
  await page.getByLabel('Annonceur').fill('Démonstration (fictif)')
  await page.getByLabel('Titre (60 caractères)').fill('Semences de démonstration')
  await page
    .getByLabel('Texte (140 caractères)')
    .fill('Créatif fictif pour la revue, aucun annonceur réel.')
  await expect(
    page.getByRole('img', { name: /Aperçu de l'affiche : Semences de démonstration/ }),
  ).toBeVisible()
  // An unsafe link is refused before anything is saved.
  await page.getByLabel('Lien (page du site ou faitierehub.com)').fill('javascript:alert(1)')
  await page.getByRole('button', { name: 'Enregistrer le brouillon' }).click()
  await expect(page.getByText(/^Lien refusé/)).toBeVisible()
  await page
    .getByLabel('Lien (page du site ou faitierehub.com)')
    .fill('/contact?sujet=haroolife-partenaire')
  await page.getByRole('button', { name: 'Enregistrer le brouillon' }).click()
  await expect(page.getByText('Semences de démonstration').first()).toBeVisible()
  await expect(page.getByText(/Brouillon · v1/)).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('billboard-admin.png'), fullPage: true })
  // Review circuit: submit, then approval is refused while rights are not confirmed.
  await page.getByRole('button', { name: 'Soumettre à la revue' }).click()
  await expect(page.getByText(/En revue/)).toBeVisible()
  await page.getByRole('button', { name: 'Approuver' }).click()
  await expect(
    page.getByText('Confirmez d’abord les droits sur les images et textes'),
  ).toBeVisible()
  expect(errors).toEqual([])
  await context.close()
})
