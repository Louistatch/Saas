/**
 * HarooLife engine — the house scene (imperative Three.js, ported from the « Une vie à Lomé »
 * prototype `scene.js`). One instance owns one WebGL renderer, one animation frame loop, the
 * DOM markers of the room and every GPU resource it loaded: `dispose()` releases all of them,
 * so React can mount, unmount and mount again (strict mode, route changes) without leaking
 * canvases, listeners or loops.
 *
 * The engine draws and moves; it never applies game rules. Reaching an interaction point
 * calls `events.onUse(propId)` once, and the game (lome-life-engine) decides the effect.
 */
import {
  type AvatarSpec,
  avatarSpec,
  clipFor,
  needsPagneWrap,
  recolorMap,
} from '@/lib/haroolife/city/avatar-catalogue'
import type { NpcAnim } from '@/lib/haroolife/city/interiors'
import type { InputState } from '@/lib/haroolife/city/player'
import { HOUSE_SCENE, type Hotspot, type HouseScene } from '@/lib/haroolife/game/core/house'
import { type Point, isFree, pathfind } from '@/lib/haroolife/game/core/pathfind'
import * as THREE from 'three'
import { type GLTF, GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js'

export const HAROO_ASSETS = {
  furniture: '/haroolife/assets/furniture/',
} as const

/** Walk and run speeds (units/s). The clips play at the rate that keeps the feet planted. */
export const WALK_SPEED = 1.3
export const RUN_SPEED = 2.4
/** Height of the player in the house (the adult characters' own height, as in the prototype). */
const PLAYER_HEIGHT = 1.85
/** Distance at which an interaction point counts as reached. */
const ARRIVE = 0.12
/** Default camera bearing (radians): the prototype's three-quarter view. */
export const CAMERA_YAW = 0.74
const CAMERA_ELEVATION = 0.7
const CAMERA_DISTANCE = 55

export interface HouseWorldEvents {
  /** Reached an interaction point: run the action of this Saas prop (once). */
  onUse: (propId: string) => void
  /** Reached the door. */
  onLeave: () => void
  /** The requested target cannot be reached. */
  onNotice?: (message: string) => void
  /** The world is drawn (assets loaded). */
  onReady?: () => void
  /** Loading failed for the avatar (the scene cannot be played). */
  onError?: (message: string) => void
  /** Rendering statistics, about twice a second (diagnostics overlay). */
  onFrame?: (s: { drawCalls: number; fps: number }) => void
}

export interface HouseWorldOptions {
  canvas: HTMLCanvasElement
  /** Layer above the canvas for interaction markers (buttons, 44 px targets). */
  markers: HTMLElement
  input: InputState
  avatarModel: string
  pagne?: string
  events: HouseWorldEvents
  scene?: HouseScene
  pixelRatio?: number
}

interface Person {
  root: THREE.Group
  mixer: THREE.AnimationMixer
  actions: Map<string, THREE.AnimationAction>
  current: string
  spec: AvatarSpec
  /** Displayed height (the walk cadence is computed from it). */
  height: number
  /** Materials cloned for this person (recoloured), disposed with it. */
  owned: THREE.Material[]
  /** Geometries created for this person (the pagne wrap of the classic characters). */
  ownedGeometry: THREE.BufferGeometry[]
}

interface Marker {
  hotspot: Hotspot
  anchor: THREE.Object3D
  el: HTMLButtonElement
}

type Goal = { hotspot: Hotspot; path: Point[] } | { point: Point; path: Point[] }

export class HouseWorld {
  private readonly canvas: HTMLCanvasElement
  private readonly markersRoot: HTMLElement
  private readonly input: InputState
  private readonly events: HouseWorldEvents
  private readonly def: HouseScene
  private readonly renderer: THREE.WebGLRenderer
  private readonly scene = new THREE.Scene()
  private readonly camera = new THREE.OrthographicCamera(-10, 10, 10, -10, 0.1, 350)
  private readonly target = new THREE.Vector3(0, 0.5, 0)
  private readonly loader = new GLTFLoader()
  private readonly gltfs = new Map<string, Promise<GLTF>>()
  private readonly loaded: GLTF[] = []
  private readonly geometries = new Map<string, THREE.BufferGeometry>()
  private readonly materials = new Map<string, THREE.MeshStandardMaterial>()
  private readonly stage = new THREE.Group()
  private readonly walls: THREE.Mesh[] = []
  private readonly markers: Marker[] = []
  private readonly raycaster = new THREE.Raycaster()
  private readonly ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
  private readonly resizeObserver: ResizeObserver
  private player: Person | null = null
  private avatarModel: string
  private pagne?: string
  private goal: Goal | null = null
  private performing: { propId: string; anim: NpcAnim } | null = null
  private width = 1
  private height = 1
  private yaw = CAMERA_YAW
  private zoom = 1
  private raf = 0
  private last = 0
  private disposed = false
  private speed = 0
  private frames = 0
  private statsAt = 0
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

  constructor(o: HouseWorldOptions) {
    this.canvas = o.canvas
    this.markersRoot = o.markers
    this.input = o.input
    this.events = o.events
    this.def = o.scene ?? HOUSE_SCENE
    this.avatarModel = o.avatarModel
    this.pagne = o.pagne
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      powerPreference: 'high-performance',
    })
    this.renderer.setPixelRatio(o.pixelRatio ?? Math.min(window.devicePixelRatio || 1, 1.7))
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap
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
    Object.assign(sun.shadow.camera, { left: -18, right: 18, top: 18, bottom: -18 })
    sun.shadow.bias = -0.0003
    sun.shadow.normalBias = 0.035
    this.scene.add(sun, sun.target)
    this.stage.name = 'Maison'
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
    const furniture = [...new Set(this.def.furniture.map((f) => f.model))]
    const [avatar, ...rest] = await Promise.allSettled([
      this.load(spec.url),
      ...furniture.map((m) => this.load(`${HAROO_ASSETS.furniture}${m}.glb`)),
    ])
    if (this.disposed) return
    if (avatar.status === 'rejected') {
      this.events.onError?.('Le personnage 3D n’a pas pu être chargé.')
      return
    }
    this.buildRoom()
    rest.forEach((r, i) => {
      if (r.status === 'fulfilled') this.placeFurniture(furniture[i], r.value)
    })
    this.buildMarkers()
    this.player = this.makePerson(avatar.value, spec, this.pagne)
    this.player.root.name = 'Joueur'
    this.player.root.position.set(this.def.spawn.x, 0, this.def.spawn.z)
    this.player.root.rotation.y = this.def.spawnHeading
    this.stage.add(this.player.root)
    this.updateCamera()
    this.publishProbes()
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
    for (const m of this.markers) m.el.remove()
    this.markers.length = 0
    if (this.player) this.disposePerson(this.player)
    this.player = null
    // Everything below was created or loaded by this instance only.
    for (const g of this.geometries.values()) g.dispose()
    for (const m of this.materials.values()) m.dispose()
    this.freeLoaded()
    this.renderer.dispose()
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
    const h = this.def.hotspots.find((x) => x.propId === propId)
    if (!h) {
      this.events.onNotice?.('Cette activité n’est pas disponible ici.')
      return
    }
    this.walkTo({ hotspot: h, path: [] })
  }

  /** The activity the game says is running (equipment and animation), or none. */
  setActivity(activity: { prop: string; anim: NpcAnim } | null): void {
    this.performing = activity ? { propId: activity.prop, anim: activity.anim } : null
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

  private mat(color: string): THREE.MeshStandardMaterial {
    let m = this.materials.get(color)
    if (!m) {
      m = new THREE.MeshStandardMaterial({ color, roughness: 0.93 })
      this.materials.set(color, m)
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
    // Lawn and plinth around the cut-away room.
    this.box(g, 0, -0.45, 0, 200, 0.3, 200, p.ground, false)
    const lawnGeo = new THREE.CylinderGeometry(11.3, 11.3, 0.07, 64)
    this.geometries.set('lawn', lawnGeo)
    const lawn = new THREE.Mesh(lawnGeo, this.mat(p.lawn))
    lawn.position.y = -0.29
    lawn.receiveShadow = true
    g.add(lawn)
    this.box(g, 0, -0.15, 0, 12.5, 0.3, 10.5, p.plinth)
    this.box(g, 0, -0.04, 0, 12.25, 0.1, 10.25, p.floor)
    // Checker tiles (one draw per colour after instancing would be nicer; 120 boxes is cheap).
    for (let x = -5.5; x < 6; x++)
      for (let z = -4.5; z < 5; z++)
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
    // Two walls; the one between the camera and the room is hidden (cut-away).
    const back = this.box(g, 0, 1.65, -5.1, 12.3, 3.3, 0.19, p.wall)
    back.userData.axis = 'z'
    back.name = 'Mur du fond'
    const side = this.box(g, -6.1, 1.65, 0, 0.19, 3.3, 10.3, p.wall)
    side.userData.axis = 'x'
    side.name = 'Mur latéral'
    this.walls.push(back, side)
    this.box(g, 0, 0.13, -4.98, 12.1, 0.2, 0.05, p.trim)
    this.box(g, -5.98, 0.13, 0, 0.05, 0.2, 10.1, p.trim)
    // Door on the back wall and a window on the side wall.
    const d = this.def.door
    this.box(g, d.x, 1.25, d.z, 1.35, 2.5, 0.09, '#916c48')
    this.box(g, d.x, 1.22, d.z + 0.07, 1.1, 2.28, 0.08, '#a78258')
    this.box(g, -5.95, 1.95, -1.6, 0.08, 1.45, 2.35, '#e5dfcb')
    this.box(g, -5.89, 1.95, -1.6, 0.05, 1.2, 2.1, '#a4ced1')
    for (let i = 0; i < 6; i++)
      this.box(g, -5.85, 1.45 + i * 0.2, -1.6, 0.04, 0.045, 2.1, '#d7e3dc')
    for (const r of this.def.rugs) {
      this.box(g, r.x, 0.015, r.z, r.w, 0.025, r.d, r.color, false)
    }
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

  private placeFurniture(model: string, gltf: GLTF): void {
    for (const f of this.def.furniture) {
      if (f.model !== model) continue
      const anchor = new THREE.Group()
      anchor.name = `meuble:${model}`
      anchor.position.set(f.x, 0, f.z)
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
      this.stage.add(anchor)
      const el = document.createElement('button')
      el.type = 'button'
      el.dataset.hotspot = h.id
      el.setAttribute('aria-label', h.label)
      el.title = h.label
      el.textContent = h.icon
      el.className =
        'pointer-events-auto absolute left-0 top-0 flex h-11 w-11 items-center justify-center rounded-full border-2 border-white bg-white/90 text-lg shadow-md'
      el.addEventListener('click', (e) => {
        e.stopPropagation()
        this.walkTo({ hotspot: h, path: [] })
      })
      this.markersRoot.append(el)
      this.markers.push({ hotspot: h, anchor, el })
    }
  }

  private makePerson(gltf: GLTF, spec: AvatarSpec, pagne?: string): Person {
    const root = new THREE.Group()
    const figure = cloneSkeleton(gltf.scene) as THREE.Group
    figure.name = 'figure'
    figure.rotation.y = THREE.MathUtils.degToRad(spec.yaw)
    // Adults keep their own size; the classic mini characters are brought to the same height.
    const k = PLAYER_HEIGHT / spec.height
    figure.scale.setScalar(k)
    root.add(figure)
    // Recolour from the file's own materials (never from a material already disposed): one
    // clone per source material, owned by this person.
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
    // Classic characters have no garment to recolour: a pagne wrap from the hips to mid-thigh.
    const ownedGeometry: THREE.BufferGeometry[] = []
    if (pagne && needsPagneWrap(spec)) {
      const geo = new THREE.BoxGeometry(1, 1, 1)
      const mat = new THREE.MeshStandardMaterial({ color: pagne, roughness: 0.9 })
      const wrap = new THREE.Mesh(geo, mat)
      wrap.name = 'pagne'
      wrap.position.set(0, 0.16 * k, -0.02 * k)
      wrap.scale.set(0.3 * k, 0.13 * k, 0.22 * k)
      wrap.castShadow = true
      root.add(wrap)
      ownedGeometry.push(geo)
      owned.push(mat)
    }
    const mixer = new THREE.AnimationMixer(figure)
    const actions = new Map<string, THREE.AnimationAction>()
    for (const clip of gltf.animations) actions.set(clip.name, mixer.clipAction(clip))
    const idle = clipFor(spec, 'idle')
    actions.get(idle)?.play()
    return {
      root,
      mixer,
      actions,
      current: idle,
      spec,
      height: PLAYER_HEIGHT,
      owned,
      ownedGeometry,
    }
  }

  private disposePerson(p: Person): void {
    p.mixer.stopAllAction()
    p.mixer.uncacheRoot(p.root)
    p.root.parent?.remove(p.root)
    p.root.traverse((o) => {
      const s = o as THREE.SkinnedMesh
      if (s.isSkinnedMesh) s.skeleton.dispose()
    })
    for (const m of p.owned) m.dispose()
    for (const g of p.ownedGeometry) g.dispose()
  }

  // ── movement and interactions ────────────────────────────────────────────────────────────

  private walkTo(goal: Goal): void {
    if (!this.player) return
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
    this.performing = null
  }

  private arrive(): void {
    const g = this.goal
    this.goal = null
    if (!g || !('hotspot' in g) || !this.player) return
    const h = g.hotspot
    const p = this.player.root.position
    this.player.root.rotation.y = Math.atan2(h.faces.x - p.x, h.faces.z - p.z)
    if (h.propId === 'exit') this.events.onLeave()
    else this.events.onUse(h.propId)
  }

  private move(dt: number): void {
    const pl = this.player
    if (!pl) return
    const p = pl.root.position
    const ix = this.input.x
    const iy = this.input.y
    const mag = Math.hypot(ix, iy)
    let moved = 0
    let running = false
    if (mag > 0.12) {
      // The stick always wins: it cancels a walk towards a target and ends an activity pose.
      this.goal = null
      this.performing = null
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
      const natural = pl.spec.pace[anim] * pl.height
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
    if (p.current === clip) return
    const next = p.actions.get(clip)
    if (!next) return
    p.actions.get(p.current)?.fadeOut(0.2)
    next.reset().fadeIn(0.2).play()
    p.current = clip
  }

  // ── camera, picking, loop ────────────────────────────────────────────────────────────────

  private resize(): void {
    this.width = this.canvas.clientWidth || 1
    this.height = this.canvas.clientHeight || 1
    this.renderer.setSize(this.width, this.height, false)
    this.updateCamera()
  }

  private updateCamera(): void {
    const aspect = this.width / this.height
    // Phones (narrow) zoom in a little, as in the prototype.
    this.zoom = this.width < 650 ? 1.12 : 1
    const size = Math.max(7.7, 8.8 / aspect) / this.zoom
    this.camera.left = -size * aspect
    this.camera.right = size * aspect
    this.camera.top = size
    this.camera.bottom = -size
    this.camera.updateProjectionMatrix()
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
      w.visible = w.userData.axis === 'x' ? this.camera.position.x > 0 : this.camera.position.z > 0
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
    // Capped at 100 ms: a slow phone keeps the real walking speed, a tab coming back from the
    // background does not jump (furniture is wider than one capped step).
    const dt = Math.min((now - this.last) / 1000, 0.1)
    this.last = now
    if (document.hidden) return
    this.move(dt)
    this.player?.mixer.update(dt)
    this.scene.updateMatrixWorld()
    const v = new THREE.Vector3()
    for (const m of this.markers) {
      m.anchor.getWorldPosition(v)
      v.project(this.camera)
      const x = (v.x * 0.5 + 0.5) * this.width
      const y = (-v.y * 0.5 + 0.5) * this.height
      m.el.style.transform = `translate(${x.toFixed(1)}px,${y.toFixed(1)}px) translate(-50%,-100%)`
      m.el.style.visibility = v.z < 1 && v.z > -1 ? 'visible' : 'hidden'
    }
    this.renderer.render(this.scene, this.camera)
    this.publishInterior()
    this.frames++
    if (now - this.statsAt >= 500) {
      const fps = (this.frames * 1000) / Math.max(1, now - this.statsAt)
      this.events.onFrame?.({ drawCalls: this.renderer.info.render.calls, fps })
      this.frames = 0
      this.statsAt = now
    }
  }

  /** Same probe shapes as the other renderers, so the end-to-end specs read every engine. */
  private publishInterior(): void {
    const w = window as unknown as Record<string, unknown>
    const pl = this.player
    const g = this.goal
    w.__LOME_INTERIOR = pl
      ? {
          engine: 'haroo',
          x: pl.root.position.x,
          z: pl.root.position.z,
          heading: pl.root.rotation.y,
          speed: this.speed,
          anim: pl.current,
          using: this.performing?.propId ?? null,
          goal: g ? ('hotspot' in g ? g.hotspot.propId : 'point') : null,
          left: false,
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
