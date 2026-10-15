'use client'

/**
 * React boundary of the HarooLife engine for the street. The engine (`StreetWorld`) draws the
 * neighbourhood and steps the game's PlayerController; React keeps the HUD and the game state.
 * One engine per mount, disposed on unmount.
 */
import type { PlayerController } from '@/lib/haroolife/city/player'
import { StreetWorld } from '@/lib/haroolife/game/render/street-world'
import type { Building } from '@/lib/haroolife/townsmen-engine'
import { useEffect, useRef, useState } from 'react'

export default function HarooStreetView(props: {
  controller: PlayerController
  avatarModel: string
  avatarPagne?: string
  estate: readonly Building[]
  pixelRatio: number
  onPlayerEvents: (events: ReturnType<PlayerController['drain']>, c: PlayerController) => void
  onLot: (lotId: string) => void
  onCell: (cell: { x: number; y: number }) => void
  onFrame?: (s: { drawCalls: number; fps: number }) => void
}) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const markers = useRef<HTMLDivElement>(null)
  const world = useRef<StreetWorld | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')
  const live = useRef(props)
  live.current = props

  const { controller, avatarModel, avatarPagne, pixelRatio, estate } = props
  // biome-ignore lint/correctness/useExhaustiveDependencies: the estate is pushed below without remounting
  useEffect(() => {
    const c = canvas.current
    const m = markers.current
    if (!c || !m) return
    setState('loading')
    const w = new StreetWorld({
      canvas: c,
      markers: m,
      controller,
      avatarModel,
      pagne: avatarPagne,
      estate: live.current.estate,
      pixelRatio,
      events: {
        onEvents: (events, ctl) => live.current.onPlayerEvents(events, ctl),
        onLot: (id) => live.current.onLot(id),
        onCell: (cell) => live.current.onCell(cell),
        onReady: () => setState('ready'),
        onError: () => setState('error'),
        onFrame: (s) => live.current.onFrame?.(s),
      },
    })
    world.current = w
    w.init().catch(() => setState('error'))
    return () => {
      world.current = null
      w.dispose()
    }
  }, [controller, avatarModel, avatarPagne, pixelRatio])
  useEffect(() => {
    if (state === 'ready') world.current?.setEstate(estate)
  }, [estate, state])

  return (
    <div className="relative h-full w-full" data-engine="haroo" data-scene="street">
      <canvas ref={canvas} className="block h-full w-full touch-none" aria-label="Rue : scène 3D" />
      <div ref={markers} className="pointer-events-none absolute inset-0 overflow-hidden" />
      {state === 'loading' && (
        <p className="pointer-events-none absolute inset-x-0 top-1/2 text-center text-sm text-[#253834]">
          Chargement du quartier…
        </p>
      )}
      {state === 'error' && (
        <p
          role="alert"
          className="absolute inset-x-4 top-1/3 rounded-xl bg-[#f7f8f1] p-4 text-center text-sm text-[#253834] shadow"
        >
          Le quartier n’a pas pu être affiché. Rechargez la page pour réessayer.
        </p>
      )}
    </div>
  )
}
