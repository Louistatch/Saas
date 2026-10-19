import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { activitiesOf, layoutFor } from '../lib/haroolife/city/interiors'
import { DRIVEWAY_Y, ESTATE, worldLots } from '../lib/haroolife/city/world'
import { HOUSE_SCENE, hotspotForProp } from '../lib/haroolife/game/core/house'
import { isFree, pathfind } from '../lib/haroolife/game/core/pathfind'
import { sceneFor } from '../lib/haroolife/game/core/scene'
import { groundAt, streetWindow } from '../lib/haroolife/game/core/street'

const { bounds, obstacles } = HOUSE_SCENE
const open = { minX: -3, maxX: 3, minZ: -3, maxZ: 3 }

describe('pathfind', () => {
  it('walks straight across an empty room and ends on the goal cell', () => {
    const path = pathfind({ x: -2.7, z: 0 }, { x: 2.7, z: 0 }, [], open)
    assert.ok(path.length > 0)
    const end = path[path.length - 1]
    assert.ok(Math.hypot(end.x - 2.7, end.z) < 0.45)
    for (const p of path)
      assert.ok(Math.abs(p.z - end.z) < 1e-9, 'one row: no detour without obstacles')
  })
  it('goes around an obstacle and never through it', () => {
    const wall = [{ x: 0, z: 0, w: 0.6, d: 4 }]
    const path = pathfind({ x: -2, z: 0 }, { x: 2, z: 0 }, wall, open)
    assert.ok(path.length > 0)
    for (const p of path) assert.ok(isFree(p.x, p.z, wall, open, 0.15), `${p.x},${p.z} is free`)
  })
  it('moves a goal inside furniture to the nearest free cell', () => {
    const box = [{ x: 1.5, z: 0, w: 1, d: 1 }]
    const path = pathfind({ x: -2, z: 0 }, { x: 1.5, z: 0 }, box, open)
    assert.ok(path.length > 0)
    const end = path[path.length - 1]
    assert.ok(isFree(end.x, end.z, box, open, 0.15))
  })
  it('returns no path when the goal is walled off', () => {
    const ring = [
      { x: 2, z: 0, w: 2.2, d: 0.3 },
      { x: 2, z: 2, w: 2.2, d: 0.3 },
    ]
    const closed = { minX: -3, maxX: 3, minZ: -0.3, maxZ: 2.3 }
    const cut = [...ring, { x: 1, z: 1, w: 0.3, d: 2.2 }, { x: 3, z: 1, w: 0.3, d: 2.2 }]
    assert.deepEqual(pathfind({ x: -2, z: 1 }, { x: 2, z: 1 }, cut, closed), [])
  })
})

describe('house scene', () => {
  const house = layoutFor('house')
  it('spawns on a free floor cell', () => {
    assert.ok(isFree(HOUSE_SCENE.spawn.x, HOUSE_SCENE.spawn.z, obstacles, bounds))
  })
  it('every interaction point is a Saas house prop with an action (no second economy)', () => {
    for (const h of HOUSE_SCENE.hotspots) {
      if (h.propId === 'exit') continue
      const prop = house.props.find((p) => p.id === h.propId)
      assert.ok(prop, `${h.id} → ${h.propId} exists in layoutFor('house')`)
      assert.ok(prop.action, `${h.propId} has an action`)
    }
  })
  it('offers every labelled house activity, eating and sleeping included', () => {
    for (const p of house.props.filter((x) => x.action && x.label))
      assert.ok(hotspotForProp(HOUSE_SCENE, p.id), `${p.id} (${p.action}) has a hotspot`)
    assert.equal(hotspotForProp(HOUSE_SCENE, 'stove')?.id, 'eat')
    assert.equal(hotspotForProp(HOUSE_SCENE, 'bed')?.id, 'sleep')
  })
  it('every interaction point stands on free floor and is reachable from the spawn', () => {
    for (const h of HOUSE_SCENE.hotspots) {
      assert.ok(isFree(h.at.x, h.at.z, obstacles, bounds, 0.19), `${h.id} stands on free floor`)
      const path = pathfind(HOUSE_SCENE.spawn, h.at, obstacles, bounds)
      assert.ok(path.length > 0, `${h.id} is reachable`)
      const end = path[path.length - 1]
      assert.ok(Math.hypot(end.x - h.at.x, end.z - h.at.z) < 0.5, `${h.id}: path ends near it`)
    }
  })
})

describe('every Saas interior in the HarooLife engine', () => {
  const ids = [
    'house',
    'gym',
    'market',
    'bakery',
    'hall',
    'well',
    'chapel',
    'clinic',
    'park',
  ] as const
  for (const id of ids) {
    const layout = layoutFor(id)
    const scene = sceneFor(id, layout)
    it(`${id}: free spawn, every activity reachable, ids from the Saas layout`, () => {
      assert.ok(isFree(scene.spawn.x, scene.spawn.z, scene.obstacles, scene.bounds), 'free spawn')
      const props = new Set(layout.props.map((p) => p.id))
      for (const h of scene.hotspots) {
        if (h.kind === 'prop') assert.ok(props.has(h.ref), `${h.ref} is a Saas prop`)
        if (h.kind === 'npc')
          assert.ok(
            layout.npcs.some((n) => n.id === h.ref),
            `${h.ref} is a Saas NPC`,
          )
      }
      for (const p of activitiesOf(layout)) {
        const h = scene.hotspots.find((x) => x.kind === 'prop' && x.ref === p.id)
        assert.ok(h, `${id}/${p.id} (${p.label}) has an interaction point`)
      }
      for (const h of scene.hotspots) {
        assert.ok(isFree(h.at.x, h.at.z, scene.obstacles, scene.bounds, 0.19), `${id}/${h.id} free`)
        const path = pathfind(scene.spawn, h.at, scene.obstacles, scene.bounds)
        assert.ok(
          path.length > 0 || Math.hypot(h.at.x - scene.spawn.x, h.at.z - scene.spawn.z) < 0.6,
          `${id}/${h.id} reachable`,
        )
      }
      assert.ok(
        scene.hotspots.some((h) => h.kind === 'exit'),
        'a way out',
      )
    })
  }
})

describe('the street around the player (HarooLife engine)', () => {
  it('reads roads, lots and doors from the Saas city, with their own ids', () => {
    // Around the estate driveway, where every new game starts.
    const win = streetWindow(ESTATE.x0 - 2, DRIVEWAY_Y, 13, [
      { x: 9, y: 9, type: 'house' },
      { x: 9, y: 12, type: 'road' },
    ])
    assert.equal(win.cells.length, 27 * 27)
    assert.ok(win.roads.length > 20, 'roads to walk on')
    assert.ok(
      win.buildings.some((b) => b.id === 'estate:9:9'),
      "the player's house is drawn",
    )
    const lots = new Set(worldLots().map((l) => l.id))
    for (const b of win.buildings) if (!b.id.startsWith('estate:')) assert.ok(lots.has(b.id), b.id)
    for (const d of win.doors) {
      assert.ok(lots.has(d.lotId), `${d.lotId} is a Saas lot`)
      assert.equal(groundAt(d.x, d.y), 'road', `${d.name}: its door opens on a road`)
    }
  })
})
