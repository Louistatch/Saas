'use client'

/**
 * React boundary of the HarooLife engine for the street. The engine (`StreetWorld`) draws the
 * neighbourhood and steps the game's PlayerController; React keeps the HUD and the game state.
 * One engine per mount, disposed on unmount.
 */
import type { PlayerController } from '@/lib/haroolife/city/player'
import type { ServiceCustomer } from '@/lib/haroolife/city/automatic-service'
import {
  type StreetAds,
  type StreetFare,
  type StreetPoseFeed,
  type StreetStats,
  StreetWorld,
} from '@/lib/haroolife/game/render/street-world'
import type { PresenceEntry } from '@/lib/haroolife/realtime/protocol'
import type { Building } from '@/lib/haroolife/townsmen-engine'
import { useEffect, useRef, useState } from 'react'

export default function HarooStreetView(props: {
  controller: PlayerController
  avatarModel: string
  avatarPagne?: string
  estate: readonly Building[]
  pixelRatio: number
  /** From the quality preset: shadow refresh and multisampling. */
  shadows?: 'full' | 'throttled' | 'off'
  antialias?: boolean
  /** Town on screen (billboard supports are per town). */
  locality: string
  /** Street billboards (campaigns, exposure, nearby support); null when switched off. */
  ads?: StreetAds | null
  /** Other players in this town (realtime relay). */
  remoteFeed?: StreetPoseFeed
  remotePresent?: PresenceEntry[]
  onPlayerEvents: (events: ReturnType<PlayerController['drain']>, c: PlayerController) => void
  onLot: (lotId: string) => void
  onCell: (cell: { x: number; y: number }) => void
  /** Another player was touched: their sheet (chat, block, report). */
  onPlayer?: (key: string) => void
  onFrame?: (s: { drawCalls: number; fps: number }) => void
  onStats?: (s: StreetStats) => void
  /** Daylight of the game's hour (sun 0.65 at night to 1 at noon). */
  light?: { sun: number; sunColor: string }
  /** The vehicle and the driver's fare (zémidjan or taxi). */
  fare?: StreetFare | null
  /** A passer-by close enough to climb on (or null). */
  onHail?: (customer: ServiceCustomer | null) => void
  onVehicle?: () => void
}) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const markers = useRef<HTMLDivElement>(null)
  const world = useRef<StreetWorld | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')
  const live = useRef(props)
  live.current = props

  const { controller, avatarModel, avatarPagne, pixelRatio, estate, locality, remoteFeed } = props
  const { shadows, antialias } = props
  const { ads, remotePresent, light, fare } = props
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
      shadows,
      antialias,
      locality,
      ads: live.current.ads ?? null,
      remote: remoteFeed ? { feed: remoteFeed, present: live.current.remotePresent ?? [] } : null,
      fare: live.current.fare ?? null,
      events: {
        onEvents: (events, ctl) => live.current.onPlayerEvents(events, ctl),
        onLot: (id) => live.current.onLot(id),
        onCell: (cell) => live.current.onCell(cell),
        onPlayer: (key) => live.current.onPlayer?.(key),
        onReady: () => setState('ready'),
        onError: () => setState('error'),
        onFrame: (s) => live.current.onFrame?.(s),
        onStats: (s) => live.current.onStats?.(s),
        onHail: (name) => live.current.onHail?.(name),
        onVehicle: () => live.current.onVehicle?.(),
      },
    })
    world.current = w
    if (live.current.light) w.setDaylight(live.current.light)
    w.init().catch(() => setState('error'))
    return () => {
      world.current = null
      w.dispose()
    }
  }, [controller, avatarModel, avatarPagne, pixelRatio, shadows, antialias, locality, remoteFeed])
  useEffect(() => {
    if (state === 'ready') world.current?.setEstate(estate)
  }, [estate, state])
  useEffect(() => {
    if (light) world.current?.setDaylight(light)
  }, [light])
  // Campaigns and presence change without rebuilding the street.
  useEffect(() => {
    if (state === 'ready') world.current?.setAds(ads ?? null)
  }, [ads, state])
  useEffect(() => {
    if (state === 'ready') world.current?.setPresent(remotePresent ?? [])
  }, [remotePresent, state])
  useEffect(() => {
    if (state === 'ready' && fare) world.current?.setFare(fare)
  }, [fare, state])

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
