/**
 * HarooLife engine — inside the coach or the plane (imperative Three.js). The player sits by a
 * window, seen from the aisle a few rows behind; the country passes behind the glass: savanna,
 * trees and compounds for the coach, clouds and the ground far below for the plane (the wing
 * out of the porthole). Purely visual: the trip itself (fare, hours, arrival) is in the game state.
 *
 * Built to stay smooth on a modest Android phone: seats, trees, houses and clouds are instanced
 * (one draw call per kind), the window wall is one shape with real openings, one renderer, one
 * frame loop, and `dispose()` frees everything.
 */
import { avatarSpec, clipFor } from '@/lib/haroolife/city/avatar-catalogue'
import * as THREE from 'three'
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js'
import {
  type AvatarActor,
  createAvatarActor,
  disposeAvatarActor,
  playAvatarActor,
} from './avatar-actor'
import { createGltfLoader } from './gltf'

export type CabinMode = 'coach' | 'bus' | 'plane'

export interface CabinWorldOptions {
  canvas: HTMLCanvasElement
  mode: CabinMode
  /** Game hour: night outside the windows from 19 h to 6 h. */
  hour: number
  pixelRatio?: number
  avatarModel?: string
  avatarPagne?: string
  onFrame?: (s: { drawCalls: number; fps: number }) => void
}

const FIGURE = 1.75
/** Seat rows, the player's row and window side. */
const ROW = 0.86
const ROWS = 13
const PLAYER_ROW = 7
/** Passengers seated around the player (other adult rigs of the catalogue). */
const OTHERS: { model: string; row: number; seat: number }[] = [
  { model: 'kossi', row: 8, seat: 0 },
  { model: 'abra', row: 6, seat: 1 },
  { model: 'koffi', row: 6, seat: 2 },
]

interface Layout {
  width: number
  height: number
  /** Seat centres across the cabin (z), window side first. */
  seats: number[]
  /** Openings of the window wall: centre x, centre y, width, height, rounded (porthole). */
  window: { y: number; w: number; h: number; every: number; oval: boolean }
  colors: { wall: string; seat: string; floor: string; trim: string }
  /** Outside: metres per second of the scenery passing by. */
  speed: number
}

const LAYOUTS: Record<CabinMode, Layout> = {
  coach: {
    width: 2.5,
    height: 2.35,
    seats: [-0.86, -0.42, 0.42, 0.86],
    window: { y: 1.38, w: 1.45, h: 0.78, every: ROW * 2, oval: false },
    colors: { wall: '#e9e4d8', seat: '#2f5e8a', floor: '#4a4f55', trim: '#9aa3ab' },
    speed: 22,
  },
  bus: {
    width: 2.5,
    height: 2.4,
    seats: [-0.86, -0.42, 0.86],
    window: { y: 1.42, w: 1.5, h: 0.9, every: ROW * 2, oval: false },
    colors: { wall: '#f1efe6', seat: '#c0392b', floor: '#5a5f63', trim: '#2e7d4f' },
    speed: 9,
  },
  plane: {
    width: 3.4,
    height: 2.2,
    seats: [-1.32, -0.86, -0.4, 0.4, 0.86, 1.32],
    window: { y: 1.18, w: 0.3, h: 0.42, every: ROW, oval: true },
    colors: { wall: '#f4f4f1', seat: '#24324a', floor: '#3b4252', trim: '#c9ccd2' },
    speed: 70,
  },
}

export class CabinWorld {
  private readonly renderer: THREE.WebGLRenderer
  private readonly scene = new THREE.Scene()
  private readonly camera = new THREE.PerspectiveCamera(58, 1, 0.05, 900)
  private readonly loader = createGltfLoader()
  private readonly loaded: GLTF[] = []
  private readonly geometries: THREE.BufferGeometry[] = []
  private readonly materials: THREE.Material[] = []
  private readonly resizeObserver: ResizeObserver
  private readonly layout: Layout
  private readonly cabin = new THREE.Group()
  /** Moving scenery: instanced meshes and the base x of each instance. */
  private readonly movers: { mesh: THREE.InstancedMesh; items: THREE.Matrix4[]; span: number }[] =
    []
  private readonly actors: AvatarActor[] = []
  private run = 0
  private raf = 0
  private last = 0
  private frames = 0
  private statsAt = 0
  private disposed = false
  private probe: unknown = null

  constructor(private readonly o: CabinWorldOptions) {
    this.layout = LAYOUTS[o.mode]
    this.renderer = new THREE.WebGLRenderer({ canvas: o.canvas, antialias: true })
    this.renderer.setPixelRatio(o.pixelRatio ?? Math.min(window.devicePixelRatio || 1, 1.6))
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.1
    const night = o.hour < 6 || o.hour >= 19
    const sky = night ? '#14213d' : o.mode === 'plane' ? '#9ccbee' : '#bfe0f2'
    this.scene.background = new THREE.Color(sky)
    this.scene.fog = new THREE.Fog(
      sky,
      o.mode === 'plane' ? 120 : 40,
      o.mode === 'plane' ? 700 : 160,
    )
    this.scene.add(new THREE.HemisphereLight('#f4f7ff', '#7d725a', night ? 0.9 : 1.7))
    const sun = new THREE.DirectionalLight(night ? '#9fb3ff' : '#fff1d6', night ? 0.5 : 2.2)
    sun.position.set(4, 9, -10)
    this.scene.add(sun)
    // The cabin lights, warmer at night.
    const ceiling = new THREE.PointLight(night ? '#ffd9a0' : '#ffffff', night ? 9 : 4, 9)
    ceiling.position.set(PLAYER_ROW * ROW - (ROWS * ROW) / 2, this.layout.height - 0.2, 0)
    this.cabin.add(ceiling)
    this.scene.add(this.cabin)
    this.resizeObserver = new ResizeObserver(() => this.resize())
    this.resizeObserver.observe(o.canvas)
    this.resize()
  }

  private mat(color: string, extra: THREE.MeshStandardMaterialParameters = {}) {
    const m = new THREE.MeshStandardMaterial({ color, roughness: 0.85, ...extra })
    this.materials.push(m)
    return m
  }
  private geo<T extends THREE.BufferGeometry>(g: T): T {
    this.geometries.push(g)
    return g
  }

  async init(): Promise<void> {
    const L = this.layout
    const length = ROWS * ROW + 1.2
    const half = length / 2
    const box = this.geo(new THREE.BoxGeometry(1, 1, 1))
    const block = (m: THREE.Material, p: [number, number, number], s: [number, number, number]) => {
      const mesh = new THREE.Mesh(box, m)
      mesh.position.set(...p)
      mesh.scale.set(...s)
      this.cabin.add(mesh)
      return mesh
    }
    const wall = this.mat(L.colors.wall, { side: THREE.DoubleSide })
    // Floor, aisle, ceiling and the far wall.
    block(this.mat(L.colors.floor), [0, -0.03, 0], [length, 0.06, L.width])
    block(
      this.mat(this.o.mode === 'plane' ? '#7a2e3a' : '#2b2f33'),
      [0, 0.005, 0],
      [length, 0.01, 0.55],
    )
    block(wall, [0, L.height, 0], [length, 0.06, L.width])
    block(wall, [half, L.height / 2, 0], [0.06, L.height, L.width])
    block(wall, [-half, L.height / 2, 0], [0.06, L.height, L.width])
    // The two side walls: one shape each, with real openings for the windows or portholes.
    const shape = new THREE.Shape()
    shape.moveTo(-half, 0)
    shape.lineTo(half, 0)
    shape.lineTo(half, L.height)
    shape.lineTo(-half, L.height)
    shape.closePath()
    const w = L.window
    const centres: number[] = []
    for (let x = -half + w.every / 2 + 0.2; x < half - w.w / 2; x += w.every) centres.push(x)
    for (const cx of centres) {
      const hole = new THREE.Path()
      if (w.oval) hole.absellipse(cx, w.y, w.w / 2, w.h / 2, 0, Math.PI * 2, false, 0)
      else {
        const r = 0.12
        const [x0, x1, y0, y1] = [cx - w.w / 2, cx + w.w / 2, w.y - w.h / 2, w.y + w.h / 2]
        hole.moveTo(x0 + r, y0)
        hole.lineTo(x1 - r, y0)
        hole.quadraticCurveTo(x1, y0, x1, y0 + r)
        hole.lineTo(x1, y1 - r)
        hole.quadraticCurveTo(x1, y1, x1 - r, y1)
        hole.lineTo(x0 + r, y1)
        hole.quadraticCurveTo(x0, y1, x0, y1 - r)
        hole.lineTo(x0, y0 + r)
        hole.quadraticCurveTo(x0, y0, x0 + r, y0)
      }
      shape.holes.push(hole)
    }
    const wallGeo = this.geo(new THREE.ShapeGeometry(shape, 6))
    for (const side of [-1, 1]) {
      const m = new THREE.Mesh(wallGeo, wall)
      m.position.z = (side * L.width) / 2
      this.cabin.add(m)
    }
    // Window frames (a thin dark ring for portholes, a sill for the coach).
    const trim = this.mat(L.colors.trim)
    if (w.oval) {
      const ring = this.geo(new THREE.TorusGeometry(1, 0.08, 6, 24))
      const frames = new THREE.InstancedMesh(ring, trim, centres.length * 2)
      const m4 = new THREE.Matrix4()
      let i = 0
      for (const side of [-1, 1])
        for (const cx of centres) {
          m4.compose(
            new THREE.Vector3(cx, w.y, (side * L.width) / 2 - side * 0.01),
            new THREE.Quaternion(),
            new THREE.Vector3(w.w / 2, w.h / 2, 0.6),
          )
          frames.setMatrixAt(i++, m4)
        }
      this.cabin.add(frames)
      // Overhead bins along both sides.
      for (const side of [-1, 1])
        block(
          this.mat('#e6e7e3'),
          [0, L.height - 0.32, side * (L.width / 2 - 0.35)],
          [length, 0.42, 0.7],
        )
    } else {
      for (const side of [-1, 1]) {
        block(trim, [0, w.y - w.h / 2 - 0.04, side * (L.width / 2 - 0.05)], [length, 0.06, 0.12])
        // Luggage rack.
        block(
          this.mat('#8d949b', { metalness: 0.6, roughness: 0.4 }),
          [0, L.height - 0.3, side * (L.width / 2 - 0.3)],
          [length, 0.04, 0.5],
        )
      }
    }
    // Seats: one instanced mesh for the cushions, one for the backs.
    const seatMat = this.mat(L.colors.seat)
    const count = ROWS * L.seats.length
    const cushions = new THREE.InstancedMesh(box, seatMat, count)
    const backs = new THREE.InstancedMesh(box, seatMat, count)
    const m4 = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    let n = 0
    for (let r = 0; r < ROWS; r++)
      for (const z of L.seats) {
        const x = -half + 0.8 + r * ROW
        m4.compose(new THREE.Vector3(x, 0.46, z), q, new THREE.Vector3(0.46, 0.12, 0.42))
        cushions.setMatrixAt(n, m4)
        m4.compose(new THREE.Vector3(x - 0.24, 0.86, z), q, new THREE.Vector3(0.08, 0.72, 0.42))
        backs.setMatrixAt(n, m4)
        n++
      }
    this.cabin.add(cushions, backs)
    // Outside.
    this.buildOutside(half)

    // The player by the window, and a few passengers: the shared adult rigs, seated.
    const mine = avatarSpec(this.o.avatarModel ?? 'afi')
    const specs = [mine, ...OTHERS.map((p) => avatarSpec(p.model))]
    const urls = [...new Set(specs.map((s) => s.url))]
    const results = await Promise.allSettled(urls.map((u) => this.load(u)))
    if (this.disposed) return
    const gltfs = new Map<string, GLTF>()
    urls.forEach((u, i) => {
      const r = results[i]
      if (r.status === 'fulfilled') gltfs.set(u, r.value)
    })
    const seat = (
      spec: ReturnType<typeof avatarSpec>,
      row: number,
      seatIndex: number,
      pagne?: string,
    ) => {
      const g = gltfs.get(spec.url)
      if (!g) return null
      const actor = createAvatarActor(g, spec, FIGURE, pagne)
      const x = -half + 0.8 + row * ROW
      actor.root.position.set(x + 0.06, 0.52 - actor.seatOffset, L.seats[seatIndex])
      // Facing the front of the vehicle (+x).
      actor.root.rotation.y = Math.PI / 2
      playAvatarActor(actor, clipFor(spec, 'drive'))
      actor.mixer.update(0.3)
      this.cabin.add(actor.root)
      this.actors.push(actor)
      return actor
    }
    const player = seat(mine, PLAYER_ROW, 0, this.o.avatarPagne)
    if (!player) throw new Error('Le personnage 3D du voyage n’a pas pu être chargé.')
    player.root.name = 'Joueur assis'
    for (const p of OTHERS) {
      if (p.seat >= L.seats.length) continue
      seat(avatarSpec(p.model), p.row, p.seat)
    }
    // From the aisle a row ahead, turned back: the player's face, the window beside them.
    const px = -half + 0.8 + PLAYER_ROW * ROW
    const aisle = (L.seats[L.seats.length / 2] + L.seats[L.seats.length / 2 - 1]) / 2 || 0
    this.camera.position.set(px + 1.45, 1.8, aisle + 0.15)
    this.camera.lookAt(px - 0.35, 0.95, -L.width / 2 + 0.25)
    this.publishProbe(centres.length)
    this.last = performance.now()
    this.statsAt = this.last
    this.raf = requestAnimationFrame(this.frame)
  }

  /** The country behind the glass, instanced and scrolled past the window side. */
  private buildOutside(half: number): void {
    const L = this.layout
    const plane = this.o.mode === 'plane'
    const night = this.o.hour < 6 || this.o.hour >= 19
    const span = 220
    const scatter = (
      geometry: THREE.BufferGeometry,
      material: THREE.Material,
      count: number,
      place: (i: number) => { x: number; y: number; z: number; s: [number, number, number] },
    ) => {
      const mesh = new THREE.InstancedMesh(geometry, material, count)
      mesh.frustumCulled = false
      const items: THREE.Matrix4[] = []
      for (let i = 0; i < count; i++) {
        const p = place(i)
        const m = new THREE.Matrix4().compose(
          new THREE.Vector3(p.x, p.y, p.z),
          new THREE.Quaternion(),
          new THREE.Vector3(...p.s),
        )
        items.push(m)
        mesh.setMatrixAt(i, m)
      }
      this.scene.add(mesh)
      this.movers.push({ mesh, items, span })
    }
    let seed = 7
    const rnd = () => {
      seed = (seed * 16807) % 2147483647
      return seed / 2147483647
    }
    if (plane) {
      // Clouds below and level with the wing, the land far below in the haze.
      const ground = new THREE.Mesh(
        this.geo(new THREE.PlaneGeometry(4000, 4000)),
        this.mat(night ? '#1d2b22' : '#6f8f4e'),
      )
      ground.rotation.x = -Math.PI / 2
      ground.position.y = -420
      this.scene.add(ground)
      const puff = this.geo(new THREE.SphereGeometry(1, 10, 8))
      scatter(puff, this.mat(night ? '#5a6478' : '#ffffff', { roughness: 1 }), 70, () => ({
        x: (rnd() - 0.5) * span,
        y: -40 + rnd() * 50,
        z: -(12 + rnd() * 160),
        s: [8 + rnd() * 16, 3 + rnd() * 5, 6 + rnd() * 10],
      }))
      // The wing, out of the porthole.
      const wing = new THREE.Mesh(
        this.geo(new THREE.BoxGeometry(5.5, 0.18, 9)),
        this.mat('#d7dbe0', { metalness: 0.3 }),
      )
      wing.position.set(-half * 0.1, 0.7, -L.width / 2 - 4.6)
      wing.rotation.set(0.04, 0.32, 0.05)
      this.cabin.add(wing)
      return
    }
    // The road the vehicle is on, the verge, the savanna.
    const ground = new THREE.Mesh(
      this.geo(new THREE.PlaneGeometry(1200, 600)),
      this.mat(night ? '#1f2a1c' : '#9fae62'),
    )
    ground.rotation.x = -Math.PI / 2
    ground.position.y = -0.62
    this.scene.add(ground)
    const road = new THREE.Mesh(this.geo(new THREE.PlaneGeometry(1200, 8)), this.mat('#3d4246'))
    road.rotation.x = -Math.PI / 2
    road.position.set(0, -0.6, -1.5)
    this.scene.add(road)
    const trunk = this.geo(new THREE.CylinderGeometry(0.18, 0.24, 1, 6))
    const crown = this.geo(new THREE.IcosahedronGeometry(1, 0))
    const house = this.geo(new THREE.BoxGeometry(1, 1, 1))
    const roof = this.geo(new THREE.ConeGeometry(1, 1, 4))
    const trees = Array.from({ length: 46 }, () => ({
      x: (rnd() - 0.5) * span,
      z: -(7 + rnd() * 60),
      h: 2.5 + rnd() * 3,
    }))
    scatter(trunk, this.mat('#6b4a2b'), trees.length, (i) => ({
      x: trees[i].x,
      y: -0.6 + trees[i].h / 2,
      z: trees[i].z,
      s: [1, trees[i].h, 1],
    }))
    scatter(
      crown,
      this.mat(night ? '#22381f' : '#4f7d3a', { flatShading: true }),
      trees.length,
      (i) => ({
        x: trees[i].x,
        y: -0.6 + trees[i].h + 0.9,
        z: trees[i].z,
        s: [1.6 + trees[i].h * 0.25, 1.4, 1.6 + trees[i].h * 0.25],
      }),
    )
    const homes = Array.from({ length: 14 }, () => ({
      x: (rnd() - 0.5) * span,
      z: -(10 + rnd() * 40),
      w: 3 + rnd() * 3,
    }))
    scatter(house, this.mat(night ? '#6d6455' : '#d9c7a3'), homes.length, (i) => ({
      x: homes[i].x,
      y: 0.6,
      z: homes[i].z,
      s: [homes[i].w, 2.4, 3],
    }))
    scatter(
      roof,
      this.mat(night ? '#3d3f42' : '#8f969c', { flatShading: true }),
      homes.length,
      (i) => ({
        x: homes[i].x,
        y: 2.4,
        z: homes[i].z,
        s: [homes[i].w * 0.78, 1.1, 2.3],
      }),
    )
    // Hills on the horizon (the Plateaux and the Kara mountains), still.
    const hill = new THREE.Mesh(
      this.geo(new THREE.ConeGeometry(1, 1, 7)),
      this.mat(night ? '#1b2533' : '#7f9c87', { flatShading: true }),
    )
    for (let i = 0; i < 6; i++) {
      const h = hill.clone()
      h.scale.set(40 + i * 7, 18 + (i % 3) * 8, 30)
      h.position.set(-200 + i * 80, 2, -150 - (i % 2) * 30)
      this.scene.add(h)
    }
  }

  private load(url: string): Promise<GLTF> {
    return this.loader.loadAsync(url).then((g) => {
      this.loaded.push(g)
      return g
    })
  }

  private resize(): void {
    const c = this.o.canvas
    const w = Math.max(1, c.clientWidth)
    const h = Math.max(1, c.clientHeight)
    this.renderer.setSize(w, h, false)
    this.camera.aspect = w / h
    // A narrow phone sees less across: widen the view a little so the window stays in frame.
    this.camera.fov = w / h < 0.8 ? 72 : 58
    this.camera.updateProjectionMatrix()
  }

  private readonly m4 = new THREE.Matrix4()
  private step(dt: number): void {
    this.run += dt * this.layout.speed
    for (const a of this.actors) a.mixer.update(Math.min(dt, 0.1))
    // The road's small jolts, the plane's slow roll.
    if (this.o.mode === 'plane') this.cabin.rotation.x = Math.sin(this.run * 0.004) * 0.012
    else
      this.cabin.position.y = Math.sin(this.run * 1.7) * 0.006 + Math.sin(this.run * 0.31) * 0.004
    for (const mv of this.movers) {
      for (let i = 0; i < mv.items.length; i++) {
        this.m4.copy(mv.items[i])
        const x = this.m4.elements[12] - this.run
        // Scroll towards the back of the vehicle, and wrap around.
        this.m4.elements[12] = ((((x + mv.span / 2) % mv.span) + mv.span) % mv.span) - mv.span / 2
        mv.mesh.setMatrixAt(i, this.m4)
      }
      mv.mesh.instanceMatrix.needsUpdate = true
    }
  }

  private publishProbe(windows: number): void {
    this.probe = {
      mode: this.o.mode,
      windows,
      passengers: this.actors.length,
      playerClip: this.actors[0]?.current ?? null,
      seated: this.actors[0] ? this.actors[0].root.position.y < 0.3 : false,
    }
    ;(window as unknown as Record<string, unknown>).__LOME_CABIN = this.probe
  }

  private readonly frame = () => {
    if (this.disposed) return
    this.raf = requestAnimationFrame(this.frame)
    const now = performance.now()
    const dt = Math.min((now - this.last) / 1000, 0.1)
    this.last = now
    if (document.hidden) return
    this.step(dt)
    this.renderer.render(this.scene, this.camera)
    this.frames++
    if (now - this.statsAt >= 500) {
      const fps = (this.frames * 1000) / Math.max(1, now - this.statsAt)
      this.o.onFrame?.({ drawCalls: this.renderer.info.render.calls, fps })
      ;(window as unknown as Record<string, unknown>).__LOME_CABIN = {
        ...(this.probe as object),
        fps: Math.round(fps),
        drawCalls: this.renderer.info.render.calls,
        distance: Math.round(this.run),
      }
      this.frames = 0
      this.statsAt = now
    }
  }

  dispose(): void {
    this.disposed = true
    cancelAnimationFrame(this.raf)
    this.resizeObserver.disconnect()
    for (const a of this.actors.splice(0)) disposeAvatarActor(a)
    for (const mv of this.movers.splice(0)) mv.mesh.dispose()
    for (const g of this.geometries) g.dispose()
    for (const m of this.materials) m.dispose()
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
    const w = window as unknown as Record<string, unknown>
    if (w.__LOME_CABIN) w.__LOME_CABIN = undefined
    this.renderer.dispose()
  }
}
