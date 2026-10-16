export type ScreenMarker = { id: string; x: number; y: number; priority: number }
/** Keep every 44 px touch target clear; equipment wins over a neighbouring conversation. */
export function placeScreenMarkers(markers: ScreenMarker[], width: number, height: number) {
  const placed = new Map<string, { x: number; y: number }>()
  const free = (x: number, y: number) =>
    ![...placed.values()].some((p) => Math.abs(p.x - x) < 48 && Math.abs(p.y - y) < 48)
  for (const marker of [...markers].sort((a, b) => a.priority - b.priority)) {
    search: for (const radius of [0, 48, 80, 112, 144]) {
      const steps = radius ? 16 : 1
      for (let n = 0; n < steps; n++) {
        const angle = (n * Math.PI * 2) / steps
        const x = Math.max(24, Math.min(width - 24, marker.x + Math.cos(angle) * radius))
        const y = Math.max(24, Math.min(height - 24, marker.y - 22 + Math.sin(angle) * radius))
        if (free(x, y)) {
          placed.set(marker.id, { x, y })
          break search
        }
      }
    }
  }
  return placed
}
