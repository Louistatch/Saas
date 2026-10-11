/**
 * Graphics quality presets. Chosen automatically from the device (memory, cores, screen)
 * and adjustable by the player; persisted locally. Each preset bounds what the renderer
 * does: render resolution (device pixel ratio cap), anti-aliasing, how far detailed chunks
 * reach, and how many animated characters and vehicles may be alive at once.
 */
export type Quality = 'eco' | 'balanced' | 'high'
export interface QualityPreset {
  id: Quality
  label: string
  hint: string
  /** Upper bound on the device pixel ratio used for the canvas. */
  maxPixelRatio: number
  antialias: boolean
  /** Chunk rings: detailed (baked models), medium (main models only), far (volumes). */
  nearRing: number
  midRing: number
  farRing: number
  /** Animated (skinned) characters allowed in the city view, and total pedestrians. */
  maxAnimated: number
  maxWalkers: number
  /** Vehicles kept alive around the camera. */
  vehicleRadius: number
  /** Second fill light on or off. */
  fillLight: boolean
}
export const PRESETS: Record<Quality, QualityPreset> = {
  eco: {
    id: 'eco',
    label: 'Économie',
    hint: 'Faible consommation : résolution réduite, moins de personnages.',
    maxPixelRatio: 1,
    antialias: false,
    nearRing: 1,
    midRing: 1,
    farRing: 2,
    maxAnimated: 4,
    maxWalkers: 8,
    vehicleRadius: 16,
    fillLight: false,
  },
  balanced: {
    id: 'balanced',
    label: 'Équilibré',
    hint: 'Fluidité d’abord : résolution limitée à 1,5×, détails à proximité.',
    maxPixelRatio: 1.5,
    antialias: true,
    nearRing: 1,
    midRing: 2,
    farRing: 3,
    maxAnimated: 8,
    maxWalkers: 14,
    vehicleRadius: 22,
    fillLight: false,
  },
  high: {
    id: 'high',
    label: 'Élevé',
    hint: 'Qualité renforcée : résolution native, plus de personnages et de détails.',
    maxPixelRatio: 2,
    antialias: true,
    nearRing: 2,
    midRing: 3,
    farRing: 4,
    maxAnimated: 14,
    maxWalkers: 20,
    vehicleRadius: 26,
    fillLight: true,
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
export function rememberQuality(q: Quality) {
  try {
    window.localStorage.setItem(STORAGE_KEY, q)
  } catch {
    /* storage blocked */
  }
}
