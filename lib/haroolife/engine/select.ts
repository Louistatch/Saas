/**
 * Which renderer draws the interiors (the street, its map and the trips are always drawn by the
 * HarooLife engine). Order: `?engine=` in the address (remembered on this device), then the remembered
 * choice, then NEXT_PUBLIC_HAROOLIFE_ENGINE, then the default.
 *
 * - `haroo` (default): the HarooLife engine (imperative Three.js) draws every interior.
 * - `three`: legacy R3F preference, kept for compatibility. Furnished game rooms use the
 *   common interaction controller via `rendererForInterior`; the R3F components stay available.
 * A remembered `playcanvas` choice (engine removed) falls back to the default.
 */
import type { RendererId } from './types'

export const ENGINE_STORAGE = 'haroolife.engine'
/** Renderer used when nothing else decides. */
export const DEFAULT_RENDERER: RendererId = 'haroo'

/** All furnished interiors share reachable bubbles, posture and meals. The remembered
 * renderer choice remains available to the standalone R3F prototype; saves are untouched. */
export function rendererForInterior(_renderer: RendererId, _interior: string): RendererId {
  return 'haroo'
}

const parse = (v: string | null | undefined): RendererId | null =>
  v === 'haroo' || v === 'three' ? v : null

export function resolveRenderer(
  search: string,
  stored: string | null,
  env: string | undefined,
): { renderer: RendererId; remember: RendererId | null } {
  const asked = parse(new URLSearchParams(search).get('engine'))
  if (asked) return { renderer: asked, remember: asked }
  return { renderer: parse(stored) ?? parse(env) ?? DEFAULT_RENDERER, remember: null }
}

/** Browser side: reads the address and storage, remembers an explicit choice. */
export function currentRenderer(): RendererId {
  if (typeof window === 'undefined') return DEFAULT_RENDERER
  let stored: string | null = null
  try {
    stored = window.localStorage.getItem(ENGINE_STORAGE)
  } catch {
    stored = null
  }
  const { renderer, remember } = resolveRenderer(
    window.location.search,
    stored,
    process.env.NEXT_PUBLIC_HAROOLIFE_ENGINE,
  )
  if (remember) {
    try {
      window.localStorage.setItem(ENGINE_STORAGE, remember)
    } catch {
      /* private mode: the choice lasts for this page only */
    }
  }
  return renderer
}
