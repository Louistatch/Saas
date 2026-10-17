/**
 * HarooLife engine — an interior (imperative Three.js, ported from the « Une vie à Lomé »
 * prototype `scene.js`). One instance owns one WebGL renderer, one animation frame loop, the
 * DOM markers of the room and every GPU resource it loaded: `dispose()` releases all of them,
 * so React can mount, unmount and mount again (strict mode, route changes) without leaking
 * canvases, listeners or loops.
 *
 * The engine draws and moves; it never applies game rules. Reaching an interaction point
 * calls `events.onUse(propId)` (or `onTalk`, `onLeave`) once, and the game decides the effect.
 */
import {
  type AvatarSpec,
  adultFor,
  avatarSpec,
  clipFor,
} from '@/lib/haroolife/city/avatar-catalogue'
import type { Meal } from '@/lib/haroolife/city/dining'
import type { NpcAnim } from '@/lib/haroolife/city/interiors'
import type { InputState } from '@/lib/haroolife/city/player'
import { SHAPE_MATERIALS, type ShapeMaterial } from '@/lib/haroolife/city/prop-shapes'
import type { DailyViewProps } from '@/lib/haroolife/engine/types'
import { type Point, isFree, pathfind } from '@/lib/haroolife/game/core/pathfind'
import type { Hotspot, PrimitivePlacement, RoomScene } from '@/lib/haroolife/game/core/scene'
import * as THREE from 'three'
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { placeScreenMarkers } from '../core/screen-markers'
import {
  type AvatarActor,
  createAvatarActor,
  disposeAvatarActor,
  playAvatarActor,
} from './avatar-actor'
import { createGltfLoader } from './gltf'
import { PerfProbe } from './perf-probe'
import { plantSeatedFeet } from './seated-feet'

/** Walk and run speeds (units/s). The clips play at the rate that keeps the feet planted. */
export const WALK_SPEED = 1.3
export const RUN_SPEED = 2.4
/** Height of every figure in the room (the adult characters' own height, as in the prototype). */
const FIGURE = 1.85
/** Distance at which an interaction point counts as reached. */
const ARRIVE = 0.12
/** Default camera bearing (radians): the prototype's three-quarter view. */
export const CAMERA_YAW = 0.74
const CAMERA_ELEVATION = 0.7
const CAMERA_DISTANCE = 55
const WALL_HEIGHT = 3.3

export interface RoomWorldEvents extends Omit<DailyViewProps, 'meal'> {
  /** Reached the interaction point of a Saas prop: run its action (once). */
  onUse: (propId: string) => void
  /** Reached a non-player character: open the conversation. */
  onTalk?: (npcId: string) => void
  /** Reached the way out. */
  onLeave: () => void
  /** The requested target cannot be reached. */
  onNotice?: (message: string) => void
  onTarget?: (label: string | null) => void
  /** The world is drawn (assets loaded). */
  onReady?: () => void
  /** Loading failed for the player's avatar (the scene cannot be played). */
  onError?: (message: string) => void
  /** Rendering statistics, about twice a second (diagnostics overlay). */
  onFrame?: (s: { drawCalls: number; fps: number }) => void
}

export interface RoomWorldOptions {
  canvas: HTMLCanvasElement
  /** Layer above the canvas for interaction markers (buttons, 44 px targets). */
  markers: HTMLElement
  input: InputState
  avatarModel: string
  pagne?: string
  events: RoomWorldEvents
  scene: RoomScene
  pixelRatio?: number
}

type Person = AvatarActor

interface Marker {
  hotspot: Hotspot
  anchor: THREE.Object3D
  el: HTMLButtonElement
}

type Goal = { hotspot: Hotspot; path: Point[]; meal?: string } | { point: Point; path: Point[] }

export class RoomWorld {
  private readonly canvas: HTMLCanvasElement
  private readonly markersRoot: HTMLElement
  private readonly input: InputState
  private readonly events: RoomWorldEvents
  private readonly def: RoomScene
  private readonly renderer: THREE.WebGLRenderer
  private readonly scene = new THREE.Scene()
  private readonly camera = new THREE.OrthographicCamera(-10, 10, 10, -10, 0.1, 350)
  private readonly target = new THREE.Vector3(0, 0.5, 0)
  private readonly loader = createGltfLoader()
  private readonly gltfs = new Map<string, Promise<GLTF>>()
  private readonly loaded: GLTF[] = []
  private readonly geometries = new Map<string, THREE.BufferGeometry>()
  private readonly materials = new Map<string, THREE.MeshStandardMaterial>()
  private readonly stage = new THREE.Group()
  private readonly walls: THREE.Mesh[] = []
  private readonly markers: Marker[] = []
  private readonly npcs: Person[] = []
  private readonly seatedNpcs = new Set<Person>()
  private readonly raycaster = new THREE.Raycaster()
  private readonly ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
  private readonly resizeObserver: ResizeObserver
  private player: Person | null = null
  private readonly avatarModel: string
  private readonly pagne?: string
  private left = false
  private goal: Goal | null = null
  private readonly guidanceGeometry = new THREE.BufferGeometry()
  private readonly guidanceMaterial = new THREE.LineBasicMaterial({
    color: '#16875e',
    transparent: true,
    opacity: 0.8,
  })
  private readonly guidance = new THREE.Line(this.guidanceGeometry, this.guidanceMaterial)
  private readonly targetGeometry = new THREE.RingGeometry(0.32, 0.41, 24)
  private readonly targetMaterial = new THREE.MeshBasicMaterial({
    color: '#22b478',
    side: THREE.DoubleSide,
    depthWrite: false,
  })
  private readonly targetHalo = new THREE.Mesh(this.targetGeometry, this.targetMaterial)
  private performing: { propId: string; anim: NpcAnim } | null = null
  private posture: {
    id: string
    phase: 'enter' | 'idle' | 'exit'
    elapsed: number
    from: THREE.Vector3
    to: THREE.Vector3
    heading: number
  } | null = null
  private afterStand: Goal | null = null
  private meal: Meal | null = null
  private mealRequest: string | null = null
  private mealSeconds = 0
  /** Where the player stood before stepping onto a machine (back there on the next move). */
  private offDevice: { x: number; z: number } | null = null
  private width = 1
  private height = 1
  private yaw = CAMERA_YAW
  private activityFraming = 0
  private raf = 0
  private last = 0
  private disposed = false
  private speed = 0
  private frames = 0
  private statsAt = 0
  /** Frame statistics for `__LOME_PERF` (diagnostics overlay, performance scenarios). */
  private readonly perf = new PerfProbe()
  private probed = false
  private down: { x: number; y: number } | null = null
  private readonly onPointerDown = (e: PointerEvent) => {
    this.down = { x: e.clientX, y: e.clientY }
  }
  private readonly onPointerUp = (e: PointerEvent) => {
    const start = this.down
    this.down = null
    if (!start || Math.hypot(e.clientX - start.x, e.clientY - start.y) > 12) return
    const p = this.screenToFloor(e.clientX, e.clientY)
    if (p) this.walkTo({ point: p, path: [] })
  }
  private readonly onPointerCancel = () => {
    this.down = null
  }

  constructor(o: RoomWorldOptions) {
    this.canvas = o.canvas
    this.markersRoot = o.markers
    this.input = o.input
    this.events = o.events
    this.def = o.scene
    this.avatarModel = o.avatarModel
    this.pagne = o.pagne
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      powerPreference: 'high-performance',
    })
    this.renderer.setPixelRatio(o.pixelRatio ?? Math.min(window.devicePixelRatio || 1, 1.7))
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFShadowMap
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.15
    this.scene.name = 'HarooLife'
    this.scene.background = new THREE.Color(this.def.palette.background)
    this.scene.add(new THREE.HemisphereLight('#f2f6ff', '#9aa380', 2.5))
    const sun = new THREE.DirectionalLight('#fff1d6', 3.2)
    sun.position.set(-12, 24, 14)
    sun.castShadow = true
    sun.shadow.mapSize.set(1024, 1024)
    const reach = Math.max(18, Math.max(this.def.room.w, this.def.room.d) * 0.9)
    Object.assign(sun.shadow.camera, { left: -reach, right: reach, top: reach, bottom: -reach })
    sun.shadow.bias = -0.0003
    sun.shadow.normalBias = 0.035
    this.scene.add(sun, sun.target)
    this.stage.name = this.def.title
    this.scene.add(this.stage)
    this.canvas.addEventListener('pointerdown', this.onPointerDown)
    this.canvas.addEventListener('pointerup', this.onPointerUp)
    this.canvas.addEventListener('pointercancel', this.onPointerCancel)
    this.resizeObserver = new ResizeObserver(() => this.resize())
    this.resizeObserver.observe(this.canvas)
    this.resize()
  }

  // ── lifecycle ────────────────────────────────────────────────────────────────────────────

  async init(): Promise<void> {
    const spec = avatarSpec(this.avatarModel)
    const urls = [...new Set(this.def.models.map((m) => m.url))]
    const npcSpecs = this.def.npcs.map((n) => avatarSpec(adultFor(n.model)))
    const [avatar, ...rest] = await Promise.allSettled([
      this.load(spec.url),
      ...urls.map((u) => this.load(u)),
      ...npcSpecs.map((s) => this.load(s.url)),
    ])
    if (this.disposed) return
    if (avatar.status === 'rejected') {
      this.events.onError?.('Le personnage 3D n’a pas pu être chargé.')
      return
    }
    this.buildRoom()
    this.buildPrimitives()
    urls.forEach((u, i) => {
      const r = rest[i]
      if (r.status === 'fulfilled') this.placeModels(u, r.value)
    })
    this.def.npcs.forEach((n, i) => {
      const r = rest[urls.length + i]
      if (r.status !== 'fulfilled') return
      const npc = this.makePerson(r.value, npcSpecs[i])
      npc.root.name = `PNJ:${n.id}`
      npc.root.position.set(n.x, 0, n.z)
      npc.root.rotation.y = n.heading
      // Characters stay where the layout puts them: a walking clip would slide in place.
      const anim = n.anim === 'walk' || n.anim === 'run' ? 'idle' : (n.anim as NpcAnim)
      this.play(npc, clipFor(npc.spec, anim))
      if (n.anim === 'sit' && n.seatHeight !== undefined) {
        npc.root.position.y = n.seatHeight - npc.seatContact.y
        this.seatedNpcs.add(npc)
      }
      this.stage.add(npc.root)
      this.npcs.push(npc)
    })
    this.buildMarkers()
    this.targetHalo.name = 'Orientation objet'
    this.targetHalo.rotation.x = -Math.PI / 2
    this.stage.add(this.guidance, this.targetHalo)
    this.player = this.makePerson(avatar.value, spec, this.pagne)
    this.player.root.name = 'Joueur'
    this.player.root.position.set(this.def.spawn.x, 0, this.def.spawn.z)
    this.player.root.rotation.y = this.def.spawnHeading
    this.stage.add(this.player.root)
    this.updateCamera(true)
    this.publishInterior()
    this.last = performance.now()
    this.raf = requestAnimationFrame(this.frame)
    this.events.onReady?.()
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    cancelAnimationFrame(this.raf)
    this.canvas.removeEventListener('pointerdown', this.onPointerDown)
    this.canvas.removeEventListener('pointerup', this.onPointerUp)
    this.canvas.removeEventListener('pointercancel', this.onPointerCancel)
    this.resizeObserver.disconnect()
    this.guidanceGeometry.dispose()
    this.guidanceMaterial.dispose()
    this.targetGeometry.dispose()
    this.targetMaterial.dispose()
    for (const m of this.markers) m.el.remove()
    this.markers.length = 0
    if (this.player) this.disposePerson(this.player)
    this.player = null
    for (const n of this.npcs) this.disposePerson(n)
    this.npcs.length = 0
    this.seatedNpcs.clear()
    // Everything below was created or loaded by this instance only.
    for (const g of this.geometries.values()) g.dispose()
    for (const m of this.materials.values()) m.dispose()
    this.freeLoaded()
    this.renderer.dispose()
    this.perf.dispose()
    const w = window as unknown as { __LOME_INTERIOR?: unknown; __LOME_SCENE?: unknown }
    w.__LOME_INTERIOR = undefined
    w.__LOME_SCENE = undefined
  }

  private freeLoaded(): void {
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
  }

  // ── commands from the game ───────────────────────────────────────────────────────────────

  /** Walk to the interaction point of this Saas prop, then use it (HUD activity buttons). */
  approach(propId: string): void {
    const h = this.def.hotspots.find(
      (x) => x.id === propId || (x.kind === 'prop' && x.ref === propId),
    )
    if (!h) {
      this.events.onNotice?.('Cette activité n’est pas disponible ici.')
      return
    }
    this.walkTo({ hotspot: h, path: [] })
  }

  /** The activity the game says is running (equipment and animation), or none. */
  setActivity(activity: { prop: string; anim: NpcAnim } | null): void {
    this.performing = activity ? { propId: activity.prop, anim: activity.anim } : null
    const pl = this.player
    if (!pl) return
    if (
      activity &&
      ['sit', 'eat-seated'].includes(activity.anim) &&
      this.def.seats?.[activity.prop]
    ) {
      if (!this.posture) this.sit(activity.prop)
      return
    }
    if (!activity && this.posture && this.posture.phase !== 'exit') this.stand()
    const spot = activity ? this.def.onDevice[activity.prop] : undefined
    if (spot && !this.offDevice) {
      // Machines are used standing on them (treadmill, bike, bench, mat).
      this.offDevice = { x: pl.root.position.x, z: pl.root.position.z }
      pl.root.position.set(spot.x, spot.seat === undefined ? 0 : spot.seat - pl.seatOffset, spot.z)
      pl.root.rotation.y = spot.heading
    } else if (!spot) this.stepOff()
  }

  setMeal(meal: Meal | null): void {
    this.meal = meal
    if (!meal) {
      this.mealRequest = null
      this.mealSeconds = 0
      if (this.goal && 'hotspot' in this.goal && this.goal.meal) this.goal = null
      return
    }
    if (meal.phase !== 'approach' || this.mealRequest === meal.id || !this.player) return
    this.mealRequest = meal.id
    if (this.posture) {
      if (this.posture.phase === 'idle') this.events.onMealReady?.(meal.id, this.posture.id)
      return
    }
    const pos = this.player.root.position
    const seats = Object.entries(this.def.seats ?? {})
      .filter(([, seat]) => seat.mealAllowed !== false)
      .sort(
        (a, b) =>
          Math.hypot(a[1].x - pos.x, a[1].z - pos.z) - Math.hypot(b[1].x - pos.x, b[1].z - pos.z),
      )
    for (const [id, seat] of seats) {
      const h = this.def.hotspots.find((h) => h.kind === 'prop' && h.ref === id)
      if (!h || !isFree(seat.entry.x, seat.entry.z, this.def.obstacles, this.def.bounds)) continue
      if (
        Math.hypot(pos.x - h.at.x, pos.z - h.at.z) > 0.5 &&
        !pathfind(pos, h.at, this.def.obstacles, this.def.bounds).length
      )
        continue
      this.walkTo({ hotspot: h, path: [], meal: meal.id })
      return
    }
    this.events.onNotice?.('Aucune place libre accessible. Tu peux manger debout ici.')
    this.events.onMealReady?.(meal.id, null)
  }

  private sit(id: string): void {
    const pl = this.player
    const seat = this.def.seats?.[id]
    if (!pl || !seat) return
    const contact = pl.seatContact.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), seat.heading)
    this.posture = {
      id,
      phase: 'enter',
      elapsed: 0,
      from: pl.root.position.clone(),
      to: new THREE.Vector3(seat.x - contact.x, seat.height - contact.y, seat.z - contact.z),
      heading: seat.heading,
    }
    this.goal = null
    this.play(pl, 'HarooSitEnter')
  }

  private stand(): boolean {
    const p = this.posture
    const pl = this.player
    if (!p || !pl || p.phase === 'exit') return false
    const entry = this.def.seats?.[p.id]?.entry
    if (!entry || !isFree(entry.x, entry.z, this.def.obstacles, this.def.bounds)) {
      this.events.onNotice?.('La sortie du siège est occupée. Attends qu’elle se libère.')
      return false
    }
    this.posture = {
      ...p,
      phase: 'exit',
      elapsed: 0,
      from: pl.root.position.clone(),
      to: new THREE.Vector3(entry.x, 0, entry.z),
    }
    this.performing = null
    this.play(pl, 'HarooSitExit')
    this.events.onActivityEnd?.()
    return true
  }

  private stepOff(): void {
    const pl = this.player
    if (!pl || !this.offDevice) return
    pl.root.position.set(this.offDevice.x, 0, this.offDevice.z)
    this.offDevice = null
  }

  // ── scene construction ───────────────────────────────────────────────────────────────────

  private load(url: string): Promise<GLTF> {
    let p = this.gltfs.get(url)
    if (!p) {
      p = this.loader.loadAsync(url).then((g) => {
        this.loaded.push(g)
        // Arrived after dispose (unmounted while loading): free it now, nobody else will.
        if (this.disposed) this.freeLoaded()
        return g
      })
      this.gltfs.set(url, p)
    }
    return p
  }

  private mat(
    color: string,
    gloss = 0.07,
    metalness = 0,
    emissive?: string,
  ): THREE.MeshStandardMaterial {
    const key = `${color}|${gloss}|${metalness}|${emissive ?? ''}`
    let m = this.materials.get(key)
    if (!m) {
      m = new THREE.MeshStandardMaterial({
        color,
        roughness: 1 - gloss * 0.8,
        metalness,
        emissive: emissive ? new THREE.Color(emissive) : undefined,
      })
      this.materials.set(key, m)
    }
    return m
  }

  private boxGeo(w: number, h: number, d: number): THREE.BufferGeometry {
    const k = `b${w},${h},${d}`
    let g = this.geometries.get(k)
    if (!g) {
      g = new THREE.BoxGeometry(w, h, d)
      this.geometries.set(k, g)
    }
    return g
  }

  private box(
    parent: THREE.Object3D,
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    d: number,
    color: string,
    shadow = true,
  ): THREE.Mesh {
    const m = new THREE.Mesh(this.boxGeo(w, h, d), this.mat(color))
    m.position.set(x, y, z)
    m.castShadow = shadow
    m.receiveShadow = true
    parent.add(m)
    return m
  }

  private buildRoom(): void {
    const g = this.stage
    const p = this.def.palette
    const W = this.def.room.w
    const D = this.def.room.d
    // Lawn and plinth around the cut-away room.
    this.box(g, 0, -0.45, 0, 300, 0.3, 300, p.ground, false)
    const lawnGeo = new THREE.CylinderGeometry(
      Math.hypot(W, D) * 0.6,
      Math.hypot(W, D) * 0.6,
      0.07,
      64,
    )
    this.geometries.set('lawn', lawnGeo)
    const lawn = new THREE.Mesh(lawnGeo, this.mat(p.lawn))
    lawn.position.y = -0.29
    lawn.receiveShadow = true
    g.add(lawn)
    this.box(g, 0, -0.15, 0, W + 0.25, 0.3, D + 0.25, p.plinth)
    this.box(g, 0, -0.04, 0, W, 0.1, D, p.floor)
    // Checker tiles (only where two tile colours are set: the house).
    if (p.tileA !== p.tileB) {
      for (let x = -W / 2 + 0.5; x < W / 2; x++)
        for (let z = -D / 2 + 0.5; z < D / 2; z++)
          this.box(
            g,
            x,
            0.005,
            z,
            0.985,
            0.016,
            0.985,
            Math.round(x + z) % 2 ? p.tileA : p.tileB,
            false,
          )
    }
    // Two walls; the one between the camera and the room is hidden (cut-away).
    const back = this.box(g, 0, WALL_HEIGHT / 2, -D / 2 - 0.1, W + 0.05, WALL_HEIGHT, 0.19, p.wall)
    back.userData.axis = 'z'
    back.name = 'Mur du fond'
    const side = this.box(g, -W / 2 - 0.1, WALL_HEIGHT / 2, 0, 0.19, WALL_HEIGHT, D + 0.05, p.wall)
    side.userData.axis = 'x'
    side.name = 'Mur latéral'
    this.walls.push(back, side)
    this.box(g, 0, 0.13, -D / 2 + 0.02, W - 0.15, 0.2, 0.05, p.trim)
    this.box(g, -W / 2 + 0.02, 0.13, 0, 0.05, 0.2, D - 0.15, p.trim)
    // A window on the side wall.
    const wz = -D * 0.16
    this.box(g, -W / 2 - 0.05, 1.95, wz, 0.08, 1.45, 2.35, '#e5dfcb')
    this.box(g, -W / 2 + 0.01, 1.95, wz, 0.05, 1.2, 2.1, '#a4ced1')
    for (let i = 0; i < 6; i++)
      this.box(g, -W / 2 + 0.05, 1.45 + i * 0.2, wz, 0.04, 0.045, 2.1, '#d7e3dc')
    const d = this.def.door
    if (d.z < 0) {
      // Door on the back wall (the house).
      this.box(g, d.x, 1.25, d.z, 1.35, 2.5, 0.09, '#916c48')
      this.box(g, d.x, 1.22, d.z + 0.07, 1.1, 2.28, 0.08, '#a78258')
    } else {
      // Entrance on the open front: a doormat.
      this.box(g, d.x, 0.02, d.z - 0.55, 1.9, 0.02, 0.8, '#2f6f55', false)
    }
    for (const r of this.def.rugs) this.box(g, r.x, 0.015, r.z, r.w, 0.025, r.d, r.color, false)
    for (const pl of this.def.plants) this.plant(pl.x, pl.z, pl.scale)
  }

  private plant(x: number, z: number, scale: number): void {
    const g = new THREE.Group()
    g.position.set(x, 0, z)
    g.scale.setScalar(scale)
    this.stage.add(g)
    const potGeo = this.geometries.get('pot') ?? new THREE.CylinderGeometry(0.27, 0.2, 0.36, 8)
    this.geometries.set('pot', potGeo)
    const pot = new THREE.Mesh(potGeo, this.mat('#c6986e'))
    pot.position.y = 0.18
    pot.castShadow = true
    g.add(pot)
    const leafGeo = this.geometries.get('leaf') ?? new THREE.IcosahedronGeometry(0.38, 0)
    this.geometries.set('leaf', leafGeo)
    for (let i = 0; i < 6; i++) {
      const a = (i * Math.PI) / 3
      const m = new THREE.Mesh(leafGeo, this.mat(i % 2 ? '#537a48' : '#6d9459'))
      m.position.set(Math.cos(a) * 0.25, 0.65 + (i % 2) * 0.1, Math.sin(a) * 0.25)
      m.scale.set(0.65, 1.5, 0.4)
      m.rotation.set(Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5)
      m.castShadow = true
      g.add(m)
    }
  }

  /** The primitive parts of the Saas props, merged into one mesh per material. */
  private buildPrimitives(): void {
    const groups = new Map<ShapeMaterial, THREE.BufferGeometry[]>()
    for (const pp of this.def.primitives) {
      const list = groups.get(pp.part.m) ?? []
      list.push(this.partGeometry(pp))
      groups.set(pp.part.m, list)
    }
    for (const [key, list] of groups) {
      const merged = mergeGeometries(list, false)
      for (const g of list) g.dispose()
      if (!merged) continue
      this.geometries.set(`prim:${key}`, merged)
      const s = SHAPE_MATERIALS[key]
      const mesh = new THREE.Mesh(merged, this.mat(s.color, s.gloss, s.metalness ?? 0, s.emissive))
      mesh.name = `objets:${key}`
      mesh.castShadow = true
      mesh.receiveShadow = true
      this.stage.add(mesh)
    }
  }

  private partGeometry(pp: PrimitivePlacement): THREE.BufferGeometry {
    const part = pp.part
    const deg = THREE.MathUtils.degToRad
    const g =
      part.t === 'box'
        ? new THREE.BoxGeometry(1, 1, 1)
        : part.t === 'cyl'
          ? new THREE.CylinderGeometry(part.r, part.r, part.h, 14)
          : new THREE.SphereGeometry(part.r, 14, 10)
    const rot = part.t === 'ball' ? undefined : part.rot
    const local = new THREE.Matrix4().compose(
      new THREE.Vector3(...part.p),
      new THREE.Quaternion().setFromEuler(
        new THREE.Euler(deg(rot?.[0] ?? 0), deg(rot?.[1] ?? 0), deg(rot?.[2] ?? 0)),
      ),
      part.t === 'box' ? new THREE.Vector3(...part.s) : new THREE.Vector3(1, 1, 1),
    )
    const placed = new THREE.Matrix4().compose(
      new THREE.Vector3(pp.x, 0, pp.z),
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), pp.rotation),
      new THREE.Vector3(pp.scale, pp.scale, pp.scale),
    )
    g.applyMatrix4(local)
    g.applyMatrix4(placed)
    return g.index ? g.toNonIndexed() : g
  }

  private placeModels(url: string, gltf: GLTF): void {
    for (const f of this.def.models) {
      if (f.url !== url) continue
      const anchor = new THREE.Group()
      anchor.name = f.name ?? url
      anchor.position.set(f.x, f.y ?? 0, f.z)
      anchor.rotation.y = f.rotation ?? 0
      // Clones share the loaded geometry and materials (owned by this world, disposed once).
      const mesh = gltf.scene.clone(true)
      mesh.scale.setScalar(f.scale)
      mesh.updateMatrixWorld(true)
      const b = new THREE.Box3().setFromObject(mesh)
      const c = b.getCenter(new THREE.Vector3())
      mesh.position.set(-c.x, -b.min.y, -c.z)
      anchor.add(mesh)
      anchor.traverse((o) => {
        if ((o as THREE.Mesh).isMesh) {
          o.castShadow = true
          o.receiveShadow = true
        }
      })
      this.stage.add(anchor)
    }
  }

  private buildMarkers(): void {
    for (const h of this.def.hotspots) {
      const anchor = new THREE.Object3D()
      anchor.position.set(h.at.x, h.markerY, h.at.z)
      if (h.kind !== 'exit') {
        // Above the object itself, not above the spot where the player stands.
        anchor.position.set((h.at.x + h.faces.x) / 2, h.markerY, (h.at.z + h.faces.z) / 2)
      }
      this.stage.add(anchor)
      const el = document.createElement('button')
      el.type = 'button'
      el.dataset.hotspot = h.id
      el.setAttribute('aria-label', h.label)
      el.title = h.label
      el.textContent = h.icon
      el.dataset.label = h.label
      el.className =
        h.kind === 'npc'
          ? 'pointer-events-auto absolute left-0 top-0 flex h-11 w-11 items-center justify-center rounded-full border-2 border-white bg-[#f7f8f1]/80 text-base shadow'
          : 'pointer-events-auto absolute left-0 top-0 flex h-11 w-11 items-center justify-center rounded-full border-2 border-white bg-white/90 text-lg shadow-md'
      el.addEventListener('click', (e) => {
        e.stopPropagation()
        this.walkTo({ hotspot: h, path: [] })
      })
      this.markersRoot.append(el)
      this.markers.push({ hotspot: h, anchor, el })
    }
  }

  private makePerson(gltf: GLTF, spec: AvatarSpec, pagne?: string): Person {
    return createAvatarActor(gltf, spec, FIGURE, pagne)
  }

  private disposePerson(p: Person): void {
    disposeAvatarActor(p)
  }

  private walkTo(goal: Goal): void {
    if (!this.player) return
    if (this.posture) {
      this.afterStand = goal
      if (this.posture.phase !== 'exit') this.stand()
      return
    }
    if (this.meal && !('hotspot' in goal && goal.meal === this.meal.id))
      this.events.onActivityEnd?.()
    this.stepOff()
    const pos = this.player.root.position
    const dest = 'hotspot' in goal ? goal.hotspot.at : goal.point
    const path = pathfind({ x: pos.x, z: pos.z }, dest, this.def.obstacles, this.def.bounds)
    if (path.length === 0) {
      if (Math.hypot(pos.x - dest.x, pos.z - dest.z) < 0.6) {
        this.goal = { ...goal, path: [] }
        this.arrive()
        return
      }
      this.goal = null
      this.events.onNotice?.('Ce passage est occupé. Choisis un emplacement libre.')
      return
    }
    // The last cell is approximate: end exactly on the interaction point.
    path[path.length - 1] = dest
    this.goal = { ...goal, path }
    this.guidanceGeometry.dispose()
    this.guidanceGeometry.deleteAttribute('position')
    this.guidanceGeometry.setFromPoints(
      [{ x: pos.x, z: pos.z }, ...path].map((p) => new THREE.Vector3(p.x, 0.035, p.z)),
    )
    this.guidanceGeometry.computeBoundingSphere()
    this.targetHalo.position.set(dest.x, 0.04, dest.z)
    this.events.onTarget?.('hotspot' in goal ? goal.hotspot.label : 'Emplacement libre')
    this.performing = null
  }

  private arrive(): void {
    const g = this.goal
    this.goal = null
    this.events.onTarget?.(null)
    if (!g || !('hotspot' in g) || !this.player) return
    const h = g.hotspot
    const p = this.player.root.position
    this.player.root.rotation.y = Math.atan2(h.faces.x - p.x, h.faces.z - p.z)
    if (h.kind === 'exit') this.leave()
    else if (h.kind === 'npc') this.events.onTalk?.(h.ref)
    else this.events.onUse(h.ref)
  }

  private leave(): void {
    if (this.left) return
    this.left = true
    this.events.onLeave()
  }

  private move(dt: number): void {
    const pl = this.player
    if (!pl) return
    const p = pl.root.position
    const ix = this.input.x
    const iy = this.input.y
    const mag = Math.hypot(ix, iy)
    const seated = this.posture
    if (seated) {
      this.speed = 0
      if (mag > 0.12 && seated.phase !== 'exit') this.stand()
      const p = this.posture!
      p.elapsed += dt
      if (p.phase === 'idle') {
        this.play(pl, this.performing?.anim === 'eat-seated' ? 'HarooEatSeated' : 'HarooSitIdle')
      } else {
        const name = p.phase === 'enter' ? 'HarooSitEnter' : 'HarooSitExit'
        this.play(pl, name)
        const duration = pl.actions.get(name)?.getClip().duration ?? 1.3
        const progress = Math.min(1, p.elapsed / duration)
        pl.root.position.lerpVectors(p.from, p.to, progress * progress * (3 - 2 * progress))
        pl.root.rotation.y = p.heading
        if (progress >= 1) {
          if (p.phase === 'enter') {
            p.phase = 'idle'
            p.elapsed = 0
            if (this.meal?.phase === 'approach') this.events.onMealReady?.(this.meal.id, p.id)
          } else {
            this.posture = null
            const next = this.afterStand
            this.afterStand = null
            if (this.meal?.phase === 'approach') {
              this.mealRequest = null
              this.setMeal(this.meal)
            } else if (next) this.walkTo(next)
          }
        }
      }
      return
    }
    let moved = 0
    let running = false
    if (mag > 0.12) {
      // The stick always wins: it cancels a walk towards a target and ends an activity pose.
      if (this.goal) this.events.onTarget?.(null)
      this.goal = null
      this.performing = null
      if (this.meal) this.events.onActivityEnd?.()
      this.stepOff()
      const m = Math.min(1, mag)
      // Walk by default; Shift or a joystick pushed to its rim (it sets `run`) runs.
      running = this.input.run
      const speed = (running ? RUN_SPEED : WALK_SPEED) * m
      const a = this.yaw
      // Screen up = away from the camera, screen right = camera right.
      const vx = ((Math.cos(a) * ix - Math.sin(a) * iy) / mag) * speed
      const vz = ((-Math.sin(a) * ix - Math.cos(a) * iy) / mag) * speed
      const ox = p.x
      const oz = p.z
      const b = this.def.bounds
      if (isFree(p.x + vx * dt, p.z, this.def.obstacles, b)) p.x += vx * dt
      if (isFree(p.x, p.z + vz * dt, this.def.obstacles, b)) p.z += vz * dt
      moved = Math.hypot(p.x - ox, p.z - oz)
      if (this.def.exitAtFront && p.z >= b.maxZ - 0.12 && vz > 0.05) this.leave()
      // Face where the stick points, not the residual slide along a wall (that turned the
      // player sideways against furniture).
      this.face(vx, vz, dt)
    } else if (this.goal && this.goal.path.length > 0) {
      const q = this.goal.path[0]
      const dx = q.x - p.x
      const dz = q.z - p.z
      const d = Math.hypot(dx, dz)
      let left = d
      for (let i = 1; i < this.goal.path.length; i++)
        left += Math.hypot(
          this.goal.path[i].x - this.goal.path[i - 1].x,
          this.goal.path[i].z - this.goal.path[i - 1].z,
        )
      running = left > 3
      const speed = running ? RUN_SPEED : WALK_SPEED
      if (d <= speed * dt + ARRIVE * 0.1) {
        p.x = q.x
        p.z = q.z
        this.goal.path.shift()
        moved = d
        if (this.goal.path.length === 0) this.arrive()
      } else {
        p.x += (dx / d) * speed * dt
        p.z += (dz / d) * speed * dt
        moved = speed * dt
        this.face(dx, dz, dt)
      }
    }
    this.speed = dt > 0 ? moved / dt : 0
    // Animation: locomotion from the speed really achieved; otherwise the activity's clip
    // (or the file's neutral pose when it has none: no fake sitting or sleeping animation).
    let anim: NpcAnim = 'idle'
    if (this.speed > 0.05) anim = running && this.speed > WALK_SPEED + 0.2 ? 'run' : 'walk'
    else if (this.performing) anim = this.performing.anim
    this.play(pl, clipFor(pl.spec, anim))
    if (anim === 'walk' || anim === 'run') {
      const natural = pl.spec.pace[anim] * FIGURE
      const rate = Math.min(3, Math.max(0.5, this.speed / natural))
      pl.actions.get(pl.current)?.setEffectiveTimeScale(rate)
    } else pl.actions.get(pl.current)?.setEffectiveTimeScale(1)
  }

  private face(x: number, z: number, dt: number): void {
    if (!this.player) return
    const target = Math.atan2(x, z)
    const r = this.player.root.rotation
    r.y += Math.atan2(Math.sin(target - r.y), Math.cos(target - r.y)) * Math.min(1, dt * 12)
  }

  private play(p: Person, clip: string): void {
    playAvatarActor(p, clip)
  }

  // ── camera, picking, loop ────────────────────────────────────────────────────────────────

  setPixelRatio(pixelRatio: number): void {
    if (this.renderer.getPixelRatio() === pixelRatio) return
    this.renderer.setPixelRatio(pixelRatio)
    this.resize()
  }

  private resize(): void {
    this.width = this.canvas.clientWidth || 1
    this.height = this.canvas.clientHeight || 1
    this.renderer.setSize(this.width, this.height, false)
    this.updateCamera(true)
  }

  private updateCamera(snap = false, dt = 0): void {
    const aspect = this.width / this.height
    // Phones (narrow) zoom in a little, as in the prototype.
    const zoom = this.width < 650 ? 1.12 : 1
    const v = this.def.view
    const focus = Boolean(this.posture || this.performing?.anim === 'eat')
    this.activityFraming +=
      ((focus ? 1 : 0) - this.activityFraming) * (snap ? 1 : Math.min(1, dt * 4))
    const size = (Math.max(v.height, v.width / aspect) / zoom) * (1 - this.activityFraming * 0.55)
    this.camera.left = -size * aspect
    this.camera.right = size * aspect
    this.camera.top = size
    this.camera.bottom = -size
    this.camera.updateProjectionMatrix()
    if ((v.follow || this.activityFraming > 0.001) && this.player) {
      // Bigger rooms: the camera keeps the player in view, without leaving the room.
      const p = this.player.root.position
      const hw = this.def.room.w / 2
      const hd = this.def.room.d / 2
      const tx =
        Math.max(-hw * 0.85, Math.min(hw * 0.85, p.x)) * (v.follow ? 1 : this.activityFraming)
      const tz =
        Math.max(-hd * 0.85, Math.min(hd * 0.85, p.z)) * (v.follow ? 1 : this.activityFraming)
      const k = snap ? 1 : Math.min(1, dt * 4)
      this.target.x += (tx - this.target.x) * k
      this.target.z += (tz - this.target.z) * k
    }
    const el = CAMERA_ELEVATION
    const t = this.target
    this.camera.position.set(
      t.x + Math.sin(this.yaw) * Math.cos(el) * CAMERA_DISTANCE,
      t.y + Math.sin(el) * CAMERA_DISTANCE,
      t.z + Math.cos(this.yaw) * Math.cos(el) * CAMERA_DISTANCE,
    )
    this.camera.lookAt(t)
    this.camera.updateMatrixWorld()
    for (const w of this.walls)
      w.visible =
        w.userData.axis === 'x' ? this.camera.position.x > t.x : this.camera.position.z > t.z
  }

  private screenToFloor(clientX: number, clientY: number): Point | null {
    const r = this.canvas.getBoundingClientRect()
    const ndc = new THREE.Vector2(
      ((clientX - r.left) / r.width) * 2 - 1,
      -((clientY - r.top) / r.height) * 2 + 1,
    )
    this.raycaster.setFromCamera(ndc, this.camera)
    const hit = new THREE.Vector3()
    return this.raycaster.ray.intersectPlane(this.ground, hit) ? { x: hit.x, z: hit.z } : null
  }

  private readonly frame = () => {
    if (this.disposed) return
    this.raf = requestAnimationFrame(this.frame)
    const now = performance.now()
    // Real time, whatever the frame rate: up to 250 ms per frame (a tab coming back from the
    // background does not jump further), integrated in steps of at most 50 ms so a slow phone
    // keeps the real walking speed and never steps through furniture.
    const dt = Math.min((now - this.last) / 1000, 0.25)
    this.last = now
    if (document.hidden) {
      this.perf.pause()
      return
    }
    this.perf.frame(now)
    const steps = Math.max(1, Math.ceil(dt / 0.05))
    for (let i = 0; i < steps; i++) this.move(dt / steps)
    this.player?.mixer.update(dt)
    if (this.player) {
      if (this.posture) {
        const p = this.posture
        const clip = p.phase === 'enter' ? 'HarooSitEnter' : 'HarooSitExit'
        const progress = Math.min(
          1,
          p.elapsed / (this.player.actions.get(clip)?.getClip().duration ?? 1.3),
        )
        plantSeatedFeet(
          this.player,
          p.phase === 'idle' ? 1 : p.phase === 'enter' ? progress : 1 - progress,
        )
      }
      const eating = this.player.current.startsWith('HarooEat')
      this.player.mealProps.show(eating)
      if (eating && this.meal?.phase === 'eating') {
        this.mealSeconds += dt
        if (this.mealSeconds >= 0.2) {
          this.events.onMealFrame?.(this.meal.id, Math.min(0.25, this.mealSeconds))
          this.mealSeconds = 0
        }
      }
    }
    for (const n of this.npcs) {
      n.mixer.update(dt)
      if (this.seatedNpcs.has(n)) plantSeatedFeet(n, 1)
    }
    if (
      this.def.view.follow ||
      this.posture ||
      this.activityFraming > 0.001 ||
      this.performing?.anim === 'eat'
    )
      this.updateCamera(false, dt)
    this.guidance.visible = !!this.goal
    this.targetHalo.visible = !!this.goal
    this.targetHalo.scale.setScalar(1 + Math.sin(now * 0.006) * 0.12)
    this.scene.updateMatrixWorld()
    const v = new THREE.Vector3()
    const projected = this.markers.flatMap((m) => {
      m.anchor.getWorldPosition(v)
      v.project(this.camera)
      const x = (v.x * 0.5 + 0.5) * this.width
      const y = (-v.y * 0.5 + 0.5) * this.height
      const inside =
        v.z < 1 && v.z > -1 && x > -20 && x < this.width + 20 && y > 0 && y < this.height + 40
      return inside && this.markerShown(m.hotspot)
        ? [{ id: m.hotspot.id, x, y, priority: m.hotspot.kind === 'npc' ? 2 : 1 }]
        : []
    })
    const placed = placeScreenMarkers(projected, this.width, this.height)
    for (const m of this.markers) {
      const p = placed.get(m.hotspot.id)
      m.el.style.visibility = p ? 'visible' : 'hidden'
      if (p)
        m.el.style.transform = `translate(${p.x.toFixed(1)}px,${p.y.toFixed(1)}px) translate(-50%,-50%)`
    }
    this.renderer.render(this.scene, this.camera)
    // The scene probe appears once the first frame is drawn (its GPU counters are then real).
    if (!this.probed) {
      this.probed = true
      this.publishProbes()
    } else this.publishInterior()
    this.frames++
    if (now - this.statsAt >= 500) {
      const fps = (this.frames * 1000) / Math.max(1, now - this.statsAt)
      this.events.onFrame?.({ drawCalls: this.renderer.info.render.calls, fps })
      this.frames = 0
      this.statsAt = now
      this.perf.publish(now, this.renderer, this.scene, {
        animated: (this.player ? 1 : 0) + this.npcs.length,
        assets: this.loaded.length,
      })
    }
  }

  /**
   * Big rooms (the camera follows): only what is within reach is marked, plus the way out and
   * the current target, so a gym full of machines stays readable on a phone. Small rooms (the
   * house) mark everything, as in the prototype.
   */
  private markerShown(h: Hotspot): boolean {
    if (this.posture || this.performing?.anim === 'eat') return h.kind === 'exit'
    if (!this.def.view.follow || h.kind === 'exit') return true
    const g = this.goal
    if (g && 'hotspot' in g && g.hotspot.id === h.id) return true
    const p = this.player?.root.position
    if (!p) return false
    return Math.hypot(h.at.x - p.x, h.at.z - p.z) < (h.kind === 'npc' ? 3 : 4.5)
  }

  /** Same probe shapes as the other renderers, so the end-to-end specs read every engine. */
  private publishInterior(): void {
    const w = window as unknown as Record<string, unknown>
    const pl = this.player
    const g = this.goal
    w.__LOME_INTERIOR = pl
      ? {
          engine: 'haroo',
          scene: this.def.id,
          avatar: pl.root.userData.avatar,
          x: pl.root.position.x,
          z: pl.root.position.z,
          heading: pl.root.rotation.y,
          speed: this.speed,
          anim: pl.current,
          posture: this.posture ? { id: this.posture.id, phase: this.posture.phase } : null,
          y: pl.root.position.y,
          mealProps: pl.root.getObjectByName('Repas · bol et ayimolou')?.visible ?? false,
          using: this.performing?.propId ?? null,
          goal: g ? ('hotspot' in g ? g.hotspot.ref : 'point') : null,
          left: this.left,
        }
      : null
  }

  private publishProbes(): void {
    this.publishInterior()
    const w = window as unknown as Record<string, unknown>
    const scene = this.scene
    const named = (n: string) => scene.getObjectByName(n) ?? null
    w.__LOME_SCENE = {
      engine: 'haroo',
      has: (n: string) => Boolean(named(n)),
      childNames: (n: string) => named(n)?.children.map((c) => c.name) ?? null,
      position: (n: string) => {
        const o = named(n)
        if (!o) return null
        const p = o.getWorldPosition(new THREE.Vector3())
        return { x: p.x, y: p.y, z: p.z }
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
