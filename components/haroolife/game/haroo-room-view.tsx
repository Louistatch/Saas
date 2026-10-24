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
import { type PlacedFurniture, furnitureHotspots } from '@/lib/haroolife/game/core/furnish'
import type { Point } from '@/lib/haroolife/game/core/pathfind'
import { sceneFor } from '@/lib/haroolife/game/core/scene'
import { type PlacingGhost, RoomWorld } from '@/lib/haroolife/game/render/room-world'
import { useEffect, useMemo, useRef, useState } from 'react'

export default function HarooRoomView(
  props: InteriorViewProps & {
    /** Interior id (`house`, `gym`, `market`…): the house is the prototype's scene. */
    interior: string
    pixelRatio: number
    onFrame?: (s: { drawCalls: number; fps: number }) => void
    /** The furniture bought and placed in the player's house (« Aménager »). */
    furniture?: readonly PlacedFurniture[]
    /** The piece being placed, previewed in green or red; taps on the floor then move it. */
    placing?: PlacingGhost | null
    onFloorTap?: (p: Point) => void
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
      pixelRatio: live.current.pixelRatio,
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
        onFloorTap: (p) => live.current.onFloorTap?.(p),
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
  }, [scene, playerModel, playerPagne, input])
  useEffect(() => {
    world.current?.setPixelRatio(pixelRatio)
  }, [pixelRatio])

  // The furniture of the house, and the preview of the piece being placed.
  const furniture = props.furniture
  const furnitureSpots = useMemo(
    () => (furniture?.length ? furnitureHotspots(furniture, scene) : []),
    [furniture, scene],
  )
  useEffect(() => {
    if (state === 'ready') world.current?.setFurnishing(furniture ?? [], furnitureSpots)
  }, [furniture, furnitureSpots, state])
  const placing = props.placing ?? null
  useEffect(() => {
    if (state === 'ready') world.current?.setPlacing(placing)
  }, [placing, state])

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

  // Seats used only by meals have no bubble: they are not offered in the guide either.
  const spots = [...scene.hotspots, ...furnitureSpots].filter((h) => !h.hidden)
  return (
    <div className="relative h-full w-full" data-engine="haroo" data-scene={scene.id}>
      <canvas
        ref={canvas}
        className="block h-full w-full touch-none"
        aria-label={`${props.title} : scène 3D`}
      />
      <div ref={markers} className="pointer-events-none absolute inset-0 overflow-hidden" />
      {state === 'ready' && (
        // Open, the list reaches the needs card of the controls (z-20): it goes above it so that
        // its last bubbles (« Sortir ») stay touchable; the dock and the sheets remain on top.
        <div
          className={`pointer-events-auto absolute left-3 right-3 top-[152px] max-w-sm ${guide ? 'z-[25]' : 'z-10'}`}
          data-testid="room-guide"
        >
          <button
            type="button"
            aria-expanded={guide}
            onClick={() => setGuide((v) => !v)}
            className="min-h-11 rounded-2xl bg-white/95 px-4 py-2 text-left text-xs font-bold text-emerald-950 shadow"
          >
            🧭 {guide ? 'Fermer le guide' : 'Objets et personnes'} · {spots.length - 1}
          </button>
          {guide && (
            <div className="mt-2 max-h-[34vh] space-y-1 overflow-y-auto overscroll-contain rounded-2xl bg-white/95 p-2 shadow-lg">
              <p className="px-2 py-1 text-xs text-slate-600">
                Choisis une bulle : tu rejoins son objet avant d’agir.
              </p>
              {spots.map((h) => (
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
