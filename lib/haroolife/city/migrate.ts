import { decodeLomeLife, initialLomeLife } from '../lome-life-engine'
/**
 * Loading the single world save, with migration of the older games.
 *
 * Three local saves existed before the unification:
 * - `haroolife.lome-city.v1`   — Lomé Life 3D (the reference world), kept as is;
 * - `haroolife.lome-life.v1`   — Lomé Life before the city layer, lifted by `fromLegacy`;
 * - `haroolife.citybuilder.v1` — HarooVille, the construction game on the same 22×22 estate.
 *
 * HarooVille's constructions are brought into the estate of the 3D world once: every
 * building standing on a free cell is kept, the municipal budget takes the higher of the two,
 * and the day counter the longer game. Nothing is deleted: the old key stays untouched and a
 * marker prevents a second import.
 */
import { type City, decodeCity, initialCity } from '../townsmen-engine'
import { type CityLife, decodeCityLife, fromLegacy, initialCityLife } from './life'

export const CITY_STORAGE = 'haroolife.lome-city.v1'
export const LEGACY_STORAGE = 'haroolife.lome-life.v1'
export const BUILDER_STORAGE = 'haroolife.citybuilder.v1'
export const BUILDER_IMPORTED = 'haroolife.citybuilder.imported'

export interface Storage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

const parse = (raw: string | null): unknown => {
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

/** Merges HarooVille's city into the estate of a world: free cells only, resources upward. */
export function mergeBuilderCity(world: CityLife, builder: City): CityLife {
  const base = world.life.city
  const taken = new Set(base.buildings.map((b) => `${b.x}:${b.y}`))
  const added = builder.buildings.filter((b) => !taken.has(`${b.x}:${b.y}`))
  if (added.length === 0 && builder.coins <= base.coins) return world
  const city: City = {
    ...base,
    buildings: [...base.buildings, ...added],
    coins: Math.max(base.coins, builder.coins),
    wood: Math.max(base.wood, builder.wood),
    maize: Math.max(base.maize, builder.maize),
    flour: Math.max(base.flour, builder.flour),
    food: Math.max(base.food, builder.food),
    population: Math.max(base.population, builder.population),
    day: Math.max(base.day, builder.day),
    log: [
      added.length > 0
        ? `HarooVille rejoint le monde : ${added.length} construction(s) retrouvée(s) sur le domaine.`
        : 'HarooVille rejoint le monde : budget municipal conservé.',
      ...base.log,
    ].slice(0, 8),
  }
  return { ...world, life: { ...world.life, city } }
}

/** True when the builder save holds anything the initial HarooVille city does not. */
export function builderHasProgress(builder: City): boolean {
  const fresh = initialCity()
  return builder.buildings.length > fresh.buildings.length || builder.day > fresh.day
}

export interface Loaded {
  world: CityLife
  /** Which save produced the world: nothing on disk, the 3D world, the legacy game. */
  source: 'fresh' | 'city' | 'legacy'
  importedBuilder: boolean
}

/** Reads the world from storage, migrating older saves. Never throws on corrupt data. */
export function loadCityLife(storage: Storage): Loaded {
  let world = decodeCityLife(parse(storage.getItem(CITY_STORAGE)))
  let source: Loaded['source'] = 'city'
  if (!world) {
    const legacy = decodeLomeLife(parse(storage.getItem(LEGACY_STORAGE)))
    world = legacy ? fromLegacy(legacy) : null
    source = legacy ? 'legacy' : 'fresh'
  }
  if (!world) world = initialCityLife()
  let importedBuilder = false
  if (!storage.getItem(BUILDER_IMPORTED)) {
    const builder = decodeCity(parse(storage.getItem(BUILDER_STORAGE)))
    if (builder && builderHasProgress(builder)) {
      const merged = mergeBuilderCity(world, builder)
      importedBuilder = merged !== world
      world = merged
      try {
        storage.setItem(BUILDER_IMPORTED, new Date().toISOString())
      } catch {
        /* Blocked storage: the import simply runs again next time, idempotently. */
      }
    }
  }
  return { world, source, importedBuilder }
}

/** Exposed for tests: the number of buildings a fresh 3D world starts with. */
export const INITIAL_WORLD_BUILDINGS = initialLomeLife().city.buildings.length
