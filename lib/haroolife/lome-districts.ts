/**
 * Named city over the 22×22 neighbourhood grid: districts, water bodies and the
 * three cities a player can choose. Names are real places; the grid layout is a
 * game simplification, not a survey. Pure functions, used by the HUD, the map and
 * the 3D tile tints.
 */
import { SIZE, terrainAt } from './townsmen-engine'

export type CityId = 'lome' | 'kara' | 'sokode'
export interface District {
  id: string
  name: string
  /** One line a resident would say about the place. */
  note: string
}
export interface CityDef {
  id: CityId
  name: string
  region: string
  /** Five districts, in grid order: north, west, centre, east, south. */
  districts: [District, District, District, District, District]
  /** The two water bodies of the grid: north-east and south-west corners. */
  water: { northEast: string; southWest: string }
  boulevard: string
}

export const CITIES: Record<CityId, CityDef> = {
  lome: {
    id: 'lome',
    name: 'Lomé',
    region: 'Maritime',
    districts: [
      {
        id: 'agoe',
        name: 'Agoè',
        note: 'Le nord qui grandit, gare routière et champs en lisière.',
      },
      {
        id: 'adidogome',
        name: 'Adidogomé',
        note: 'Quartier résidentiel, écoles et petits commerces.',
      },
      { id: 'tokoin', name: 'Tokoin', note: 'Le centre : mairie, marché et administrations.' },
      { id: 'be', name: 'Bè', note: 'Le vieux Lomé, au bord de la lagune, ruelles et cultes.' },
      { id: 'baguida', name: 'Baguida', note: 'La côte vers l’est, cocotiers et plage.' },
    ],
    water: { northEast: 'Lagune de Bè', southWest: 'Océan Atlantique' },
    boulevard: 'Boulevard du Mono',
  },
  kara: {
    id: 'kara',
    name: 'Kara',
    region: 'Kara',
    districts: [
      { id: 'tchre', name: 'Tchré', note: 'Au pied des collines, maisons et jardins.' },
      { id: 'kpewa', name: 'Kpéwa', note: 'Quartier de l’université et des étudiants.' },
      { id: 'centre-kara', name: 'Centre-ville', note: 'Le grand marché et la préfecture.' },
      { id: 'dongoyo', name: 'Dongoyo', note: 'Le long de la rivière Kara.' },
      { id: 'awandjelo', name: 'Awandjélo', note: 'Sortie vers Kabou, ateliers et garages.' },
    ],
    water: { northEast: 'Rivière Kara', southWest: 'Retenue d’eau' },
    boulevard: 'Route nationale 1',
  },
  sokode: {
    id: 'sokode',
    name: 'Sokodé',
    region: 'Centrale',
    districts: [
      { id: 'komah', name: 'Komah', note: 'Quartier du nord, grenier à maïs.' },
      { id: 'kpangalam', name: 'Kpangalam', note: 'Marché de bétail et artisans.' },
      {
        id: 'didaoure',
        name: 'Didaouré',
        note: 'Le cœur de la ville, mosquée centrale et marché.',
      },
      { id: 'kossobio', name: 'Kossobio', note: 'Sur la route de Bassar.' },
      { id: 'salimde', name: 'Salimdè', note: 'Vers le sud, jardins maraîchers.' },
    ],
    water: { northEast: 'Rivière Mô', southWest: 'Barrage de Kpangalam' },
    boulevard: 'Route de Bassar',
  },
}
export const CITY_IDS = Object.keys(CITIES) as CityId[]
export const isCityId = (v: unknown): v is CityId => typeof v === 'string' && v in CITIES

/** Index into `districts`: 0 north, 1 west, 2 centre, 3 east, 4 south. */
export function districtIndexAt(x: number, y: number): 0 | 1 | 2 | 3 | 4 {
  if (y < 6) return 0
  if (y > 15) return 4
  if (x < 7) return 1
  if (x > 15) return 3
  return 2
}

export function districtAt(city: CityId, x: number, y: number): District {
  return CITIES[city].districts[districtIndexAt(x, y)]
}

/** What a tile is called on the map: a district, a water body, or the shore. */
export function placeNameAt(city: CityId, x: number, y: number): string {
  const def = CITIES[city]
  if (terrainAt(x, y) === 'water') return x > SIZE / 2 ? def.water.northEast : def.water.southWest
  return districtAt(city, x, y).name
}

/** Grass next to water is sand: the lagoon shore and the beach. */
export function isShore(x: number, y: number): boolean {
  if (terrainAt(x, y) === 'grass') {
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      if (terrainAt(x + dx, y + dy) === 'water') return true
    }
  }
  return false
}

export type MapFilter = 'all' | 'shops' | 'services' | 'homes'
export const MAP_FILTERS: { id: MapFilter; label: string }[] = [
  { id: 'all', label: 'Tout' },
  { id: 'shops', label: 'Commerces' },
  { id: 'services', label: 'Services' },
  { id: 'homes', label: 'Maisons' },
]
const SHOPS = new Set(['market', 'bakery'])
const SERVICES = new Set(['hall', 'well', 'park'])
export function matchesFilter(filter: MapFilter, venue: string): boolean {
  if (filter === 'all') return true
  if (filter === 'shops') return SHOPS.has(venue)
  if (filter === 'services') return SERVICES.has(venue)
  return venue === 'house'
}
