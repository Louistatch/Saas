/**
 * Which renderer draws the scenes it supports (today: interiors; the street is always
 * PlayCanvas). Order: `?engine=` in the address (remembered on this device), then the remembered
 * choice, then NEXT_PUBLIC_HAROOLIFE_ENGINE, then the default.
 *
 * - `haroo` (default): the HarooLife engine (imperative Three.js) draws every interior.
 * - `three`: React Three Fiber for every interior (the previous default, the way back).
 * - `playcanvas`: PlayCanvas everywhere.
 */
import type { RendererId } from './types'

export const ENGINE_STORAGE = 'haroolife.engine'
/** Renderer used when nothing else decides. */
export const DEFAULT_RENDERER: RendererId = 'haroo'

const parse = (v: string | null | undefined): RendererId | null =>
  v === 'haroo' || v === 'three' || v === 'playcanvas' ? v : null

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

/**
 * Which engine draws the street. `haroo` (default): the HarooLife engine (`StreetWorld`) and its
 * clear map; `playcanvas`: the city as before, with its billboards, other players and taxi model
 * (the way back while the new street reaches them). `?street=` in the address is remembered on
 * this device, like `?engine=`.
 */
export type StreetEngine = 'haroo' | 'playcanvas'
export const STREET_STORAGE = 'haroolife.street'
export const DEFAULT_STREET: StreetEngine = 'haroo'
const parseStreet = (v: string | null | undefined): StreetEngine | null =>
  v === 'haroo' || v === 'playcanvas' ? v : null

export function resolveStreet(
  search: string,
  stored: string | null,
): { street: StreetEngine; remember: StreetEngine | null } {
  const asked = parseStreet(new URLSearchParams(search).get('street'))
  if (asked) return { street: asked, remember: asked }
  return { street: parseStreet(stored) ?? DEFAULT_STREET, remember: null }
}

export function currentStreet(): StreetEngine {
  if (typeof window === 'undefined') return DEFAULT_STREET
  let stored: string | null = null
  try {
    stored = window.localStorage.getItem(STREET_STORAGE)
  } catch {
    stored = null
  }
  const { street, remember } = resolveStreet(window.location.search, stored)
  if (remember) {
    try {
      window.localStorage.setItem(STREET_STORAGE, remember)
    } catch {
      /* private mode: the choice lasts for this page only */
    }
  }
  return street
}
