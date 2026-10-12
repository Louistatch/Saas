import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  CITIES,
  CITY_IDS,
  districtAt,
  districtIndexAt,
  isCityId,
  isShore,
  matchesFilter,
  placeNameAt,
} from '../lib/haroolife/lome-districts'
import {
  LIFE_LOCATIONS,
  decodeLomeLife,
  initialLomeLife,
  selectCity,
} from '../lib/haroolife/lome-life-engine'
import { SIZE, terrainAt } from '../lib/haroolife/townsmen-engine'

test('every tile of every city belongs to exactly one named district or water body', () => {
  for (const city of CITY_IDS) {
    const names = new Set<string>()
    for (let x = 0; x < SIZE; x++)
      for (let y = 0; y < SIZE; y++) {
        const name = placeNameAt(city, x, y)
        assert.ok(name.length > 1)
        names.add(name)
      }
    // Five districts and two water bodies are all reachable on the grid.
    assert.equal(names.size, 7, `${city}: ${[...names].join(', ')}`)
    assert.equal(CITIES[city].districts.length, 5)
  }
  assert.equal(districtAt('lome', 11, 10).name, 'Tokoin')
  assert.equal(districtIndexAt(3, 10), 1)
  assert.equal(placeNameAt('lome', 20, 0), 'Lagune de Bè')
  assert.equal(placeNameAt('lome', 0, 21), 'Océan Atlantique')
  assert.ok(isCityId('kara') && !isCityId('abidjan'))
})

test('the shore is grass touching water, and all starting places sit in the centre', () => {
  let shore = 0
  for (let x = 0; x < SIZE; x++)
    for (let y = 0; y < SIZE; y++) {
      if (isShore(x, y)) {
        shore++
        assert.equal(terrainAt(x, y), 'grass')
      }
    }
  assert.ok(shore >= 6)
  for (const p of LIFE_LOCATIONS) assert.equal(districtAt('lome', p.x, p.y).id, 'tokoin')
})

test('map filters and city choice', () => {
  assert.ok(matchesFilter('all', 'well'))
  assert.ok(matchesFilter('shops', 'market') && !matchesFilter('shops', 'hall'))
  assert.ok(matchesFilter('services', 'hall') && !matchesFilter('services', 'house'))
  assert.ok(matchesFilter('homes', 'house'))
  const s = initialLomeLife()
  assert.equal(s.cityId, 'lome')
  const kara = selectCity(s, 'kara')
  assert.equal(kara.cityId, 'kara')
  assert.match(kara.lastEvent, /Kara/)
  // The grid and the wallet stay; only the names change.
  assert.deepEqual(kara.city.buildings, s.city.buildings)
  const { cityId: _c, ...old } = JSON.parse(JSON.stringify(s))
  assert.equal(decodeLomeLife(old)?.cityId, 'lome')
  assert.equal(decodeLomeLife({ ...old, cityId: 'paris' }), null)
})
