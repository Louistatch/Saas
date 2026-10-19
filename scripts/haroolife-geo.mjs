#!/usr/bin/env node
/**
 * HarooLife — pipeline hors ligne de la géographie du Togo.
 *
 * Entrée : fichiers GeoJSON déjà téléchargés (aucun accès réseau ici) :
 *   <dir>/tgo-ADM0.geojson  pays       (geoBoundaries gbOpen TGO ADM0)
 *   <dir>/tgo-ADM1.geojson  régions    (geoBoundaries gbOpen TGO ADM1)
 *   <dir>/tgo-ADM2.geojson  préfectures(geoBoundaries gbOpen TGO ADM2)
 * geoBoundaries publie ces limites à partir d'OpenStreetMap (ODbL 1.0). Un extrait OSM
 * Geofabrik (togo-latest.osm.pbf) converti en GeoJSON (osmium export) est accepté à la
 * place : mêmes attributs attendus (`shapeName`/`name`, `shapeType`/`admin_level`).
 *
 * Sortie : lib/haroolife/togo/boundaries.json — anneaux simplifiés (Douglas-Peucker,
 * tolérance en degrés), centroïdes (lon/lat) et bornes, prêts pour la carte nationale.
 * Aucune coordonnée n'est inventée : tout vient des fichiers d'entrée.
 *
 * Usage : node scripts/haroolife-geo.mjs <dir> [tolerance=0.012]
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const [, , dir, tolArg] = process.argv
if (!dir) {
  console.error('usage: node scripts/haroolife-geo.mjs <dir-with-geojson> [tolerance]')
  process.exit(1)
}
const TOL = Number(tolArg ?? 0.012)

const read = (name) => JSON.parse(readFileSync(join(dir, name), 'utf8'))

function sqDist(p, q) {
  return (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2
}
function segDist(p, a, b) {
  let t = 0
  const d = sqDist(a, b)
  if (d > 0)
    t = Math.max(
      0,
      Math.min(1, ((p[0] - a[0]) * (b[0] - a[0]) + (p[1] - a[1]) * (b[1] - a[1])) / d),
    )
  return sqDist(p, [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])])
}
/** Douglas-Peucker on a closed ring; keeps at least a triangle. */
function simplify(ring, tol) {
  const keep = new Array(ring.length).fill(false)
  keep[0] = keep[ring.length - 1] = true
  const stack = [[0, ring.length - 1]]
  const t2 = tol * tol
  while (stack.length) {
    const [i, j] = stack.pop()
    let best = -1
    let bestD = t2
    for (let k = i + 1; k < j; k++) {
      const d = segDist(ring[k], ring[i], ring[j])
      if (d > bestD) {
        bestD = d
        best = k
      }
    }
    if (best >= 0) {
      keep[best] = true
      stack.push([i, best], [best, j])
    }
  }
  const out = ring.filter((_, k) => keep[k])
  return out.length >= 4 ? out : ring
}
const round = (v) => Math.round(v * 1e4) / 1e4

/** Area-weighted centroid of a polygon's outer ring (shoelace). */
function centroid(rings) {
  let A = 0
  let cx = 0
  let cy = 0
  for (const ring of rings) {
    let a = 0
    let x = 0
    let y = 0
    for (let i = 0; i < ring.length - 1; i++) {
      const f = ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1]
      a += f
      x += (ring[i][0] + ring[i + 1][0]) * f
      y += (ring[i][1] + ring[i + 1][1]) * f
    }
    A += a
    cx += x
    cy += y
  }
  return A === 0 ? [rings[0][0][0], rings[0][0][1]] : [round(cx / (3 * A)), round(cy / (3 * A))]
}

function outerRings(geometry) {
  if (geometry.type === 'Polygon') return [geometry.coordinates[0]]
  if (geometry.type === 'MultiPolygon') return geometry.coordinates.map((p) => p[0])
  throw new Error(`unsupported geometry ${geometry.type}`)
}

function convert(feature) {
  const p = feature.properties
  const name = p.shapeName ?? p.name
  const rings = outerRings(feature.geometry)
  const simplified = rings.map((r) => simplify(r, TOL).map(([x, y]) => [round(x), round(y)]))
  let minX = Number.POSITIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let maxY = Number.NEGATIVE_INFINITY
  for (const r of rings)
    for (const [x, y] of r) {
      if (x < minX) minX = x
      if (y < minY) minY = y
      if (x > maxX) maxX = x
      if (y > maxY) maxY = y
    }
  return {
    id: p.shapeID ?? name,
    name,
    centroid: centroid(rings),
    bbox: [round(minX), round(minY), round(maxX), round(maxY)],
    rings: simplified,
  }
}

const country = read('tgo-ADM0.geojson').features.map(convert)[0]
const regions = read('tgo-ADM1.geojson').features.map(convert)
const prefectures = read('tgo-ADM2.geojson').features.map(convert)
/** Each prefecture is attached to the region whose polygon holds its centroid. */
function inside(point, rings) {
  let inside = false
  for (const ring of rings)
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i]
      const [xj, yj] = ring[j]
      if (
        yi > point[1] !== yj > point[1] &&
        point[0] < ((xj - xi) * (point[1] - yi)) / (yj - yi) + xi
      )
        inside = !inside
    }
  return inside
}
const fullRegions = read('tgo-ADM1.geojson').features.map((f) => [
  f.properties.shapeName,
  outerRings(f.geometry),
])
for (const pref of prefectures) {
  const owner = fullRegions.find(([, rings]) => inside(pref.centroid, rings))
  pref.region = owner ? owner[0] : null
}

const out = {
  source: {
    name: 'geoBoundaries (gbOpen) TGO ADM0–ADM2, built from OpenStreetMap',
    license: 'Open Data Commons Open Database License (ODbL) 1.0',
    attribution: '© les contributeurs OpenStreetMap, geoBoundaries',
    url: 'https://www.geoboundaries.org',
    boundaryYear: '2017',
    tolerance: TOL,
    generated: new Date().toISOString().slice(0, 10),
  },
  country,
  regions,
  prefectures,
}
const target = join(process.cwd(), 'lib/haroolife/togo/boundaries.json')
writeFileSync(target, JSON.stringify(out))
const kb = Math.round(JSON.stringify(out).length / 1024)
console.log(`${target}: ${regions.length} régions, ${prefectures.length} préfectures, ${kb} ko`)
