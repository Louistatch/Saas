'use client'

/**
 * React boundary of the cabin scene (coach, city bus or plane): one `CabinWorld` per mount,
 * disposed on unmount. Nothing is shown when the scene cannot load: the journey card stays.
 */
import { type CabinMode, CabinWorld } from '@/lib/haroolife/game/render/cabin-world'
import { useEffect, useRef, useState } from 'react'

export default function HarooCabinView({
  mode,
  hour,
  pixelRatio,
  avatarModel,
  avatarPagne,
  onReady,
}: {
  mode: CabinMode
  hour: number
  pixelRatio: number
  avatarModel?: string
  avatarPagne?: string
  /** The cabin is drawn (or could not be): the trip's time by the window starts. */
  onReady?: () => void
}) {
  const ready = useRef(onReady)
  ready.current = onReady
  const canvas = useRef<HTMLCanvasElement>(null)
  const [failed, setFailed] = useState(false)
  // The hour only picks day or night when the trip starts: no rebuild while seated.
  const night = hour < 6 || hour >= 19
  useEffect(() => {
    const c = canvas.current
    if (!c) return
    let active = true
    let world: CabinWorld | null = null
    try {
      world = new CabinWorld({
        canvas: c,
        mode,
        hour: night ? 22 : 12,
        pixelRatio,
        avatarModel,
        avatarPagne,
      })
      world
        .init()
        .then(() => active && ready.current?.())
        .catch(() => {
          if (!active) return
          setFailed(true)
          ready.current?.()
        })
    } catch {
      setFailed(true)
      ready.current?.()
    }
    return () => {
      active = false
      world?.dispose()
    }
  }, [mode, night, pixelRatio, avatarModel, avatarPagne])
  if (failed) return null
  return (
    <canvas
      ref={canvas}
      data-testid="cabin"
      data-mode={mode}
      aria-label={mode === 'plane' ? 'Dans l’avion : scène 3D' : 'Dans le car : scène 3D'}
      className="absolute inset-0 block h-full w-full"
    />
  )
}
