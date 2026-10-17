'use client'

/**
 * React boundary of the HarooLife engine for an interior. React owns the DOM (canvas and the
 * marker layer) and the game state; the engine (`RoomWorld`) owns the scene, the player, the
 * animations, the camera, picking and its frame loop. One engine per mount: the effect creates
 * it and its cleanup disposes it, so strict-mode double mounting and route changes leave no
 * canvas context, listener or loop behind.
 *
 * The props are the renderer contract (`InteriorViewProps`): reaching an interaction point
 * hands the matching Saas prop to `onUse` (or the character to `onTalk`), the game applies the
 * effect and saves it.
 */
import type { InteriorViewProps } from '@/lib/haroolife/engine/types'
import { sceneFor } from '@/lib/haroolife/game/core/scene'
import { RoomWorld } from '@/lib/haroolife/game/render/room-world'
import { useEffect, useMemo, useRef, useState } from 'react'

export default function HarooRoomView(
  props: InteriorViewProps & {
    /** Interior id (`house`, `gym`, `market`…): the house is the prototype's scene. */
    interior: string
    pixelRatio: number
    onFrame?: (s: { drawCalls: number; fps: number }) => void
  },
) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const markers = useRef<HTMLDivElement>(null)
  const world = useRef<RoomWorld | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [error, setError] = useState<string | null>(null)
  // Latest callbacks, read by the engine's events (the engine is created once per mount).
  const live = useRef(props)
  live.current = props

  const { interior, layout, playerModel, playerPagne, input, pixelRatio } = props
  const scene = useMemo(() => sceneFor(interior, layout), [interior, layout])
  useEffect(() => {
    const c = canvas.current
    const m = markers.current
    if (!c || !m) return
    setState('loading')
    const w = new RoomWorld({
      canvas: c,
      markers: m,
      input,
      avatarModel: playerModel,
      pagne: playerPagne,
      pixelRatio,
      scene,
      events: {
        onUse: (propId) => {
          const prop = live.current.layout.props.find((p) => p.id === propId)
          if (prop) live.current.onUse(prop)
        },
        onTalk: (npcId) => {
          const npc = live.current.layout.npcs.find((n) => n.id === npcId)
          if (npc) live.current.onTalk?.(npc)
        },
        onLeave: () => live.current.onLeave(),
        onNotice: (msg) => live.current.onNotice?.(msg),
        onReady: () => setState('ready'),
        onError: (msg) => {
          setError(msg)
          setState('error')
        },
        onFrame: (s) => live.current.onFrame?.(s),
        onMealReady: (id, seat) => live.current.onMealReady?.(id, seat),
        onMealFrame: (id, seconds) => live.current.onMealFrame?.(id, seconds),
        onActivityEnd: () => live.current.onActivityEnd?.(),
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
  }, [scene, playerModel, playerPagne, input, pixelRatio])

  // The game's current activity (pose) and the HUD's walk-then-use requests.
  const { activity, approach } = props
  useEffect(() => {
    if (state === 'ready') world.current?.setActivity(activity)
  }, [activity, state])
  useEffect(() => {
    if (state === 'ready') world.current?.setMeal(props.meal ?? null)
  }, [props.meal, state])
  useEffect(() => {
    if (approach && state === 'ready') world.current?.approach(approach.prop)
    // biome-ignore lint/correctness/useExhaustiveDependencies: `n` makes each request distinct
  }, [approach?.n, state])

  return (
    <div className="relative h-full w-full" data-engine="haroo" data-scene={scene.id}>
      <canvas
        ref={canvas}
        className="block h-full w-full touch-none"
        aria-label={`${props.title} : scène 3D`}
      />
      <div ref={markers} className="pointer-events-none absolute inset-0 overflow-hidden" />
      {state === 'loading' && (
        <p className="pointer-events-none absolute inset-x-0 top-1/2 text-center text-sm text-[#253834]">
          Chargement : {props.title}…
        </p>
      )}
      {state === 'error' && (
        <p
          role="alert"
          className="absolute inset-x-4 top-1/3 rounded-xl bg-[#f7f8f1] p-4 text-center text-sm text-[#253834] shadow"
        >
          {error ?? 'Ce lieu n’a pas pu être affiché.'} Rechargez la page pour réessayer.
        </p>
      )}
    </div>
  )
}
