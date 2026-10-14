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
}
const tokenOf = (sub: string) =>
  `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub, role: 'authenticated', aud: 'authenticated', exp: 4102444800 })}.c2ln`
type Live = {
  status: string
  me: string | null
  rooms: number
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

async function player(browser: Browser, who: 'ama' | 'yawa', device: object) {
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
  const page = await context.newPage()
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('dialog', (d) => {
    errors.push(`dialog: ${d.message()}`)
    void d.dismiss()
  })
  await page.goto('/haroolife', { waitUntil: 'domcontentloaded' })
  await expect(page.locator('canvas').first()).toBeVisible({ timeout: 30000 })
  await expect.poll(async () => (await rt(page))?.status, { timeout: 30000 }).toBe('online')
  return { context, page, errors }
}
async function openChat(page: Page, room: string) {
  await page
    .getByRole('navigation', { name: 'Navigation du jeu' })
    .getByRole('button', { name: 'Téléphone' })
    .click()
  await page.getByRole('button', { name: /Messages$/ }).click()
  await expect(page.getByRole('region', { name: 'Discussions en direct' })).toBeVisible()
  await page.getByRole('button', { name: room, exact: true }).click()
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
          window as unknown as { __LOME_SCENE?: import('../lib/haroolife/engine/types').SceneProbe }
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
  const span = (frames[frames.length - 1].t - frames[0].t) / 1000
  const fps = (frames.length - 1) / span
  const dist = Math.hypot(
    frames[frames.length - 1].x - frames[0].x,
    frames[frames.length - 1].z - frames[0].z,
  )
  const moved = frames
    .slice(1)
    .filter((p, i) => Math.hypot(p.x - frames[i].x, p.z - frames[i].z) > 1e-4).length
  const steps = frames
    .slice(1)
    .map((p, i) => Math.hypot(p.x - frames[i].x, p.z - frames[i].z) / ((p.t - frames[i].t) / 1000))
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
  expect(Math.max(...steps), 'no jump').toBeLessThan(14)
  await yawa.page.screenshot({ path: testInfo.outputPath('realtime-remote-avatar.png') })

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
  await openChat(yawa.page, 'Lomé')
  await expect(log(yawa.page)).toContainText(`Pendant ta coupure ${run}`)
  await expect(log(yawa.page)).toContainText(`Je suis dans le taxi, j’arrive ${run}`)

  // Kofi heard Lomé (city room he may read) but never the Bè canton.
  expect(kofiHeard).toContain(`Qui vient au stade ? ${run}`)
  expect(kofiHeard).not.toContain(text)
  kofi.disconnect()

  const after = await (await fetch(`${RELAY}/health`)).json()
  testInfo.annotations.push({ type: 'relay health', description: JSON.stringify(after) })
  expect(after.messagesStored).toBeGreaterThanOrEqual(5)
  expect(await ama.page.locator('canvas').count()).toBe(1)
  expect(await yawa.page.locator('canvas').count()).toBe(1)
  expect(ama.errors).toEqual([])
  expect(yawa.errors).toEqual([])
  await ama.context.close()
  await yawa.context.close()
})
