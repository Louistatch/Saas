import { createHash, randomUUID } from 'node:crypto'
import { type Browser, type BrowserContext, type Page, devices } from '@playwright/test'
import { type Socket, io } from 'socket.io-client'
import { expect, test } from './lome-test'

/**
 * M1 (D4+): real-time chat over the Socket.IO relay with two signed-in people in two browsers
 * (desktop + Android profile), the REAL chat migration behind it (PGlite), a third account
 * (other canton) as a raw Socket.IO client. Checks: delivery without refresh, stored before
 * broadcast, canton isolation, unread badge, offline queue then catch-up, persistence after a
 * reload, text never interpreted as HTML, other avatars moving smoothly in the 3D street.
 */
const RELAY = 'http://127.0.0.1:3001'
const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url')
const ACCOUNTS = {
  ama: 'a1a1a1a1-0000-4000-8000-000000000001',
  kofi: 'b2b2b2b2-0000-4000-8000-000000000002',
  yawa: 'c3c3c3c3-0000-4000-8000-000000000003',
  // The team (the mock Supabase's super_admin, the local moderator of realtime/pglite.ts).
  equipe: '11111111-1111-4111-8111-111111111111',
}
const tokenOf = (sub: string) =>
  `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub, role: 'authenticated', aud: 'authenticated', exp: 4102444800 })}.c2ln`
type Live = {
  status: string
  me: string | null
  rooms: number
  dms: number
  present: string[]
  unread: number
  outbox: string[]
  drop: () => void
}
const rt = (page: Page) =>
  page.evaluate(() => {
    const r = (window as unknown as { __LOME_REALTIME?: Live }).__LOME_REALTIME
    return r ? { ...r, drop: undefined } : null
  })

async function signIn(browser: Browser, who: keyof typeof ACCOUNTS, device: object) {
  const context: BrowserContext = await browser.newContext({
    ...device,
    baseURL: 'http://127.0.0.1:3000',
  })
  const sub = ACCOUNTS[who]
  const session = {
    access_token: tokenOf(sub),
    refresh_token: `r-${who}`,
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    user: {
      id: sub,
      aud: 'authenticated',
      role: 'authenticated',
      email: `${who}@test.local`,
      app_metadata: {},
      user_metadata: {},
    },
  }
  await context.addCookies([
    { name: 'sb-127-auth-token', value: `base64-${b64(session)}`, domain: '127.0.0.1', path: '/' },
  ])
  // A returning player: the first-run appearance sheet would otherwise take the keyboard.
  await context.addInitScript((id) => {
    localStorage.setItem('haroolife.avatar.chosen', '1')
    sessionStorage.setItem('haroolife.entered.v1', id)
  }, sub)
  const page = await context.newPage()
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('dialog', (d) => {
    errors.push(`dialog: ${d.message()}`)
    void d.dismiss()
  })
  return { context, page, errors }
}
async function player(browser: Browser, who: keyof typeof ACCOUNTS, device: object) {
  const { context, page, errors } = await signIn(browser, who, device)
  await page.goto('/haroolife', { waitUntil: 'domcontentloaded' })
  await expect(page.locator('canvas:visible').first()).toBeVisible({ timeout: 30000 })
  await expect.poll(async () => (await rt(page))?.status, { timeout: 30000 }).toBe('online')
  return { context, page, errors }
}
async function openChat(page: Page, room: string | RegExp) {
  // Already in the discussions (a private conversation was open): switch room in place.
  if (await page.getByRole('region', { name: 'Discussions en direct' }).isVisible()) {
    await page.getByRole('button', { name: room, exact: typeof room === 'string' }).click()
    return
  }
  await page
    .getByRole('navigation', { name: 'Navigation du jeu' })
    .getByRole('button', { name: 'Téléphone' })
    .click()
  await page.getByRole('button', { name: /Messages$/ }).click()
  await expect(page.getByRole('region', { name: 'Discussions en direct' })).toBeVisible()
  await page.getByRole('button', { name: room, exact: typeof room === 'string' }).click()
}
const log = (page: Page) => page.getByRole('log')

test('two people chat in real time, survive a network cut and a reload, and see each other walk', async ({
  browser,
}, testInfo) => {
  test.skip(/mobile/.test(testInfo.project.name), 'opens its own desktop + Android contexts')
  test.setTimeout(300_000)
  // The local relay keeps messages for its lifetime: every text is unique to this run.
  const run = Date.now().toString(36)
  const health = await (await fetch(`${RELAY}/health`)).json()
  expect(health.ok, 'relay running').toBe(true)

  const ama = await player(browser, 'ama', devices['Desktop Chrome'])
  const yawa = await player(browser, 'yawa', {
    ...devices['Pixel 7'],
    viewport: { width: 412, height: 915 },
  })
  expect(await rt(ama.page)).toMatchObject({ me: 'Ama (test)', rooms: 5 })
  expect(await rt(yawa.page)).toMatchObject({ me: 'Yawa (test)', rooms: 4 })

  // Kofi lives in Kara (another canton): a raw client listening to everything he may receive.
  const kofi: Socket = io(RELAY, {
    transports: ['websocket'],
    auth: { token: tokenOf(ACCOUNTS.kofi) },
  })
  const kofiHeard: string[] = []
  kofi.on('chat:new', (m: { body: string }) => kofiHeard.push(m.body))
  await new Promise<void>((r) => kofi.once('system:hello', () => r()))

  // 1. Presence: both are in Lomé.
  await expect.poll(async () => (await rt(yawa.page))?.present).toContain('Ama (test)')
  await expect.poll(async () => (await rt(ama.page))?.present).toContain('Yawa (test)')

  // 2. Ama walks (keyboard); on Yawa's phone her avatar moves smoothly, not in jumps.
  const remote = () =>
    yawa.page.evaluate(() => {
      const scene = (
        window as unknown as { __LOME_SCENE?: import('../lib/haroolife/engine/types').SceneProbe }
      ).__LOME_SCENE
      const p = scene?.position('Joueur Ama (test)')
      return p ? { x: p.x, z: p.z } : null
    })
  await ama.page.bringToFront()
  await ama.page.keyboard.down('ArrowRight')
  const walkedFrom = Date.now()
  await expect.poll(remote, { timeout: 15000 }).not.toBeNull()
  await expect
    .poll(() =>
      ama.page.evaluate(() =>
        Boolean(
          (
            window as unknown as {
              __LOME_SCENE?: import('../lib/haroolife/engine/types').SceneProbe
            }
          ).__LOME_SCENE?.has('Joueur Yawa (test)'),
        ),
      ),
    )
    .toBe(true)
  await ama.page.screenshot({ path: testInfo.outputPath('realtime-two-avatars-desktop.png') })
  // Sample the remote avatar on every rendered frame of Yawa's page (not on a wall clock):
  // interpolation means it moves a little on each frame, not in snapshot-sized jumps.
  const frames = await yawa.page.evaluate(
    () =>
      new Promise<{ x: number; z: number; t: number }[]>((resolve) => {
        const scene = (
          window as unknown as {
            __LOME_SCENE?: import('../lib/haroolife/engine/types').SceneProbe
          }
        ).__LOME_SCENE
        const out: { x: number; z: number; t: number }[] = []
        const tick = () => {
          const p = scene?.position('Joueur Ama (test)')
          if (p) out.push({ x: p.x, z: p.z, t: performance.now() })
          if (out.length >= 24) resolve(out)
          else requestAnimationFrame(tick)
        }
        requestAnimationFrame(tick)
      }),
  )
  await ama.page.keyboard.up('ArrowRight')
  const walkedMs = Date.now() - walkedFrom
  const span = (frames[frames.length - 1].t - frames[0].t) / 1000
  const fps = (frames.length - 1) / span
  const dist = Math.hypot(
    frames[frames.length - 1].x - frames[0].x,
    frames[frames.length - 1].z - frames[0].z,
  )
  const moved = frames
    .slice(1)
    .filter((p, i) => Math.hypot(p.x - frames[i].x, p.z - frames[i].z) > 1e-4).length
  // Speed over windows of at least one interpolation delay (remote-players INTERP_DELAY_MS): two animation-frame callbacks a
  // few ms apart can straddle a single engine update after a long frame (software rendering),
  // which would read as a huge per-frame speed although the figure moved one normal step.
  const SPEED_WINDOW_MS = 220
  const steps: number[] = []
  for (let i = 0; i < frames.length; i++) {
    const j = frames.findIndex((p, k) => k > i && p.t - frames[i].t >= SPEED_WINDOW_MS)
    if (j < 0) break
    const d = Math.hypot(frames[j].x - frames[i].x, frames[j].z - frames[i].z)
    steps.push(d / ((frames[j].t - frames[i].t) / 1000))
  }
  testInfo.annotations.push({
    type: 'remote avatar (SwiftShader, 2 pages)',
    description: JSON.stringify({
      fps: +fps.toFixed(1),
      dist: +dist.toFixed(2),
      movedFrames: moved,
      frames: frames.length,
      maxSpeed: +Math.max(...steps).toFixed(2),
    }),
  })
  expect(dist, 'remote avatar travelled').toBeGreaterThan(0.5)
  // Moving on most frames: interpolated, not held until the next snapshot.
  expect(moved / (frames.length - 1), 'moves between snapshots').toBeGreaterThan(0.6)
  // Never faster than the taxi (9 cells/s ≈ 10 world units/s at CELL scale): no teleport.
  // HarooLife street: 2 units per cell (the limit was 14 at the former 1.35 units per cell).
  expect(Math.max(...steps), 'no jump').toBeLessThan((14 * 2) / 1.35)
  await yawa.page.screenshot({ path: testInfo.outputPath('realtime-remote-avatar.png') })

  // 2b. Ama touches Yawa's name tag in the street: her sheet, then a private conversation that
  //     only the two of them read (Kofi's client never receives it).
  await ama.page.bringToFront()
  const tag = ama.page.getByRole('button', { name: 'Joueur Yawa (test)', exact: true })
  // Ama walked right; she walks back as long, then step by step until Yawa is on her screen.
  await ama.page.keyboard.down('ArrowLeft')
  await ama.page.waitForTimeout(walkedMs)
  await ama.page.keyboard.up('ArrowLeft')
  for (let i = 0; i < 10 && !(await tag.isVisible().catch(() => false)); i++) {
    await ama.page.keyboard.down('ArrowLeft')
    await ama.page.waitForTimeout(250)
    await ama.page.keyboard.up('ArrowLeft')
  }
  await expect(tag).toBeVisible({ timeout: 10000 })
  await tag.click()
  const sheet = ama.page.getByTestId('player-sheet')
  await expect(sheet).toContainText('Yawa (test)')
  await ama.page.screenshot({ path: testInfo.outputPath('realtime-player-sheet.png') })
  await sheet.getByRole('button', { name: /Discuter avec Yawa/ }).click()
  await expect(log(ama.page)).toHaveAttribute('aria-label', 'Messages · Yawa (test)')
  const secret = `Rendez-vous à 16 h, juste nous deux ${run}`
  await ama.page.getByLabel('Écrire dans la discussion').fill(secret)
  await ama.page.getByRole('button', { name: 'Envoyer le message', exact: true }).click()
  await expect(log(ama.page)).toContainText(secret)
  // On Yawa's phone the conversation appears by itself, named after Ama.
  // The chip carries the unread count too.
  await openChat(yawa.page, /^💬 Ama \(test\)/)
  await expect(log(yawa.page)).toContainText(secret, { timeout: 5000 })
  await yawa.page.getByLabel('Écrire dans la discussion').fill(`D’accord, à tout à l’heure ${run}`)
  await yawa.page.getByRole('button', { name: 'Envoyer le message', exact: true }).click()
  await expect(log(ama.page)).toContainText(`D’accord, à tout à l’heure ${run}`, { timeout: 5000 })
  await yawa.page.screenshot({ path: testInfo.outputPath('realtime-private-android.png') })

  // 3. Canton chat: Ama writes, Yawa sees it without refreshing; Kofi (Kara) never does.
  await openChat(yawa.page, 'Mon canton')
  await openChat(ama.page, 'Mon canton')
  const text = `Réunion au marché de Bè ${run}`
  const t0 = Date.now()
  await ama.page.getByLabel('Écrire dans la discussion').fill(text)
  await ama.page.getByRole('button', { name: 'Envoyer le message', exact: true }).click()
  await expect(log(yawa.page)).toContainText(text, { timeout: 5000 })
  const latency = Date.now() - t0
  testInfo.annotations.push({
    type: 'chat latency (local relay, ms)',
    description: String(latency),
  })
  expect(latency).toBeLessThan(3000)
  await expect(log(ama.page)).toContainText(text)
  await expect(ama.page.getByTestId('chat-pending')).toHaveCount(0)
  await yawa.page.screenshot({ path: testInfo.outputPath('realtime-chat-android.png') })

  // 4. Unread badge: Ama writes in Lomé while Yawa reads the canton.
  await ama.page.getByRole('button', { name: 'Lomé', exact: true }).click()
  await ama.page.getByLabel('Écrire dans la discussion').fill(`Qui vient au stade ? ${run}`)
  await ama.page.getByRole('button', { name: 'Envoyer le message', exact: true }).click()
  await expect.poll(async () => (await rt(yawa.page))?.unread).toBe(1)
  await yawa.page.getByRole('button', { name: /Lomé/ }).first().click()
  await expect(log(yawa.page)).toContainText(`Qui vient au stade ? ${run}`)
  await expect.poll(async () => (await rt(yawa.page))?.unread).toBe(0)

  // 5. Network cut on the phone: Yawa's message waits; Ama keeps talking; on reconnection the
  //    queued message is delivered once and Yawa catches up on what she missed.
  await yawa.context.setOffline(true)
  await yawa.page.evaluate(() =>
    (window as unknown as { __LOME_REALTIME?: Live }).__LOME_REALTIME?.drop(),
  )
  await expect.poll(async () => (await rt(yawa.page))?.status).toBe('offline')
  await expect(yawa.page.getByText('Hors connexion : tes messages partiront')).toBeVisible()
  await yawa.page
    .getByLabel('Écrire dans la discussion')
    .fill(`Je suis dans le taxi, j’arrive ${run}`)
  await yawa.page.getByRole('button', { name: 'Envoyer le message', exact: true }).click()
  await expect(yawa.page.getByTestId('chat-pending')).toHaveAttribute('data-state', 'queued')
  await ama.page.getByLabel('Écrire dans la discussion').fill(`Pendant ta coupure ${run}`)
  await ama.page.getByRole('button', { name: 'Envoyer le message', exact: true }).click()
  await expect(log(ama.page)).toContainText(`Pendant ta coupure ${run}`)
  await yawa.context.setOffline(false)
  await expect.poll(async () => (await rt(yawa.page))?.status, { timeout: 40000 }).toBe('online')
  await expect(log(yawa.page)).toContainText(`Pendant ta coupure ${run}`, { timeout: 10000 })
  await expect(log(ama.page)).toContainText(`Je suis dans le taxi, j’arrive ${run}`, {
    timeout: 10000,
  })
  await expect(yawa.page.getByTestId('chat-pending')).toHaveCount(0)
  await expect(log(ama.page).getByText(`Je suis dans le taxi, j’arrive ${run}`)).toHaveCount(1)

  // 6. Text is text: markup is shown, never run.
  await ama.page
    .getByLabel('Écrire dans la discussion')
    .fill('<img src=x onerror=alert(1)> <b>gras</b>')
  await ama.page.getByRole('button', { name: 'Envoyer le message', exact: true }).click()
  await expect(log(yawa.page)).toContainText('<img src=x onerror=alert(1)> <b>gras</b>')
  expect(await log(yawa.page).locator('img, b').count()).toBe(0)

  // 7. Reload the phone: the conversation is still there (stored, not just broadcast).
  await yawa.page.reload({ waitUntil: 'domcontentloaded' })
  await expect.poll(async () => (await rt(yawa.page))?.status, { timeout: 30000 }).toBe('online')
  // History is loaded room by room after the connection: wait for Lomé's, then read it.
  await expect
    .poll(() =>
      yawa.page.evaluate(
        () =>
          (window as unknown as { __LOME_REALTIME?: { loaded: Record<string, number> } })
            .__LOME_REALTIME?.loaded['locality:lome'] ?? 0,
      ),
    )
    .toBeGreaterThan(0)
  await openChat(yawa.page, 'Lomé')
  await expect(log(yawa.page)).toContainText(`Pendant ta coupure ${run}`)
  await expect(log(yawa.page)).toContainText(`Je suis dans le taxi, j’arrive ${run}`)

  // Kofi heard Lomé (city room he may read) but never the Bè canton.
  expect(kofiHeard).toContain(`Qui vient au stade ? ${run}`)
  expect(kofiHeard).not.toContain(text)
  // … nor any private message between Ama and Yawa.
  expect(kofiHeard.some((b) => b.includes('juste nous deux'))).toBe(false)
  kofi.disconnect()

  const after = await (await fetch(`${RELAY}/health`)).json()
  testInfo.annotations.push({ type: 'relay health', description: JSON.stringify(after) })
  expect(after.messagesStored).toBeGreaterThanOrEqual(5)
  // One engine draws the street: one canvas.
  expect(await ama.page.locator('canvas').count()).toBe(1)
  expect(await yawa.page.locator('canvas').count()).toBe(1)
  expect(ama.errors).toEqual([])
  expect(yawa.errors).toEqual([])
  await ama.context.close()
  await yawa.context.close()
})

// The database RPCs the dashboard calls, as a given person (through the mock Supabase, which
// runs them in the relay's PGlite: the real migrations).
const SUPABASE = 'http://127.0.0.1:54329'
const keyOf = (sub: string) =>
  createHash('md5').update(`haroolife-author:${sub}`).digest('hex').slice(0, 16)
const dmOf = (a: string, b: string) => `dm:${[keyOf(a), keyOf(b)].sort().join(':')}`
async function rpcAs(who: keyof typeof ACCOUNTS, fn: string, args: object = {}) {
  const r = await fetch(`${SUPABASE}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: 'e2e-anon-key',
      Authorization: `Bearer ${tokenOf(ACCOUNTS[who])}`,
    },
    body: JSON.stringify(args),
  })
  expect(r.status, `${fn} as ${who}`).toBe(200)
  return r.json()
}
type Inbox = { room: string; peer: { name: string }; last: { body: string }; unread: number }[]

test('a private message is seen and answered from the dashboard, and the answer reaches the game', async ({
  browser,
}, testInfo) => {
  test.setTimeout(180_000)
  test.skip(/mobile/.test(testInfo.project.name), 'opens its own desktop context')
  const run = Date.now().toString(36)
  const room = dmOf(ACCOUNTS.ama, ACCOUNTS.kofi)

  // Ama writes to Kofi; Kofi is not in the game.
  await rpcAs('ama', 'haroolife_chat_send', {
    p_room: room,
    p_body: `Kofi, tu as vu le match ? ${run}`,
    p_client_id: randomUUID(),
  })
  // Ama is in the game (connected after the conversation exists: it is one of her rooms).
  const ama = await player(browser, 'ama', devices['Desktop Chrome'])

  // Kofi opens his dashboard: the card shows Ama, the message and an unread count.
  const kofi = await signIn(browser, 'kofi', devices['Desktop Chrome'])
  await kofi.page.goto('/dashboard', { waitUntil: 'domcontentloaded' })
  const card = kofi.page.getByTestId('haroolife-messages-card')
  await expect(card).toBeVisible({ timeout: 30000 })
  await expect(card).toContainText('Ama (test)')
  await expect(card).toContainText(`Kofi, tu as vu le match ? ${run}`)
  await expect(card).toContainText(/\d+ non lus?/)

  // He opens the conversation and answers from there.
  await card.getByRole('link', { name: /Ama \(test\)/ }).click()
  await expect(kofi.page).toHaveURL(/\/messages\?room=dm%3A/)
  const thread = kofi.page.getByRole('log', { name: 'Messages avec Ama (test)' })
  await expect(thread).toContainText(`Kofi, tu as vu le match ? ${run}`)
  // Read on screen: no unread left for Kofi.
  await expect
    .poll(
      async () =>
        ((await rpcAs('kofi', 'haroolife_dm_inbox')) as Inbox).find((e) => e.room === room)?.unread,
    )
    .toBe(0)
  await kofi.page.getByRole('textbox', { name: 'Répondre à Ama (test)' }).fill(`Oui, 2-1 ! ${run}`)
  await kofi.page.getByRole('button', { name: 'Envoyer' }).click()
  await expect(thread).toContainText(`Oui, 2-1 ! ${run}`)

  // Ama sees the answer in the game without reloading, and in her own inbox as unread.
  await openChat(ama.page, /^💬 Kofi \(test\)/)
  await expect(log(ama.page)).toContainText(`Oui, 2-1 ! ${run}`)
  const amaBox = (await rpcAs('ama', 'haroolife_dm_inbox')) as Inbox
  expect(amaBox.find((e) => e.room === room)?.last.body).toBe(`Oui, 2-1 ! ${run}`)
  // Open in the game: read there too.
  await expect
    .poll(
      async () =>
        ((await rpcAs('ama', 'haroolife_dm_inbox')) as Inbox).find((e) => e.room === room)?.unread,
    )
    .toBe(0)

  // A third person cannot read the conversation.
  const refused = await fetch(`${SUPABASE}/rest/v1/rpc/haroolife_chat_history`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${tokenOf(ACCOUNTS.yawa)}`,
    },
    body: JSON.stringify({ p_room: room, p_limit: 50 }),
  })
  expect(refused.status).toBe(403)

  expect(ama.errors).toEqual([])
  expect(kofi.errors).toEqual([])
  await ama.context.close()
  await kofi.context.close()
})

test('game money sent to another player reaches their game once', async ({ browser }, testInfo) => {
  test.setTimeout(180_000)
  test.skip(/mobile/.test(testInfo.project.name), 'opens its own desktop contexts')
  const wallet = (page: Page) =>
    page.evaluate(
      () =>
        JSON.parse(localStorage.getItem('haroolife.lome-city.v1') || 'null')?.life
          ?.wallet as number,
    )
  const run = Date.now().toString(36)
  // Ama in the game (test hooks on: her sheet of Kofi opens by his key).
  const ama = await signIn(browser, 'ama', devices['Desktop Chrome'])
  await ama.context.addInitScript(() => localStorage.setItem('haroolife.e2e', '1'))
  await ama.page.goto('/haroolife', { waitUntil: 'domcontentloaded' })
  await expect(ama.page.locator('canvas:visible').first()).toBeVisible({ timeout: 30000 })
  await expect.poll(() => wallet(ama.page), { timeout: 20000 }).toBeGreaterThan(0)
  // Nothing waiting for Ama from earlier runs once her game has collected.
  await ama.page.waitForTimeout(1500)
  const amaBefore = await wallet(ama.page)
  await ama.page.evaluate(
    (key) =>
      (window as unknown as { __LOME_OPEN_PLAYER?: (k: string) => void }).__LOME_OPEN_PLAYER?.(key),
    keyOf(ACCOUNTS.kofi),
  )
  const form = ama.page.getByRole('form', { name: /Envoyer de l’argent à/ })
  await expect(form).toBeVisible()
  await form.getByRole('button', { name: '1 000 FCFA', exact: false }).first().click()
  await form.getByLabel('Un mot (facultatif)').fill(`pour l’essence ${run}`)
  await form.getByRole('button', { name: /^Envoyer 1/ }).click()
  await expect(ama.page.getByTestId('player-sheet')).toContainText('Tu as envoyé 1')
  await expect.poll(() => wallet(ama.page)).toBe(amaBefore - 1000)

  // Kofi opens his game: the money is collected once, with Ama's word.
  const kofi = await signIn(browser, 'kofi', devices['Desktop Chrome'])
  await kofi.page.goto('/haroolife', { waitUntil: 'domcontentloaded' })
  await expect(kofi.page.locator('canvas:visible').first()).toBeVisible({ timeout: 30000 })
  await expect
    .poll(
      () =>
        kofi.page.evaluate(
          () =>
            (JSON.parse(localStorage.getItem('haroolife.lome-city.v1') || 'null')?.life?.events ??
              []) as string[],
        ),
      { timeout: 20000 },
    )
    .toContainEqual(expect.stringContaining(`pour l’essence ${run}`))
  // Collected once: nothing is left to claim for Kofi.
  expect(await rpcAs('kofi', 'haroolife_money_claim')).toEqual([])
  expect(ama.errors).toEqual([])
  expect(kofi.errors).toEqual([])
  await ama.context.close()
  await kofi.context.close()
})

test('debate of the day: a vote is posted in the Togo room for everyone', async ({
  browser,
}, testInfo) => {
  test.setTimeout(120_000)
  test.skip(/mobile/.test(testInfo.project.name), 'opens its own desktop context')
  const ama = await player(browser, 'ama', devices['Desktop Chrome'])
  await ama.page
    .getByRole('navigation', { name: 'Navigation du jeu' })
    .getByRole('button', { name: 'Téléphone' })
    .click()
  await ama.page.getByRole('button', { name: /Débats$/ }).click()
  const debates = ama.page.getByTestId('debates')
  await expect(debates.getByRole('region', { name: 'Débat du jour' })).toBeVisible()
  await expect(debates.getByRole('region', { name: 'Blague du jour' })).toBeVisible()
  const first = debates.getByRole('region', { name: 'Débat du jour' }).getByRole('button').first()
  const side = (await first.textContent())?.trim() ?? ''
  await first.click()
  // The vote is in the « Togo » room, which opens.
  await expect(ama.page.getByRole('region', { name: 'Discussions en direct' })).toBeVisible()
  await expect(log(ama.page)).toContainText(`Moi je suis pour : ${side}`)
  expect(ama.errors).toEqual([])
  await ama.context.close()
})

test('the game follows the player to another phone, and a hand-raised wallet is capped', async ({
  browser,
}, testInfo) => {
  test.setTimeout(180_000)
  test.skip(/mobile/.test(testInfo.project.name), 'opens its own desktop contexts')
  type Cloud = { status: string; version: number | null; capped: number }
  const cloudOf = (page: Page) =>
    page.evaluate(() => (window as unknown as { __LOME_CLOUD?: Cloud }).__LOME_CLOUD ?? null)
  const save = (page: Page) =>
    page.evaluate(
      () =>
        JSON.parse(localStorage.getItem('haroolife.lome-city.v1') || 'null') as {
          life: { wallet: number; events: string[] }
        } | null,
    )
  const open = async (page: Page) => {
    await page.goto('/haroolife', { waitUntil: 'domcontentloaded' })
    await expect(page.locator('canvas:visible').first()).toBeVisible({ timeout: 30000 })
    await expect.poll(async () => (await cloudOf(page))?.status, { timeout: 20000 }).toBe('saved')
  }
  // Phone 1: Yawa plays, her game is saved online.
  const one = await signIn(browser, 'yawa', devices['Desktop Chrome'])
  await open(one.page)
  // A recognisable state: a few hundred francs more (within what can be earned), saved.
  const mark = 1000 + (Date.now() % 900)
  // Edited from a light page of the site: leaving the game writes its own save on the way out.
  await one.page.goto('/robots.txt')
  await one.page.evaluate((extra) => {
    const s = JSON.parse(localStorage.getItem('haroolife.lome-city.v1') || 'null')
    s.life.wallet += extra
    localStorage.setItem('haroolife.lome-city.v1', JSON.stringify(s))
  }, mark)
  const expected = (await save(one.page))?.life.wallet ?? 0
  await open(one.page)
  await expect.poll(async () => (await save(one.page))?.life.wallet).toBe(expected)
  const saved = (await cloudOf(one.page))?.version ?? 0
  expect(saved).toBeGreaterThan(0)

  // Phone 2, never used by Yawa: it opens her online game, not a new one.
  const two = await signIn(browser, 'yawa', devices['Pixel 7'])
  await open(two.page)
  await expect.poll(async () => (await save(two.page))?.life.wallet).toBe(expected)

  // Phone 1 is put away (still open, it would keep saving a newer game, which would rightly win).
  expect(one.errors).toEqual([])
  await one.context.close()
  // A wallet raised by hand on phone 2 is brought back to what the server recognises.
  await two.page.goto('/robots.txt')
  await two.page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('haroolife.lome-city.v1') || 'null')
    s.life.wallet = 9_999_999
    localStorage.setItem('haroolife.lome-city.v1', JSON.stringify(s))
  })
  await open(two.page)
  await expect
    .poll(async () => (await save(two.page))?.life.wallet ?? 0, { timeout: 20000 })
    .toBeLessThan(expected + 20000 + 6000 * 5)
  // The server said so: the wallet was capped (the player is told in a notice).
  expect((await cloudOf(two.page))?.capped).toBeGreaterThan(0)

  expect(two.errors).toEqual([])
  await two.context.close()
})

test('the team moderates a reported message from the admin console', async ({
  browser,
}, testInfo) => {
  test.setTimeout(120_000)
  test.skip(/mobile/.test(testInfo.project.name), 'opens its own desktop context')
  const run = Date.now().toString(36)
  const say = (who: keyof typeof ACCOUNTS, body: string) =>
    fetch(`${SUPABASE}/rest/v1/rpc/haroolife_chat_send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenOf(ACCOUNTS[who])}`,
      },
      body: JSON.stringify({ p_room: 'locality:lome', p_body: body, p_client_id: randomUUID() }),
    })
  // Kofi writes an insult on the Lomé room; Ama reports it from the game.
  const posted = await say('kofi', `insulte de test ${run}`)
  expect(posted.status).toBe(200)
  const message = (await posted.json()) as { id: string }
  await rpcAs('ama', 'haroolife_chat_report', { p_id: message.id, p_reason: 'Insulte' })

  // The team (super_admin) sees it in the console and hides it, suspending Kofi.
  const team = await signIn(browser, 'equipe', devices['Desktop Chrome'])
  await team.page.goto('/admin/haroolife-moderation', { waitUntil: 'domcontentloaded' })
  const card = team.page.getByTestId('mod-message').filter({ hasText: `insulte de test ${run}` })
  await expect(card).toBeVisible({ timeout: 30000 })
  await expect(card).toContainText('Kofi (test)')
  await expect(card).toContainText('Insulte')
  await card.getByRole('button', { name: /Masquer et suspendre/ }).click()
  await expect(card).toBeHidden()
  const suspended = team.page.getByTestId('mod-suspended').filter({ hasText: 'Kofi (test)' })
  await expect(suspended).toBeVisible()
  await expect(team.page.getByText('Joueur suspendu · Insulte').first()).toBeVisible()

  // Kofi can no longer write; the message is hidden for everyone.
  expect((await say('kofi', `encore ${run}`)).status).toBe(403)
  const lome = (await rpcAs('yawa', 'haroolife_chat_history', {
    p_room: 'locality:lome',
    p_limit: 100,
  })) as { id: string; deleted: boolean; body: string }[]
  const hidden = lome.find((m) => m.id === message.id)
  expect(hidden?.deleted).toBe(true)
  expect(hidden?.body).toBe('')

  // Lifting the suspension: Kofi writes again.
  await suspended.getByRole('button', { name: 'Lever la suspension' }).click()
  await expect(suspended).toBeHidden()
  expect((await say('kofi', `pardon ${run}`)).status).toBe(200)
  expect(team.errors).toEqual([])
  await team.context.close()
})

test('a visitor enters with one tap, plays and reads the rooms, and keeps the game with an e-mail only', async ({
  browser,
}, testInfo) => {
  test.setTimeout(150_000)
  test.skip(/mobile/.test(testInfo.project.name), 'opens its own Android context')
  const run = Date.now().toString(36)
  // The visitor's anonymous account (mock Supabase signInAnonymously, realtime/pglite.ts).
  const VISITOR = 'd4d4d4d4-0000-4000-8000-000000000004'
  const visitorToken = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: VISITOR, role: 'authenticated', aud: 'authenticated', is_anonymous: true, exp: 4102444800 })}.c2ln`
  const rpc = (token: string, fn: string, args: object) =>
    fetch(`${SUPABASE}/rest/v1/rpc/${fn}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(args),
    })

  // Signed out, on a phone: one tap on « Jouer en visiteur », no e-mail, no password.
  const context = await browser.newContext({
    ...devices['Pixel 7'],
    baseURL: 'http://127.0.0.1:3000',
  })
  await context.addInitScript(() => localStorage.setItem('haroolife.avatar.chosen', '1'))
  const page = await context.newPage()
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto('/haroolife', { waitUntil: 'domcontentloaded' })
  await page.getByRole('button', { name: 'Jouer en visiteur' }).click()
  await expect(page.locator('canvas:visible').first()).toBeVisible({ timeout: 30000 })
  await expect.poll(async () => (await rt(page))?.status, { timeout: 30000 }).toBe('online')
  expect(await rt(page)).toMatchObject({ me: 'Visiteur (test)' })

  // The visitor reads what the others write.
  const said = await rpc(tokenOf(ACCOUNTS.ama), 'haroolife_chat_send', {
    p_room: 'locality:lome',
    p_body: `bienvenue au visiteur ${run}`,
    p_client_id: randomUUID(),
  })
  expect(said.status).toBe(200)
  await openChat(page, 'Lomé')
  await expect(log(page)).toContainText(`bienvenue au visiteur ${run}`)
  // No message box: keeping the game (an e-mail) instead.
  await expect(page.getByRole('textbox', { name: 'Écrire dans la discussion' })).toHaveCount(0)
  const keep = page.getByTestId('keep-game')
  await expect(keep).toBeVisible()

  // The server refuses a visitor's writing even outside the screen: room, money.
  const write = await rpc(visitorToken, 'haroolife_chat_send', {
    p_room: 'locality:lome',
    p_body: `ecrit quand meme ${run}`,
    p_client_id: randomUUID(),
  })
  expect(write.status).not.toBe(200)
  const gift = await rpc(visitorToken, 'haroolife_money_send', {
    p_key: keyOf(ACCOUNTS.ama),
    p_amount: 500,
    p_note: null,
    p_client_id: randomUUID(),
  })
  expect(gift.status).not.toBe(200)

  // Keeping the game asks for the e-mail only (same account, confirmed by a link).
  await keep.getByRole('textbox', { name: 'Ton e-mail' }).fill(`visiteur-${run}@test.local`)
  await keep.getByRole('button', { name: 'Garder' }).click()
  await expect(keep).toContainText('Un lien a été envoyé')
  expect(await (await fetch(`${SUPABASE}/__visitor-keep`)).json()).toEqual({
    email: `visiteur-${run}@test.local`,
  })
  await page.screenshot({ path: testInfo.outputPath('realtime-visitor.png') })
  expect(errors).toEqual([])
  await context.close()
})
