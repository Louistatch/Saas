import type { Page } from '@playwright/test'
import { io } from 'socket.io-client'
import { gameSessionCookie } from './fixtures/game-account'
import { expect, test } from './lome-test'

type Street = {
  rendererId: string
  quality: string
  pendingTiles: number
  traffic: { shown: boolean; kind: string }[]
  remotes: { key: string; vehicle: string | null; vehicleShown: boolean; shown: boolean }[]
}
const street = (page: Page) =>
  page.evaluate(() => (window as unknown as { __LOME_STREET?: Street }).__LOME_STREET ?? null)

test('map and graphics changes preserve the WebGL scene, stationary doors and city tiles', async ({
  page,
}) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.addInitScript(() => {
    ;(window as unknown as { __LOME_PERF_LOCK_QUALITY: boolean }).__LOME_PERF_LOCK_QUALITY = true
  })
  await page.goto('/haroolife')
  await expect.poll(async () => (await street(page))?.pendingTiles, { timeout: 60000 }).toBe(0)
  const id = (await street(page))?.rendererId
  expect(id).toBeTruthy()
  await page.evaluate(() => {
    const w = window as unknown as { __doorMutations: number; __canvasBefore: Element | null }
    w.__doorMutations = 0
    w.__canvasBefore = document.querySelector('[data-scene="street"] canvas')
    new MutationObserver((m) => {
      w.__doorMutations += m.filter(
        (x) => x.target instanceof HTMLElement && x.target.hasAttribute('data-door'),
      ).length
    }).observe(document.querySelector('[data-scene="street"]')!, {
      subtree: true,
      attributes: true,
      attributeFilter: ['style'],
    })
  })
  await page.waitForTimeout(2000)
  expect(
    await page.evaluate(() => (window as unknown as { __doorMutations: number }).__doorMutations),
  ).toBe(0)
  const nav = page.getByRole('navigation', { name: 'Navigation du jeu' })
  await nav.getByRole('button', { name: 'Carte' }).click()
  await expect(page.getByTestId('city-map')).toBeVisible()
  await page.getByRole('button', { name: 'Retour au jeu' }).click()
  await expect.poll(async () => (await street(page))?.rendererId).toBe(id)
  expect(
    await page.evaluate(
      () =>
        document.querySelector('[data-scene="street"] canvas') ===
        (window as unknown as { __canvasBefore: Element }).__canvasBefore,
    ),
  ).toBe(true)
  await nav.getByRole('button', { name: 'Téléphone' }).click()
  await page.getByRole('button', { name: 'Réglages', exact: true }).click()
  for (const [label, value] of [
    ['Économie', 'eco'],
    ['Élevé', 'high'],
    ['Équilibré', 'balanced'],
  ]) {
    await page
      .getByRole('group', { name: 'Qualité graphique' })
      .getByRole('button', { name: label })
      .click()
    await expect.poll(async () => (await street(page))?.quality).toBe(value)
    expect((await street(page))?.rendererId).toBe(id)
  }
  await page.getByRole('button', { name: 'Fermer', exact: true }).click()
  await expect.poll(async () => (await street(page))?.traffic.filter((c) => c.shown).length).toBe(6)
  await page.waitForTimeout(1500)
  expect(errors).toEqual([])
})

test('real relay: a remote avatar, taxi and moto survive culling and graphic changes', async ({
  page,
  context,
}) => {
  const resident = 'c3c3c3c3-0000-4000-8000-000000000003'
  await context.addCookies([gameSessionCookie(resident)])
  await page.addInitScript((id) => sessionStorage.setItem('haroolife.entered.v1', id), resident)
  await page.goto('/haroolife')
  await expect.poll(async () => (await street(page))?.pendingTiles, { timeout: 60000 }).toBe(0)
  const port = Number(process.env.HAROOLIFE_TEST_PORT || 3000)
  const b64 = (v: unknown) => Buffer.from(JSON.stringify(v)).toString('base64url')
  const token = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: 'a1a1a1a1-0000-4000-8000-000000000001', role: 'authenticated', exp: 4102444800 })}.c2ln`
  const socket = io(`http://127.0.0.1:${port + 1}`, { transports: ['websocket'], auth: { token } })
  let timer: ReturnType<typeof setInterval> | undefined
  try {
    await new Promise<void>((resolve, reject) => {
      socket.once('system:hello', () => resolve())
      socket.once('connect_error', reject)
    })
    expect(
      (await socket.timeout(10000).emitWithAck('presence:join', { locality: 'lome' })).ok,
    ).toBe(true)
    const at = await page.evaluate(
      () => (window as unknown as { __LOME_PLAYER: { x: number; z: number } }).__LOME_PLAYER,
    )
    let mode = 'walk'
    let n = 0
    timer = setInterval(
      () => socket.emit('player:pose', { x: at.x + 1, z: at.z + 1, heading: 0, mode, n: ++n }),
      200,
    )
    await expect.poll(async () => (await street(page))?.remotes.some((r) => r.shown)).toBe(true)
    mode = 'drive:taxi'
    await expect
      .poll(async () =>
        (await street(page))?.remotes.some((r) => r.vehicle === 'taxi' && r.vehicleShown),
      )
      .toBe(true)
    mode = 'drive:moto'
    await expect
      .poll(async () =>
        (await street(page))?.remotes.some(
          (r) => r.vehicle === 'moto' && r.vehicleShown && r.shown,
        ),
      )
      .toBe(true)
    mode = 'walk'
    await expect
      .poll(async () => (await street(page))?.remotes.some((r) => r.vehicle === null && r.shown))
      .toBe(true)
    clearInterval(timer)
    timer = undefined
    await expect.poll(async () => (await street(page))?.remotes.length, { timeout: 15000 }).toBe(0)
    timer = setInterval(
      () => socket.emit('player:pose', { x: at.x + 1, z: at.z + 1, heading: 0, mode, n: ++n }),
      200,
    )
    await expect.poll(async () => (await street(page))?.remotes.some((r) => r.shown)).toBe(true)
  } finally {
    if (timer) clearInterval(timer)
    socket.disconnect()
  }
})
