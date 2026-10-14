/**
 * Which renderer draws the scenes it supports (today: interiors; the street is always
 * PlayCanvas). Order: `?engine=` in the address (remembered on this device), then the remembered
 * choice, then NEXT_PUBLIC_HAROOLIFE_ENGINE, then the default. The default is React Three Fiber
 * since the adult avatars: it is the interior where the player walks, collides and leaves by the
 * open side. `?engine=playcanvas` is the controlled way back and overwrites the remembered choice.
 */
import type { RendererId } from './types'

export const ENGINE_STORAGE = 'haroolife.engine'
/** Renderer used when nothing else decides. */
export const DEFAULT_RENDERER: RendererId = 'three'

const parse = (v: string | null | undefined): RendererId | null =>
  v === 'three' || v === 'playcanvas' ? v : null

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
