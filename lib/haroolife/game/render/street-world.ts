import { current } from '@/lib/haroolife/city/locality'
import { RoadTraffic } from '@/lib/haroolife/city/road-traffic'
import {
  type AvatarActor,
  createAvatarActor,
  disposeAvatarActor,
  playAvatarActor,
} from './avatar-actor'
import {
  type AdCampaign,
  type AdPlacement,
  PLACEMENTS,
  ROTATION_MS,
  campaignFor,
  supportNear,
  supportsSeen,
  supportsToBuild,
} from '@/lib/haroolife/ads/campaigns'
import type { ExposureTracker } from '@/lib/haroolife/ads/exposure'
import { POSTER_H, POSTER_W, drawPoster, loadPosterImage } from '@/lib/haroolife/ads/poster'
import { pagneColor } from '@/lib/haroolife/city/avatar'
/**
 * HarooLife engine — the street (imperative Three.js). Draws the neighbourhood around the player
 * from the Saas city data (`core/street.ts`) in the prototype's style: orthographic three-quarter
 * camera, soft palette, adult avatars. The walking rules are not here: the existing
 * PlayerController (collisions, routes, doors, taxi) is stepped by this loop and its events go
 * back to the game unchanged, exactly as the PlayCanvas rig did.
 *
 * Lifecycle as the rooms: one renderer, one frame loop; `dispose()` releases everything.
 */
import {
  type AvatarSpec,
  adultFor,
  avatarSpec,
  clipFor,
} from '@/lib/haroolife/city/avatar-catalogue'
import { type Bank, loadBank } from '@/lib/haroolife/city/bank'
import { drivingRoute, type VehicleKind } from '@/lib/haroolife/city/fares'
import type { ServiceCustomer } from '@/lib/haroolife/city/automatic-service'
import { isCityRoad, isDriveway } from '@/lib/haroolife/city/world'
import { WALK_SIDE, streetDressing } from '@/lib/haroolife/game/core/sidewalks'
import type { NpcAnim } from '@/lib/haroolife/city/interiors'
import { DEFAULT_CONFIG, type PlayerController } from '@/lib/haroolife/city/player'
import {
  type GroundKind,
  STREET_CELL,
  type StreetDoor,
  type StreetWindow,
  TILE,
  buildingsInTile,
  streetWindow,
} from '@/lib/haroolife/game/core/street'
import {
  INTERP_DELAY_MS,
  MAX_SHOWN,
  STALE_MS,
  type Sample,
  remoteAnim,
  remoteModel,
  sampleAt,
} from '@/lib/haroolife/realtime/interpolate'
import type { Pose, PresenceEntry } from '@/lib/haroolife/realtime/protocol'
import type { Building } from '@/lib/haroolife/townsmen-engine'
import * as THREE from 'three'
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { DETAIL_CELLS, buildCityGeometry } from './city-models'
import { createGltfLoader } from './gltf'
import { type MotoParts, buildMoto } from './moto'
import { PerfProbe } from './perf-probe'
import { fitTaxiModel } from './vehicle-scale'

/**
 * Height of an adult (scene units; a cell is STREET_CELL). With the buildings drawn taller
 * (`BUILDING_HEIGHT`), a person is about 1.75 m against houses of one or two storeys and cars of
 * 4.5 m, instead of standing taller than the houses.
 */
const FIGURE = 1.15
/** Background by day (the prototype's soft green) and at night. */
const DAY_SKY = '#c6d9bd'
const NIGHT_SKY = '#33456b'
/** Cells drawn around the player; the window is rebuilt when the player gets near its edge. */
const RADIUS = 13
const REBUILD_AT = 6
/** Building tiles kept within this many cells of the player (the camera shows about ±9). */
const TILE_RANGE = 11
const CAMERA_ELEVATION = 0.7
const CAMERA_DISTANCE = 80
const PEDESTRIANS = 8
const PEDESTRIAN_MODELS = ['afi', 'koffi', 'abra', 'kossi']
/** First names of the passers-by (game characters, never real people), one per model. */
const PEDESTRIAN_NAMES = [
  'Abla',
  'Kossi',
  'Enyonam',
  'Komi',
  'Akossiwa',
  'Yao',
  'Agent Afi',
  'Agent Dodzi',
]
const U = STREET_CELL
/** The player's taxi (Kenney Car Kit, CC0): front along +Z, as the controller's heading 0. */
const TAXI_URL = '/haroolife/vendor/kenney-3d/car-kit/taxi.glb'
/** Rolling radius of a compact taxi or moto, in the adult avatar's scale. */
const WHEEL_RADIUS = 0.3 * (FIGURE / 1.75)
/** Front wheels at full steering (radians), drawn from the stick. */
const MAX_STEER = 0.45

const GROUND: Record<GroundKind, string> = {
  land: '#b9cc9f',
  sand: '#e6d7a8',
  water: '#7fb6c2',
  hill: '#a6b88c',
  road: '#8d918f',
  estate: '#c7d6ad',
  'estate-road': '#a39c8a',
}

export interface StreetWorldEvents {
  /** The controller's events (cells, arrivals, vehicle), as the PlayCanvas rig sent them. */
  onEvents: (events: ReturnType<PlayerController['drain']>, c: PlayerController) => void
  /** A named place was touched: open its sheet (name, district, trip, cost, Aller). */
  onLot: (lotId: string) => void
  /** The street ground was touched: walk there. */
  onCell: (cell: { x: number; y: number }) => void
  /** Another player was touched (their presence key): open their sheet. */
  onPlayer?: (key: string) => void
  onReady?: () => void
  onError?: (message: string) => void
  onFrame?: (s: { drawCalls: number; fps: number }) => void
  /** Building tiles loaded around the player (the game's chunk statistics). */
  onStats?: (s: StreetStats) => void
  /** At the wheel, looking for clients: the passer-by close enough to climb on (or null). */
  onHail?: (customer: ServiceCustomer | null) => void
  /** Touching the nearby parked vehicle boards it through the normal game action. */
  onVehicle?: () => void
}

/** The driver's job in the street: the vehicle, who is on board, where they go. */
export interface StreetFare {
  vehicle: VehicleKind
  /** Passers-by may hail the driver (the job is on and nobody is on board). */
  hailing: boolean
  passenger: string | null
  pickup?: ServiceCustomer | null
  /** Destination door (road cell) and its name, while a passenger is on board. */
  dest: { x: number; y: number; name: string } | null
}

export interface StreetStats {
  /** Building tiles in the scene. */
  chunks: number
  buildings: number
  /** Triangles in the loaded building tiles. */
  tris: number
  /** True once the Kenney models are in use (not fallback boxes). */
  detailed: boolean
}

export interface StreetWorldOptions {
  canvas: HTMLCanvasElement
  markers: HTMLElement
  controller: PlayerController
  avatarModel: string
  pagne?: string
  /** The player's own buildings (townsmen-engine, local cells), drawn on the estate. */
  estate: readonly Building[]
  events: StreetWorldEvents
  pixelRatio?: number
  /** Town on screen (billboard supports are per town). */
  locality: string
  /** Street billboards: campaigns, the exposure counter, the support the player stands by. */
  ads?: StreetAds | null
  /** Other players in this town (realtime relay): snapshots and who is present. */
  remote?: { feed: StreetPoseFeed; present: PresenceEntry[] } | null
  /** The vehicle and the driver's fare (zémidjan or taxi). */
  fare?: StreetFare | null
  /**
   * Cast shadows: every frame (high), refreshed one frame in three (balanced: the shadow pass
   * draws every caster a second time), or none (eco). Default: every frame.
   */
  shadows?: 'full' | 'throttled' | 'off'
  /** Multisampling of the canvas (off in eco). Default: on. */
  antialias?: boolean
}

export interface StreetAds {
  campaigns: AdCampaign[]
  tracker: ExposureTracker
  onNear: (p: { placement: AdPlacement; campaign: AdCampaign } | null) => void
}
export interface StreetPoseFeed {
  onPose(fn: (s: { key: string; pose: Pose }) => void): () => void
}

/** Billboard yaw per face (degrees), as the PlayCanvas street: the poster looks at its road. */
const BOARD_YAW = { N: 180, E: 90, S: 0, W: 270 } as const
/** Billboards were drawn for 1.2-unit figures: scaled to the adult avatar. */
/** A roadside billboard: posts and a face about 5 m wide, whatever the figure. */
const BOARD_SCALE = 1.54

interface Board {
  placement: AdPlacement
  root: THREE.Group
  canvas: HTMLCanvasElement
  texture: THREE.CanvasTexture
  material: THREE.MeshBasicMaterial
  shown: string | null
}

interface Remote {
  key: string
  name: string
  person: Person | null
  loading: boolean
  /** Name tag over the head: touching it (or the player) opens their sheet. */
  tag: HTMLButtonElement | null
}

type Person = AvatarActor

interface Walker {
  person: Person
  from: { x: number; y: number }
  to: { x: number; y: number }
  t: number
  /** A passer-by of the game (not a connected player): their name and tag (shown when near). */
  name: string
  police?: boolean
  tag: HTMLButtonElement
}

export class StreetWorld {
  private readonly canvas: HTMLCanvasElement
  private readonly markersRoot: HTMLElement
  private readonly controller: PlayerController
  private readonly events: StreetWorldEvents
  private readonly renderer: THREE.WebGLRenderer
  private readonly scene = new THREE.Scene()
  private readonly camera = new THREE.OrthographicCamera(-10, 10, 10, -10, 0.1, 400)
  private readonly loader = createGltfLoader()
  private readonly loaded: GLTF[] = []
  private readonly materials = new Map<string, THREE.MeshStandardMaterial>()
  private readonly unitBox = new THREE.BoxGeometry(1, 1, 1)
  /** Billboard posts and frame, built once and shared by every support. */
  private boardFrame: THREE.BufferGeometry | null = null
  private readonly raycaster = new THREE.Raycaster()
  private readonly groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
  private readonly resizeObserver: ResizeObserver
  private readonly sun = new THREE.DirectionalLight('#fff1d6', 3)
  private readonly hemi = new THREE.HemisphereLight('#f2f6ff', '#9aa380', 2.4)
  private estate: readonly Building[]
  private win: StreetWindow | null = null
  private winGroup: THREE.Group | null = null
  private markers: { door: StreetDoor; el: HTMLButtonElement; at: THREE.Vector3 }[] = []
  private player: Person | null = null
  private car: THREE.Object3D | null = null
  private carLoading = false
  /** Invalidates an old taxi download when changing vehicle or disposing the street. */
  private carLoadId = 0
  private carTag: HTMLButtonElement | null = null
  private moto: MotoParts | null = null
  private fare: StreetFare = { vehicle: 'taxi', hailing: false, passenger: null, dest: null }
  private hailed: string | null = null
  private hailTimer = 0
  /** Destination of the fare: a beacon on the ground and its label. */
  private beacon: THREE.Group | null = null
  private beaconTag: HTMLDivElement | null = null
  /** The baked Kenney pack (same models as the PlayCanvas city); null while loading or if it failed. */
  private bank: Bank | null = null
  /** Duration of the last neighbourhood rebuild (ms), for the probe. */
  private rebuildMs = 0
  /** Building tiles (Kenney models), cached: key → mesh and level of detail. */
  private tiles = new Map<string, { mesh: THREE.Mesh; detail: boolean; buildings: number }>()
  private tileMs = 0
  private cityMaterial: THREE.MeshStandardMaterial | null = null
  private wheels: { node: THREE.Object3D; front: boolean }[] = []
  private wheelSpin = 0
  /** Camera framing factor (1 on foot, wider at the wheel), eased. */
  private framing = 1
  private walkers: Walker[] = []
  private readonly shadows: 'full' | 'throttled' | 'off'
  private readonly traffic = new RoadTraffic((x, z) => isCityRoad(x, z) || isDriveway(x, z))
  private readonly trafficModels = new Map<number, THREE.Object3D>()
  private readonly trafficMotos: MotoParts[] = []
  private readonly trafficRiders = new Map<number, Person>()
  private trafficRiderTemplate: { gltf: GLTF; spec: AvatarSpec } | null = null
  private readonly trafficTemplates = new Map<string, THREE.Object3D>()
  private readonly avatarModel: string
  private readonly pagne?: string
  private readonly locality: string
  private ads: StreetAds | null
  private readonly supports: AdPlacement[]
  private boards = new Map<string, Board>()
  private showing: Record<string, AdCampaign> = {}
  private nearBoard: string | null = null
  private impressions = 0
  private adsTimer = 0
  private rotationTimer = 0
  private readonly posterGeometry = new THREE.PlaneGeometry(1, 1)
  private readonly gltfCache = new Map<string, Promise<GLTF>>()
  private remoteFeed: StreetPoseFeed | null = null
  private unsubscribe: (() => void) | null = null
  private present: PresenceEntry[] = []
  private readonly buffers = new Map<string, Sample[]>()
  private readonly modes = new Map<string, string>()
  private readonly remotes = new Map<string, Remote>()
  private width = 1
  private height = 1
  private raf = 0
  private last = 0
  private disposed = false
  private frames = 0
  /** Reused every frame to place the taxi label: no allocation in the loop. */
  private readonly tagPoint = new THREE.Vector3()
  private statsAt = 0
  /** Frame times and long tasks for `__LOME_PERF` (same snapshot as the PlayCanvas city had). */
  private readonly perf = new PerfProbe()
  private seed = 1
  private down: { x: number; y: number } | null = null
  /** Animation of the player, in the game's words (idle, walk, run), for the probes. */
  private anim: NpcAnim = 'idle'
  private readonly onPointerDown = (e: PointerEvent) => {
    this.down = { x: e.clientX, y: e.clientY }
  }
  private readonly onPointerUp = (e: PointerEvent) => {
    const start = this.down
    this.down = null
    if (!start || Math.hypot(e.clientX - start.x, e.clientY - start.y) > 12) return
    const r = this.canvas.getBoundingClientRect()
    // Another player under the finger (their body, a generous 40 px): their sheet, not a walk.
    const hitPlayer = this.playerAt(e.clientX - r.left, e.clientY - r.top)
    if (hitPlayer) {
      this.events.onPlayer?.(hitPlayer)
      return
    }
    this.raycaster.setFromCamera(
      new THREE.Vector2(
        ((e.clientX - r.left) / r.width) * 2 - 1,
        -((e.clientY - r.top) / r.height) * 2 + 1,
      ),
      this.camera,
    )
    if (
      this.car &&
      this.controller.canEnterVehicle() &&
      this.raycaster.intersectObject(this.car, true).length
    ) {
      this.events.onVehicle?.()
      return
    }
    const hit = new THREE.Vector3()
    if (this.raycaster.ray.intersectPlane(this.groundPlane, hit))
      this.events.onCell({ x: Math.round(hit.x / U), y: Math.round(hit.z / U) })
  }
  private readonly onPointerCancel = () => {
    this.down = null
  }

  constructor(o: StreetWorldOptions) {
    this.canvas = o.canvas
    this.markersRoot = o.markers
    this.controller = o.controller
    this.events = o.events
    this.estate = o.estate
    this.avatarModel = o.avatarModel
    this.pagne = o.pagne
    this.locality = o.locality
    this.ads = o.ads ?? null
    if (o.fare) this.fare = { ...o.fare }
    this.supports = PLACEMENTS.filter((p) => p.locality === o.locality)
    if (o.remote) {
      this.remoteFeed = o.remote.feed
      this.present = o.remote.present
    }
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: o.antialias ?? true,
      powerPreference: 'high-performance',
    })
    this.renderer.setPixelRatio(o.pixelRatio ?? Math.min(window.devicePixelRatio || 1, 1.7))
    this.shadows = o.shadows ?? 'full'
    this.renderer.shadowMap.enabled = this.shadows !== 'off'
    // Throttled: the shadow map is redrawn on chosen frames only (see the frame loop).
    this.renderer.shadowMap.autoUpdate = this.shadows === 'full'
    this.renderer.shadowMap.type = THREE.PCFShadowMap
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.15
    this.scene.name = 'HarooLife rue'
    this.scene.background = new THREE.Color(DAY_SKY)
    this.scene.add(this.hemi)
    this.sun.castShadow = this.shadows !== 'off'
    this.sun.shadow.mapSize.set(1024, 1024)
    Object.assign(this.sun.shadow.camera, { left: -26, right: 26, top: 26, bottom: -26, far: 120 })
    this.sun.shadow.bias = -0.0004
    this.sun.shadow.normalBias = 0.04
    this.scene.add(this.sun, this.sun.target)
    this.canvas.addEventListener('pointerdown', this.onPointerDown)
    this.canvas.addEventListener('pointerup', this.onPointerUp)
    this.canvas.addEventListener('pointercancel', this.onPointerCancel)
    this.resizeObserver = new ResizeObserver(() => this.resize())
    this.resizeObserver.observe(this.canvas)
    this.resize()
  }

  async init(): Promise<void> {
    const spec = avatarSpec(this.avatarModel)
    const pedSpecs = PEDESTRIAN_MODELS.map((m) => avatarSpec(adultFor(m)))
    const [bank, avatar, ...peds] = await Promise.allSettled([
      loadBank(),
      this.load(spec.url),
      ...pedSpecs.map((s) => this.load(s.url)),
    ])
    this.bank = bank.status === 'fulfilled' ? bank.value : null
    if (this.disposed) return
    if (avatar.status === 'rejected') {
      this.events.onError?.('Le personnage 3D n’a pas pu être chargé.')
      return
    }
    this.player = this.makePerson(avatar.value, spec, this.pagne)
    this.player.root.name = 'Joueur'
    this.scene.add(this.player.root)
    this.rebuild()
    this.updateTiles(Number.POSITIVE_INFINITY)
    for (let i = 0; i < PEDESTRIANS; i++) {
      const r = peds[i % peds.length]
      if (r.status !== 'fulfilled') continue
      const police = i >= 6
      const person = this.makePerson(
        r.value,
        pedSpecs[i % pedSpecs.length],
        police ? '#243e78' : undefined,
      )
      person.root.name = `Piéton ${i + 1}`
      this.scene.add(person.root)
      const start = this.randomRoad()
      const name = PEDESTRIAN_NAMES[i % PEDESTRIAN_NAMES.length]
      const tag = document.createElement('button')
      tag.type = 'button'
      tag.dataset.pedestrian = name
      tag.setAttribute('aria-label', `Habitant ${name}`)
      tag.textContent = police ? `👮🏿 ${name}` : name
      if (police) tag.dataset.police = name
      tag.className =
        'pointer-events-auto absolute left-0 top-0 min-h-8 rounded-full border border-white/80 bg-white/85 px-3 text-xs font-semibold text-slate-700 shadow'
      tag.style.visibility = 'hidden'
      tag.addEventListener('click', (e) => {
        e.stopPropagation()
        this.events.onPlayer?.(`npc:${name}`)
      })
      this.markersRoot.append(tag)
      this.walkers.push({
        person,
        from: start,
        to: this.nextRoad(start, start),
        t: Math.random(),
        name,
        police,
        tag,
      })
      this.play(person, clipFor(person.spec, 'walk'))
      person.actions.get(person.current)?.setEffectiveTimeScale(1)
    }
    // End-to-end tests only (flag set by the test): bring a passer-by next to the vehicle, as
    // waiting for one to wander by would make the test depend on chance.
    try {
      if (localStorage.getItem('haroolife.e2e') === '1')
        (window as unknown as { __LOME_SUMMON_WALKER?: () => string | null }).__LOME_SUMMON_WALKER =
          () => {
            const v = this.controller.vehicle
            const w = this.walkers.find((x) => x.name !== this.fare.passenger)
            if (!v || !w) return null
            w.from = { x: Math.round(v.x) + 1, y: Math.round(v.z) }
            w.to = { ...w.from }
            w.t = 0
            return w.name
          }
    } catch {
      // Storage refused: no test hook.
    }
    const riderIndex = peds.findIndex((p) => p.status === 'fulfilled')
    const rider = peds[riderIndex]
    if (rider?.status === 'fulfilled')
      this.trafficRiderTemplate = { gltf: rider.value, spec: pedSpecs[riderIndex] }
    // Licensed CC0 models already bundled with the game, no external runtime download.
    await Promise.allSettled(
      ['taxi', 'sedan', 'van'].map(async (kind) => {
        const gltf = await this.load(`/haroolife/vendor/kenney-3d/car-kit/${kind}.glb`)
        if (!this.disposed) this.trafficTemplates.set(kind, gltf.scene)
      }),
    )
    if (this.disposed) return
    this.startAds()
    this.startRemote()
    this.publishProbe()
    this.last = performance.now()
    this.raf = requestAnimationFrame(this.frame)
    this.events.onReady?.()
  }

  /**
   * The game's hour of day: `sun` from 0.65 (night) to 1 (noon), as the city's daylight cycle.
   * By day the street keeps its soft palette; at night the sky and the lights go down.
   */
  setDaylight(light: { sun: number; sunColor: string }): void {
    const k = Math.max(0, Math.min(1, (light.sun - 0.65) / 0.35))
    ;(this.scene.background as THREE.Color).set(NIGHT_SKY).lerp(new THREE.Color(DAY_SKY), k)
    this.hemi.intensity = 2.4 * (0.45 + 0.55 * k)
    this.sun.intensity = 3 * (0.25 + 0.75 * k)
    this.sun.color.set(light.sunColor)
  }

  /** The player's own buildings changed (construction): redraw the window. */
  setEstate(estate: readonly Building[]): void {
    this.estate = estate
    if (!this.player) return
    this.rebuild()
    // The estate changed (construction): its tiles are drawn again.
    for (const k of [...this.tiles.keys()]) this.dropTile(k)
    this.updateTiles(Number.POSITIVE_INFINITY)
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    cancelAnimationFrame(this.raf)
    this.canvas.removeEventListener('pointerdown', this.onPointerDown)
    this.canvas.removeEventListener('pointerup', this.onPointerUp)
    this.canvas.removeEventListener('pointercancel', this.onPointerCancel)
    this.resizeObserver.disconnect()
    this.clearWindow()
    window.clearInterval(this.adsTimer)
    window.clearTimeout(this.rotationTimer)
    for (const id of [...this.boards.keys()]) this.dropBoard(id)
    this.posterGeometry.dispose()
    for (const k of [...this.tiles.keys()]) this.dropTile(k)
    this.cityMaterial?.dispose()
    this.unsubscribe?.()
    this.unsubscribe = null
    for (const r of this.remotes.values()) {
      if (r.person) this.disposePerson(r.person)
      r.tag?.remove()
    }
    this.remotes.clear()
    for (const w of this.walkers) {
      this.disposePerson(w.person)
      w.tag.remove()
    }
    this.walkers = []
    this.controller.obstacles = []
    for (const model of this.trafficModels.values()) this.scene.remove(model)
    this.trafficModels.clear()
    for (const rider of this.trafficRiders.values()) this.disposePerson(rider)
    this.trafficRiders.clear()
    this.trafficRiderTemplate = null
    for (const moto of this.trafficMotos) {
      for (const g of moto.geometries) g.dispose()
      for (const m of moto.materials) m.dispose()
    }
    this.trafficMotos.length = 0
    this.trafficTemplates.clear()
    if (this.player) this.disposePerson(this.player)
    this.player = null
    this.dropCar()
    this.setBeacon(null)
    ;(window as unknown as { __LOME_SUMMON_WALKER?: unknown }).__LOME_SUMMON_WALKER = undefined
    this.unitBox.dispose()
    this.boardFrame?.dispose()
    for (const m of this.materials.values()) m.dispose()
    for (const gltf of this.loaded.splice(0))
      gltf.scene.traverse((o) => {
        const mesh = o as THREE.Mesh
        if (!mesh.isMesh) return
        mesh.geometry.dispose()
        for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
          for (const v of Object.values(m)) if (v instanceof THREE.Texture) v.dispose()
          m.dispose()
        }
      })
    this.renderer.dispose()
    this.perf.dispose()
    const w = window as unknown as {
      __LOME_STREET?: unknown
      __LOME_SCENE?: unknown
      __LOME_ADS?: unknown
    }
    w.__LOME_STREET = undefined
    w.__LOME_SCENE = undefined
    w.__LOME_ADS = undefined
    if (this.nearBoard) this.ads?.onNear(null)
  }

  // ── construction ─────────────────────────────────────────────────────────────────────────

  private load(url: string): Promise<GLTF> {
    let p = this.gltfCache.get(url)
    if (!p) {
      p = this.loader.loadAsync(url).then((g) => {
        this.loaded.push(g)
        return g
      })
      this.gltfCache.set(url, p)
    }
    return p
  }

  private mat(color: string): THREE.MeshStandardMaterial {
    let m = this.materials.get(color)
    if (!m) {
      m = new THREE.MeshStandardMaterial({ color, roughness: 0.92 })
      this.materials.set(color, m)
    }
    return m
  }

  private clearWindow(): void {
    for (const m of this.markers) m.el.remove()
    this.markers = []
    if (!this.winGroup) return
    this.winGroup.traverse((o) => {
      const im = o as THREE.InstancedMesh
      if (im.isInstancedMesh) im.dispose()
      else if (o.userData.ownsGeometry) (o as THREE.Mesh).geometry.dispose()
    })
    this.winGroup.removeFromParent()
    this.winGroup = null
  }

  /** Draws the neighbourhood around the player's current cell. */
  private rebuild(): void {
    const t0 = performance.now()
    this.clearWindow()
    const c = this.controller.cell
    const win = streetWindow(c.x, c.y, RADIUS, this.estate)
    this.win = win
    const g = new THREE.Group()
    g.name = 'Quartier'
    // Ground: one instanced mesh per kind (one draw call each).
    const byKind = new Map<GroundKind, { x: number; y: number }[]>()
    for (const cell of win.cells) {
      const list = byKind.get(cell.kind) ?? []
      list.push(cell)
      byKind.set(cell.kind, list)
    }
    const m4 = new THREE.Matrix4()
    for (const [kind, list] of byKind) {
      const water = kind === 'water'
      const road = kind === 'road' || kind === 'estate-road'
      const h = water ? 0.05 : road ? 0.12 : 0.18
      const loc = current()
      const color =
        loc.id === 'lome' || loc.id === 'kara'
          ? GROUND[kind]
          : kind === 'land'
            ? Object.values(loc.decor.grass)[0]
            : kind === 'water'
              ? loc.decor.lagoon
              : kind === 'hill'
                ? loc.decor.hill
                : GROUND[kind]
      const im = new THREE.InstancedMesh(this.unitBox, this.mat(color), list.length)
      im.name = `sol:${kind}`
      list.forEach((cell, i) => {
        m4.makeScale(U, h, U)
        m4.setPosition(cell.x * U, (water ? -0.15 : road ? -0.05 : 0) - h / 2, cell.y * U)
        im.setMatrixAt(i, m4)
      })
      im.receiveShadow = true
      g.add(im)
    }
    // Lane markings on city roads (thin, light).
    const marks = win.cells.filter((cell) => cell.kind === 'road')
    if (marks.length) {
      const im = new THREE.InstancedMesh(this.unitBox, this.mat('#e9e4d4'), marks.length)
      im.name = 'marquage'
      marks.forEach((cell, i) => {
        m4.makeScale(0.5, 0.02, 0.12)
        m4.setPosition(cell.x * U, -0.03, cell.y * U)
        im.setMatrixAt(i, m4)
      })
      g.add(im)
    }
    // Sidewalks along every plot and zebra crossings at the crossroads (one draw call each).
    const dressing = streetDressing(win.cells)
    for (const [list, color, top, name] of [
      [dressing.sidewalks, '#e4e0d6', 0.05, 'trottoir'],
      [dressing.curbs, '#8f8a80', 0.06, 'bordure'],
      [dressing.zebras, '#f2efe6', -0.025, 'passage-pieton'],
    ] as const) {
      if (!list.length) continue
      const im = new THREE.InstancedMesh(this.unitBox, this.mat(color), list.length)
      im.name = name
      list.forEach((s, i) => {
        const h = name === 'passage-pieton' ? 0.02 : 0.13
        m4.makeScale(s.w * U, h, s.h * U)
        m4.setPosition(s.x * U, top - h / 2, s.y * U)
        im.setMatrixAt(i, m4)
      })
      im.receiveShadow = true
      g.add(im)
    }
    // Buildings: the Kenney models by tiles (updateTiles); boxes only when the pack is missing.
    if (this.bank) {
      // Drawn by the tile cache.
    } else {
      // Fallback (pack unavailable): stylised volumes in the prototype's palette.
      for (const b of win.buildings) {
        const x = (b.x + (b.w - 1) / 2) * U
        const z = (b.y + (b.h - 1) / 2) * U
        if (b.floors === 0) {
          // Parks and empty lots: a low green or sand plot with a few trees.
          const plot = new THREE.Mesh(
            this.unitBox,
            this.mat(b.type === 'park' ? '#8fbf7a' : '#d6cdb5'),
          )
          plot.scale.set(b.w * U - 0.4, 0.06, b.h * U - 0.4)
          plot.position.set(x, 0.03, z)
          plot.receiveShadow = true
          plot.name = `lot:${b.id}`
          g.add(plot)
          continue
        }
        // Low-rise, as in the prototype: the street stays readable from the game camera.
        const floors = Math.min(4, b.floors)
        const height = 1.4 + floors * 1.15
        const body = new THREE.Mesh(this.unitBox, this.mat(b.color))
        body.scale.set(b.w * U - 0.5, height, b.h * U - 0.5)
        body.position.set(x, height / 2, z)
        body.castShadow = true
        body.receiveShadow = true
        body.name = `lot:${b.id}`
        g.add(body)
        const roof = new THREE.Mesh(this.unitBox, this.mat(b.roof))
        roof.scale.set(b.w * U - 0.2, 0.3, b.h * U - 0.2)
        roof.position.set(x, height + 0.15, z)
        roof.castShadow = true
        g.add(roof)
        // A darker band of windows on each floor (reads as a building, not a block).
        for (let f = 0; f < floors; f++) {
          const band = new THREE.Mesh(this.unitBox, this.mat('#5f7a86'))
          band.scale.set(b.w * U - 0.45, 0.4, b.h * U - 0.45)
          band.position.set(x, 1.2 + f * 1.15, z)
          g.add(band)
        }
      }
    }
    this.scene.add(g)
    this.winGroup = g
    this.rebuildMs = Math.round(performance.now() - t0)
    // Doors of named places: a marker each (44 px), opening the place's sheet.
    for (const d of win.doors) {
      const el = document.createElement('button')
      el.type = 'button'
      el.dataset.door = d.lotId
      el.setAttribute('aria-label', d.name)
      el.title = d.name
      el.textContent = d.icon
      el.className =
        'pointer-events-auto absolute left-0 top-0 flex h-11 w-11 items-center justify-center rounded-full border-2 border-white bg-white/90 text-lg shadow-md'
      el.addEventListener('click', (e) => {
        e.stopPropagation()
        this.events.onLot(d.lotId)
      })
      this.markersRoot.append(el)
      this.markers.push({ door: d, el, at: new THREE.Vector3(d.x * U, 3.2, d.y * U) })
    }
  }

  private makePerson(gltf: GLTF, spec: AvatarSpec, pagne?: string): Person {
    return createAvatarActor(gltf, spec, FIGURE, pagne)
  }

  private disposePerson(p: Person): void {
    disposeAvatarActor(p)
  }

  private play(p: Person, clip: string): void {
    playAvatarActor(p, clip)
  }

  /**
   * Keeps the building tiles around the player: missing ones are built, those whose level of
   * detail changed are rebuilt (at most `budget` per call), those out of range are freed.
   */
  private updateTiles(budget: number): void {
    const bank = this.bank
    if (!bank) return
    const c = this.controller.cell
    const t0x = Math.floor((c.x - TILE_RANGE) / TILE)
    const t1x = Math.floor((c.x + TILE_RANGE) / TILE)
    const t0y = Math.floor((c.y - TILE_RANGE) / TILE)
    const t1y = Math.floor((c.y + TILE_RANGE) / TILE)
    for (const k of [...this.tiles.keys()]) {
      const [tx, ty] = k.split(':').map(Number)
      if (tx < t0x - 1 || tx > t1x + 1 || ty < t0y - 1 || ty > t1y + 1) this.dropTile(k)
    }
    // Nearest tiles first.
    const wanted: { tx: number; ty: number; d: number }[] = []
    for (let ty = t0y; ty <= t1y; ty++)
      for (let tx = t0x; tx <= t1x; tx++)
        wanted.push({
          tx,
          ty,
          d: Math.hypot(tx * TILE + TILE / 2 - c.x, ty * TILE + TILE / 2 - c.y),
        })
    wanted.sort((a, b) => a.d - b.d)
    let built = 0
    for (const w of wanted) {
      if (built >= budget) break
      const key = `${w.tx}:${w.ty}`
      const detail = w.d <= DETAIL_CELLS
      const have = this.tiles.get(key)
      if (have && have.detail === detail) continue
      const t = performance.now()
      if (!this.cityMaterial)
        this.cityMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 })
      const inTile = buildingsInTile(w.tx, w.ty, this.estate)
      const mesh = new THREE.Mesh(buildCityGeometry(bank, inTile, detail), this.cityMaterial)
      mesh.name = `Bâtiments ${key}`
      mesh.castShadow = true
      mesh.receiveShadow = true
      if (have) this.dropTile(key)
      this.scene.add(mesh)
      this.tiles.set(key, { mesh, detail, buildings: inTile.length })
      this.tileMs = Math.round(performance.now() - t)
      built++
    }
  }

  private dropTile(key: string): void {
    const t = this.tiles.get(key)
    if (!t) return
    t.mesh.removeFromParent()
    t.mesh.geometry.dispose()
    this.tiles.delete(key)
  }

  /** Someone astride the zémidjan, at `along` (units, +Z forward) on its seat. */
  private seat(p: Person, v: { x: number; z: number; heading: number }, along: number): void {
    const h = (v.heading * Math.PI) / 180
    p.root.position.set(
      v.x * U + Math.sin(h) * along,
      (this.moto?.seat ?? 0) - p.seatOffset,
      v.z * U + Math.cos(h) * along,
    )
    p.root.rotation.y = h
  }

  private dropCar(): void {
    this.carLoadId++
    this.car?.removeFromParent()
    this.car = null
    this.carLoading = false
    this.carTag?.remove()
    this.carTag = null
    this.wheels = []
    if (this.moto) {
      for (const g of this.moto.geometries) g.dispose()
      for (const m of this.moto.materials) m.dispose()
      this.moto = null
    }
  }

  /**
   * The driver's job: the vehicle (zémidjan or taxi), whether passers-by may hail, who is on
   * board and where they go. A passenger who leaves is set down at the destination's door.
   */
  setFare(fare: StreetFare): void {
    const was = this.fare
    this.fare = { ...fare }
    if (was.vehicle !== fare.vehicle) this.dropCar()
    if (was.passenger && was.passenger !== fare.passenger) {
      const w = this.walkers.find((x) => x.name === was.passenger)
      const at = was.dest ?? this.controller.cell
      if (w) {
        w.from = { x: at.x, y: at.y }
        w.to = this.nextRoad(w.from, w.from)
        w.t = 0
        w.person.root.visible = true
      }
    }
    this.setBeacon(fare.passenger ? fare.dest : null)
    if ((!fare.hailing && !fare.pickup) || fare.passenger || (was.pickup && !fare.pickup))
      this.hailed = null
  }

  private setBeacon(dest: StreetFare['dest']): void {
    if (this.beacon) {
      this.beacon.removeFromParent()
      this.beacon.traverse((o) => {
        const m = o as THREE.Mesh
        if (m.isMesh) m.geometry.dispose()
      })
      this.beacon = null
    }
    this.beaconTag?.remove()
    this.beaconTag = null
    if (!dest) return
    const g = new THREE.Group()
    g.name = `Destination ${dest.name}`
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(U * 0.9, U * 0.08, 8, 32),
      this.mat('#f59e0b'),
    )
    ring.rotation.x = Math.PI / 2
    ring.position.y = 0.05
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(U * 0.12, U * 0.12, FIGURE * 1.4, 10),
      this.mat('#f59e0b'),
    )
    beam.position.y = FIGURE * 0.7
    g.add(ring, beam)
    g.position.set(dest.x * U, 0, dest.y * U)
    this.scene.add(g)
    this.beacon = g
    const tag = document.createElement('div')
    tag.dataset.fareDest = dest.name
    tag.className =
      'pointer-events-none absolute left-0 top-0 whitespace-nowrap rounded-full bg-amber-500 px-3 py-1 text-xs font-bold text-white shadow-md'
    tag.textContent = `📍 Déposer ici · ${dest.name}`
    tag.style.visibility = 'hidden'
    this.markersRoot.append(tag)
    this.beaconTag = tag
  }

  /** At the wheel with the job on: the nearest passer-by close to the vehicle hails (4 times a second). */
  private stepHail(dt: number): void {
    this.hailTimer += dt
    if (this.hailTimer < 0.25) return
    this.hailTimer = 0
    const ctl = this.controller
    const v = ctl.vehicle
    if (this.fare.pickup) return
    let best: { customer: ServiceCustomer; d: number } | null = null
    if (ctl.driving && v && this.fare.hailing && !this.fare.passenger) {
      if (this.hailed) return
      for (const w of this.walkers) {
        if (w.police) continue
        const p = w.person.root.position
        const d = Math.hypot(p.x / U - v.x, p.z / U - v.z)
        const customer = { name: w.name, x: Math.round(p.x / U), y: Math.round(p.z / U) }
        if (
          (!best || d < best.d) &&
          drivingRoute(v, customer, (x, y) => isCityRoad(x, y) || isDriveway(x, y))
        )
          best = { customer, d }
      }
    }
    const name = best?.customer.name ?? null
    if (name !== this.hailed) {
      this.hailed = name
      this.events.onHail?.(best?.customer ?? null)
    }
  }

  private loadCar(): void {
    this.carLoading = true
    const loadId = ++this.carLoadId
    const tag = document.createElement('button')
    tag.type = 'button'
    tag.dataset.serviceVehicle = this.fare.vehicle
    tag.className =
      'pointer-events-auto absolute left-0 top-0 whitespace-nowrap rounded-full border-2 border-amber-300 bg-white px-3 py-1 text-xs font-bold text-slate-900 shadow-md'
    tag.textContent = this.fare.vehicle === 'moto' ? '🏍️ Zémidjan · Monter' : '🚕 Taxi · Monter'
    tag.style.visibility = 'hidden'
    tag.addEventListener('click', () => this.events.onVehicle?.())
    this.markersRoot.append(tag)
    this.carTag = tag
    if (this.fare.vehicle === 'moto') {
      const moto = buildMoto(FIGURE)
      this.moto = moto
      moto.root.traverse((o) => {
        if (o.name.startsWith('wheel-'))
          this.wheels.push({ node: o, front: o.name.startsWith('wheel-front') })
      })
      this.scene.add(moto.root)
      this.car = moto.root
      this.carLoading = false
      return
    }
    this.load(TAXI_URL)
      .then((g) => {
        if (this.disposed || loadId !== this.carLoadId) return
        const root = new THREE.Group()
        root.name = 'Taxi du joueur'
        const model = g.scene.clone(true)
        fitTaxiModel(model, FIGURE, U)
        model.traverse((o) => {
          const mesh = o as THREE.Mesh
          if (mesh.isMesh) {
            mesh.castShadow = true
            mesh.receiveShadow = true
          }
          if (o.name.startsWith('wheel-'))
            this.wheels.push({ node: o, front: o.name.startsWith('wheel-front') })
        })
        root.add(model)
        this.scene.add(root)
        this.car = root
        this.carLoading = false
      })
      .catch(() => {
        if (this.disposed || loadId !== this.carLoadId) return
        // Honest fallback: a yellow volume of the taxi's size, never an invisible car.
        const box = new THREE.Mesh(this.unitBox, this.mat('#f2c230'))
        box.name = 'Taxi du joueur'
        box.scale.set((1.7 * FIGURE) / 1.75, (1.45 * FIGURE) / 1.75, (4.1 * FIGURE) / 1.75)
        box.position.y = (0.725 * FIGURE) / 1.75
        const root = new THREE.Group()
        root.add(box)
        this.scene.add(root)
        this.car = root
        this.carLoading = false
      })
  }

  // ── pedestrians (non-player characters on the roads around the player) ──────────────────

  private rand(): number {
    this.seed = (this.seed * 16807) % 2147483647
    return this.seed / 2147483647
  }

  private randomRoad(): { x: number; y: number } {
    const roads = (this.win?.roads ?? []).filter(
      (p) => isCityRoad(p.x, p.y) || isDriveway(p.x, p.y),
    )
    return roads.length ? roads[Math.floor(this.rand() * roads.length)] : this.controller.cell
  }

  private nextRoad(at: { x: number; y: number }, prev: { x: number; y: number }) {
    const roads = new Set(
      (this.win?.roads ?? [])
        .filter((p) => isCityRoad(p.x, p.y) || isDriveway(p.x, p.y))
        .map((r) => `${r.x}:${r.y}`),
    )
    const options = [
      { x: at.x + 1, y: at.y },
      { x: at.x - 1, y: at.y },
      { x: at.x, y: at.y + 1 },
      { x: at.x, y: at.y - 1 },
    ].filter((p) => roads.has(`${p.x}:${p.y}`))
    const ahead = options.filter((p) => p.x !== prev.x || p.y !== prev.y)
    const pick = ahead.length ? ahead : options
    return pick.length ? pick[Math.floor(this.rand() * pick.length)] : at
  }

  private stepWalkers(dt: number): void {
    const speed = 1.1 // units/s: a calm walk
    const v = this.controller.vehicle
    for (const w of this.walkers) {
      if (w.name === this.fare.pickup?.name || (this.fare.hailing && w.name === this.hailed)) {
        this.play(w.person, clipFor(w.person.spec, 'idle'))
        w.person.mixer.update(dt)
        continue
      }
      if (w.name === this.fare.passenger && v) {
        // On board: behind the driver on the zémidjan, out of sight in the taxi.
        w.person.root.visible = !!this.moto
        if (this.moto) {
          this.seat(w.person, this.controller.shownVehicle ?? v, this.moto.passengerZ)
          this.play(w.person, clipFor(w.person.spec, 'drive'))
        }
        w.person.mixer.update(dt)
        continue
      }
      w.person.root.visible = true
      this.play(w.person, clipFor(w.person.spec, 'walk'))
      const dx = (w.to.x - w.from.x) * U
      const dz = (w.to.y - w.from.y) * U
      const len = Math.hypot(dx, dz) || 1
      w.t += (speed * dt) / len
      if (w.t >= 1) {
        const prev = w.from
        w.from = w.to
        w.to = this.nextRoad(w.from, prev)
        w.t = 0
        // Far from the player (the window moved): reappear on a road nearby.
        const c = this.controller.cell
        if (Math.abs(w.from.x - c.x) > RADIUS || Math.abs(w.from.y - c.y) > RADIUS) {
          w.from = this.randomRoad()
          w.to = this.nextRoad(w.from, w.from)
        }
      }
      // Walk on the sidewalk to the right of the road; turns are eased (no jump at a corner).
      const side = WALK_SIDE * U
      const nx = len ? -dz / len : 0
      const nz = len ? dx / len : 0
      const x = w.from.x * U + dx * w.t + nx * side
      const z = w.from.y * U + dz * w.t + nz * side
      const p = w.person.root.position
      const ease = Math.hypot(x - p.x, z - p.z) > 3 ? 1 : Math.min(1, dt * 6)
      p.set(p.x + (x - p.x) * ease, 0, p.z + (z - p.z) * ease)
      if (dx || dz) w.person.root.rotation.y = Math.atan2(dx, dz)
      const natural = w.person.spec.pace.walk * FIGURE
      w.person.actions.get(w.person.current)?.setEffectiveTimeScale(Math.max(0.5, speed / natural))
      w.person.mixer.update(dt)
    }
  }

  // ── loop ─────────────────────────────────────────────────────────────────────────────────

  private resize(): void {
    this.width = this.canvas.clientWidth || 1
    this.height = this.canvas.clientHeight || 1
    this.renderer.setSize(this.width, this.height, false)
  }

  private updateCamera(): void {
    const c = this.controller.camera
    const aspect = this.width / this.height
    // The rig's distance (zoom buttons, pinch) sets the framing; 8 is the follow distance.
    // Framed on the person (smaller than the buildings around): a narrower view than before.
    const zoom = this.width < 650 ? 1.3 : 1
    const size = (Math.max(4.5, Math.min(40, 7 * (c.distance / 8))) * this.framing) / zoom
    const half = Math.max(size, (size * 1.15) / aspect)
    this.camera.left = -half * aspect
    this.camera.right = half * aspect
    this.camera.top = half
    this.camera.bottom = -half
    this.camera.updateProjectionMatrix()
    const yaw = (c.angle * Math.PI) / 180
    const tx = c.tx * U
    const tz = c.tz * U
    this.camera.position.set(
      tx + Math.sin(yaw) * Math.cos(CAMERA_ELEVATION) * CAMERA_DISTANCE,
      Math.sin(CAMERA_ELEVATION) * CAMERA_DISTANCE,
      tz + Math.cos(yaw) * Math.cos(CAMERA_ELEVATION) * CAMERA_DISTANCE,
    )
    this.camera.lookAt(tx, 0.5, tz)
    this.camera.updateMatrixWorld()
    this.sun.position.set(tx - 14, 30, tz + 16)
    this.sun.target.position.set(tx, 0, tz)
  }

  private stepTraffic(dt: number): void {
    const ctl = this.controller
    ctl.vehicleDimensions =
      this.fare.vehicle === 'moto'
        ? { halfWidth: 0.12, halfLength: 0.33 }
        : { halfWidth: 0.27, halfLength: 0.67 }
    const point = ctl.driving && ctl.shownVehicle ? ctl.shownVehicle : ctl.pos
    const blockers = [
      {
        ...point,
        heading: ctl.heading,
        halfWidth: ctl.turning ? 1.05 : ctl.driving ? ctl.vehicleDimensions.halfWidth : 0.3,
        halfLength: ctl.turning ? 1.05 : ctl.driving ? ctl.vehicleDimensions.halfLength : 0.3,
      },
    ]
    // NPC cars yield to crossing people, including the visible pedestrians.
    for (const w of this.walkers)
      if (w.person.root.visible)
        blockers.push({
          x: w.person.root.position.x / U,
          z: w.person.root.position.z / U,
          heading: 0,
          halfWidth: 0.07,
          halfLength: 0.07,
        })
    if (!ctl.driving && ctl.vehicle)
      blockers.push({ ...ctl.vehicle, halfWidth: 0.3, halfLength: 1 })
    this.traffic.step(dt, point.x, point.z, blockers)
    ctl.obstacles = [
      ...this.traffic.cars.filter((c) => this.trafficModels.has(c.id)),
      ...this.walkers
        .filter(
          (w) =>
            w.person.root.visible &&
            w.name !== this.fare.passenger &&
            w.name !== this.fare.pickup?.name,
        )
        .map((w) => ({
          x: w.person.root.position.x / U,
          z: w.person.root.position.z / U,
          heading: 0,
          halfWidth: 0.07,
          halfLength: 0.07,
        })),
    ]
    for (const agent of this.traffic.cars) {
      let model = this.trafficModels.get(agent.id)
      if (!model) {
        if (agent.kind === 'moto') {
          const moto = buildMoto(FIGURE * 0.85)
          this.trafficMotos.push(moto)
          model = moto.root
          if (this.trafficRiderTemplate) {
            const rider = this.makePerson(
              this.trafficRiderTemplate.gltf,
              this.trafficRiderTemplate.spec,
              '#d4a72c',
            )
            rider.root.scale.setScalar(0.85)
            rider.root.position.y = moto.seat - rider.seatOffset * 0.85
            this.play(rider, clipFor(rider.spec, 'drive'))
            model.add(rider.root)
            this.trafficRiders.set(agent.id, rider)
          }
        } else {
          const template = this.trafficTemplates.get(agent.kind)
          if (!template) continue
          model = template.clone(true)
          fitTaxiModel(model, FIGURE * 0.78, U * 0.67)
          const root = new THREE.Group()
          root.add(model)
          model = root
        }
        model.name = `Circulation ${agent.kind} ${agent.id}`
        this.scene.add(model)
        this.trafficModels.set(agent.id, model)
      }
      model.position.set(agent.x * U, 0, agent.z * U)
      model.rotation.y = (agent.heading * Math.PI) / 180
      this.trafficRiders.get(agent.id)?.mixer.update(dt)
    }
  }

  private readonly frame = () => {
    if (this.disposed) return
    this.raf = requestAnimationFrame(this.frame)
    const now = performance.now()
    const dt = Math.min((now - this.last) / 1000, 0.25)
    this.last = now
    if (document.hidden) {
      this.perf.pause()
      return
    }
    this.perf.frame(now)
    const ctl = this.controller
    this.stepTraffic(dt)
    ctl.update(dt)
    const events = ctl.drain()
    if (events.length) this.events.onEvents(events, ctl)
    const c = ctl.cell
    if (
      this.win &&
      (Math.abs(c.x - this.win.cx) > REBUILD_AT || Math.abs(c.y - this.win.cy) > REBUILD_AT)
    )
      this.rebuild()
    // At most one building tile per frame: the cost of the Kenney models is spread out.
    this.updateTiles(1)
    const pl = this.player
    if (pl) {
      const onFoot = !ctl.driving && ctl.mode !== 'inside'
      // On the zémidjan the driver is seen, astride; in the taxi, inside.
      const astride = ctl.driving && !!this.moto && !!ctl.vehicle
      pl.root.visible = onFoot || astride
      if (astride && ctl.vehicle && this.moto) {
        this.seat(pl, ctl.shownVehicle ?? ctl.vehicle, this.moto.driverZ)
      } else {
        pl.root.position.set(ctl.pos.x * U, 0, ctl.pos.z * U)
        pl.root.rotation.y = (ctl.heading * Math.PI) / 180
      }
      const speed = ctl.speed * U
      const anim: NpcAnim = astride
        ? 'drive'
        : ctl.mode === 'run'
          ? 'run'
          : ctl.mode === 'walk' && speed > 0.05
            ? 'walk'
            : 'idle'
      this.anim = anim
      this.play(pl, clipFor(pl.spec, anim))
      if (anim === 'walk' || anim === 'run') {
        const natural = pl.spec.pace[anim] * FIGURE
        pl.actions
          .get(pl.current)
          ?.setEffectiveTimeScale(Math.min(3, Math.max(0.5, speed / natural)))
      } else pl.actions.get(pl.current)?.setEffectiveTimeScale(1)
      pl.mixer.update(dt)
    }
    // The player's taxi, when this town has one: the Kenney model, wheels turning and steering.
    const v = ctl.vehicle
    if (!v && (this.car || this.carLoading)) this.dropCar()
    if (v) {
      if (!this.car && !this.carLoading) this.loadCar()
      const car = this.car
      if (car) {
        const shown = ctl.shownVehicle ?? v
        car.position.set(shown.x * U, 0, shown.z * U)
        car.rotation.y = (v.heading * Math.PI) / 180
        this.wheelSpin += ((v.speed * U) / WHEEL_RADIUS) * dt
        const steer = ctl.driving ? Math.max(-1, Math.min(1, ctl.input.x)) * MAX_STEER : 0
        for (const w of this.wheels) {
          w.node.rotation.x = this.wheelSpin
          if (w.front) w.node.rotation.y = steer
        }
      }
    }
    // At the wheel the camera frames wider (the car is faster than a walk), eased both ways.
    const wanted = ctl.driving ? 1.35 : 1
    this.framing += (wanted - this.framing) * Math.min(1, dt * 2.5)
    this.stepWalkers(dt)
    this.stepHail(dt)
    this.stepRemotes(dt)
    this.updateCamera()
    const p = this.tagPoint
    if (this.carTag && this.car) {
      p.copy(this.car.position)
      p.y += this.moto ? this.moto.seat + 0.3 : FIGURE + 0.3
      p.project(this.camera)
      const x = (p.x * 0.5 + 0.5) * this.width
      const y = (-p.y * 0.5 + 0.5) * this.height
      this.carTag.style.transform = `translate(${x.toFixed(1)}px,${y.toFixed(1)}px) translate(-50%,-100%)`
      this.carTag.style.visibility =
        ctl.canEnterVehicle() &&
        p.z > -1 &&
        p.z < 1 &&
        x > 0 &&
        x < this.width &&
        y > 80 &&
        y < this.height - 100
          ? 'visible'
          : 'hidden'
    }
    for (const m of this.markers) {
      p.copy(m.at).project(this.camera)
      const x = (p.x * 0.5 + 0.5) * this.width
      const y = (-p.y * 0.5 + 0.5) * this.height
      m.el.style.transform = `translate(${x.toFixed(1)}px,${y.toFixed(1)}px) translate(-50%,-100%)`
      const near = Math.hypot(m.door.x - c.x, m.door.y - c.y) < 9
      m.el.style.visibility =
        near && p.z < 1 && x > 0 && x < this.width && y > 40 ? 'visible' : 'hidden'
    }
    // Passers-by: their first name when they are near the player (touch to talk).
    for (const w of this.walkers) {
      p.copy(w.person.root.position)
      const near = Math.hypot(p.x / U - c.x, p.z / U - c.y) < 5
      p.y += FIGURE + 0.2
      p.project(this.camera)
      const x = (p.x * 0.5 + 0.5) * this.width
      const y = (-p.y * 0.5 + 0.5) * this.height
      w.tag.style.transform = `translate(${x.toFixed(1)}px,${y.toFixed(1)}px) translate(-50%,-100%)`
      w.tag.style.visibility =
        near && w.name !== this.fare.passenger && p.z < 1 && x > 0 && x < this.width && y > 40
          ? 'visible'
          : 'hidden'
    }
    // The fare's destination, labelled over its beacon.
    if (this.beacon && this.beaconTag) {
      p.copy(this.beacon.position)
      p.y += FIGURE * 1.6
      p.project(this.camera)
      const x = (p.x * 0.5 + 0.5) * this.width
      const y = (-p.y * 0.5 + 0.5) * this.height
      const on = p.z < 1 && x > 0 && x < this.width && y > 40 && y < this.height
      this.beaconTag.style.transform = `translate(${x.toFixed(1)}px,${y.toFixed(1)}px) translate(-50%,-100%)`
      this.beaconTag.style.visibility = on ? 'visible' : 'hidden'
      this.beacon.rotation.y += dt * 1.5
    }
    // Other players' name tags, over their heads.
    for (const r of this.remotes.values()) {
      if (!r.tag || !r.person) continue
      p.copy(r.person.root.position)
      p.y += FIGURE + 0.25
      p.project(this.camera)
      const x = (p.x * 0.5 + 0.5) * this.width
      const y = (-p.y * 0.5 + 0.5) * this.height
      r.tag.style.transform = `translate(${x.toFixed(1)}px,${y.toFixed(1)}px) translate(-50%,-100%)`
      r.tag.style.visibility =
        r.person.root.visible && p.z < 1 && x > 0 && x < this.width && y > 40 ? 'visible' : 'hidden'
    }
    if (this.shadows === 'throttled' && this.frames % 3 === 0)
      this.renderer.shadowMap.needsUpdate = true
    this.renderer.render(this.scene, this.camera)
    this.frames++
    if (now - this.statsAt >= 500) {
      const fps = (this.frames * 1000) / Math.max(1, now - this.statsAt)
      this.events.onFrame?.({ drawCalls: this.renderer.info.render.calls, fps })
      this.frames = 0
      this.statsAt = now
      this.publishProbe()
      this.publishPerf(now)
    }
  }

  // ── billboards (same supports, rotation, exposure and « Lire l'annonce » as before) ────────

  /** New campaigns (API refresh, kill switch): faces are redrawn on the next tick. */
  setAds(ads: StreetAds | null): void {
    this.ads = ads
    this.rotate()
    if (!ads) for (const id of [...this.boards.keys()]) this.dropBoard(id)
  }

  private startAds(): void {
    this.rotate()
    // Rotation: on the rotation boundary, then every ROTATION_MS (all players see the same face).
    const wait = ROTATION_MS - (Date.now() % ROTATION_MS)
    this.rotationTimer = window.setTimeout(() => {
      this.rotate()
      this.rotationTimer = window.setInterval(() => this.rotate(), ROTATION_MS)
    }, wait)
    // Streaming, exposure and proximity: 4 Hz, off the render loop.
    this.adsTimer = window.setInterval(() => this.tickAds(), 250)
    this.tickAds()
  }

  private rotate(): void {
    const now = Date.now()
    const m: Record<string, AdCampaign> = {}
    if (this.ads)
      for (const p of this.supports) {
        const c = campaignFor(p, this.ads.campaigns, now)
        if (c) m[p.id] = c
      }
    this.showing = m
    for (const b of this.boards.values()) this.paint(b)
  }

  private tickAds(): void {
    if (this.disposed) return
    const ctl = this.controller
    const ads = this.ads
    const wanted = ads
      ? supportsToBuild(this.supports, ctl.pos, [...this.boards.keys()]).filter(
          (id) => this.showing[id],
        )
      : []
    for (const id of [...this.boards.keys()]) if (!wanted.includes(id)) this.dropBoard(id)
    for (const id of wanted) if (!this.boards.has(id)) this.buildBoard(id)
    if (ads) {
      this.impressions += ads.tracker.observe(
        Date.now(),
        supportsSeen(this.supports, this.showing, ctl.camera),
      )
      const close = supportNear(this.supports, this.showing, ctl.pos, ctl.driving)
      const key = close?.id ?? null
      if (key !== this.nearBoard) {
        this.nearBoard = key
        ads.onNear(close ? { placement: close, campaign: this.showing[close.id] } : null)
      }
    }
    ;(window as unknown as { __LOME_ADS?: unknown }).__LOME_ADS = {
      built: [...this.boards.keys()],
      showing: Object.fromEntries(Object.entries(this.showing).map(([k, v]) => [k, v.id])),
      textures: this.boards.size,
      impressions: this.impressions,
    }
  }

  private buildBoard(id: string): void {
    const placement = this.supports.find((p) => p.id === id)
    if (!placement) return
    const root = new THREE.Group()
    root.name = `Panneau ${id}`
    root.position.set(placement.x * U, 0, placement.y * U)
    root.rotation.y = THREE.MathUtils.degToRad(BOARD_YAW[placement.faces])
    root.scale.setScalar(BOARD_SCALE)
    // Square steel posts and the frame, merged: one mesh (36 triangles) per support.
    if (!this.boardFrame) {
      const parts = (
        [
          [-0.72, 0.8, 0.09, 1.6],
          [0.72, 0.8, 0.09, 1.6],
          [0, 2.05, 1.95, 1.2],
        ] as const
      ).map(([x, y, w, h]) =>
        new THREE.BoxGeometry(w, h, w === 1.95 ? 0.08 : 0.09).translate(x, y, -0.06),
      )
      this.boardFrame = mergeGeometries(parts) ?? new THREE.BoxGeometry(1, 1, 1)
      for (const g of parts) g.dispose()
    }
    const frame = new THREE.Mesh(this.boardFrame, this.mat('#383d45'))
    frame.castShadow = true
    root.add(frame)
    const canvas = document.createElement('canvas')
    canvas.width = POSTER_W
    canvas.height = POSTER_H
    const texture = new THREE.CanvasTexture(canvas)
    texture.colorSpace = THREE.SRGBColorSpace
    texture.anisotropy = 4
    // Lit like a backlit street panel: readable at dusk too.
    const material = new THREE.MeshBasicMaterial({ map: texture, toneMapped: false })
    const poster = new THREE.Mesh(this.posterGeometry, material)
    poster.name = `Affiche ${id}`
    poster.scale.set(1.82, 1.04, 1)
    poster.position.set(0, 2.05, -0.015)
    root.add(poster)
    this.scene.add(root)
    const board: Board = { placement, root, canvas, texture, material, shown: null }
    this.boards.set(id, board)
    this.paint(board)
  }

  private paint(b: Board): void {
    const c = this.showing[b.placement.id]
    if (!c) return
    const key = `${c.id}@${c.version}`
    if (b.shown === key) return
    b.shown = key
    drawPoster(b.canvas, c)
    b.texture.needsUpdate = true
    void loadPosterImage(c).then((img) => {
      if (!img || this.disposed || this.boards.get(b.placement.id) !== b || b.shown !== key) return
      drawPoster(b.canvas, c, img)
      b.texture.needsUpdate = true
    })
  }

  private dropBoard(id: string): void {
    const b = this.boards.get(id)
    if (!b) return
    b.root.removeFromParent()
    b.texture.dispose()
    b.material.dispose()
    this.boards.delete(id)
  }

  // ── other players (realtime relay), interpolated between snapshots ────────────────────────

  /** Who is in town now (presence): others who left are removed. */
  setPresent(present: PresenceEntry[]): void {
    this.present = present
    const keys = new Set(present.map((p) => p.key))
    for (const [k, r] of this.remotes)
      if (!keys.has(k)) {
        if (r.person) this.disposePerson(r.person)
        r.tag?.remove()
        this.remotes.delete(k)
      }
    for (const k of this.buffers.keys()) if (!keys.has(k)) this.buffers.delete(k)
  }

  private startRemote(): void {
    if (!this.remoteFeed) return
    this.unsubscribe = this.remoteFeed.onPose(({ key, pose }) => {
      const list = this.buffers.get(key) ?? []
      list.push({ at: performance.now(), x: pose.x, z: pose.z, heading: pose.heading })
      if (list.length > 20) list.splice(0, list.length - 20)
      this.buffers.set(key, list)
      this.modes.set(key, pose.mode)
      if (!this.remotes.has(key)) this.spawnRemote(key)
    })
  }

  private spawnRemote(key: string): void {
    const who = this.present.find((p) => p.key === key)
    if (!who || this.remotes.size >= MAX_SHOWN) return
    const r: Remote = { key, name: who.name, person: null, loading: true, tag: null }
    this.remotes.set(key, r)
    const spec = avatarSpec(remoteModel(key))
    void this.load(spec.url)
      .then((g) => {
        if (this.disposed || this.remotes.get(key) !== r) return
        r.person = this.makePerson(g, spec, pagneColor(who.pagne))
        r.person.root.name = `Joueur ${who.name}`
        this.scene.add(r.person.root)
        r.loading = false
        const tag = document.createElement('button')
        tag.type = 'button'
        tag.dataset.player = key
        tag.setAttribute('aria-label', `Joueur ${who.name}`)
        tag.textContent = who.name
        tag.className =
          'pointer-events-auto absolute left-0 top-0 min-h-8 max-w-[160px] truncate rounded-full border-2 border-white bg-[#195f51] px-3 text-xs font-bold text-white shadow-md'
        tag.style.visibility = 'hidden'
        tag.addEventListener('click', (e) => {
          e.stopPropagation()
          this.events.onPlayer?.(key)
        })
        this.markersRoot.append(tag)
        r.tag = tag
      })
      .catch(() => {
        r.loading = false
      })
  }

  private stepRemotes(dt: number): void {
    const now = performance.now()
    const at = now - INTERP_DELAY_MS
    for (const r of this.remotes.values()) {
      const p = r.person
      const list = this.buffers.get(r.key)
      if (!p || !list?.length) continue
      // Forget samples older than the bracket still needed.
      while (list.length > 2 && list[1].at < at) list.shift()
      const s = sampleAt(list, at)
      if (!s) continue
      p.root.position.set(s.x * U, 0, s.z * U)
      p.root.rotation.y = (s.heading * Math.PI) / 180
      p.root.visible = now - list[list.length - 1].at < STALE_MS
      const anim = remoteAnim(this.modes.get(r.key) ?? 'idle')
      const clip = clipFor(p.spec, anim === 'drive' ? 'idle' : anim)
      this.play(p, clip)
      if (anim === 'walk' || anim === 'run') {
        const speed = (anim === 'run' ? DEFAULT_CONFIG.runSpeed : DEFAULT_CONFIG.walkSpeed) * U
        const natural = p.spec.pace[anim] * FIGURE
        p.actions.get(p.current)?.setEffectiveTimeScale(Math.min(3, Math.max(0.5, speed / natural)))
      } else p.actions.get(p.current)?.setEffectiveTimeScale(1)
      p.mixer.update(dt)
    }
  }

  /** Chunk statistics for the game (`__LOME_CITY`) and the frame snapshot (`__LOME_PERF`). */
  private publishPerf(now: number): void {
    let buildings = 0
    let tris = 0
    for (const t of this.tiles.values()) {
      buildings += t.buildings
      tris += (t.mesh.geometry.index?.count ?? 0) / 3
    }
    this.events.onStats?.({
      chunks: this.bank ? this.tiles.size : this.win ? 1 : 0,
      buildings: this.bank ? buildings : (this.win?.buildings.length ?? 0),
      tris,
      detailed: Boolean(this.bank),
    })
    const people = (this.player ? 1 : 0) + this.walkers.length + this.remotes.size
    this.perf.publish(now, this.renderer, this.scene, {
      animated: people,
      assets: this.loaded.length + (this.bank ? 1 : 0),
    })
  }

  /** The visible remote player whose body is nearest a screen point (within 40 px). */
  private playerAt(x: number, y: number): string | null {
    let best: { key: string; d: number } | null = null
    const v = new THREE.Vector3()
    for (const r of this.remotes.values()) {
      if (!r.person?.root.visible) continue
      v.copy(r.person.root.position)
      v.y += FIGURE / 2
      v.project(this.camera)
      const d = Math.hypot((v.x * 0.5 + 0.5) * this.width - x, (-v.y * 0.5 + 0.5) * this.height - y)
      if (d < 40 && (!best || d < best.d)) best = { key: r.key, d }
    }
    // Then the passers-by of the game (a real player under the finger wins).
    if (!best)
      for (const w of this.walkers) {
        v.copy(w.person.root.position)
        v.y += FIGURE / 2
        v.project(this.camera)
        const d = Math.hypot(
          (v.x * 0.5 + 0.5) * this.width - x,
          (-v.y * 0.5 + 0.5) * this.height - y,
        )
        if (d < 40 && (!best || d < best.d)) best = { key: `npc:${w.name}`, d }
      }
    return best?.key ?? null
  }

  /** Test hooks: the same `__LOME_PLAYER` the PlayCanvas rig published, plus the street. */
  private publishProbe(): void {
    const ctl = this.controller
    const w = window as unknown as Record<string, unknown>
    w.__LOME_STREET = {
      engine: 'haroo',
      window: this.win ? { cx: this.win.cx, cy: this.win.cy, doors: this.win.doors.length } : null,
      buildings: this.win?.buildings.length ?? 0,
      pedestrians: this.walkers.length,
      traffic: this.traffic.cars.map((c) => ({
        id: c.id,
        kind: c.kind,
        shown: this.trafficModels.has(c.id),
        x: c.x,
        z: c.z,
        stopped: c.stopped,
      })),
      collisions: true,
      kenney: Boolean(this.bank),
      rebuildMs: this.rebuildMs,
      tiles: this.tiles.size,
      tileMs: this.tileMs,
      remotes: [...this.remotes.values()].map((r) => ({
        key: r.key,
        name: r.name,
        shown: Boolean(r.person?.root.visible),
      })),
    }
    // The bounds of the actual attached model let browser checks inspect its rendered pixels.
    let vehicleScreen: { x: number; y: number; width: number; height: number } | null = null
    let vehicleSize: { x: number; y: number; z: number } | null = null
    if (this.car?.parent === this.scene) {
      const box = new THREE.Box3().setFromObject(this.car)
      const size = box.getSize(new THREE.Vector3())
      vehicleSize = { x: size.x, y: size.y, z: size.z }
      const points: THREE.Vector3[] = []
      for (const x of [box.min.x, box.max.x])
        for (const y of [box.min.y, box.max.y])
          for (const z of [box.min.z, box.max.z])
            points.push(new THREE.Vector3(x, y, z).project(this.camera))
      const xs = points.map((p) => (p.x * 0.5 + 0.5) * this.width)
      const ys = points.map((p) => (-p.y * 0.5 + 0.5) * this.height)
      vehicleScreen = {
        x: Math.min(...xs),
        y: Math.min(...ys),
        width: Math.max(...xs) - Math.min(...xs),
        height: Math.max(...ys) - Math.min(...ys),
      }
    }
    w.__LOME_PLAYER = {
      x: ctl.pos.x,
      z: ctl.pos.z,
      heading: ctl.heading,
      speed: ctl.speed,
      mode: ctl.mode,
      cell: ctl.cell,
      camera: { ...ctl.camera },
      vehicle: ctl.vehicle ? { ...ctl.vehicle } : null,
      vehicleKind:
        this.car?.parent === this.scene ? (this.car === this.moto?.root ? 'moto' : 'taxi') : null,
      vehicleScreen,
      vehicleSize,
      hailed: this.hailed,
      passenger: this.fare.passenger,
      astride: !!this.moto && ctl.driving && this.player?.root.visible === true,
      driving: ctl.driving,
      automaticDriving: ctl.automaticDriving,
      drivingRouteState: ctl.drivingRouteState,
      model: this.player?.spec.id ?? avatarSpec(this.avatarModel).id,
      avatar: this.player?.root.userData.avatar ?? null,
      anim: this.anim,
    }
    const scene = this.scene
    w.__LOME_SCENE = {
      engine: 'haroo',
      has: (n: string) => Boolean(scene.getObjectByName(n)),
      childNames: (n: string) => scene.getObjectByName(n)?.children.map((c) => c.name) ?? null,
      position: (n: string) => {
        const o = scene.getObjectByName(n)
        if (!o) return null
        const q = o.getWorldPosition(new THREE.Vector3())
        return { x: q.x, y: q.y, z: q.z }
      },
      count: () => {
        let n = 0
        scene.traverse(() => {
          n++
        })
        return n
      },
      geometry: (pattern: string) => {
        const re = new RegExp(pattern)
        let matches = 0
        let triangles = 0
        scene.traverse((o) => {
          if (!re.test(o.name)) return
          matches++
          o.traverse((c) => {
            const mesh = c as THREE.Mesh
            if (!mesh.isMesh) return
            const geo = mesh.geometry
            triangles += (geo.index ? geo.index.count : geo.attributes.position.count) / 3
          })
        })
        return { matches, triangles }
      },
      gpu: () => ({
        textures: this.renderer.info.memory.textures,
        buffers: this.renderer.info.memory.geometries,
        vramMB: null,
      }),
    }
  }
}
