/**
 * HarooLife City: deterministic single-player isometric city-builder.
 * All resources, agents and coins are fictional and NEVER read/write Haroo business tables.
 */
export const SIZE = 22
export const BUILDING_TYPES = [
  'road',
  'house',
  'lumberyard',
  'farm',
  'mill',
  'bakery',
  'market',
  'well',
  'park',
] as const
export type BuildType = (typeof BUILDING_TYPES)[number]
export type Structure = BuildType | 'hall'
export type Terrain = 'grass' | 'forest' | 'water'
export interface Building {
  x: number
  y: number
  type: Structure
}
export interface City {
  version: 1
  day: number
  coins: number
  wood: number
  maize: number
  flour: number
  food: number
  population: number
  happiness: number
  /** Optional to preserve compatibility with v1 localStorage save files. */
  reliefUsed?: boolean
  buildings: Building[]
  log: string[]
}
export const CATALOG: Record<
  BuildType,
  {
    label: string
    coins: number
    wood: number
    workers: number
    description: string
    icon: string
  }
> = {
  road: {
    label: 'Route',
    coins: 5,
    wood: 1,
    workers: 0,
    description: 'Relie les bâtiments à la mairie.',
    icon: '🛤️',
  },
  house: {
    label: 'Maison',
    coins: 85,
    wood: 8,
    workers: 0,
    description: '+6 places pour les habitants.',
    icon: '🏠',
  },
  lumberyard: {
    label: 'Scierie',
    coins: 120,
    wood: 7,
    workers: 2,
    description: '2 ouvriers : produit du bois près de la forêt.',
    icon: '🪵',
  },
  farm: {
    label: 'Champ de maïs',
    coins: 150,
    wood: 9,
    workers: 2,
    description: '2 ouvriers : produit du maïs.',
    icon: '🌽',
  },
  mill: {
    label: 'Moulin',
    coins: 220,
    wood: 12,
    workers: 2,
    description: '4 maïs → 3 farine par jour.',
    icon: '⚙️',
  },
  bakery: {
    label: 'Boulangerie',
    coins: 260,
    wood: 10,
    workers: 2,
    description: '3 farine → 6 repas par jour.',
    icon: '🥖',
  },
  market: {
    label: 'Marché',
    coins: 190,
    wood: 8,
    workers: 1,
    description: 'Vente 2 repas contre 30 FCFA et augmente le bonheur.',
    icon: '🛒',
  },
  well: {
    label: 'Puits',
    coins: 110,
    wood: 5,
    workers: 0,
    description: 'Approvisionne le quartier en eau.',
    icon: '💧',
  },
  park: {
    label: 'Jardin',
    coins: 75,
    wood: 4,
    workers: 0,
    description: 'Améliore le bonheur des habitants.',
    icon: '🌳',
  },
}

export function within(x: number, y: number): boolean {
  return Number.isInteger(x) && Number.isInteger(y) && x >= 0 && y >= 0 && x < SIZE && y < SIZE
}
export function terrainAt(x: number, y: number): Terrain {
  if (!within(x, y)) return 'water'
  // Fixed shoreline + clustered woodland, for a repeatable map.
  if ((x >= 17 && y <= 4 && x + y < 21) || (x <= 2 && y >= 17 && x + y > 18)) return 'water'
  if (
    ((x * 17 + y * 31 + x * y * 7) % 23 < 6 && (x < 8 || y > 15 || (x > 16 && y > 9))) ||
    (x >= 3 && x <= 6 && y >= 6 && y <= 8)
  )
    return 'forest'
  return 'grass'
}
export function initialCity(): City {
  const buildings: Building[] = [
    { x: 11, y: 10, type: 'hall' },
    ...[
      [11, 11],
      [11, 12],
      [10, 12],
      [9, 12],
      [12, 12],
      [13, 12],
      [14, 12],
      [9, 11],
      [9, 10],
      [14, 11],
    ].map(([x, y]) => ({ x, y, type: 'road' as const })),
    { x: 9, y: 9, type: 'house' },
    { x: 14, y: 10, type: 'house' },
  ]
  return {
    version: 1,
    day: 1,
    coins: 1250,
    wood: 65,
    maize: 0,
    flour: 0,
    food: 60,
    population: 10,
    happiness: 60,
    reliefUsed: false,
    buildings,
    log: [
      'Bienvenue à HarooVille ! Relie tes bâtiments aux routes de la mairie.',
      'Construis un champ de maïs, puis un moulin et une boulangerie.',
    ],
  }
}
const key = (x: number, y: number) => x + ':' + y
const neighbors = (x: number, y: number): [number, number][] => [
  [x - 1, y],
  [x + 1, y],
  [x, y - 1],
  [x, y + 1],
]
const manhattan = (a: Building, b: Building) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y)

export function roadNetwork(buildings: Building[]): Set<string> {
  const occupied = new Map(buildings.map((b) => [key(b.x, b.y), b.type]))
  const connected = new Set<string>()
  const queue: [number, number][] = buildings
    .filter((b) => b.type === 'hall')
    .map((b) => [b.x, b.y])
  for (let i = 0; i < queue.length; i++) {
    const [x, y] = queue[i]
    for (const [nx, ny] of neighbors(x, y)) {
      const id = key(nx, ny)
      if (occupied.get(id) === 'road' && !connected.has(id)) {
        connected.add(id)
        queue.push([nx, ny])
      }
    }
  }
  return connected
}
export function isConnected(building: Building, city: City): boolean {
  if (building.type === 'hall') return true
  const network = roadNetwork(city.buildings)
  if (building.type === 'road') return network.has(key(building.x, building.y))
  return neighbors(building.x, building.y).some(([x, y]) => network.has(key(x, y)))
}
export function capacity(city: City): number {
  return city.buildings.filter((b) => b.type === 'house' && isConnected(b, city)).length * 6
}
export function canBuild(city: City, x: number, y: number, type: BuildType): string | null {
  if (!within(x, y)) return 'En dehors du terrain.'
  if (terrainAt(x, y) === 'water') return 'Impossible de construire sur l’eau.'
  if (city.buildings.some((b) => b.x === x && b.y === y)) return 'Cette case est déjà occupée.'
  const item = CATALOG[type]
  if (city.coins < item.coins || city.wood < item.wood) return 'Ressources insuffisantes.'
  const roads = roadNetwork(city.buildings)
  const connected = neighbors(x, y).some(
    ([nx, ny]) =>
      roads.has(key(nx, ny)) ||
      city.buildings.some((b) => b.type === 'hall' && b.x === nx && b.y === ny),
  )
  if (!connected) return 'Construis d’abord une route reliée à la mairie.'
  if (type === 'lumberyard' && !hasForest(x, y))
    return 'La scierie doit être située près d’une forêt.'
  return null
}
function hasForest(x: number, y: number): boolean {
  for (let dx = -3; dx <= 3; dx++) {
    for (let dy = -3; dy <= 3; dy++) {
      if (Math.abs(dx) + Math.abs(dy) <= 4 && terrainAt(x + dx, y + dy) === 'forest') return true
    }
  }
  return false
}
function pushLog(city: City, message: string) {
  city.log = [message, ...city.log].slice(0, 8)
}
export function place(
  city: City,
  x: number,
  y: number,
  type: BuildType,
): { city: City; error: string | null } {
  const error = canBuild(city, x, y, type)
  if (error) return { city, error }
  const next: City = {
    ...city,
    coins: city.coins - CATALOG[type].coins,
    wood: city.wood - CATALOG[type].wood,
    buildings: [...city.buildings, { x, y, type }],
    log: [...city.log],
  }
  pushLog(next, CATALOG[type].label + ' construit en (' + (x + 1) + ', ' + (y + 1) + ').')
  return { city: next, error: null }
}
export function removeBuilding(
  city: City,
  x: number,
  y: number,
): { city: City; error: string | null } {
  const existing = city.buildings.find((b) => b.x === x && b.y === y)
  if (!existing) return { city, error: 'Aucun bâtiment à démolir.' }
  if (existing.type === 'hall') return { city, error: 'La mairie ne peut pas être démolie.' }
  const next: City = {
    ...city,
    buildings: city.buildings.filter((b) => b !== existing),
    log: [...city.log],
  }
  next.population = Math.min(next.population, Math.max(capacity(next), 0))
  pushLog(
    next,
    'Démolition : ' + (existing.type === 'road' ? 'Route' : CATALOG[existing.type].label),
  )
  return { city: next, error: null }
}
export function count(city: City, type: Structure): number {
  return city.buildings.filter((b) => b.type === type).length
}
export function workforce(city: City) {
  const employed = city.buildings.reduce(
    (sum, b) =>
      sum +
      (b.type !== 'hall' && b.type !== 'road' && isConnected(b, city)
        ? CATALOG[b.type].workers
        : 0),
    0,
  )
  return { required: employed, available: city.population }
}
export function tick(city: City): City {
  const next: City = { ...city, day: city.day + 1, buildings: city.buildings, log: [...city.log] }
  let workers = next.population
  let operated = 0
  const buildings = next.buildings.filter(
    (b) => b.type !== 'hall' && b.type !== 'road' && isConnected(b, next),
  )
  // Protect the essential food supply: food-producing jobs get priority before
  // logging, then cash sales. Idle factories consume no workers.
  for (const type of ['farm', 'mill', 'bakery', 'lumberyard', 'market'] as const) {
    for (const b of buildings.filter((b) => b.type === type)) {
      const need = CATALOG[type].workers
      if (workers < need) continue
      if (type === 'mill' && next.maize < 4) continue
      if (type === 'bakery' && next.flour < 3) continue
      if (type === 'lumberyard' && !hasForest(b.x, b.y)) continue
      // Market reserves food for domestic consumption before exports.
      if (type === 'market' && next.food < Math.ceil(next.population / 4) + 3) continue
      workers -= need
      operated++
      if (type === 'lumberyard') next.wood += 5
      if (type === 'farm') next.maize += 7
      if (type === 'mill') {
        next.maize -= 4
        next.flour += 3
      }
      if (type === 'bakery') {
        next.flour -= 3
        next.food += 7
      }
      if (type === 'market') {
        next.food -= 3
        next.coins += 40
      }
    }
  }
  const consumption = Math.ceil(next.population / 4)
  const fed = next.food >= consumption
  next.food = Math.max(0, next.food - consumption)
  const connectedHouses = next.buildings.filter((b) => b.type === 'house' && isConnected(b, next))
  const houseCount = connectedHouses.length
  const hasWell = next.buildings.some(
    (b) =>
      b.type === 'well' &&
      isConnected(b, next) &&
      connectedHouses.some((h) => manhattan(h, b) <= 5),
  )
  const hasMarket = next.buildings.some((b) => b.type === 'market' && isConnected(b, next))
  const parks = next.buildings.filter((b) => b.type === 'park' && isConnected(b, next)).length
  next.happiness = Math.max(
    5,
    Math.min(
      100,
      49 +
        (fed ? 15 : -28) +
        (next.population <= houseCount * 6 ? 9 : -20) +
        (hasWell ? 12 : -6) +
        (hasMarket ? 9 : -6) +
        Math.min(12, parks * 4),
    ),
  )
  // Taxes require an actual functioning and fed settlement. Avoid the prior
  // exploit of growing rich for hundreds of starving days.
  if (fed) next.coins += Math.floor((next.population * next.happiness) / 20)
  if (fed && next.happiness >= 68 && next.day % 3 === 0 && next.population < houseCount * 6) {
    next.population += 1
    pushLog(next, 'Une nouvelle famille s’installe dans la ville.')
  }
  if (!fed && next.day % 2 === 0 && next.population > 2) {
    next.population -= 1
    pushLog(next, 'Pénurie alimentaire : un habitant quitte la ville.')
  }
  if (!fed && city.food > 0) {
    pushLog(next, 'CRISE : les réserves alimentaires sont épuisées. Mettez le temps en pause.')
  }
  if (next.day % 4 === 0) {
    pushLog(
      next,
      'Jour ' +
        next.day +
        ' : ' +
        operated +
        ' atelier(s) actif(s), bonheur ' +
        next.happiness +
        ' %.',
    )
  }
  return next
}

/** One-time tutorial recovery: never alters real accounts or farm parcels. */
export function emergencyRelief(city: City): { city: City; error: string | null } {
  if (city.reliefUsed) return { city, error: 'Le secours exceptionnel a déjà été utilisé.' }
  const next: City = {
    ...city,
    coins: Math.max(city.coins, 700),
    wood: Math.max(city.wood, 45),
    food: Math.max(city.food, 65),
    population: Math.min(capacity(city), Math.max(city.population, 10)),
    happiness: Math.max(city.happiness, 60),
    reliefUsed: true,
    log: [...city.log],
  }
  pushLog(
    next,
    'Soutien exceptionnel : vivres, bois et ouvriers temporaires pour relancer la ville.',
  )
  return { city: next, error: null }
}

export function cityWarning(city: City): {
  kind: 'critical' | 'warning' | 'healthy'
  message: string
} {
  const dailyNeed = Math.ceil(city.population / 4)
  const supplies = count(city, 'farm') > 0 && count(city, 'mill') > 0 && count(city, 'bakery') > 0
  if (city.food < dailyNeed || city.population <= 3)
    return {
      kind: 'critical',
      message: 'Urgence alimentaire : mettez en pause et relancez la chaîne de production.',
    }
  if (city.food <= Math.max(12, dailyNeed * 4) && !supplies)
    return {
      kind: 'warning',
      message: 'Réserves faibles : construisez rapidement un champ, un moulin et une boulangerie.',
    }
  return { kind: 'healthy', message: 'Votre village peut continuer son développement.' }
}

export function nextObjective(city: City): string {
  if (count(city, 'farm') === 0)
    return '1. Sélectionnez « Champ de maïs », puis construisez-le contre une route proche de la mairie.'
  if (count(city, 'mill') === 0)
    return '2. Ajoutez un moulin relié aux routes pour transformer le maïs récolté.'
  if (count(city, 'bakery') === 0)
    return '3. Placez une boulangerie reliée : le moulin fournira la farine pour les repas.'
  if (count(city, 'well') === 0)
    return '4. Construisez un puits près des maisons pour améliorer le bonheur.'
  if (city.population < 15)
    return '5. Construisez des maisons, puis maintenez nourriture et eau pour accueillir de nouveaux habitants.'
  return 'Développez les commerces, les espaces verts et un quartier autosuffisant.'
}

export function goal(city: City): { done: number; total: number; steps: string[] } {
  const steps = [
    count(city, 'farm') > 0 ? '✓ Produire du maïs' : '○ Construire un champ de maïs',
    count(city, 'mill') > 0 ? '✓ Construire un moulin' : '○ Transformer le maïs en farine',
    count(city, 'bakery') > 0 ? '✓ Ouvrir une boulangerie' : '○ Préparer des repas',
    count(city, 'well') > 0 ? '✓ Alimenter le village en eau' : '○ Construire un puits',
    city.population >= 15 ? '✓ Accueillir 15 habitants' : '○ Atteindre 15 habitants',
  ]
  return { done: steps.filter((s) => s.startsWith('✓')).length, total: steps.length, steps }
}
/** Serialized saves are always untrusted. Use strict shape checks and conservative caps. */
export function decodeCity(value: unknown): City | null {
  if (typeof value !== 'object' || value === null) return null
  const v = value as Partial<City>
  if (
    v.version !== 1 ||
    !Array.isArray(v.buildings) ||
    v.buildings.length > SIZE * SIZE ||
    !Number.isInteger(v.day) ||
    (v.day ?? 0) < 1 ||
    (v.day ?? 0) > 100000 ||
    !Number.isInteger(v.population) ||
    (v.population ?? 0) < 0 ||
    (v.population ?? 0) > 200 ||
    !['coins', 'wood', 'maize', 'flour', 'food', 'happiness'].every((name) => {
      const n = v[name as keyof City]
      return typeof n === 'number' && Number.isInteger(n) && n >= 0 && n <= 100000000
    }) ||
    !Array.isArray(v.log) ||
    v.log.length > 8 ||
    !v.log.every((line) => typeof line === 'string' && line.length < 300)
  )
    return null
  const occupied = new Set<string>()
  for (const b of v.buildings) {
    if (
      !b ||
      !within(b.x, b.y) ||
      (b.type !== 'hall' && !BUILDING_TYPES.includes(b.type as BuildType)) ||
      occupied.has(key(b.x, b.y))
    )
      return null
    occupied.add(key(b.x, b.y))
  }
  if (v.buildings.filter((b) => b.type === 'hall').length !== 1) return null
  if (v.reliefUsed !== undefined && typeof v.reliefUsed !== 'boolean') return null
  return v as City
}
