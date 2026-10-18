import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  FURNITURE,
  MAX_PIECES,
  buyFurniture,
  decodeFurnishing,
  furnishingOf,
  placePiece,
  resellPiece,
  storePiece,
} from '../lib/haroolife/city/furnishing'
import { type CityLife, decodeCityLife, initialCityLife } from '../lib/haroolife/city/life'
import {
  canPlace,
  freeSpotNear,
  furnitureHotspots,
  placedFurniture,
} from '../lib/haroolife/game/core/furnish'
import { isFree, pathfind } from '../lib/haroolife/game/core/pathfind'
import { HOUSE_SCENE } from '../lib/haroolife/game/core/scene'

const rich = (wallet: number): CityLife => {
  const s = initialCityLife()
  return { ...s, life: { ...s.life, wallet } }
}

test('acheter un meuble : débité au prix affiché, livré dans son carton', () => {
  const tv = FURNITURE.find((f) => f.id === 'tv-43')
  assert.ok(tv)
  const s = buyFurniture(rich(500_000), 'tv-43')
  assert.equal(s.life.wallet, 500_000 - tv.price)
  assert.deepEqual(furnishingOf(s).pieces, [{ uid: 'p1', item: 'tv-43' }])
  assert.match(s.life.lastEvent, /carton/)
  // Sans l'argent, rien ne change ; un article inconnu n'est pas vendu.
  assert.equal(buyFurniture(rich(1000), 'tv-43').furnishing, undefined)
  assert.equal(buyFurniture(rich(500_000), 'piscine').furnishing, undefined)
})

test('les prix sont ceux de Lomé (ordres de grandeur, en FCFA)', () => {
  const price = (id: string) => FURNITURE.find((f) => f.id === id)?.price ?? 0
  assert.ok(price('tv-43') >= 100_000 && price('tv-43') <= 400_000)
  assert.ok(price('chaise-plastique') < 10_000)
  assert.ok(price('ventilateur') < price('refrigerateur'))
  for (const f of FURNITURE) assert.ok(Number.isSafeInteger(f.price) && f.price > 0, f.id)
})

test('installer, ranger, revendre', () => {
  let s = buyFurniture(rich(500_000), 'tv-43')
  s = placePiece(s, 'p1', 0.3, -1.6, 5)
  assert.deepEqual(furnishingOf(s).pieces[0], { uid: 'p1', item: 'tv-43', x: 0.3, z: -1.6, rot: 1 })
  s = storePiece(s, 'p1')
  assert.deepEqual(furnishingOf(s).pieces[0], { uid: 'p1', item: 'tv-43' })
  const before = s.life.wallet
  s = resellPiece(s, 'p1')
  assert.equal(furnishingOf(s).pieces.length, 0)
  assert.equal(s.life.wallet, before + 78_000)
})

test('une maison pleine refuse un meuble de plus', () => {
  let s = rich(10_000_000)
  for (let i = 0; i < MAX_PIECES; i++) s = buyFurniture(s, 'chaise-plastique')
  assert.equal(furnishingOf(s).pieces.length, MAX_PIECES)
  assert.equal(furnishingOf(buyFurniture(s, 'plante')).pieces.length, MAX_PIECES)
})

test('sauvegarde : les meubles reviennent, une sauvegarde trafiquée est nettoyée', () => {
  let s = buyFurniture(buyFurniture(rich(500_000), 'tv-43'), 'ventilateur')
  s = placePiece(s, 'p1', 0.3, -1.6, 0)
  const back = decodeCityLife(JSON.parse(JSON.stringify(s)))
  assert.deepEqual(back?.furnishing, s.furnishing)
  const dirty = decodeFurnishing({
    pieces: [
      { uid: 'p1', item: 'tv-43', x: 99, z: 0 },
      { uid: 'p1', item: 'ventilateur' },
      { uid: 'x', item: 'tv-43' },
      { uid: 'p2', item: 'piscine' },
      { uid: 'p3', item: 'lampe', x: 1, z: 1, rot: 9 },
    ],
    next: 1,
  })
  assert.deepEqual(dirty, {
    pieces: [
      { uid: 'p1', item: 'tv-43' },
      { uid: 'p3', item: 'lampe', x: 1, z: 1, rot: 0 },
    ],
    next: 4,
  })
  assert.equal(decodeFurnishing('rien'), undefined)
})

test('placer : entre les murs, sans chevaucher, porte et activités libres', () => {
  const s = buyFurniture(buyFurniture(rich(500_000), 'tv-43'), 'armoire')
  const pieces = furnishingOf(s).pieces
  assert.equal(canPlace(pieces, 'p1', 0.5, -1.0, 0).ok, true)
  assert.equal(canPlace(pieces, 'p1', 7, 0, 0).ok, false, 'à travers le mur')
  assert.equal(canPlace(pieces, 'p1', 3.4, -2.05, 0).ok, false, 'sur le lit')
  assert.equal(canPlace(pieces, 'p1', 3.6, -4.2, 0).ok, false, 'devant la porte')
  const sleep = HOUSE_SCENE.hotspots.find((h) => h.id === 'sleep')
  assert.ok(sleep)
  assert.equal(canPlace(pieces, 'p1', sleep.at.x, sleep.at.z, 0).ok, false, 'sur le point du lit')
  // Deux meubles ne se superposent pas.
  const placed = furnishingOf(placePiece(s, 'p1', 0.5, -1.0, 0)).pieces
  assert.equal(canPlace(placed, 'p2', 0.5, -1.0, 0).ok, false)
  // Ni sur le passage vers une place du coin repas.
  assert.match(
    String((canPlace(pieces, 'p1', 0.3, -1.6, 0) as { reason?: string }).reason),
    /table à manger/,
  )
})

test('chaque emplacement accepté laisse toutes les activités accessibles', () => {
  const s = buyFurniture(rich(500_000), 'canape')
  const pieces = furnishingOf(s).pieces
  let accepted = 0
  for (let x = -5.5; x <= 5.5; x += 0.5)
    for (let z = -4.5; z <= 4.5; z += 0.5)
      for (const rot of [0, 1]) {
        if (!canPlace(pieces, 'p1', x, z, rot).ok) continue
        accepted++
        const placed = placedFurniture([{ uid: 'p1', item: 'canape', x, z, rot }])
        const blocked = [
          ...HOUSE_SCENE.obstacles,
          ...placed.map((p) => ({ x: p.x, z: p.z, w: p.w, d: p.d })),
        ]
        for (const h of HOUSE_SCENE.hotspots) {
          assert.ok(isFree(h.at.x, h.at.z, blocked, HOUSE_SCENE.bounds), `${h.id} libre`)
          assert.ok(pathfind(HOUSE_SCENE.spawn, h.at, blocked, HOUSE_SCENE.bounds).length > 0)
        }
      }
  assert.ok(accepted > 20, 'il reste de la place pour un canapé')
})

test('une télé installée offre « Regarder la télé » devant son écran', () => {
  const s = placePiece(buyFurniture(rich(500_000), 'tv-43'), 'p1', 0.5, -1.0, 0)
  const spots = furnitureHotspots(placedFurniture(furnishingOf(s).pieces))
  assert.equal(spots.length, 1)
  assert.equal(spots[0].ref, 'tv')
  assert.ok(spots[0].at.z > -1.0, 'devant l’écran (+Z)')
})

test('un meuble sorti de son carton trouve une place libre', () => {
  const s = buyFurniture(rich(500_000), 'congelateur')
  const pieces = furnishingOf(s).pieces
  const at = freeSpotNear(pieces, 'p1', 0, 0.5, 0)
  assert.equal(canPlace(pieces, 'p1', at.x, at.z, 0).ok, true)
})
