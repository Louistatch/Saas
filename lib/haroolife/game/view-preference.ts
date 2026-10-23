/**
 * How the street is seen: « classique » (the three-quarter view from above, the default) or
 * « libre » (the chase camera behind the player, free-camera.ts). A per-device choice, kept in
 * localStorage and announced to the street view by a window event, so the settings in the phone
 * do not need to be wired through the game's state.
 */
export type StreetView = 'classic' | 'free'

export const VIEW_KEY = 'haroolife.view'
export const VIEW_EVENT = 'haroolife:view'

export function savedView(): StreetView {
  try {
    return localStorage.getItem(VIEW_KEY) === 'free' ? 'free' : 'classic'
  } catch {
    return 'classic'
  }
}

export function rememberView(view: StreetView): void {
  try {
    localStorage.setItem(VIEW_KEY, view)
  } catch {
    /* blocked storage: the choice lasts until the page is closed */
  }
  window.dispatchEvent(new CustomEvent<StreetView>(VIEW_EVENT, { detail: view }))
}

export function onViewChange(listener: (view: StreetView) => void): () => void {
  const handle = (e: Event) => listener((e as CustomEvent<StreetView>).detail)
  window.addEventListener(VIEW_EVENT, handle)
  return () => window.removeEventListener(VIEW_EVENT, handle)
}
