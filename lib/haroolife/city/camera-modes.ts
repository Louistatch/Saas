/** Street camera choices exposed to the player. The city map has its own aerial camera. */
export type StreetCameraMode = 'close' | 'follow' | 'district'

export const CAMERA_MODE_STORAGE = 'haroolife.camera-mode'

export const STREET_CAMERA_MODES: Record<
  StreetCameraMode,
  { label: string; shortLabel: string; distance: number }
> = {
  close: { label: 'Vue proche', shortLabel: 'Proche', distance: 5 },
  follow: { label: 'Vue de suivi', shortLabel: 'Suivi', distance: 8 },
  district: { label: 'Vue du quartier', shortLabel: 'Quartier', distance: 14 },
}

const ORDER: StreetCameraMode[] = ['close', 'follow', 'district']

export function isStreetCameraMode(value: string | null): value is StreetCameraMode {
  return value === 'close' || value === 'follow' || value === 'district'
}

export function nextStreetCameraMode(mode: StreetCameraMode): StreetCameraMode {
  return ORDER[(ORDER.indexOf(mode) + 1) % ORDER.length]
}
