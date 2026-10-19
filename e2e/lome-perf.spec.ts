import fs from 'node:fs'
import path from 'node:path'
import { expect, openPlaces, test } from './lome-test'

/**
 * Performance scenarios A–F on the 3D city, measured in the real browser build. Figures come
 * from the in-game probe (`window.__LOME_PERF`: frame-time percentiles, draw calls, triangles,
 * entities, animated figures, memory, long tasks, React renders) plus network transfer and
 * navigation timing. Written to test-results/lome-perf/<project>.json and .md.
 *
 * These numbers are measured under emulation (headless Chromium, software WebGL) unless the
 * run is pointed at a real device; the report says which.
 */
type Perf = {
  frame: {
    n: number
    mean: number
    p50: number
    p95: number
    p99: number
    max: number
    fps: number
  }
  drawCalls: number
  triangles: number
  renderEntities: number
  meshInstances: number
  animated: number
  animating: number
  heapMB: number | null
  longTasks: number
  longTaskMs: number
  renders: Record<string, number>
  assets: number
  pixelRatio: number
  resolution: [number, number]
}
type City = {
  chunks: number
  buildings: number
  detailed: boolean
  route: number
  inside: string | null
}
const perf = (page: import('@playwright/test').Page) =>
  page.evaluate(() => (window as unknown as { __LOME_PERF?: Perf }).__LOME_PERF ?? null)
const city = (page: import('@playwright/test').Page) =>
  page.evaluate(() => (window as unknown as { __LOME_CITY?: City }).__LOME_CITY ?? null)

async function sample(page: import('@playwright/test').Page, ms: number) {
  await page.evaluate(() =>
    (window as unknown as { __LOME_PERF_RESET?: () => void }).__LOME_PERF_RESET?.(),
  )
  await page.waitForTimeout(ms)
  return (await perf(page))!
}

test('performance scenarios A–F', async ({ page, browserName }, testInfo) => {
  test.setTimeout(240_000)
  let bytes = 0
  let requests = 0
  const byType: Record<string, number> = {}
  page.on('response', async (r) => {
    try {
      const len = Number(r.headers()['content-length'] ?? 0)
      const size = len || (await r.body().catch(() => Buffer.alloc(0))).length
      bytes += size
      requests++
      const t = r.request().resourceType()
      byType[t] = (byType[t] ?? 0) + size
    } catch {
      /* body unavailable */
    }
  })
  const report: Record<string, unknown> = {
    project: testInfo.project.name,
    browser: browserName,
    emulation: 'headless Chromium, SwiftShader (software WebGL); not a real device',
    userAgent: await page.evaluate(() => navigator.userAgent),
  }

  // A. Cold open.
  const t0 = Date.now()
  await page.goto('/haroolife/territoire/lome', { waitUntil: 'domcontentloaded' })
  await expect(page.locator('canvas').first()).toBeVisible({ timeout: 30000 })
  const canvasAt = Date.now() - t0
  await expect
    .poll(() => city(page).then((c) => (c?.detailed && c.chunks >= 9 ? c.buildings : 0)), {
      timeout: 60000,
    })
    .toBeGreaterThan(0)
  const cityAt = Date.now() - t0
  const nav = await page.evaluate(() => {
    const n = performance.getEntriesByType('navigation')[0] as
      | PerformanceNavigationTiming
      | undefined
    return n
      ? {
          ttfb: Math.round(n.responseStart),
          domContentLoaded: Math.round(n.domContentLoadedEventEnd),
          load: Math.round(n.loadEventEnd),
        }
      : null
  })
  await page.waitForTimeout(2000)
  report.A_cold_open = {
    canvasVisibleMs: canvasAt,
    cityDetailedMs: cityAt,
    navigation: nav,
    transferBytes: bytes,
    requests,
    byType: { ...byType },
    perf: await sample(page, 3000),
    city: await city(page),
  }

  // B. Tokoin street at home (follow camera, idle).
  report.B_tokoin_street = { perf: await sample(page, 4000) }

  // D. The city map (SVG, no 3D scene behind it) and back to the street.
  await page
    .getByRole('navigation', { name: 'Navigation du jeu' })
    .getByRole('button', { name: 'Carte' })
    .click()
  await expect(page.getByTestId('city-map')).toBeVisible()
  const tD = Date.now()
  await page.getByRole('button', { name: 'Retour au jeu' }).click()
  await expect
    .poll(() => city(page).then((c) => c?.chunks ?? 0), { timeout: 30000 })
    .toBeGreaterThanOrEqual(9)
  report.D_map_back_to_street = { backMs: Date.now() - tD, perf: await sample(page, 3000) }

  // E. Open the gym (ride there, enter) and measure inside.
  await openPlaces(page)
  await page
    .getByRole('group', { name: 'Filtrer la ville' })
    .getByRole('button', { name: 'Loisirs' })
    .click()
  await page.getByRole('button', { name: /Salle Fitness Tokoin/ }).click()
  await page.getByRole('dialog', { name: 'Lieu' }).getByRole('button', { name: /Taxi/ }).click()
  await page.getByRole('button', { name: 'Confirmer le trajet' }).click()
  await page
    .getByLabel('Trajet en cours')
    .getByRole('button', { name: /Passer/ })
    .click()
  await expect.poll(() => city(page).then((c) => c?.route ?? 99), { timeout: 20000 }).toBe(0)
  const bytesBeforeGym = bytes
  const tE = Date.now()
  await page.getByRole('button', { name: 'Entrer ou sortir' }).click()
  await expect
    .poll(() => city(page).then((c) => c?.inside ?? null), { timeout: 10000 })
    .not.toBeNull()
  // The room engine is drawing (it publishes its own __LOME_PERF once running).
  await expect
    .poll(
      () =>
        page.evaluate(() =>
          Boolean((window as unknown as { __LOME_INTERIOR?: unknown }).__LOME_INTERIOR),
        ),
      {
        timeout: 30000,
      },
    )
    .toBe(true)
  await page.waitForTimeout(2500)
  report.E_gym = {
    enterMs: Date.now() - tE,
    transferBytes: bytes - bytesBeforeGym,
    perf: await sample(page, 3000),
  }

  // F. Straight back to the city.
  const tF = Date.now()
  await page.getByRole('button', { name: 'Entrer ou sortir' }).click()
  await expect.poll(() => city(page).then((c) => c?.inside ?? null)).toBeNull()
  await expect
    .poll(() => city(page).then((c) => c?.chunks ?? 0), { timeout: 30000 })
    .toBeGreaterThanOrEqual(9)
  const backAt = Date.now() - tF
  report.F_back_to_city = { backMs: backAt, perf: await sample(page, 3000) }

  // C (measured last: walking may leave the road network, which the trips above need).
  // Walking down the street: the camera follows, building tiles stream in.
  await page.evaluate(() =>
    (window as unknown as { __LOME_PERF_RESET?: () => void }).__LOME_PERF_RESET?.(),
  )
  await page.keyboard.down('ArrowUp')
  await page.waitForTimeout(3000)
  report.C_walk = { perf: await perf(page) }
  await page.keyboard.up('ArrowUp')
  report.G_cooperative = 'non mesuré : jalon 2'
  report.H_multi_actors = 'non mesuré : jalon 2'

  const dir = path.join('test-results', 'lome-perf')
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, `${testInfo.project.name}.json`), JSON.stringify(report, null, 2))
  const row = (k: string, v: unknown) => {
    const p = (v as { perf?: Perf }).perf
    if (!p) return `| ${k} | ${String(v)} |`
    return `| ${k} | ${p.frame.fps} | ${p.frame.p50} | ${p.frame.p95} | ${p.frame.p99} | ${p.drawCalls} | ${Math.round(p.triangles / 1000)}k | ${p.renderEntities} | ${p.animating}/${p.animated} | ${p.heapMB ?? '—'} | ${p.longTasks} |`
  }
  const md = [
    `# Performance ${testInfo.project.name} (${report.emulation})`,
    '',
    `Ouverture à froid : canvas visible ${canvasAt} ms, ville détaillée ${cityAt} ms, ${Math.round(bytes / 1024)} Ko transférés en ${requests} requêtes.`,
    `Salle : entrée ${(report.E_gym as { enterMs: number }).enterMs} ms ; retour ville ${backAt} ms.`,
    '',
    '| Scénario | FPS | p50 ms | p95 ms | p99 ms | Draw calls | Triangles | Entités | Animés | Heap Mo | Long tasks |',
    '|---|---|---|---|---|---|---|---|---|---|---|',
    ...[
      'A_cold_open',
      'B_tokoin_street',
      'C_walk',
      'D_map_back_to_street',
      'E_gym',
      'F_back_to_city',
    ].map((k) => row(k, report[k])),
  ].join('\n')
  fs.writeFileSync(path.join(dir, `${testInfo.project.name}.md`), md)
  testInfo.annotations.push({ type: 'perf', description: md })
  // Software rendering can be slower than one frame per second; the report is the deliverable.
  expect((report.A_cold_open as { perf: Perf }).perf.frame.n).toBeGreaterThanOrEqual(1)
  // The gym figures are the room's own (not the street's last snapshot).
  expect((report.E_gym as { perf: Perf }).perf.frame.n, 'room frames').toBeGreaterThanOrEqual(1)
})
