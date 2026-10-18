/**
 * The zémidjan: a 125 cc moto-taxi about 1.9 m long against a 1.75 m figure, front along +Z like
 * the controller's heading 0. Its wheels are named `wheel-front` / `wheel-back` so the street
 * turns and steers them like the taxi's. The yellow of Lomé's zémidjan drivers is their shirt,
 * not the moto: the body is dark red.
 *
 * With `parts` (the street's city pack: `lome-moto` and `lome-moto-roue`, modelled in metres by
 * tools/blender/haroolife_lome_buildings.py) the moto is that model; without (the trip scene, or
 * a pack without it) it is built from simple volumes, same size and seats.
 */
import type { Model } from '@/lib/haroolife/city/pack'
import * as THREE from 'three'

export interface MotoModel {
  /** Everything but the wheels, in metres, front along +Z. */
  body: Model
  /** One wheel centred on its hub, axle along X, in metres. */
  wheel: Model
}

/** The model's geometry at the figure's scale (copies: the pack's arrays are shared). */
function modelGeometry(m: Model, k: number): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.BufferAttribute(m.pos.slice(), 3))
  g.setAttribute('normal', new THREE.BufferAttribute(m.nrm.slice(), 3))
  g.setAttribute('color', new THREE.BufferAttribute(m.col, 3))
  g.setIndex(new THREE.BufferAttribute(m.idx, 1))
  g.scale(k, k, k)
  return g
}

function modelMoto(figure: number, parts: MotoModel): MotoParts {
  const k = figure / 1.75
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6 })
  const body = modelGeometry(parts.body, k)
  const wheel = modelGeometry(parts.wheel, k)
  const root = new THREE.Group()
  root.name = 'Zémidjan du joueur'
  const frame = new THREE.Mesh(body, material)
  frame.castShadow = true
  root.add(frame)
  for (const [name, z] of [
    ['wheel-front', 0.64],
    ['wheel-back', -0.62],
  ] as const) {
    const pivot = new THREE.Group()
    pivot.name = name
    pivot.position.set(0, 0.3 * k, z * k)
    const tyre = new THREE.Mesh(wheel, material)
    tyre.castShadow = true
    pivot.add(tyre)
    root.add(pivot)
  }
  return {
    root,
    seat: 0.84 * k,
    driverZ: 0.02 * k,
    passengerZ: -0.42 * k,
    geometries: [body, wheel],
    materials: [material],
  }
}

export interface MotoParts {
  root: THREE.Group
  /** Height of the driver's seat and of the passenger's, above the ground. */
  seat: number
  /** Where the driver and the passenger sit, along the moto (+Z forward). */
  driverZ: number
  passengerZ: number
  geometries: THREE.BufferGeometry[]
  materials: THREE.Material[]
}

export function buildMoto(figure: number, parts?: MotoModel): MotoParts {
  if (parts) return modelMoto(figure, parts)
  const k = figure / 1.75 // metres → scene units
  const geometries: THREE.BufferGeometry[] = []
  const materials: THREE.Material[] = []
  const mat = (color: string, metal = 0.1, rough = 0.6) => {
    const m = new THREE.MeshStandardMaterial({ color, metalness: metal, roughness: rough })
    materials.push(m)
    return m
  }
  const geo = <G extends THREE.BufferGeometry>(g: G) => {
    geometries.push(g)
    return g
  }
  const body = mat('#8e1f1f', 0.3, 0.45)
  const black = mat('#1d1f22', 0.1, 0.8)
  const chrome = mat('#c8ccd1', 0.8, 0.3)
  const seatMat = mat('#2b2420', 0, 0.9)

  const root = new THREE.Group()
  root.name = 'Zémidjan du joueur'
  const mesh = (g: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number) => {
    const o = new THREE.Mesh(g, m)
    o.position.set(x * k, y * k, z * k)
    o.castShadow = true
    o.receiveShadow = true
    root.add(o)
    return o
  }
  const r = 0.3 // wheel radius, m
  const wheelGeo = geo(new THREE.CylinderGeometry(r * k, r * k, 0.1 * k, 18))
  wheelGeo.rotateZ(Math.PI / 2)
  for (const [name, z] of [
    ['wheel-front', 0.68],
    ['wheel-back', -0.68],
  ] as const) {
    // A pivot per wheel: steering turns it around Y, rolling around X.
    const pivot = new THREE.Group()
    pivot.name = name
    pivot.position.set(0, r * k, z * k)
    const tyre = new THREE.Mesh(wheelGeo, black)
    tyre.castShadow = true
    pivot.add(tyre)
    const hub = new THREE.Mesh(geo(new THREE.BoxGeometry(0.12 * k, 0.12 * k, 0.12 * k)), chrome)
    pivot.add(hub)
    root.add(pivot)
  }
  // Frame, tank, seat, rear rack, front fork, handlebar, headlight.
  mesh(geo(new THREE.BoxGeometry(0.22, 0.18, 1.0).scale(k, k, k)), body, 0, 0.55, 0.02)
  mesh(geo(new THREE.BoxGeometry(0.3, 0.22, 0.4).scale(k, k, k)), body, 0, 0.74, 0.3)
  mesh(geo(new THREE.BoxGeometry(0.3, 0.1, 0.78).scale(k, k, k)), seatMat, 0, 0.78, -0.22)
  mesh(geo(new THREE.BoxGeometry(0.32, 0.05, 0.3).scale(k, k, k)), black, 0, 0.72, -0.72)
  const fork = mesh(
    geo(new THREE.BoxGeometry(0.06, 0.6, 0.06).scale(k, k, k)),
    chrome,
    0,
    0.6,
    0.62,
  )
  fork.rotation.x = -0.35
  mesh(geo(new THREE.BoxGeometry(0.7, 0.04, 0.04).scale(k, k, k)), black, 0, 0.98, 0.52)
  mesh(geo(new THREE.BoxGeometry(0.14, 0.12, 0.08).scale(k, k, k)), chrome, 0, 0.88, 0.74)
  mesh(geo(new THREE.BoxGeometry(0.18, 0.1, 0.4).scale(k, k, k)), chrome, 0.16, 0.36, -0.35)
  return { root, seat: 0.8 * k, driverZ: 0.02 * k, passengerZ: -0.42 * k, geometries, materials }
}
