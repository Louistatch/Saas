import type { Page } from '@playwright/test'
import { expect, test } from './lome-test'

/**
 * M2 (D4+): billboards stand in the 3D streets of Lomé, show internal notices (offline too) or an
 * approved partner campaign marked « Promotion », are read by a deliberate tap, open their link
 * only on « En savoir plus », count exposure and clicks as aggregates, hide expired campaigns, and
 * cost little to render. The partner below is a fictional demo creative injected by the test.
 */
type Ads = {
  built: string[]
  showing: Record<string, string>
  impressions: number
  screen: Record<string, { x: number; y: number; seen: boolean }>
}
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
  await expect
    .poll(async () => (await ads(page))?.built ?? [], { timeout: 15000 })
    .toEqual(expect.arrayContaining(['lome-avenue', 'lome-jardin']))
  const on = await settledPerf(page)
  const built = (await ads(page))?.built.length ?? 0
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
  // One draw call per poster; the posts and frames of every support share one instanced mesh.
  expect(on.drawCalls - off.drawCalls, 'about one draw call per support').toBeLessThanOrEqual(
    built + 4,
  )
  // The supports' own geometry, counted exactly (scene totals move with pedestrians and traffic).
  const own = await page.evaluate(() => {
    const scene = (
      window as unknown as { __LOME_SCENE?: import('../lib/haroolife/engine/types').SceneProbe }
    ).__LOME_SCENE
    const g = scene?.geometry('^Panneau (lome|kara)-') ?? { matches: 0, triangles: 0 }
    return { tris: g.triangles, boards: g.matches }
  })
  testInfo.annotations.push({ type: 'billboards own geometry', description: JSON.stringify(own) })
  expect(own.boards).toBe(built)
  expect(own.tris / own.boards, 'triangles per support').toBeLessThan(100)

  // Physical supports exist in the scene, with their poster.
  const inScene = await page.evaluate(() => {
    const scene = (
      window as unknown as { __LOME_SCENE?: import('../lib/haroolife/engine/types').SceneProbe }
    ).__LOME_SCENE
    return ['Panneau lome-avenue', 'Affiche lome-avenue', 'Panneau lome-jardin'].map((n) =>
      Boolean(scene?.has(n)),
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

type Post = {
  id: string
  placement: string
  title: string
  body: string
  palette: number
  author: string
  mine: boolean
  startsAt: string
  endsAt: string
}
const wallet = (page: Page) =>
  page.evaluate(
    () => (window as unknown as { __LOME_CITY?: { wallet: number } }).__LOME_CITY?.wallet ?? 0,
  )
/** Built supports on screen whose face is of this kind (`vacant:` or `post:`). */
const onScreen = async (page: Page, kind: 'vacant:' | 'post:') => {
  const a = await ads(page)
  if (!a) return []
  return a.built.filter((id) => a.showing[id]?.startsWith(kind) && a.screen[id]?.seen)
}
async function touch(page: Page, id: string, mobile: boolean) {
  const box = await page.locator('canvas:visible').first().boundingBox()
  const at = (await ads(page))?.screen[id]
  if (!box || !at) throw new Error(`support ${id} not on screen`)
  if (mobile) await page.touchscreen.tap(box.x + at.x, box.y + at.y)
  else await page.mouse.click(box.x + at.x, box.y + at.y)
}

/**
 * Supports nobody rents read « Panneau disponible · À louer »; any support on screen opens its
 * sheet when touched, near or far. A player rents a free one with game money and writes their
 * notice (no phone number, link or e-mail), the street shows it, and another player's notice can
 * be read and reported. The database is stood in for by the test (its rules, prices and wallet
 * check run on the real migration in tests/haroolife-board-sql.test.ts).
 */
test('free billboards: « À louer », touched from afar, rented with game money, reported', async ({
  page,
}, testInfo) => {
  test.setTimeout(240_000)
  const mobile = /mobile/.test(testInfo.project.name)
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  const state: { posts: Post[]; rented: Record<string, unknown>[]; reported: string[] } = {
    posts: [],
    rented: [],
    reported: [],
  }
  await page.route('**/rest/v1/rpc/haroolife_board_posts_live', (route) =>
    route.fulfill({ json: state.posts }),
  )
  await page.route('**/rest/v1/rpc/haroolife_board_rent', async (route) => {
    const a = route.request().postDataJSON() as Record<string, unknown>
    state.rented.push(a)
    const now = Date.now()
    const post: Post = {
      id: '9b000000-0000-4000-8000-000000000001',
      placement: String(a.p_placement),
      title: String(a.p_title).trim(),
      body: String(a.p_body).trim(),
      palette: Number(a.p_palette),
      author: '@moi_test',
      mine: true,
      startsAt: new Date(now).toISOString(),
      endsAt: new Date(now + Number(a.p_hours) * 3600e3).toISOString(),
    }
    state.posts.push(post)
    return route.fulfill({ json: { ...post, price: 5000, duplicate: false } })
  })
  await page.route('**/rest/v1/rpc/haroolife_board_report', async (route) => {
    state.reported.push(String((route.request().postDataJSON() as { p_reason: string }).p_reason))
    return route.fulfill({ json: { ok: true, hidden: false } })
  })

  // First visit: which free supports stand in view of the arrival.
  await open(page, 'live')
  await expect
    .poll(async () => (await onScreen(page, 'vacant:')).length, { timeout: 20000 })
    .toBeGreaterThanOrEqual(2)
  const [mineAt, theirsAt] = await onScreen(page, 'vacant:')
  // Another player rents one of them; the street shows it at the next visit.
  state.posts.push({
    id: '9b000000-0000-4000-8000-0000000000aa',
    placement: theirsAt,
    title: 'Tontine du quartier',
    body: 'Réunion dimanche après la messe, chez Tante Ablavi.',
    palette: 2,
    author: '@yawa_tokoin',
    mine: false,
    startsAt: new Date(Date.now() - 3600e3).toISOString(),
    endsAt: new Date(Date.now() + 86400e3).toISOString(),
  })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await expect.poll(async () => (await player(page))?.mode ?? null, { timeout: 30000 }).toBe('idle')
  await expect
    .poll(async () => (await ads(page))?.showing[theirsAt] ?? '', { timeout: 20000 })
    .toBe('post:9b000000-0000-4000-8000-0000000000aa')
  expect((await ads(page))?.showing[mineAt]).toBe(`vacant:${mineAt}`)
  await expect.poll(async () => (await ads(page))?.screen[mineAt]?.seen ?? false).toBe(true)
  await page.screenshot({ path: testInfo.outputPath('billboards-for-rent.png') })

  // Touched from where the player stands: the sheet to rent it.
  await touch(page, mineAt, mobile)
  const rent = page.getByTestId('board-rent')
  await expect(rent).toBeVisible()
  await expect(rent).toContainText('Panneau disponible')
  const before = await wallet(page)
  expect(before).toBeGreaterThanOrEqual(5000)
  await rent.getByLabel('Titre').fill('Maïs de Bè')
  // A phone number is refused before anything is sent.
  await rent.getByLabel('Ton information').fill('Appelle-moi au 90 12 34 56')
  await expect(rent.getByRole('alert')).toContainText('Pas de numéro de téléphone')
  await expect(rent.getByRole('button', { name: /^Louer pour/ })).toBeDisabled()
  await rent.getByLabel('Ton information').fill('Je vends mon maïs, passe au marché samedi.')
  await rent.getByLabel('Couleurs 2').check({ force: true })
  await expect(rent.getByRole('img', { name: 'Aperçu du panneau : Maïs de Bè' })).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('billboard-rent-sheet.png') })
  await rent.getByRole('button', { name: /^Louer pour 5\s000 FCFA$/ }).click()
  await expect(page.getByTestId('board-post')).toContainText('C’est ton panneau')
  expect(state.rented).toEqual([
    expect.objectContaining({
      p_placement: mineAt,
      p_hours: 24,
      p_title: 'Maïs de Bè',
      p_palette: 1,
    }),
  ])
  await expect.poll(() => wallet(page)).toBe(before - 5000)
  // The street shows the notice at once.
  await expect
    .poll(async () => (await ads(page))?.showing[mineAt] ?? '')
    .toBe('post:9b000000-0000-4000-8000-000000000001')
  await page.getByRole('button', { name: 'Retour au jeu' }).click()
  await page.screenshot({ path: testInfo.outputPath('billboard-rented.png') })

  // Another player's notice: read it, and report it.
  await expect.poll(async () => (await ads(page))?.screen[theirsAt]?.seen ?? false).toBe(true)
  await touch(page, theirsAt, mobile)
  const theirs = page.getByTestId('board-post')
  await expect(theirs).toContainText('Tontine du quartier')
  await expect(theirs).toContainText('Annonce de @yawa_tokoin')
  await theirs.getByRole('button', { name: 'Signaler' }).click()
  await theirs.getByRole('button', { name: 'Arnaque' }).click()
  await expect(theirs.locator('output')).toContainText('signalement est envoyé')
  expect(state.reported).toEqual(['arnaque'])
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
