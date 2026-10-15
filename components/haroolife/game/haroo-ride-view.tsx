'use client'

import { RideWorld } from '@/lib/haroolife/game/render/ride-world'
/**
 * React boundary of the HarooLife trip scene: one `RideWorld` per mount, disposed on unmount.
 * The overlay (boulevard, destination, « Passer ») stays in `RideOverlay`.
 */
import type { Transport } from '@/lib/haroolife/lome-life-engine'
import { useEffect, useRef } from 'react'

export default function HarooRideView(props: {
  transport: Transport
  rain: boolean
  pixelRatio: number
  onFrame?: (s: { drawCalls: number; fps: number }) => void
}) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const live = useRef(props)
  live.current = props
  const { transport, rain, pixelRatio } = props
  useEffect(() => {
    const c = canvas.current
    if (!c) return
    const w = new RideWorld({
      canvas: c,
      transport,
      rain,
      pixelRatio,
      onFrame: (s) => live.current.onFrame?.(s),
    })
    w.init().catch(() => undefined)
    return () => w.dispose()
  }, [transport, rain, pixelRatio])
  return (
    <div className="relative h-full w-full" data-engine="haroo" data-scene="ride">
      <canvas ref={canvas} className="block h-full w-full" aria-label="Trajet : scène 3D" />
    </div>
  )
}
