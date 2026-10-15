'use client'

/**
 * React boundary of the HarooLife engine for the house. React owns the DOM (canvas and the
 * marker layer) and the game state; the engine (`HouseWorld`) owns the scene, the player, the
 * animations, the camera, picking and its frame loop. One engine per mount: the effect creates
 * it and its cleanup disposes it, so strict-mode double mounting and route changes leave no
 * canvas context, listener or loop behind.
 *
 * The props are the renderer contract (`InteriorViewProps`): reaching an interaction point
 * hands the matching Saas prop to `onUse`, the game applies the effect and saves it.
 */
import type { Prop } from '@/lib/haroolife/city/interiors'
import type { InteriorViewProps } from '@/lib/haroolife/engine/types'
import { HouseWorld } from '@/lib/haroolife/game/render/house-world'
import { useEffect, useRef, useState } from 'react'

export default function HarooHouseView(
  props: InteriorViewProps & {
    pixelRatio: number
    onFrame?: (s: { drawCalls: number; fps: number }) => void
  },
) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const markers = useRef<HTMLDivElement>(null)
  const world = useRef<HouseWorld | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [error, setError] = useState<string | null>(null)
  // Latest callbacks, read by the engine's events (the engine is created once per mount).
  const live = useRef(props)
  live.current = props

  const { playerModel, playerPagne, input, pixelRatio } = props
  useEffect(() => {
    const c = canvas.current
    const m = markers.current
    if (!c || !m) return
    setState('loading')
    const w = new HouseWorld({
      canvas: c,
      markers: m,
      input,
      avatarModel: playerModel,
      pagne: playerPagne,
      pixelRatio,
      events: {
        onUse: (propId) => {
          const prop: Prop | undefined = live.current.layout.props.find((p) => p.id === propId)
          if (prop) live.current.onUse(prop)
        },
        onLeave: () => live.current.onLeave(),
        onNotice: (msg) => live.current.onNotice?.(msg),
        onReady: () => setState('ready'),
        onError: (msg) => {
          setError(msg)
          setState('error')
        },
        onFrame: (s) => live.current.onFrame?.(s),
      },
    })
    world.current = w
    w.init().catch((e: unknown) => {
      setError(e instanceof Error ? e.message : 'Chargement impossible.')
      setState('error')
    })
    return () => {
      world.current = null
      w.dispose()
    }
  }, [playerModel, playerPagne, input, pixelRatio])

  // The game's current activity (pose) and the HUD's walk-then-use requests.
  const { activity, approach } = props
  useEffect(() => {
    world.current?.setActivity(activity)
  }, [activity, state])
  useEffect(() => {
    if (approach && state === 'ready') world.current?.approach(approach.prop)
    // biome-ignore lint/correctness/useExhaustiveDependencies: `n` makes each request distinct
  }, [approach?.n, state])

  return (
    <div className="relative h-full w-full" data-engine="haroo">
      <canvas
        ref={canvas}
        className="block h-full w-full touch-none"
        aria-label={`${props.title} : scène 3D`}
      />
      <div ref={markers} className="pointer-events-none absolute inset-0 overflow-hidden" />
      {state === 'loading' && (
        <p className="pointer-events-none absolute inset-x-0 top-1/2 text-center text-sm text-[#253834]">
          Chargement de la maison…
        </p>
      )}
      {state === 'error' && (
        <p
          role="alert"
          className="absolute inset-x-4 top-1/3 rounded-xl bg-[#f7f8f1] p-4 text-center text-sm text-[#253834] shadow"
        >
          {error ?? 'La maison n’a pas pu être affichée.'} Rechargez la page pour réessayer.
        </p>
      )}
    </div>
  )
}
