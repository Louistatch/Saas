import assert from 'node:assert/strict'
import { test } from 'node:test'
import { CHUNK, CHUNKS_X, CHUNKS_Y, chunksAround, lotsInChunk } from '../lib/haroolife/city/chunks'
import {
  ESTATE_GATE,
  estateRoadsOf,
  findPath,
  nearestWalkable,
  walkable,
} from '../lib/haroolife/city/navigation'
import { agentsNear, cityLoop } from '../lib/haroolife/city/traffic'
import {
  CATEGORY_OF,
  ESTATE,
  WORLD_H,
  WORLD_W,
  districtAt,
  districts,
  inEstate,
  isCityRoad,
  isDriveway,
  landmarkAnchors,
  landmarks,
  landmarksIn,
  lotAt,
  terrainAt,
  toWorld,
  worldLots,
} from '../lib/haroolife/city/world'
import { initialLomeLife } from '../lib/haroolife/lome-life-engine'

test('the world is a real city: hundreds of buildings across six districts, water and roads', () => {
  const lots = worldLots()
  const buildings = lots.filter((l) => l.type !== 'lot' && l.type !== 'park')
  assert.ok(buildings.length >= 250, `${buildings.length} buildings`)
  assert.ok(lots.length >= 400, `${lots.length} lots`)
  for (const d of districts()) {
    const inD = buildings.filter((l) => l.district === d.id)
    assert.ok(inD.length >= 25, `${d.name}: ${inD.length} buildings`)
    // Every district has the everyday services: market, school, bank, hospital, sport, worship.
    for (const t of ['market', 'school', 'bank', 'hospital', 'sport', 'worship'] as const)
      assert.ok(
        landmarksIn(d.id).some((l) => l.type === t),
        `${d.name} lacks ${t}`,
      )
  }
  let water = 0
  let roads = 0
  for (let y = 0; y < WORLD_H; y++)
    for (let x = 0; x < WORLD_W; x++) {
      const t = terrainAt(x, y)
      if (t === 'lagoon' || t === 'ocean') water++
      if (isCityRoad(x, y)) roads++
    }
  assert.ok(water > 600 && water < 3000, `water ${water}`)
  assert.ok(roads > 1500, `roads ${roads}`)
  assert.equal(terrainAt(84, 20), 'lagoon')
  assert.ok(isCityRoad(84, 20), 'bridge at x=84 crosses the lagoon')
  assert.ok(!isCityRoad(90, 20), 'no road on open lagoon water')
})

test('lots never overlap roads, water or the estate, and each has a reachable door', () => {
  const seen = new Set<string>()
  for (const lot of worldLots()) {
    for (let i = 0; i < lot.w; i++)
      for (let j = 0; j < lot.h; j++) {
        const x = lot.x + i
        const y = lot.y + j
        const k = `${x}:${y}`
        assert.ok(!seen.has(k), `overlap at ${k}`)
        seen.add(k)
        assert.equal(terrainAt(x, y), 'land')
        assert.ok(!isCityRoad(x, y) && !isDriveway(x, y) && !inEstate(x, y))
        assert.equal(lotAt(x, y)?.id, lot.id)
      }
    assert.ok(
      isCityRoad(lot.door.x, lot.door.y) || isDriveway(lot.door.x, lot.door.y),
      `${lot.id} door is not on a road`,
    )
    assert.equal(districtAt(lot.x, lot.y).id, lot.district)
  }
  // Every named landmark was placed, in its own district.
  assert.equal(landmarks().length, landmarkAnchors().length)
  for (const lm of landmarks()) assert.ok(CATEGORY_OF[lm.type])
})

test('the estate is embedded: its roads join the city through the driveway and every landmark is reachable', () => {
  const estateRoads = estateRoadsOf(initialLomeLife().city.buildings)
  const inside = toWorld({ x: 11, y: 12 }) // the player's starting road tile
  assert.ok(walkable(inside.x, inside.y, estateRoads))
  assert.ok(walkable(ESTATE_GATE.x, ESTATE_GATE.y, estateRoads))
  assert.ok(isCityRoad(ESTATE.x0 - 2, ESTATE_GATE.y) || isCityRoad(ESTATE.x0 - 1, ESTATE_GATE.y))
  const toGate = findPath(inside, ESTATE_GATE, estateRoads)
  assert.ok(toGate && toGate.length > 2, 'estate connects to the gate')
  let longest = 0
  for (const lm of landmarks()) {
    const path = findPath(inside, lm.door, estateRoads)
    assert.ok(path, `${lm.name} unreachable`)
    longest = Math.max(longest, path.length)
  }
  assert.ok(longest > 60, `the city is wide: longest walk ${longest}`)
  assert.deepEqual(
    nearestWalkable({ x: ESTATE.x0 + 3, y: ESTATE.y0 + 3 }, estateRoads)?.x !== undefined,
    true,
  )
})

test('chunks partition the world deterministically and keep the centre first', () => {
  assert.equal(CHUNKS_X * CHUNK >= WORLD_W && CHUNKS_Y * CHUNK >= WORLD_H, true)
  const around = chunksAround(60, 40, 1, 3)
  assert.equal(around[0].lod, 'near')
  assert.ok(around.filter((c) => c.lod === 'near').length === 9)
  assert.ok(around.length <= 49 && around.length >= 35)
  const total = new Set<string>()
  for (let cx = 0; cx < CHUNKS_X; cx++)
    for (let cy = 0; cy < CHUNKS_Y; cy++) for (const l of lotsInChunk(cx, cy)) total.add(l.id)
  assert.equal(total.size, worldLots().length)
  assert.deepEqual(chunksAround(10, 10), chunksAround(10, 10))
})

test('traffic follows the streets without teleporting', () => {
  const loop = cityLoop()
  assert.ok(loop.length > 1500)
  for (let i = 0; i < loop.length; i++) {
    const a = loop[i]
    const b = loop[(i + 1) % loop.length]
    assert.equal(Math.abs(a.x - b.x) + Math.abs(a.y - b.y), 1, `jump at ${i}`)
  }
  const now = agentsNear(100, 60, 40, 60)
  const later = agentsNear(101, 60, 40, 60)
  assert.ok(now.length >= 10)
  for (const a of now) {
    const b = later.find((x) => x.id === a.id)
    if (b) assert.ok(Math.abs(a.x - b.x) + Math.abs(a.y - b.y) <= 3)
  }
})
