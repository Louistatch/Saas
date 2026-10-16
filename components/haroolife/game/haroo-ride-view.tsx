'use client'

import { RideWorld } from '@/lib/haroolife/game/render/ride-world'
/**
 * React boundary of the HarooLife trip scene: one `RideWorld` per mount, disposed on unmount.
 * The overlay (boulevard, destination, « Passer ») stays in `RideOverlay`.
 */
import type { Transport } from '@/lib/haroolife/lome-life-engine'
import { useEffect, useRef, useState } from 'react'

export default function HarooRideView(props: {
  transport: Transport
  rain: boolean
  pixelRatio: number
  avatarModel?: string
  avatarPagne?: string
  onFrame?: (s: { drawCalls: number; fps: number }) => void
}) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [attempt, setAttempt] = useState(0)
  const live = useRef(props)
  live.current = props
  const { transport, rain, pixelRatio, avatarModel, avatarPagne } = props
  // biome-ignore lint/correctness/useExhaustiveDependencies: attempt recreates the failed scene when the player retries.
  useEffect(() => {
    const c = canvas.current
    if (!c) return
    let active = true
    setLoading(true)
    setError(null)
    const w = new RideWorld({
      canvas: c,
      transport,
      rain,
      pixelRatio,
      avatarModel,
      avatarPagne,
      onFrame: (s) => live.current.onFrame?.(s),
    })
    w.init()
      .then(() => {
        if (active) setLoading(false)
      })
      .catch((e: unknown) => {
        if (active) {
          setLoading(false)
          setError(e instanceof Error ? e.message : 'Le trajet 3D ne peut pas être chargé.')
        }
      })
    return () => {
      active = false
      w.dispose()
    }
  }, [transport, rain, pixelRatio, avatarModel, avatarPagne, attempt])
  return (
    <div className="relative h-full w-full" data-engine="haroo" data-scene="ride">
      {loading && (
        <output className="absolute left-1/2 top-1/2 -translate-x-1/2 rounded-2xl bg-white/95 p-3 text-sm font-bold text-slate-800">
          Préparation du trajet…
        </output>
      )}
      {error && (
        <div
          role="alert"
          className="absolute inset-x-5 top-1/2 rounded-2xl bg-white p-4 text-sm text-slate-800"
        >
          <p>{error}</p>
          <button
            type="button"
            onClick={() => setAttempt((n) => n + 1)}
            className="mt-3 rounded-xl bg-emerald-700 px-4 py-2 font-bold text-white"
          >
            Réessayer
          </button>
        </div>
      )}
      <canvas ref={canvas} className="block h-full w-full" aria-label="Trajet : scène 3D" />
    </div>
  )
}
