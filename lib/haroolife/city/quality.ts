/**
 * Graphics quality presets. Chosen automatically from the device (memory, cores, screen)
 * and adjustable by the player; persisted locally. Each preset bounds what the renderer
 * does: render resolution (device pixel ratio cap), anti-aliasing, how far detailed chunks
 * reach, how many distant characters animate at full rate, and the inactive geometry cache.
 */
export type Quality = 'eco' | 'balanced' | 'high'
export interface QualityPreset {
  id: Quality
  label: string
  hint: string
  /** Upper bound on the device pixel ratio used for the canvas. */
  maxPixelRatio: number
  antialias: boolean
  /** Outer preloading ring of the Three.js street, in half tiles. */
  farRing: number
  /** Full-rate distant actors (near faces/local player are exempt), and ambient cast ceiling. */
  maxAnimated: number
  maxWalkers: number
  /** GPU/CPU cache of inactive tiles. Active geometry is never evicted by this budget. */
  geometryCacheMB: number
  /** Street engine: preserve the existing eight-cell detailed neighbourhood at every level. */
  streetDetailCells: number
  /** Soft CPU deadline for incremental tile work (one indivisible tile at most per frame). */
  streamBudgetMs: number
}
export const PRESETS: Record<Quality, QualityPreset> = {
  eco: {
    id: 'eco',
    label: 'Économie',
    hint: 'Faible consommation : résolution réduite, moins de personnages.',
    maxPixelRatio: 1,
    antialias: false,
    farRing: 2,
    maxAnimated: 4,
    maxWalkers: 8,
    geometryCacheMB: 6,
    streetDetailCells: 8,
    streamBudgetMs: 2,
  },
  balanced: {
    id: 'balanced',
    label: 'Équilibré',
    hint: 'Fluidité d’abord : résolution limitée à 1,5×, détails à proximité.',
    maxPixelRatio: 1.5,
    antialias: true,
    farRing: 2,
    maxAnimated: 8,
    maxWalkers: 14,
    geometryCacheMB: 9,
    streetDetailCells: 8,
    streamBudgetMs: 3,
  },
  high: {
    id: 'high',
    label: 'Élevé',
    hint: 'Qualité renforcée : résolution native, plus de personnages et de détails.',
    maxPixelRatio: 2,
    antialias: true,
    farRing: 3,
    maxAnimated: 14,
    maxWalkers: 20,
    geometryCacheMB: 12,
    streetDetailCells: 8,
    streamBudgetMs: 4,
  },
}
export const STORAGE_KEY = 'haroolife.quality'

export interface DeviceHints {
  deviceMemory?: number
  hardwareConcurrency?: number
  /** CSS pixels of the shorter screen edge. */
  shortEdge?: number
  mobile?: boolean
  saveData?: boolean
  reducedMotion?: boolean
}
/** The preset a device should start with, before any player choice. */
export function autoQuality(d: DeviceHints): Quality {
  if (d.saveData || d.reducedMotion) return 'eco'
  const mem = d.deviceMemory ?? (d.mobile ? 4 : 8)
  const cores = d.hardwareConcurrency ?? (d.mobile ? 4 : 8)
  if (mem <= 2 || cores <= 2) return 'eco'
  if (d.mobile) return mem >= 8 && cores >= 8 ? 'balanced' : mem < 4 ? 'eco' : 'balanced'
  if (mem >= 8 && cores >= 8) return 'high'
  return 'balanced'
}
export function isQuality(v: unknown): v is Quality {
  return v === 'eco' || v === 'balanced' || v === 'high'
}
/** Reads the device in the browser (safe on the server: returns balanced). */
export function detectQuality(): Quality {
  if (typeof window === 'undefined') return 'balanced'
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    if (isQuality(stored)) return stored
  } catch {
    /* storage blocked */
  }
  if (softwareRenderer()) return 'eco'
  const nav = navigator as Navigator & {
    deviceMemory?: number
    connection?: { saveData?: boolean }
  }
  return autoQuality({
    deviceMemory: nav.deviceMemory,
    hardwareConcurrency: nav.hardwareConcurrency,
    shortEdge: Math.min(window.screen.width, window.screen.height),
    mobile: /Android|iPhone|iPad|Mobile/i.test(nav.userAgent),
    saveData: nav.connection?.saveData === true,
    reducedMotion: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false,
  })
}
let software: boolean | null = null
/**
 * Whether WebGL runs on a software rasterizer (SwiftShader, llvmpipe…): no GPU at all, as on
 * headless runners and some low-end or virtualised machines. Detected once, cached.
 */
export function softwareRenderer(): boolean {
  if (software !== null) return software
  if (typeof document === 'undefined') return false
  try {
    const canvas = document.createElement('canvas')
    const gl = (canvas.getContext('webgl2') ??
      canvas.getContext('webgl')) as WebGLRenderingContext | null
    if (!gl) {
      software = true
      return software
    }
    const info = gl.getExtension('WEBGL_debug_renderer_info')
    const renderer = String(
      info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
    )
    gl.getExtension('WEBGL_lose_context')?.loseContext()
    software = /swiftshader|llvmpipe|softpipe|software|mesa offscreen/i.test(renderer)
  } catch {
    software = false
  }
  return software
}
/** For tests and diagnostics. */
export function setSoftwareRendererForTests(value: boolean | null) {
  software = value
}
/**
 * Pixel ratio actually used for the canvas: on a software rasterizer the cost is the number
 * of pixels, so every preset renders at half resolution there and the UI stays responsive.
 */
export function renderPixelRatio(
  q: Quality,
  isSoftware = softwareRenderer(),
  deviceRatio = typeof window === 'undefined'
    ? PRESETS[q].maxPixelRatio
    : window.devicePixelRatio || 1,
): number {
  const cap = PRESETS[q].maxPixelRatio
  return isSoftware ? Math.min(cap, 0.5) : Math.min(cap, deviceRatio)
}
/** One step down (high → balanced → eco), or null when already at the floor. */
export function lowerQuality(q: Quality): Quality | null {
  return q === 'high' ? 'balanced' : q === 'balanced' ? 'eco' : null
}
/** Frames slower than this, sustained, trigger an automatic step down (software renderers excepted). */
export const SLOW_FRAME_FPS = 24
/** Above this, sustained for a minute, the preset may climb back towards the device's level. */
export const FAST_FRAME_FPS = 50
export function raiseQuality(q: Quality): Quality | null {
  return q === 'eco' ? 'balanced' : q === 'balanced' ? 'high' : null
}
/**
 * Adaptive quality with hysteresis. Fed one FPS reading per check (every 3 s): three slow
 * checks in a row step the preset down; twenty fast checks in a row (one minute) step it
 * back up, never above the ceiling the device or the player chose, and never within a
 * minute of a step down. A software rasterizer keeps the old 6 FPS floor: it cannot reach
 * 24 FPS whatever the preset, and dropping it further only blurs the picture.
 */
export class QualityGovernor {
  private slow = 0
  private fast = 0
  private sinceDown = Number.POSITIVE_INFINITY
  constructor(
    public ceiling: Quality,
    private software = false,
    private slowChecks = 3,
    private fastChecks = 20,
  ) {}
  /** Returns the preset to switch to, or null to keep the current one. */
  sample(fps: number, current: Quality): Quality | null {
    // Explicit profiling control; normal sessions retain automatic adaptation.
    if (
      typeof window !== 'undefined' &&
      (window as unknown as { __LOME_PERF_LOCK_QUALITY?: boolean }).__LOME_PERF_LOCK_QUALITY
    )
      return null
    if (!(fps > 0)) return null
    this.sinceDown += 1
    const floor = this.software ? 6 : SLOW_FRAME_FPS
    if (fps < floor) {
      this.fast = 0
      this.slow += 1
      if (this.slow < this.slowChecks) return null
      this.slow = 0
      this.sinceDown = 0
      return lowerQuality(current)
    }
    this.slow = 0
    if (fps >= FAST_FRAME_FPS && this.sinceDown >= this.fastChecks) {
      this.fast += 1
      if (this.fast < this.fastChecks) return null
      this.fast = 0
      const up = raiseQuality(current)
      return up && order(up) <= order(this.ceiling) ? up : null
    }
    this.fast = 0
    return null
  }
}
const order = (q: Quality) => (q === 'eco' ? 0 : q === 'balanced' ? 1 : 2)

export function rememberQuality(q: Quality) {
  try {
    window.localStorage.setItem(STORAGE_KEY, q)
  } catch {
    /* storage blocked */
  }
}
