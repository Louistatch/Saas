/**
 * HarooLife territorial sandbox.
 * Every financial/production value is FICTITIOUS and kept separate from
 * FaîtiereHub's real parcels, missions, contracts and payments.
 * Pure transitions make runs reproducible and unit-testable.
 */
export const HUBS = [
  { id: 'lome', name: 'Lomé', lat: 6.1375, lng: 1.2123, role: 'Débouchés et logistique' },
  { id: 'kpalime', name: 'Kpalimé', lat: 6.9, lng: 0.6333, role: 'Agriculture et transformation' },
  { id: 'sokode', name: 'Sokodé', lat: 8.9833, lng: 1.1333, role: 'Échanges régionaux' },
  { id: 'kara', name: 'Kara', lat: 9.5511, lng: 1.1861, role: 'Production et services' },
  { id: 'dapaong', name: 'Dapaong', lat: 10.8623, lng: 0.2076, role: 'Commerce et production' },
] as const

export type HubId = (typeof HUBS)[number]['id']

export const UPGRADES = {
  irrigation: {
    title: 'Irrigation des producteurs',
    location: 'Kpalimé',
    cost: 450_000,
    detail: 'Augmente la récolte quotidienne.',
  },
  factory: {
    title: 'Unité de transformation',
    location: 'Kpalimé',
    cost: 1_800_000,
    detail: 'Transforme le gingembre frais en produit sec.',
  },
  truck: {
    title: 'Camion de livraison',
    location: 'Kpalimé → Lomé',
    cost: 700_000,
    detail: 'Livre les produits transformés au marché de Lomé.',
  },
  solar: {
    title: 'Installation solaire',
    location: 'Kpalimé',
    cost: 600_000,
    detail: 'Réduit les charges énergétiques de l’unité.',
  },
} as const
export type UpgradeId = keyof typeof UPGRADES

export interface TerritoryWorld {
  day: number
  treasury: number
  rawKg: number
  driedKg: number
  totalHarvestKg: number
  totalDriedKg: number
  soldKg: number
  revenue: number
  expenses: number
  investments: number
  projects: Record<UpgradeId, boolean>
  events: string[]
}

const STARTING_TREASURY = 8_000_000

export function initialTerritoryWorld(): TerritoryWorld {
  return {
    day: 0,
    treasury: STARTING_TREASURY,
    rawKg: 300,
    driedKg: 0,
    totalHarvestKg: 0,
    totalDriedKg: 0,
    soldKg: 0,
    revenue: 0,
    expenses: 0,
    investments: 0,
    projects: { irrigation: false, factory: false, truck: false, solar: false },
    events: ['Bienvenue dans le scénario fictif Kpalimé → Lomé.'],
  }
}

const log = (world: TerritoryWorld, entry: string) => [entry, ...world.events].slice(0, 7)

export function invest(
  world: TerritoryWorld,
  upgrade: UpgradeId,
): { world: TerritoryWorld; ok: boolean; message: string } {
  const item = UPGRADES[upgrade]
  if (world.projects[upgrade])
    return { world, ok: false, message: 'Cet équipement est déjà installé.' }
  if (world.treasury < item.cost)
    return { world, ok: false, message: 'Trésorerie insuffisante pour cet investissement.' }
  const message = `${item.title} installé à ${item.location}.`
  return {
    ok: true,
    message,
    world: {
      ...world,
      treasury: world.treasury - item.cost,
      investments: world.investments + item.cost,
      projects: { ...world.projects, [upgrade]: true },
      events: log(world, message),
    },
  }
}

/** Advance exactly one illustrative day. No randomness and no real market prices. */
export function advanceTerritoryDay(world: TerritoryWorld): TerritoryWorld {
  const day = world.day + 1
  // Illustrative climatic variation. These coefficients are NOT weather forecasts.
  const rainfall = [0.85, 1.0, 1.1, 0.75, 0.95, 1.05, 0.9][(day - 1) % 7]
  const harvest = Math.floor((world.projects.irrigation ? 190 : 110) * rainfall)
  const availableRaw = world.rawKg + harvest
  const processedRaw = world.projects.factory ? Math.min(150, availableRaw) : 0
  const dried = Math.floor(processedRaw * 0.25)
  const availableDried = world.driedKg + dried
  const shipped = world.projects.truck ? Math.min(30, availableDried) : 0
  const pricePerKg = 4_700 + (day % 7) * 80 // fictitious FCFA/kg
  const dayRevenue = shipped * pricePerKg
  const farmCost = 9_000 + (world.projects.irrigation ? 3_000 : 0)
  const processingCost = processedRaw > 0 ? (world.projects.solar ? 15_000 : 26_000) : 0
  const logisticsCost = shipped > 0 ? 12_000 : 0
  const dayCosts = farmCost + processingCost + logisticsCost

  const event =
    shipped > 0
      ? `Jour ${day} : ${shipped} kg livrés à Lomé, recettes fictives de ${dayRevenue.toLocaleString('fr-FR')} FCFA.`
      : dried > 0
        ? `Jour ${day} : ${dried} kg transformés, en attente d’un camion pour Lomé.`
        : `Jour ${day} : ${harvest} kg récoltés, en attente d’une unité de transformation.`

  return {
    ...world,
    day,
    treasury: world.treasury + dayRevenue - dayCosts,
    rawKg: availableRaw - processedRaw,
    driedKg: availableDried - shipped,
    totalHarvestKg: world.totalHarvestKg + harvest,
    totalDriedKg: world.totalDriedKg + dried,
    soldKg: world.soldKg + shipped,
    revenue: world.revenue + dayRevenue,
    expenses: world.expenses + dayCosts,
    events: log(world, event),
  }
}

export function advanceTerritoryDays(world: TerritoryWorld, days: number): TerritoryWorld {
  if (!Number.isInteger(days) || days < 1 || days > 30)
    throw new RangeError('Le nombre de jours doit être compris entre 1 et 30.')
  let result = world
  for (let n = 0; n < days; n++) result = advanceTerritoryDay(result)
  return result
}
