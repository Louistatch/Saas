import fs from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'
import { expect, test } from './lome-test'

/**
 * Ambiance, after Slop New York (mrdoob, MIT): the street's trees sway in the sea breeze and the
 * light follows the hour, golden at dawn and dusk, blue and still readable at night. Checks on a
 * real WebGL context that the patched shader compiles, that the trees (and only them) carry
 * their sway weights, and measures the colour cast of the frame at four hours of the day.
 */
type Probe = {
  swaying: number
  vertices: number
  windMaterial: boolean
  fill: [number, number, number] | null
}

const probe = (page: import('@playwright/test').Page) =>
  page.evaluate((): Probe | null => {
    type Attr = { count: number; getX: (i: number) => number }
    type Node = {
      name?: string
      isMesh?: boolean
      isHemisphereLight?: boolean
      color?: { getStyle: () => string; r: number; g: number; b: number }
      geometry?: { getAttribute: (n: string) => Attr | undefined }
      material?: { customProgramCacheKey?: () => string }
      children: Node[]
    }
    const scene = (window as unknown as { __LOME_SCENE?: Node }).__LOME_SCENE
    if (!scene) return null
    let swaying = 0
    let vertices = 0
    let windMaterial = false
    let fill: [number, number, number] | null = null
    const walk = (o: Node) => {
      if (o.isHemisphereLight && o.color) fill = [o.color.r, o.color.g, o.color.b]
      if (o.isMesh && o.name?.startsWith('Bâtiments')) {
        const sway = o.geometry?.getAttribute('sway')
        if (sway) {
          vertices += sway.count
          for (let i = 0; i < sway.count; i++) if (sway.getX(i) > 0) swaying++
        }
        if (o.material?.customProgramCacheKey?.().includes('wind')) windMaterial = true
      }
      for (const c of o.children) walk(c)
    }
    walk(scene)
    return { swaying, vertices, windMaterial, fill }
  })

const hourOf = (page: import('@playwright/test').Page) =>
  page.evaluate(
    () => (window as unknown as { __LOME_CITY?: { hour: number } }).__LOME_CITY?.hour ?? null,
  )

/** Mean colour of the city in the middle of the frame (the HUD sits at the edges). */
async function cast(file: string) {
  const img = sharp(file)
  const { width = 0, height = 0 } = await img.metadata()
  const { data } = await img
    .extract({
      left: Math.round(width * 0.15),
      top: Math.round(height * 0.25),
      width: Math.round(width * 0.7),
      height: Math.round(height * 0.45),
    })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  let r = 0
  let g = 0
  let b = 0
  const n = data.length / 3
  for (let i = 0; i < n; i++) {
    r += data[i * 3]
    g += data[i * 3 + 1]
    b += data[i * 3 + 2]
  }
  r /= n
  g /= n
  b /= n
  return { r, g, b, warmth: r - b, luminance: 0.2126 * r + 0.7152 * g + 0.0722 * b }
}

test('the trees sway in the breeze and the light follows the hour', async ({ page }, testInfo) => {
  test.setTimeout(300_000)
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => {
    if (m.type() === 'error' && /Shader Error|WebGLProgram|VALIDATE_STATUS/.test(m.text()))
      errors.push(m.text())
  })
  const dir = path.join('test-results', 'lome-ambiance')
  fs.mkdirSync(dir, { recursive: true })

  await page.goto('/haroolife/territoire/lome', { waitUntil: 'domcontentloaded' })
  await expect(page.locator('canvas').first()).toBeVisible({ timeout: 30000 })
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('haroolife.lome-city.v1') !== null), {
      timeout: 30000,
    })
    .toBe(true)

  const casts: Record<number, Awaited<ReturnType<typeof cast>>> = {}
  const fills: Record<number, [number, number, number] | null> = {}
  for (const hour of [12, 18, 22, 6]) {
    // The save is rewritten before the app boots again, so no autosave can overwrite the hour
    // (init scripts run in order: the last one registered, this hour's, wins).
    await page.addInitScript((h) => {
      const raw = JSON.parse(localStorage.getItem('haroolife.lome-city.v1') ?? 'null')
      if (raw && raw.life.hour !== h) {
        raw.life.hour = h
        localStorage.setItem('haroolife.lome-city.v1', JSON.stringify(raw))
      }
    }, hour)
    await page.reload({ waitUntil: 'domcontentloaded' })
    await expect(page.locator('canvas').first()).toBeVisible({ timeout: 30000 })
    await expect.poll(() => hourOf(page), { timeout: 30000 }).toBe(hour)
    // Trees are baked into the building tiles: wait until the tiles around the player are in.
    await expect
      .poll(() => probe(page).then((p) => p?.swaying ?? 0), { timeout: 60000 })
      .toBeGreaterThan(0)
    await page.waitForTimeout(2500)
    const file = path.join(dir, `${testInfo.project.name}-${String(hour).padStart(2, '0')}h.png`)
    await page.screenshot({ path: file })
    casts[hour] = await cast(file)
    const p = await probe(page)
    fills[hour] = p?.fill ?? null
    if (hour === 12) {
      expect(p?.windMaterial, 'the city material carries the breeze').toBe(true)
      // Trees only: most of a tile (houses, roads, walls) stays still.
      expect(p?.swaying ?? 0).toBeLessThan((p?.vertices ?? 0) * 0.5)
    }
  }
  testInfo.annotations.push({ type: 'cast', description: JSON.stringify(casts) })
  testInfo.annotations.push({ type: 'fill', description: JSON.stringify(fills) })

  // The fill light: white by day, blue moonlight at night, warm at dusk and dawn.
  const [nr, , nb] = fills[22] ?? [0, 0, 0]
  expect(nb, 'night fill is blue').toBeGreaterThan(nr)
  const [dr, , db] = fills[18] ?? [0, 0, 0]
  expect(dr, 'dusk fill is warm').toBeGreaterThan(db)
  // The frame itself: dusk warmer than noon; night bluer than noon, yet not black.
  expect(casts[18].warmth).toBeGreaterThan(casts[12].warmth)
  expect(casts[22].warmth).toBeLessThan(casts[12].warmth)
  expect(casts[22].luminance, 'the night street stays readable').toBeGreaterThan(30)
  expect(errors).toEqual([])
})
