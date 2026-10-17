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
  const [guide, setGuide] = useState(false)
  const [target, setTarget] = useState<string | null>(null)
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
        onTarget: setTarget,
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
      {state === 'ready' && (
        <div
          className="pointer-events-auto absolute left-3 right-3 top-[152px] z-10 max-w-sm"
          data-testid="room-guide"
        >
          <button
            type="button"
            aria-expanded={guide}
            onClick={() => setGuide((v) => !v)}
            className="min-h-11 rounded-2xl bg-white/95 px-4 py-2 text-left text-xs font-bold text-emerald-950 shadow"
          >
            🧭 {guide ? 'Fermer le guide' : 'Objets et personnes'} · {scene.hotspots.length - 1}
          </button>
          {guide && (
            <div className="mt-2 max-h-[34vh] space-y-1 overflow-y-auto overscroll-contain rounded-2xl bg-white/95 p-2 shadow-lg">
              <p className="px-2 py-1 text-xs text-slate-600">
                Choisis une bulle : tu rejoins son objet avant d’agir.
              </p>
              {scene.hotspots.map((h) => (
                <button
                  key={h.id}
                  type="button"
                  onClick={() => {
                    setGuide(false)
                    world.current?.approach(h.id)
                  }}
                  className="flex min-h-11 w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-xs font-semibold text-slate-800 hover:bg-emerald-50"
                >
                  <span aria-hidden>{h.icon}</span>
                  <span>{h.label}</span>
                </button>
              ))}
            </div>
          )}
          {!guide && target && (
            <output className="mt-2 block rounded-xl bg-emerald-950/90 px-3 py-2 text-xs font-bold text-white">
              🚶 {target}
            </output>
          )}
        </div>
      )}
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
