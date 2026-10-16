/**
 * HarooLife engine — the trip scene (imperative Three.js). A ride along a Lomé boulevard seen
 * from behind the vehicle, as the PlayCanvas `Ride` drew it: the road scrolls, street lights
 * and compounds pass by, traffic ahead is overtaken. CC0 Kenney car kit and street lights; the
 * real weather decides the rain. Purely visual: the trip itself (route, arrival, « Passer »)
 * stays in the game state.
 *
 * Lifecycle as the street and the rooms: one renderer, one frame loop; `dispose()` frees all.
 */
import { avatarSpec, clipFor } from '@/lib/haroolife/city/avatar-catalogue'
import {
  type AvatarActor,
  createAvatarActor,
  disposeAvatarActor,
  playAvatarActor,
} from './avatar-actor'
import { buildMoto, type MotoParts } from './moto'
import { fitTaxiModel } from './vehicle-scale'
import type { Transport } from '@/lib/haroolife/lome-life-engine'
import * as THREE from 'three'
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { createGltfLoader } from './gltf'

const BASE = '/haroolife/vendor/kenney-3d/'
const LANES = [-2.1, 2.1]
const TRAFFIC = [
  { kind: 'sedan', lane: 0, z: -14, s: 0.83 },
  { kind: 'van', lane: 1, z: -22, s: 0.78 },
  { kind: 'taxi', lane: 0, z: -34, s: 0.9 },
  { kind: 'sedan', lane: 1, z: -48, s: 0.83 },
  { kind: 'taxi', lane: 1, z: -66, s: 0.9 },
  { kind: 'van', lane: 0, z: -80, s: 0.78 },
] as const
const SPEED: Record<Transport, number> = { walk: 1.3, moto: 11, taxi: 8, bus: 6 }
const DASHES = 40
const SIDES = 14
const deg = THREE.MathUtils.degToRad

export interface RideWorldOptions {
  canvas: HTMLCanvasElement
  transport: Transport
  rain: boolean
  pixelRatio?: number
  avatarModel?: string
  avatarPagne?: string
  onFrame?: (s: { drawCalls: number; fps: number }) => void
}

export class RideWorld {
  private readonly renderer: THREE.WebGLRenderer
  private readonly scene = new THREE.Scene()
  private readonly camera = new THREE.PerspectiveCamera(55, 1, 0.2, 260)
  private readonly loader = createGltfLoader()
  private readonly loaded: GLTF[] = []
  private readonly geometries: THREE.BufferGeometry[] = []
  private readonly materials: THREE.Material[] = []
  private readonly resizeObserver: ResizeObserver
  private readonly dashes: THREE.Mesh[] = []
  /** Street lights and compounds: one group per row, moved together. */
  private readonly sides: THREE.Group[] = []
  private readonly cars: { root: THREE.Object3D; z: number; i: number }[] = []
  private actor: AvatarActor | null = null
  private moto: MotoParts | null = null
  private vehicle: THREE.Object3D | null = null
  private wheels: THREE.Object3D[] = []
  private probe: unknown = null
  private run = 0
  private raf = 0
  private last = 0
  private frames = 0
  private statsAt = 0
  private disposed = false

  constructor(private readonly o: RideWorldOptions) {
    this.renderer = new THREE.WebGLRenderer({ canvas: o.canvas, antialias: true })
    this.renderer.setPixelRatio(o.pixelRatio ?? Math.min(window.devicePixelRatio || 1, 1.7))
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.15
    this.renderer.shadowMap.enabled = (o.pixelRatio ?? 1.5) >= 1.4
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap
    this.scene.name = 'HarooLife trajet'
    this.scene.background = new THREE.Color(o.rain ? '#9aa3a8' : '#bfe0f2')
    const cameraLane = o.transport === 'walk' ? -4.9 : -2.1
    this.camera.position.set(cameraLane, 2.9, o.transport === 'taxi' ? 10.5 : 9.5)
    this.camera.lookAt(cameraLane, 0.5, -5)
    this.scene.add(new THREE.HemisphereLight('#f2f6ff', '#9a8f70', o.rain ? 1.3 : 1.8))
    const sun = new THREE.DirectionalLight('#fff4de', o.rain ? 1.4 : 2.6)
    sun.position.set(-6, 10, 8)
    sun.castShadow = this.renderer.shadowMap.enabled
    sun.shadow.mapSize.set(1024, 1024)
    Object.assign(sun.shadow.camera, { left: -12, right: 12, top: 12, bottom: -12, far: 50 })
    sun.shadow.bias = -0.001
    this.scene.add(sun)
    this.scene.fog = new THREE.Fog(o.rain ? '#9aa3a8' : '#bfe0f2', 45, 170)
    this.resizeObserver = new ResizeObserver(() => this.resize())
    this.resizeObserver.observe(o.canvas)
    this.resize()
  }

  async init(): Promise<void> {
    const rain = this.o.rain
    const mat = (color: string, roughness: number) => {
      const m = new THREE.MeshStandardMaterial({ color, roughness })
      this.materials.push(m)
      return m
    }
    const box = new THREE.BoxGeometry(1, 1, 1)
    const cylinder = new THREE.CylinderGeometry(0.5, 0.5, 1, 10)
    this.geometries.push(box, cylinder)
    const asphalt = mat(rain ? '#2b3034' : '#3a3f44', rain ? 0.4 : 0.9)
    const kerb = mat('#b9b2a4', 0.95)
    const paint = mat('#e9e2c6', 0.9)
    const sand = mat(rain ? '#8d8368' : '#c9b98a', 0.98)
    const wall = mat('#d8d2c2', 0.95)
    const roof = mat('#8c4a2f', 0.95)
    const pole = mat('#4b5563', 0.8)
    const block = (m: THREE.Material, p: [number, number, number], s: [number, number, number]) => {
      const mesh = new THREE.Mesh(box, m)
      mesh.position.set(...p)
      mesh.scale.set(...s)
      mesh.receiveShadow = true
      return mesh
    }
    // Ground, boulevard, kerbs.
    this.scene.add(block(sand, [0, -0.3, -100], [120, 0.4, 260]))
    this.scene.add(block(asphalt, [0, -0.09, -100], [9.2, 0.2, 260]))
    for (const x of [-5, 5]) this.scene.add(block(kerb, [x, 0.05, -100], [1.2, 0.3, 260]))
    // Lane dashes, scrolled towards the camera.
    for (let i = 0; i < DASHES; i++) {
      const d = block(paint, [0, 0.02, 0], [0.18, 0.02, 2.4])
      this.dashes.push(d)
      this.scene.add(d)
    }
    const spec = avatarSpec(this.o.avatarModel ?? 'afi')
    const urls = [
      `${BASE}city-kit-roads/light-curved.glb`,
      spec.url,
      ...new Set(TRAFFIC.map((v) => `${BASE}car-kit/${v.kind}.glb`)),
    ]
    const results = await Promise.allSettled(urls.map((u) => this.load(u)))
    if (this.disposed) return
    const model = new Map<string, GLTF>()
    urls.forEach((u, i) => {
      const r = results[i]
      if (r.status === 'fulfilled') model.set(u, r.value)
    })
    const place = (url: string, p: [number, number, number], scale: number, rot: number) => {
      const g = model.get(url)
      if (!g) return null
      const o = g.scene.clone(true)
      o.position.set(...p)
      o.scale.setScalar(scale)
      o.rotation.y = deg(rot)
      return o
    }
    // Street lights and roadside compounds (positions relative to the row).
    for (let i = 0; i < SIDES; i++) {
      const row = new THREE.Group()
      const light = `${BASE}city-kit-roads/light-curved.glb`
      const left = place(light, [-5.3, 0.2, 0], 1.6, 90)
      const right = place(light, [5.3, 0.2, -9], 1.6, 270)
      if (left) row.add(left)
      if (right) row.add(right)
      const h = 2.6 + (i % 2)
      row.add(block(wall, [-10 - (i % 3), 1.3, -4], [5, h, 7]))
      row.add(block(roof, [-10 - (i % 3), 2.9 + (i % 2) * 0.5, -4], [5.4, 0.3, 7.4]))
      row.add(block(wall, [10 + ((i + 1) % 3), 1.1, -12], [5, 2.2 + ((i + 1) % 2), 6]))
      const p = new THREE.Mesh(cylinder, pole)
      p.position.set(7.4, 0.9, -2)
      p.scale.set(0.12, 1.8, 0.12)
      row.add(p)
      row.name = `Bord de route ${i + 1}`
      this.sides.push(row)
      this.scene.add(row)
    }
    // Traffic ahead, overtaken.
    TRAFFIC.forEach((v, i) => {
      const car = place(`${BASE}car-kit/${v.kind}.glb`, [LANES[v.lane], 0, v.z], v.s, 180)
      if (!car) return
      car.name = `Voiture ${i + 1}`
      this.cars.push({ root: car, z: v.z, i })
      this.scene.add(car)
    })
    // The same adult rig as the street and the rooms, with independent bones and animations.
    const avatar = model.get(spec.url)
    if (!avatar) throw new Error('Le personnage 3D du trajet n’a pas pu être chargé.')
    this.actor = createAvatarActor(avatar, spec, 1.75, this.o.avatarPagne)
    this.actor.root.name = 'Joueur du trajet'
    if (this.o.transport === 'walk') {
      this.actor.root.position.set(-4.9, 0.2, 2.5)
      this.actor.root.rotation.y = Math.PI
      playAvatarActor(this.actor, clipFor(spec, 'walk'))
      this.scene.add(this.actor.root)
    } else if (this.o.transport === 'moto') {
      this.moto = buildMoto(1.75)
      this.vehicle = this.moto.root
      this.actor.root.position.set(0, this.moto.seat - this.actor.seatOffset, this.moto.driverZ)
      this.vehicle.add(this.actor.root)
      playAvatarActor(this.actor, clipFor(spec, 'drive'))
    } else {
      const taxi = model.get(`${BASE}car-kit/taxi.glb`)
      if (!taxi) throw new Error('Le taxi 3D n’a pas pu être chargé.')
      this.vehicle = taxi.scene.clone(true)
      fitTaxiModel(this.vehicle, 1.75, 4.6)
      this.actor.root.position.set(0.3, 0.22 - this.actor.seatOffset, 0.1)
      // A sibling, so the taxi's non-uniform scale cannot distort the human skeleton.
      const group = new THREE.Group()
      group.add(this.vehicle, this.actor.root)
      this.vehicle = group
      playAvatarActor(this.actor, clipFor(spec, 'drive'))
    }
    if (this.vehicle) {
      this.vehicle.name = 'Véhicule du joueur'
      this.vehicle.position.set(-2.1, 0, 2.5)
      this.vehicle.rotation.y = Math.PI
      this.vehicle.traverse((o) => {
        if ((o as THREE.Mesh).isMesh) {
          ;(o as THREE.Mesh).castShadow = true
          ;(o as THREE.Mesh).receiveShadow = true
        }
        if (/wheel/i.test(o.name) && !/wheel/i.test(o.parent?.name ?? '')) this.wheels.push(o)
      })
      this.scene.add(this.vehicle)
    }
    // The trip starts seated; do not briefly render the standing pose through the roof.
    this.actor.mixer.update(0.25)
    this.publishProbe()
    this.step(0)
    this.last = performance.now()
    this.statsAt = this.last
    this.raf = requestAnimationFrame(this.frame)
  }

  dispose(): void {
    this.disposed = true
    cancelAnimationFrame(this.raf)
    this.resizeObserver.disconnect()
    if (this.actor) {
      disposeAvatarActor(this.actor)
      this.actor = null
    }
    if (this.moto) {
      for (const g of this.moto.geometries) g.dispose()
      for (const m of this.moto.materials) m.dispose()
      this.moto = null
    }
    this.vehicle = null
    this.wheels = []
    const w = window as unknown as Record<string, unknown>
    if (w.__LOME_RIDE === this.probe) w.__LOME_RIDE = undefined
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
    this.renderer.dispose()
  }

  private load(url: string): Promise<GLTF> {
    return this.loader.loadAsync(url).then((g) => {
      if (this.disposed) {
        g.scene.traverse((o) => {
          const m = o as THREE.Mesh
          if (m.isMesh) {
            m.geometry.dispose()
            for (const material of Array.isArray(m.material) ? m.material : [m.material])
              material.dispose()
          }
        })
        throw new Error('Trajet fermé.')
      }
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
    this.camera.updateProjectionMatrix()
  }

  /** Places everything for the distance travelled so far. */
  private step(dt: number): void {
    this.run += dt * SPEED[this.o.transport]
    this.actor?.mixer.update(Math.min(dt, 0.1))
    for (const wheel of this.wheels) wheel.rotation.x -= (dt * SPEED[this.o.transport]) / 0.3
    if (this.moto && this.vehicle) this.vehicle.rotation.z = Math.sin(this.run * 0.12) * 0.015
    const dash = this.run % 6
    const light = this.run % 18
    this.dashes.forEach((d, i) => {
      d.position.z = 6 - i * 6 + dash
    })
    this.sides.forEach((row, i) => {
      row.position.z = 8 - i * 18 + light
    })
    for (const c of this.cars) {
      const z = c.z + ((this.run * 0.55 + c.i * 7) % 90)
      c.root.position.z = z > 12 ? z - 90 : z
    }
  }

  private publishProbe(): void {
    this.camera.updateMatrixWorld(true)
    let vehicleScreen: { x: number; y: number; width: number; height: number } | null = null
    const shown = this.vehicle ?? this.actor?.root
    if (shown) {
      // SkinnedMesh.updateMatrixWorld also refreshes bindMatrixInverse; updateWorldMatrix
      // alone leaves a stale bind transform until the first WebGL render.
      shown.updateMatrixWorld(true)
      // Skinning changes the vertex bounds: a cached neutral-pose box overstates the
      // on-screen footprint and cannot verify a seated driver on a narrow phone.
      const bounds = new THREE.Box3().setFromObject(shown, true)
      const points: THREE.Vector3[] = []
      for (const x of [bounds.min.x, bounds.max.x])
        for (const y of [bounds.min.y, bounds.max.y])
          for (const z of [bounds.min.z, bounds.max.z])
            points.push(new THREE.Vector3(x, y, z).project(this.camera))
      const xs = points.map((p) => (p.x * 0.5 + 0.5) * this.o.canvas.clientWidth)
      const ys = points.map((p) => (-p.y * 0.5 + 0.5) * this.o.canvas.clientHeight)
      const x = Math.min(...xs)
      const y = Math.min(...ys)
      vehicleScreen = { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y }
    }
    this.probe = {
      vehicleScreen,
      transport: this.o.transport,
      model: this.actor?.spec.id,
      source: this.actor?.spec.url,
      avatar: this.actor?.root.userData.avatar,
      clip: this.actor?.current,
      distance: this.run,
      moto: !!this.moto,
      wheels: this.wheels.length,
    }
    ;(window as unknown as Record<string, unknown>).__LOME_RIDE = this.probe
  }

  private readonly frame = () => {
    if (this.disposed) return
    this.raf = requestAnimationFrame(this.frame)
    const now = performance.now()
    const dt = Math.min((now - this.last) / 1000, 0.25)
    this.last = now
    if (document.hidden) return
    this.step(dt)
    this.renderer.render(this.scene, this.camera)
    this.frames++
    if (now - this.statsAt >= 500) {
      const fps = (this.frames * 1000) / Math.max(1, now - this.statsAt)
      this.o.onFrame?.({ drawCalls: this.renderer.info.render.calls, fps })
      this.publishProbe()
      this.frames = 0
      this.statsAt = now
    }
  }
}
