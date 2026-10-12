/**
 * Performance instrumentation for the 3D city: frame-time percentiles, render-side
 * counters (draw calls, triangles, entities, animated figures), memory and long tasks,
 * published on `window.__LOME_PERF` for the Playwright scenarios and for the in-game
 * statistics overlay. Pure helpers here; the PlayCanvas probe lives in city-world.tsx.
 */
export interface FrameSummary {
  /** Samples used. */
  n: number
  mean: number
  p50: number
  p95: number
  p99: number
  max: number
  /** Frames per second derived from the mean frame time. */
  fps: number
}

export class FrameRing {
  private buf: Float32Array
  private i = 0
  private filled = 0
  constructor(size = 600) {
    this.buf = new Float32Array(size)
  }
  push(ms: number) {
    if (!Number.isFinite(ms) || ms <= 0) return
    this.buf[this.i] = ms
    this.i = (this.i + 1) % this.buf.length
    this.filled = Math.min(this.filled + 1, this.buf.length)
  }
  reset() {
    this.i = 0
    this.filled = 0
  }
  summary(): FrameSummary {
    const n = this.filled
    if (n === 0) return { n: 0, mean: 0, p50: 0, p95: 0, p99: 0, max: 0, fps: 0 }
    const arr = Array.from(this.buf.subarray(0, n)).sort((a, b) => a - b)
    const mean = arr.reduce((s, v) => s + v, 0) / n
    return {
      n,
      mean: round(mean),
      p50: round(percentile(arr, 50)),
      p95: round(percentile(arr, 95)),
      p99: round(percentile(arr, 99)),
      max: round(arr[n - 1]),
      fps: round(1000 / mean),
    }
  }
}

/** Nearest-rank percentile of an ascending array. */
export function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0
  const rank = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1))
  return sorted[rank]
}
const round = (v: number) => Math.round(v * 100) / 100

/** React render counters, bumped by the components that matter for the canvas. */
export const renders: Record<string, number> = { world: 0, immersive: 0, chunks: 0, agents: 0 }
export const bump = (key: string) => {
  renders[key] = (renders[key] ?? 0) + 1
}

export interface PerfSnapshot {
  at: number
  frame: FrameSummary
  drawCalls: number
  triangles: number
  /** Entities carrying a render component. */
  renderEntities: number
  /** Mesh instances submitted to the forward renderer. */
  meshInstances: number
  /** Anim components, and how many are playing. */
  animated: number
  animating: number
  heapMB: number | null
  longTasks: number
  longTaskMs: number
  renders: Record<string, number>
  /** Loaded assets (GLB containers, textures) in the registry. */
  assets: number
  pixelRatio: number
  resolution: [number, number]
}

/** Long tasks (> 50 ms) observed since the page loaded; counts are cumulative. */
export function watchLongTasks(): { count: () => number; totalMs: () => number } {
  let count = 0
  let total = 0
  try {
    const obs = new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        count++
        total += e.duration
      }
    })
    obs.observe({ type: 'longtask', buffered: true })
  } catch {
    /* not supported */
  }
  return { count: () => count, totalMs: () => Math.round(total) }
}
