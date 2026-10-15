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
  needsPagneWrap,
  recolorMap,
} from '@/lib/haroolife/city/avatar-catalogue'
import { type Bank, loadBank } from '@/lib/haroolife/city/bank'
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
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js'
import { DETAIL_CELLS, buildCityGeometry } from './city-models'
import { createGltfLoader } from './gltf'
import { PerfProbe } from './perf-probe'

const FIGURE = 1.85
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
const PEDESTRIANS = 6
const PEDESTRIAN_MODELS = [
  'character-female-a',
  'character-male-b',
  'character-female-c',
  'character-male-a',
]
const U = STREET_CELL
/** The player's taxi (Kenney Car Kit, CC0): front along +Z, as the controller's heading 0. */
const TAXI_URL = '/haroolife/vendor/kenney-3d/car-kit/taxi.glb'
/** 1.5 × 2.7 units raw: brought next to the 1.85-unit adult avatar on a 2-unit road. */
const TAXI_SCALE = 1.3
const WHEEL_RADIUS = 0.3 * TAXI_SCALE
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
  onReady?: () => void
  onError?: (message: string) => void
  onFrame?: (s: { drawCalls: number; fps: number }) => void
  /** Building tiles loaded around the player (the game's chunk statistics). */
  onStats?: (s: StreetStats) => void
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
const BOARD_SCALE = FIGURE / 1.2

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
}

interface Person {
  root: THREE.Group
  mixer: THREE.AnimationMixer
  actions: Map<string, THREE.AnimationAction>
  current: string
  spec: AvatarSpec
  owned: THREE.Material[]
  ownedGeometry: THREE.BufferGeometry[]
}

interface Walker {
  person: Person
  from: { x: number; y: number }
  to: { x: number; y: number }
  t: number
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
    this.raycaster.setFromCamera(
      new THREE.Vector2(
        ((e.clientX - r.left) / r.width) * 2 - 1,
        -((e.clientY - r.top) / r.height) * 2 + 1,
      ),
      this.camera,
    )
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
    this.supports = PLACEMENTS.filter((p) => p.locality === o.locality)
    if (o.remote) {
      this.remoteFeed = o.remote.feed
      this.present = o.remote.present
    }
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true })
    this.renderer.setPixelRatio(o.pixelRatio ?? Math.min(window.devicePixelRatio || 1, 1.7))
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFShadowMap
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.15
    this.scene.name = 'HarooLife rue'
    this.scene.background = new THREE.Color(DAY_SKY)
    this.scene.add(this.hemi)
    this.sun.castShadow = true
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
      const person = this.makePerson(r.value, pedSpecs[i % pedSpecs.length])
      person.root.name = `Piéton ${i + 1}`
      this.scene.add(person.root)
      const start = this.randomRoad()
      this.walkers.push({ person, from: start, to: this.nextRoad(start, start), t: Math.random() })
      this.play(person, clipFor(person.spec, 'walk'))
      person.actions.get(person.current)?.setEffectiveTimeScale(1)
    }
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
    for (const r of this.remotes.values()) if (r.person) this.disposePerson(r.person)
    this.remotes.clear()
    for (const w of this.walkers) this.disposePerson(w.person)
    this.walkers = []
    if (this.player) this.disposePerson(this.player)
    this.player = null
    this.car?.removeFromParent()
    this.car = null
    this.wheels = []
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
      const im = new THREE.InstancedMesh(this.unitBox, this.mat(GROUND[kind]), list.length)
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
    const root = new THREE.Group()
    const figure = cloneSkeleton(gltf.scene) as THREE.Group
    figure.name = 'figure'
    figure.rotation.y = THREE.MathUtils.degToRad(spec.yaw)
    const k = FIGURE / spec.height
    figure.scale.setScalar(k)
    root.add(figure)
    const colors = recolorMap(spec, pagne)
    const owned: THREE.Material[] = []
    const clones = new Map<THREE.Material, THREE.Material>()
    figure.traverse((o) => {
      const mesh = o as THREE.Mesh
      if (!mesh.isMesh) return
      mesh.castShadow = true
      mesh.frustumCulled = false
      const swap = (m: THREE.Material) => {
        const color = colors.get(m.name)
        if (!color) return m
        let c = clones.get(m)
        if (!c) {
          c = m.clone()
          ;(c as THREE.MeshStandardMaterial).color?.set(color)
          clones.set(m, c)
          owned.push(c)
        }
        return c
      }
      mesh.material = Array.isArray(mesh.material) ? mesh.material.map(swap) : swap(mesh.material)
    })
    const ownedGeometry: THREE.BufferGeometry[] = []
    if (pagne && needsPagneWrap(spec)) {
      const geo = new THREE.BoxGeometry(1, 1, 1)
      const mat = new THREE.MeshStandardMaterial({ color: pagne, roughness: 0.9 })
      const wrap = new THREE.Mesh(geo, mat)
      wrap.name = 'pagne'
      wrap.position.set(0, 0.16 * k, -0.02 * k)
      wrap.scale.set(0.3 * k, 0.13 * k, 0.22 * k)
      root.add(wrap)
      ownedGeometry.push(geo)
      owned.push(mat)
    }
    const mixer = new THREE.AnimationMixer(figure)
    const actions = new Map<string, THREE.AnimationAction>()
    for (const clip of gltf.animations) actions.set(clip.name, mixer.clipAction(clip))
    const idle = clipFor(spec, 'idle')
    actions.get(idle)?.play()
    return { root, mixer, actions, current: idle, spec, owned, ownedGeometry }
  }

  private disposePerson(p: Person): void {
    p.mixer.stopAllAction()
    p.mixer.uncacheRoot(p.root)
    p.root.removeFromParent()
    p.root.traverse((o) => {
      const s = o as THREE.SkinnedMesh
      if (s.isSkinnedMesh) s.skeleton.dispose()
    })
    for (const m of p.owned) m.dispose()
    for (const g of p.ownedGeometry) g.dispose()
  }

  private play(p: Person, clip: string): void {
    if (p.current === clip) return
    const next = p.actions.get(clip)
    if (!next) return
    p.actions.get(p.current)?.fadeOut(0.2)
    next.reset().fadeIn(0.2).play()
    p.current = clip
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

  private loadCar(): void {
    this.carLoading = true
    this.load(TAXI_URL)
      .then((g) => {
        if (this.disposed) return
        const root = new THREE.Group()
        root.name = 'Taxi du joueur'
        const model = g.scene.clone(true)
        model.scale.setScalar(TAXI_SCALE)
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
      })
      .catch(() => {
        // Honest fallback: a yellow volume of the taxi's size, never an invisible car.
        const box = new THREE.Mesh(this.unitBox, this.mat('#f2c230'))
        box.name = 'Taxi du joueur'
        box.scale.set(1.5 * TAXI_SCALE, 1.1 * TAXI_SCALE, 2.7 * TAXI_SCALE)
        box.position.y = 0.55 * TAXI_SCALE
        const root = new THREE.Group()
        root.add(box)
        this.scene.add(root)
        this.car = root
      })
  }

  // ── pedestrians (non-player characters on the roads around the player) ──────────────────

  private rand(): number {
    this.seed = (this.seed * 16807) % 2147483647
    return this.seed / 2147483647
  }

  private randomRoad(): { x: number; y: number } {
    const roads = this.win?.roads ?? []
    return roads.length ? roads[Math.floor(this.rand() * roads.length)] : this.controller.cell
  }

  private nextRoad(at: { x: number; y: number }, prev: { x: number; y: number }) {
    const roads = new Set((this.win?.roads ?? []).map((r) => `${r.x}:${r.y}`))
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
    for (const w of this.walkers) {
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
      // Walk on the right-hand side of the lane.
      const side = 0.55
      const nx = len ? -dz / len : 0
      const nz = len ? dx / len : 0
      const x = w.from.x * U + dx * w.t + nx * side
      const z = w.from.y * U + dz * w.t + nz * side
      w.person.root.position.set(x, 0, z)
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
    const zoom = this.width < 650 ? 1.12 : 1
    const size = (Math.max(6, Math.min(40, 9 * (c.distance / 8))) * this.framing) / zoom
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
      pl.root.visible = onFoot
      pl.root.position.set(ctl.pos.x * U, 0, ctl.pos.z * U)
      pl.root.rotation.y = (ctl.heading * Math.PI) / 180
      const speed = ctl.speed * U
      const anim: NpcAnim =
        ctl.mode === 'run' ? 'run' : ctl.mode === 'walk' && speed > 0.05 ? 'walk' : 'idle'
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
    if (v) {
      if (!this.car && !this.carLoading) this.loadCar()
      const car = this.car
      if (car) {
        car.position.set(v.x * U, 0, v.z * U)
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
    this.stepRemotes(dt)
    this.updateCamera()
    const p = new THREE.Vector3()
    for (const m of this.markers) {
      p.copy(m.at).project(this.camera)
      const x = (p.x * 0.5 + 0.5) * this.width
      const y = (-p.y * 0.5 + 0.5) * this.height
      m.el.style.transform = `translate(${x.toFixed(1)}px,${y.toFixed(1)}px) translate(-50%,-100%)`
      const near = Math.hypot(m.door.x - c.x, m.door.y - c.y) < 9
      m.el.style.visibility =
        near && p.z < 1 && x > 0 && x < this.width && y > 40 ? 'visible' : 'hidden'
    }
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
    const r: Remote = { key, name: who.name, person: null, loading: true }
    this.remotes.set(key, r)
    const spec = avatarSpec(remoteModel(key))
    void this.load(spec.url)
      .then((g) => {
        if (this.disposed || this.remotes.get(key) !== r) return
        r.person = this.makePerson(g, spec, pagneColor(who.pagne))
        r.person.root.name = `Joueur ${who.name}`
        this.scene.add(r.person.root)
        r.loading = false
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

  /** Test hooks: the same `__LOME_PLAYER` the PlayCanvas rig published, plus the street. */
  private publishProbe(): void {
    const ctl = this.controller
    const w = window as unknown as Record<string, unknown>
    w.__LOME_STREET = {
      engine: 'haroo',
      window: this.win ? { cx: this.win.cx, cy: this.win.cy, doors: this.win.doors.length } : null,
      buildings: this.win?.buildings.length ?? 0,
      pedestrians: this.walkers.length,
      kenney: Boolean(this.bank),
      rebuildMs: this.rebuildMs,
      tiles: this.tiles.size,
      tileMs: this.tileMs,
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
      driving: ctl.driving,
      model: this.avatarModel,
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
