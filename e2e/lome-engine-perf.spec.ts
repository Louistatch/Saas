import fs from 'node:fs'
import path from 'node:path'
import { initialCityLife } from '../lib/haroolife/city/life'
import type { PerfSnapshot } from '../lib/haroolife/city/perf'
import { expect, test } from './lome-test'

test('repeatable street workload and sampled allocations', async ({ page }, info) => {
  const mobile = info.project.name === 'mobile-android'
  const save = initialCityLife()
  save.life.hour = 14
  const quality = mobile ? 'balanced' : 'high'
  await page.addInitScript(
    ({ save, quality }) => {
      ;(window as unknown as { __LOME_PERF_LOCK_QUALITY: boolean }).__LOME_PERF_LOCK_QUALITY = true
      localStorage.setItem('haroolife.lome-city.v1', JSON.stringify(save))
      localStorage.setItem('haroolife.quality', quality)
      localStorage.setItem('haroolife.camera-mode', 'follow')
    },
    { save, quality },
  )
  const cdp = await page.context().newCDPSession(page)
  // Viewport/UA and CPU emulation only, NOT a physical Android GPU.
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: mobile ? 4 : 1 })
  await cdp.send('Performance.enable')
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  const t0 = Date.now()
  await page.goto('/haroolife', { waitUntil: 'domcontentloaded' })
  const probe = () =>
    page.evaluate(() => (window as unknown as { __LOME_PERF?: PerfSnapshot }).__LOME_PERF ?? null)
  await expect
    .poll(async () => (await probe())?.street?.tileBuilds ?? 0, { timeout: 90000 })
    .toBeGreaterThan(8)
  const coldMs = Date.now() - t0
  await page.waitForTimeout(4000)
  const measure = async (walking: boolean) => {
    await cdp.send('HeapProfiler.collectGarbage')
    const heapBefore = await cdp.send('Runtime.getHeapUsage')
    await cdp.send('HeapProfiler.startSampling', {
      samplingInterval: 32768,
      includeObjectsCollectedByMajorGC: true,
      includeObjectsCollectedByMinorGC: true,
    })
    const before = await probe()
    await page.evaluate(() =>
      (window as unknown as { __LOME_PERF_RESET?: () => void }).__LOME_PERF_RESET?.(),
    )
    const start = Date.now()
    if (walking) await page.keyboard.down('ArrowUp')
    await page.waitForTimeout(12000)
    if (walking) await page.keyboard.up('ArrowUp')
    const after = await probe()
    const elapsedMs = Date.now() - start
    const { profile } = await cdp.send('HeapProfiler.stopSampling')
    const allocatedBytes = profile.samples.reduce((n, s) => n + s.size, 0)
    const hotspots: { name: string; bytes: number }[] = []
    const collect = (node: typeof profile.head) => {
      if (node.selfSize)
        hotspots.push({ name: node.callFrame.functionName || '(anonymous)', bytes: node.selfSize })
      for (const child of node.children ?? []) collect(child)
    }
    collect(profile.head)
    hotspots.sort((a, b) => b.bytes - a.bytes)
    const heapBeforeGC = await cdp.send('Runtime.getHeapUsage')
    await cdp.send('HeapProfiler.collectGarbage')
    const heapAfter = await cdp.send('Runtime.getHeapUsage')
    return {
      elapsedMs,
      perf: after,
      tileScans: (after?.street?.tileScans ?? 0) - (before?.street?.tileScans ?? 0),
      tileBuilds: (after?.street?.tileBuilds ?? 0) - (before?.street?.tileBuilds ?? 0),
      sampledAllocatedBytes: allocatedBytes,
      sampledAllocatedMBPerSecond: allocatedBytes / 1048576 / (elapsedMs / 1000),
      allocationHotspots: hotspots.slice(0, 12),
      heapBefore,
      heapBeforeGC,
      heapAfter,
    }
  }
  const idle = await measure(false)
  await page.screenshot({ path: info.outputPath('street.png') })
  const walk = await measure(true)
  const report = {
    phase: process.env.HAROOLIFE_PERF_PHASE ?? 'current',
    project: info.project.name,
    quality,
    cpuThrottle: mobile ? 4 : 1,
    viewport: page.viewportSize(),
    environment: 'Chromium, SwiftShader software WebGL, Android emulated (not physical)',
    coldMs,
    idle,
    walk,
    errors,
  }
  const dir = path.join('docs', 'captures', 'engine-performance')
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(
    path.join(dir, `${report.phase}-${info.project.name}.json`),
    JSON.stringify(report, null, 2),
  )
  expect(idle.perf?.frame.n).toBeGreaterThan(10)
  expect(walk.perf?.frame.n).toBeGreaterThan(10)
  expect(errors).toEqual([])
})
