import assert from 'node:assert/strict'
import fs from 'node:fs'
import { test } from 'node:test'
import * as THREE from 'three'
import type { Bank } from '../lib/haroolife/city/bank'
import { bodiesOverlap } from '../lib/haroolife/city/collisions'
import {
  type Geometry,
  type PackManifest,
  appendModel,
  decodeModel,
} from '../lib/haroolife/city/pack'
import { PavementGraph } from '../lib/haroolife/city/pedestrians'
import { renderPixelRatio } from '../lib/haroolife/city/quality'
import { RoadTraffic } from '../lib/haroolife/city/road-traffic'
import { STREET_CELL } from '../lib/haroolife/game/core/street'
import { BUILDING_HEIGHT, buildCityGeometry } from '../lib/haroolife/game/render/city-models'
import { buildPoles, polePlaces } from '../lib/haroolife/game/render/street-poles'
import { TileCache } from '../lib/haroolife/game/render/tile-cache'
import { batchTrafficModel, disposeTrafficModel } from '../lib/haroolife/game/render/vehicle-batch'
import {
  TRAFFIC_CAR_SCALE,
  TRAFFIC_LANE_SCALE,
  fitTaxiModel,
} from '../lib/haroolife/game/render/vehicle-scale'

test('allocation-free collision SAT agrees with the four-axis reference for rotated bodies', () => {
  type Body = Parameters<typeof bodiesOverlap>[0]
  const reference = (a: Body, b: Body, gap: number) => {
    const axes = (v: Body) => {
      const angle = (v.heading * Math.PI) / 180
      return [
        [Math.cos(angle), -Math.sin(angle)],
        [Math.sin(angle), Math.cos(angle)],
      ]
    }
    const aa = axes(a)
    const ba = axes(b)
    const extent = (v: Body, axes: number[][], axis: number[]) =>
      Math.abs(axes[0][0] * axis[0] + axes[0][1] * axis[1]) * v.halfWidth +
      Math.abs(axes[1][0] * axis[0] + axes[1][1] * axis[1]) * v.halfLength
    return [...aa, ...ba].every(
      (axis) =>
        Math.abs((a.x - b.x) * axis[0] + (a.z - b.z) * axis[1]) <
        extent(a, aa, axis) + extent(b, ba, axis) + gap,
    )
  }
  let seed = 123
  const random = () => {
    seed = (seed * 16807) % 2147483647
    return seed / 2147483647
  }
  const body = (): Body => ({
    x: random() * 4,
    z: random() * 4,
    heading: random() * 360,
    halfWidth: 0.1 + random(),
    halfLength: 0.1 + random(),
  })
  for (let i = 0; i < 10000; i++) {
    const a = body()
    const b = body()
    const gap = random() * 0.2
    assert.equal(bodiesOverlap(a, b, gap), reference(a, b, gap), `pair ${i}`)
  }
})

test('traffic batching preserves all triangles, UVs, transforms, materials and bounds', () => {
  const source = new THREE.Group()
  source.position.set(2, 1, -3)
  const material = new THREE.MeshStandardMaterial()
  for (let i = 0; i < 10; i++) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(), material)
    mesh.position.set(i, i / 3, 0)
    source.add(mesh)
  }
  const batch = batchTrafficModel(source)
  assert.equal(batch.children.length, 1)
  const mesh = batch.children[0] as THREE.Mesh
  assert.equal(mesh.geometry.index?.count, 10 * 36)
  assert.equal(mesh.geometry.attributes.uv.count, 10 * 24)
  assert.equal(mesh.material, material)
  assert.deepEqual(new THREE.Box3().setFromObject(batch), new THREE.Box3().setFromObject(source))
  let disposed = 0
  material.addEventListener('dispose', () => disposed++)
  disposeTrafficModel(batch)
  assert.equal(disposed, 0, 'materials remain owned by the GLTF, never disposed by a batch')
  source.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).geometry.dispose()
  })
  material.dispose()
})

test('inactive geometry cache evicts by bytes, transfers ownership and frees exactly once', () => {
  const g = new THREE.BoxGeometry()
  const bytes = Object.values(g.attributes).reduce(
    (n, a) => n + a.array.byteLength,
    g.index!.array.byteLength,
  )
  const cache = new TileCache(bytes + 1)
  let disposed = 0
  g.addEventListener('dispose', () => disposed++)
  cache.put('a', g, 1)
  const g2 = g.clone()
  cache.put('b', g2, 2)
  assert.equal(disposed, 1)
  assert.equal(cache.take('a'), null)
  assert.equal(cache.take('b')?.geometry, g2)
  assert.equal(cache.byteLength, 0)
  cache.clear()
  assert.equal(disposed, 1)
  g2.dispose()
})

test('typed building buffers preserve the original estate geometry and normals', () => {
  const manifest = JSON.parse(
    fs.readFileSync('public/haroolife/city/kenney-pack.json', 'utf8'),
  ) as PackManifest
  const buffer = fs.readFileSync('public/haroolife/city/kenney-pack.bin')
  const binary = buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength,
  ) as ArrayBuffer
  const m = decodeModel(manifest, binary, 'sub-a')
  const bank = { model: () => m } as unknown as Bank
  const b = {
    id: 'estate:0:0',
    x: 50,
    y: 30,
    w: 1,
    h: 1,
    floors: 1,
    type: 'house' as const,
    color: '#fff',
    roof: '#fff',
    name: null,
  }
  const original: Geometry = { pos: [], nrm: [], col: [], idx: [] }
  const fit = Math.min((STREET_CELL * 0.9) / m.size[0], (STREET_CELL * 0.9) / m.size[2])
  appendModel(original, m, {
    x: 50 * STREET_CELL,
    y: 0,
    z: 30 * STREET_CELL,
    rot: 180,
    scale: [fit, fit * BUILDING_HEIGHT, fit],
  })
  const g = buildCityGeometry(bank, [b], true)
  for (const [key, values] of [
    ['position', original.pos],
    ['normal', original.nrm],
    ['color', original.col],
  ] as const)
    assert.deepEqual(g.attributes[key].array, new Float32Array(values))
  assert.deepEqual(Array.from(g.index!.array), original.idx)
  g.dispose()
})

test('taxi fits the traffic scale and native device ratio is an upper bound', () => {
  const model = new THREE.Mesh(new THREE.BoxGeometry(3, 2, 6))
  fitTaxiModel(model, 1.15 * TRAFFIC_CAR_SCALE, STREET_CELL * TRAFFIC_LANE_SCALE)
  const size = new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3())
  // 4.1 × 1.7 × 1.45 m against a 1.75 m adult of 1.15 units, in a lane of the real-scale street.
  const m = 1.15 / 1.75
  assert.ok(Math.abs(size.z - 4.1 * m) < 0.01 && Math.abs(size.x - 1.7 * m) < 0.01)
  assert.ok(Math.abs(size.y - 1.45 * m) < 0.01)
  assert.equal(new THREE.Box3().setFromObject(model).min.y, 0)
  assert.equal(renderPixelRatio('high', false, 1), 1)
  assert.equal(renderPixelRatio('balanced', false, 3), 1.5)
  model.geometry.dispose()
})

test('traffic clears a pedestrian waiting beside the lane, but still stops for an occupied lane', () => {
  const traffic = new RoadTraffic((_x, z) => z === 30, 1)
  const car = {
    id: 0,
    kind: 'taxi' as const,
    from: { x: 47, z: 30 },
    to: { x: 48, z: 30 },
    t: 0.176,
    x: 47.176,
    z: 29.7,
    heading: 90,
    halfWidth: 0.2,
    halfLength: 0.54,
    stopped: false,
  }
  traffic.cars.push(car)
  const pedestrian = { x: 47.38, z: 30.0039, heading: 0, halfWidth: 0.1, halfLength: 0.1 }
  traffic.step(0.05, 47.38, 30, [pedestrian])
  assert.ok(car.x > 47.176, 'car can clear the zebra without touching the pedestrian')
  pedestrian.z = 29.7
  const before = car.x
  traffic.step(0.05, 47.38, 30, [pedestrian])
  assert.equal(car.stopped, true)
  assert.equal(car.x, before)
})

test('reused sidewalk searches preserve paths, isolate returned arrays and recover after a failed route', () => {
  const graph = new PavementGraph(
    (x, z) => (x === 4 && z >= 0 && z < 12) || (z === 4 && x >= 0 && x < 12),
    12,
    12,
  )
  const from = { x: 3.38, z: 1 }
  const to = { x: 9, z: 3.38 }
  const first = graph.route(from, to)
  assert.ok(first && first.length > 2)
  const snapshot = structuredClone(first)
  for (let i = 0; i < 20; i++) {
    assert.equal(graph.route(from, { x: 1000, z: 1000 }), null)
    const route = graph.route(from, to)
    assert.deepEqual(route, snapshot)
    route?.shift()
    graph.route(to, from)
  }
  assert.deepEqual(first, snapshot)
  assert.equal(graph.nearest({ x: Number.POSITIVE_INFINITY, z: 0 }), -1)
  assert.equal(graph.route(from, { x: 1e20, z: 1e20 }), null)
  for (let x = -3; x < 17; x += 0.7)
    for (let z = -3; z < 17; z += 0.7) {
      let nearest = -1
      let distance = Number.POSITIVE_INFINITY
      graph.nodes.forEach((node, n) => {
        const d = Math.hypot(node.x - x, node.z - z)
        if (d < distance) {
          distance = d
          nearest = n
        }
      })
      assert.equal(graph.nearest({ x, z }), nearest)
    }
})

test('CEET poles stand at the kerb every three cells, never at a crossroads, wired in a row', () => {
  // A road along x (y = 9000, far from every lot's door) crossed by a street at x = 9006.
  const cells: { x: number; y: number; kind: 'road' | 'land' }[] = []
  for (let x = 9000; x <= 9012; x++)
    for (let y = 8998; y <= 9002; y++)
      cells.push({ x, y, kind: y === 9000 || x === 9006 ? 'road' : 'land' })
  const places = polePlaces(cells)
  const onAvenue = places.filter((p) => p.y === 9000)
  assert.deepEqual(
    [...new Set(onAvenue.map((p) => p.x))].sort((a, b) => a - b),
    [9000, 9003, 9009, 9012],
  )
  assert.ok(onAvenue.every((p) => p.dx === 0 && Math.abs(p.dy) === 1))
  assert.ok(!places.some((p) => p.x === 9006 && p.y === 9000), 'no pole in the crossroads')
  const geometry = new THREE.BoxGeometry(1, 1, 1)
  const material = new THREE.MeshStandardMaterial()
  const wire = new THREE.LineBasicMaterial()
  const [poles, wires] = buildPoles(places, geometry, material, wire, STREET_CELL, 1.15 / 1.75)
  assert.equal((poles as THREE.InstancedMesh).count, places.length)
  // 9000→9003 and 9009→9012 on both sides, two wires each, six segments per wire.
  const segments = (wires as THREE.LineSegments).geometry.attributes.position.count / 2
  assert.equal(segments, 4 * 2 * 6)
  ;(wires as THREE.LineSegments).geometry.dispose()
  ;(poles as THREE.InstancedMesh).dispose()
  geometry.dispose()
  material.dispose()
  wire.dispose()
})
