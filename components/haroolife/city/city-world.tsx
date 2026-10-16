'use client'

import type { AdCampaign, AdPlacement } from '@/lib/haroolife/ads/campaigns'
import type { ServiceCustomer } from '@/lib/haroolife/city/automatic-service'
import type { ExposureTracker } from '@/lib/haroolife/ads/exposure'
import { type Npc, type NpcAnim, type Prop, layoutFor } from '@/lib/haroolife/city/interiors'
import type { Interior } from '@/lib/haroolife/city/life'
import { LOCALITIES, type LocalityId } from '@/lib/haroolife/city/locality'
import { bump } from '@/lib/haroolife/city/perf'
import type { InputState, PlayerController } from '@/lib/haroolife/city/player'
import { type Quality, renderPixelRatio } from '@/lib/haroolife/city/quality'
import { type Category, ESTATE, type Lot, inEstate, lotById } from '@/lib/haroolife/city/world'
import type { RendererId } from '@/lib/haroolife/engine/types'
import type {
  StreetFare,
  StreetPoseFeed,
  StreetStats,
} from '@/lib/haroolife/game/render/street-world'
import type { Transport } from '@/lib/haroolife/lome-life-engine'
import type { PresenceEntry } from '@/lib/haroolife/realtime/protocol'
import type { City } from '@/lib/haroolife/townsmen-engine'
/**
 * The game's scene, by situation: the street around the player, the clear map, a trip, or an
 * interior. Every one is drawn by the HarooLife engine (imperative Three.js), each in its own
 * chunk and canvas, one at a time. No PlayCanvas anywhere: the street, its map, the rooms and
 * the trips are all Three.js.
 */
import dynamic from 'next/dynamic'
import { useMemo } from 'react'

export { CAMERA_HOME, type CameraState } from '@/lib/haroolife/city/geometry'
import type { CameraState } from '@/lib/haroolife/city/geometry'

// Each renderer is its own chunk, downloaded when its scene is first shown.
const InteriorThree = dynamic(() => import('../engine-three/interior-three'), { ssr: false })
const HarooRoomView = dynamic(() => import('../game/haroo-room-view'), { ssr: false })
const HarooStreetView = dynamic(() => import('../game/haroo-street-view'), { ssr: false })
const HarooRideView = dynamic(() => import('../game/haroo-ride-view'), { ssr: false })
const CityMap = dynamic(() => import('../game/city-map'), { ssr: false })

/** The player's adult skinned avatar. */
export const PLAYER_MODEL = 'afi'

/** Sun, sky and ambient light for an hour of the day. */
export function daylight(hour: number) {
  const t = Math.max(0, Math.sin(((hour - 6) / 12) * Math.PI)) // 0 at night, 1 at noon
  const dawn = hour >= 5 && hour <= 8 ? 1 - Math.abs(hour - 6.5) / 1.5 : 0
  const dusk = hour >= 17 && hour <= 20 ? 1 - Math.abs(hour - 18.5) / 1.5 : 0
  const warm = Math.max(0, dawn, dusk)
  const mix = (
    a: [number, number, number],
    b: [number, number, number],
    k: number,
  ): [number, number, number] => [
    a[0] + (b[0] - a[0]) * k,
    a[1] + (b[1] - a[1]) * k,
    a[2] + (b[2] - a[2]) * k,
  ]
  // Night floor: dark enough to read as night, bright enough that the city stays legible on a
  // phone screen outdoors (measured on a Motorola at 21h: buildings were nearly black).
  const night: [number, number, number] = [0.23, 0.31, 0.48]
  const day: [number, number, number] = [0.62, 0.82, 0.91]
  const gold: [number, number, double] = [0.96, 0.68, 0.45] as unknown as [number, number, number]
  let sky = mix(night, day, Math.min(1, t * 1.6))
  sky = mix(sky, gold as unknown as [number, number, number], warm * 0.7)
  const hex = (c: [number, number, number]) =>
    `#${c
      .map((v) =>
        Math.round(Math.min(1, Math.max(0, v)) * 255)
          .toString(16)
          .padStart(2, '0'),
      )
      .join('')}`
  const sun = 0.65 + t * 0.35
  const sunColor = hex(
    mix([0.8, 0.85, 1], mix([1, 1, 0.96], [1, 0.78, 0.55], warm), Math.min(1, t * 2)),
  )
  const ambient = hex(mix([0.4, 0.46, 0.56], [0.5, 0.55, 0.6], Math.min(1, t * 1.8)))
  return { sky: hex(sky), sun, sunColor, ambient, night: t < 0.08 }
}
type double = number

export default function CityWorld({
  city,
  onTile,
  controller,
  onPlayerEvents,
  avatarModel = PLAYER_MODEL,
  avatarPagne,
  camera,
  hour,
  interior,
  interiorTitle,
  interiorLot,
  activity,
  onUseProp,
  approach,
  onTalk,
  onNotice,
  ride,
  onCell,
  onLotIcon,
  onPlayer,
  fare,
  onHail,
  onVehicle,
  filter,
  selectedLot,
  showNames = false,
  onStats,
  onFrame,
  quality = 'balanced',
  locality = 'lome',
  remoteFeed,
  remotePresent,
  ads,
  renderer = 'haroo',
  input,
  onLeave,
  mapView = false,
}: {
  city: City
  /** A cell of the player's estate was touched (local coordinates). */
  onTile: (x: number, y: number) => void
  /** The continuous player controller: the street engine steps it and draws the player. */
  controller: PlayerController
  onPlayerEvents: (events: ReturnType<PlayerController['drain']>, c: PlayerController) => void
  /** The player's chosen look: Kenney model and pagne colour (also used indoors). */
  avatarModel?: string
  avatarPagne?: string
  /** Other players in this locality (realtime relay), interpolated between snapshots. */
  remoteFeed?: StreetPoseFeed
  remotePresent?: PresenceEntry[]
  /** Street billboards (M2): campaigns, exposure statistics, the support the player stands by. */
  ads?: {
    campaigns: AdCampaign[]
    tracker: ExposureTracker
    onNear: (p: { placement: AdPlacement; campaign: AdCampaign } | null) => void
  }
  /** Camera state of the game (the interiors' viewing angle). */
  camera: CameraState
  hour: number
  interior: Interior | null
  interiorTitle: string
  interiorLot?: Lot
  activity: { prop: string; anim: NpcAnim } | null
  onUseProp: (p: Prop) => void
  /** HUD activity button: walk to that equipment, then use it (Three interiors). */
  approach?: { prop: string; n: number } | null
  onTalk?: (npc: Npc) => void
  onNotice?: (message: string) => void
  ride: { transport: Transport; rain: boolean } | null
  onCell: (cell: { x: number; y: number }) => void
  onLotIcon: (lot: Lot) => void
  /** Another player was touched in the street (their presence key). */
  onPlayer?: (key: string) => void
  /** The vehicle and the driver's fare (zémidjan or taxi job). */
  fare?: StreetFare | null
  /** A passer-by close enough to climb on (or null). */
  onHail?: (customer: ServiceCustomer | null) => void
  onVehicle?: () => void
  filter: Category | 'all'
  selectedLot: Lot | null
  /** Map view: write every place's name (by priority, without overlaps); off by default. */
  showNames?: boolean
  /** Building tiles loaded around the player (chunks, buildings, triangles). */
  onStats?: (s: StreetStats) => void
  onFrame?: (s: { drawCalls: number; fps: number }) => void
  quality?: Quality
  /** Town on screen; the estate is drawn only where it exists (Lomé). */
  locality?: LocalityId
  /** Renderer of the interiors: the HarooLife engine or React Three Fiber. */
  renderer?: RendererId
  /** Joystick and keyboard input, read by renderers that let the player walk indoors. */
  input?: InputState
  /** Leave the current building (walking out of the door in the Three interiors). */
  onLeave?: () => void
  mapView?: boolean
}) {
  bump('world')
  const hasEstate = LOCALITIES[locality].estate !== null
  const light = useMemo(() => daylight(mapView ? 10 : hour), [hour, mapView])
  const pixelRatio = renderPixelRatio(quality)
  // Interiors walked with the joystick: the HarooLife engine, or React Three Fiber with
  // ?engine=three.
  const room = !ride && interior ? renderer : null

  return (
    <div
      className="relative h-full w-full touch-none overflow-hidden"
      style={{ background: light.sky }}
      data-testid="city-world"
    >
      {ride && (
        <div className="absolute inset-0" data-renderer="haroo">
          <HarooRideView
            transport={ride.transport}
            rain={ride.rain}
            avatarModel={avatarModel}
            avatarPagne={avatarPagne}
            pixelRatio={pixelRatio}
            onFrame={onFrame}
          />
        </div>
      )}
      {room === 'haroo' && interior && input && (
        <div className="absolute inset-0" data-renderer="haroo">
          <HarooRoomView
            key={`${interior}:${interiorLot?.id ?? 'home'}`}
            interior={interior}
            layout={layoutFor(interior, interiorLot)}
            title={interiorTitle}
            angle={camera.angle}
            activity={activity}
            playerModel={avatarModel}
            playerPagne={avatarPagne}
            onUse={onUseProp}
            approach={approach}
            onTalk={onTalk}
            onNotice={onNotice}
            input={input}
            onLeave={onLeave ?? (() => {})}
            onFrame={onFrame}
            pixelRatio={pixelRatio}
          />
        </div>
      )}
      {room === 'three' && interior && input && (
        <div className="absolute inset-0" data-renderer="three">
          <InteriorThree
            layout={layoutFor(interior, interiorLot)}
            title={interiorTitle}
            angle={camera.angle}
            activity={activity}
            playerModel={avatarModel}
            playerPagne={avatarPagne}
            onUse={onUseProp}
            approach={approach}
            onTalk={onTalk}
            onNotice={onNotice}
            input={input}
            onLeave={onLeave ?? (() => {})}
            onFrame={onFrame}
            pixelRatio={pixelRatio}
          />
        </div>
      )}
      {!ride && !interior && !mapView && (
        <div className="absolute inset-0" data-renderer="haroo">
          <HarooStreetView
            controller={controller}
            avatarModel={avatarModel}
            avatarPagne={avatarPagne}
            estate={hasEstate ? city.buildings : []}
            pixelRatio={pixelRatio}
            locality={locality}
            ads={ads && ads.campaigns.length > 0 ? ads : null}
            remoteFeed={remoteFeed}
            remotePresent={remotePresent}
            onPlayerEvents={onPlayerEvents}
            onLot={(id) => {
              const lot = lotById(id)
              if (lot) onLotIcon(lot)
            }}
            onCell={(cell) => {
              // The player's own estate: its cells go to the estate handler (local cells).
              if (hasEstate && inEstate(cell.x, cell.y))
                onTile(cell.x - ESTATE.x0, cell.y - ESTATE.y0)
              else onCell(cell)
            }}
            onFrame={onFrame}
            onStats={onStats}
            onPlayer={onPlayer}
            light={light}
            fare={fare}
            onHail={onHail}
            onVehicle={onVehicle}
          />
        </div>
      )}
      {!ride && !interior && mapView && (
        <CityMap
          locality={locality}
          filter={filter}
          showNames={showNames}
          selectedLot={selectedLot}
          player={controller.cell}
          onLot={onLotIcon}
        />
      )}
    </div>
  )
}
