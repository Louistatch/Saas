/**
 * « Mon champ » : the player's own plot, sown in the real season of the town they are in, tended
 * each game day, harvested, kept in the granary and sold at the market price (market_prices, the
 * platform's price survey: see app/api/haroolife/prices). No network or React in here.
 *
 * Seasons: a simplified sowing calendar from the real rains. The south (Lomé, Maritime) has two
 * rainy seasons (the long one from March, the short one from September); the north (Kara) has one,
 * from May to October. Market gardens (tomato, okra, chilli) are also grown in the dry season,
 * watered by hand. The month is the real month in Lomé (UTC+0), so a player in Kara in December
 * finds the sowing over, as a farmer would. Growth, care and yield are in game days; a yam, a
 * cassava or a coffee plot takes many months in reality, a week or so in the game.
 *
 * Prices, said as they are: the survey's price of the last 14 days when there is one (« relevé »),
 * else the survey's undated reference price for the region (« référence »), else the game's own
 * indicative price (« jeu »).
 *
 * Granary: dry harvests (grains, legumes, coffee, cocoa, cashew) keep for long in a triple-layer
 * hermetic bag (the PICS bag: insects run out of air); left in the open, weevils eat a little
 * each day. Fresh produce rots within days, yams keep a few weeks. Keeping a harvest lets the
 * player sell when the market pays more; the past year's high and low months are shown from the
 * survey, never a forecast.
 */
import type { CityLife } from './life'
import { type LocalityId, isLocalityId } from './locality'

export type CropId =
  | 'mais'
  | 'haricot'
  | 'soja'
  | 'sorgho'
  | 'mil'
  | 'arachide'
  | 'riz'
  | 'igname'
  | 'manioc'
  | 'tomate'
  | 'piment'
  | 'gombo'
  | 'cafe'
  | 'cacao'
  | 'cajou'

/** How a harvest keeps: dry (bags protect it), fresh produce, yams and cassava. */
export type Keeping = 'sec' | 'frais' | 'racine'

export interface Crop {
  name: string
  /** Its article: « le maïs », « la tomate », « l’igname ». */
  article: 'le' | 'la' | 'l’'
  /** For « ta tomate est mûre », « ton arachide est mûre ». */
  feminine?: true
  icon: string
  /** Name of the culture in market_prices. */
  market: string
  /** Game days from sowing to harvest. */
  days: number
  /** Harvest (kg) when tended every day. */
  kg: number
  /** Plot hire and seeds (FCFA of the game). */
  cost: number
  /** The game's indicative price (FCFA/kg), when the region has no price in the survey. */
  guide: number
  keeps: Keeping
  /** Game days a harvest keeps in the open before losses start. */
  shelf: number
  /** Share lost each day after that, in the open (at least 1 kg). */
  loss: number
}

const dry = { keeps: 'sec', shelf: 3, loss: 0.015 } as const
export const CROPS: Record<CropId, Crop> = {
  mais: {
    name: 'Maïs',
    article: 'le',
    icon: '🌽',
    market: 'Mais',
    days: 4,
    kg: 70,
    cost: 3000,
    guide: 180,
    ...dry,
  },
  haricot: {
    name: 'Haricot',
    article: 'le',
    icon: '🫘',
    market: 'Haricot',
    days: 3,
    kg: 22,
    cost: 3500,
    guide: 500,
    ...dry,
  },
  soja: {
    name: 'Soja',
    article: 'le',
    icon: '🌱',
    market: 'Soja',
    days: 4,
    kg: 25,
    cost: 3500,
    guide: 420,
    ...dry,
  },
  sorgho: {
    name: 'Sorgho',
    article: 'le',
    icon: '🌾',
    market: 'Sorgho',
    days: 5,
    kg: 35,
    cost: 2500,
    guide: 250,
    ...dry,
  },
  mil: {
    name: 'Mil',
    article: 'le',
    icon: '🌾',
    market: 'Mil',
    days: 5,
    kg: 30,
    cost: 2500,
    guide: 300,
    ...dry,
  },
  arachide: {
    name: 'Arachide',
    article: 'l’',
    feminine: true,
    icon: '🥜',
    market: 'Arachide',
    days: 4,
    kg: 28,
    cost: 3500,
    guide: 420,
    ...dry,
  },
  riz: {
    name: 'Riz',
    article: 'le',
    icon: '🍚',
    market: 'Riz paddy',
    days: 5,
    kg: 50,
    cost: 4000,
    guide: 300,
    ...dry,
  },
  igname: {
    name: 'Igname',
    article: 'l’',
    icon: '🍠',
    market: 'Igname',
    days: 7,
    kg: 60,
    cost: 6000,
    guide: 300,
    keeps: 'racine',
    shelf: 10,
    loss: 0.03,
  },
  manioc: {
    name: 'Manioc',
    article: 'le',
    icon: '🥔',
    market: 'Manioc',
    days: 8,
    kg: 110,
    cost: 3000,
    guide: 155,
    keeps: 'racine',
    shelf: 2,
    loss: 0.3,
  },
  tomate: {
    name: 'Tomate',
    article: 'la',
    feminine: true,
    icon: '🍅',
    market: 'Tomate',
    days: 3,
    kg: 20,
    cost: 4500,
    guide: 650,
    keeps: 'frais',
    shelf: 2,
    loss: 0.3,
  },
  piment: {
    name: 'Piment',
    article: 'le',
    icon: '🌶️',
    market: 'Piment',
    days: 3,
    kg: 12,
    cost: 3500,
    guide: 900,
    keeps: 'frais',
    shelf: 3,
    loss: 0.15,
  },
  gombo: {
    name: 'Gombo',
    article: 'le',
    icon: '🥒',
    market: 'Gombo',
    days: 3,
    kg: 25,
    cost: 3000,
    guide: 400,
    keeps: 'frais',
    shelf: 2,
    loss: 0.3,
  },
  cafe: {
    name: 'Café',
    article: 'le',
    icon: '☕',
    market: 'Cafe',
    days: 10,
    kg: 25,
    cost: 9000,
    guide: 1200,
    keeps: 'sec',
    shelf: 10,
    loss: 0.01,
  },
  cacao: {
    name: 'Cacao',
    article: 'le',
    icon: '🍫',
    market: 'Cacao',
    days: 10,
    kg: 24,
    cost: 8000,
    guide: 1100,
    keeps: 'sec',
    shelf: 10,
    loss: 0.01,
  },
  cajou: {
    name: 'Cajou',
    article: 'le',
    icon: '🌰',
    market: 'Anacarde (Cajou)',
    days: 9,
    kg: 45,
    cost: 6000,
    guide: 480,
    keeps: 'sec',
    shelf: 10,
    loss: 0.01,
  },
}
export const CROP_IDS = Object.keys(CROPS) as CropId[]

/** Months (1–12) when each crop is sown, by town: a simplified calendar of the real rains. */
export const SOWING: Record<LocalityId, Partial<Record<CropId, number[]>>> = {
  lome: {
    mais: [3, 4, 5, 9, 10],
    haricot: [4, 5, 9, 10],
    soja: [5, 6],
    arachide: [4, 5, 9],
    manioc: [4, 5, 6, 9, 10],
    tomate: [10, 11, 12, 1, 2],
    piment: [3, 4, 9, 10],
    gombo: [3, 4, 5, 9, 10],
  },
  dapaong: {
    mais: [5, 6],
    sorgho: [5, 6],
    mil: [5, 6],
    haricot: [7, 8],
    soja: [6, 7],
    arachide: [6, 7],
    riz: [6, 7],
    tomate: [11, 12, 1],
    piment: [6, 7],
    gombo: [6, 7],
    cajou: [6, 7],
  },
  sokode: {
    mais: [4, 5, 6],
    sorgho: [5, 6],
    soja: [5, 6, 7],
    haricot: [6, 7, 8],
    igname: [2, 3, 4],
    manioc: [5, 6],
    arachide: [5, 6],
    riz: [6, 7],
    tomate: [11, 12, 1],
    piment: [5, 6],
    gombo: [5, 6],
    cajou: [6, 7],
  },
  kpalime: {
    mais: [3, 4, 5, 9, 10],
    haricot: [4, 5, 9, 10],
    soja: [5, 6],
    igname: [3, 4],
    manioc: [4, 5, 6],
    arachide: [4, 5, 8],
    riz: [5, 6],
    tomate: [10, 11, 12, 1],
    piment: [4, 5],
    gombo: [4, 5, 9],
    cafe: [5, 6, 7],
    cacao: [5, 6, 7],
  },
  atakpame: {
    mais: [3, 4, 5, 9],
    haricot: [4, 5, 9],
    soja: [5, 6],
    igname: [3, 4],
    manioc: [4, 5, 6],
    arachide: [4, 5, 8],
    riz: [5, 6],
    gombo: [4, 5],
    cacao: [5, 6],
    cajou: [5, 6, 7],
  },
  kara: {
    mais: [5, 6, 7],
    sorgho: [5, 6, 7],
    mil: [5, 6],
    soja: [6, 7],
    haricot: [7, 8],
    igname: [3, 4],
    manioc: [5, 6],
    arachide: [5, 6],
    riz: [6, 7],
    tomate: [11, 12, 1],
    piment: [6, 7],
    gombo: [6, 7],
    cajou: [6, 7],
  },
}

export const MONTHS = [
  'janvier',
  'février',
  'mars',
  'avril',
  'mai',
  'juin',
  'juillet',
  'août',
  'septembre',
  'octobre',
  'novembre',
  'décembre',
]

/** The real month in Lomé (UTC+0), 1–12. */
export const realMonth = (now = new Date()) => now.getUTCMonth() + 1

export interface Field {
  locality: LocalityId
  crop: CropId
  /** Game day of sowing. */
  sownDay: number
  /** Days the field was tended (at most one per game day). */
  tended: number
  lastTendDay: number
}

export interface Farm {
  field: Field | null
  /** Harvest kept in the granary, not yet sold (kg). */
  stock: Partial<Record<CropId, number>>
  /** Game day each crop was last harvested (its freshness; absent in old saves). */
  since?: Partial<Record<CropId, number>>
  /** Triple-layer hermetic bags owned, BAG_KG each, used again season after season. */
  bags?: number
  /** Last game day the granary's losses were counted. */
  checked?: number
}

/** A triple-layer bag holds 100 kg; its price is the game's (FCFA). */
export const BAG_KG = 100
export const BAG_PRICE = 1500
export const MAX_BAGS = 50

const isCrop = (c: unknown): c is CropId => typeof c === 'string' && c in CROPS

export function sowableNow(locality: LocalityId, month: number): CropId[] {
  const plan = SOWING[locality]
  return (Object.keys(plan) as CropId[]).filter((c) => plan[c]?.includes(month))
}

/** The next month (after this one) when something can be sown in this town, and what. */
export function nextSowing(
  locality: LocalityId,
  month: number,
): { month: number; crops: CropId[] } | null {
  for (let i = 1; i <= 12; i++) {
    const m = ((month - 1 + i) % 12) + 1
    const crops = sowableNow(locality, m)
    if (crops.length) return { month: m, crops }
  }
  return null
}

export type FieldStatus =
  | { kind: 'empty' }
  | { kind: 'growing'; field: Field; daysLeft: number; tendedToday: boolean }
  | { kind: 'ready'; field: Field; kg: number }

/** Yield of a field: the full harvest if tended every day, 40 % if never. */
export const yieldOf = (field: Field) => {
  const crop = CROPS[field.crop]
  const care = Math.min(1, field.tended / crop.days)
  return Math.round(crop.kg * (0.4 + 0.6 * care))
}

export function fieldStatus(s: CityLife): FieldStatus {
  const field = s.farm?.field
  if (!field) return { kind: 'empty' }
  const left = field.sownDay + CROPS[field.crop].days - s.life.day
  if (left <= 0) return { kind: 'ready', field, kg: yieldOf(field) }
  return { kind: 'growing', field, daysLeft: left, tendedToday: field.lastTendDay === s.life.day }
}

const note = (s: CityLife, msg: string): CityLife => ({
  ...s,
  life: { ...s.life, lastEvent: msg, events: [msg, ...s.life.events].slice(0, 8) },
})
const tired = (s: CityLife, energy: number): CityLife => ({
  ...s,
  life: {
    ...s.life,
    needs: { ...s.life.needs, energy: Math.max(0, s.life.needs.energy - energy) },
  },
})
const farmOf = (s: CityLife): Farm => s.farm ?? { field: null, stock: {} }
const daylight = (s: CityLife) => s.life.hour >= 6 && s.life.hour < 19

export function sow(s: CityLife, crop: CropId, month: number): CityLife {
  const farm = farmOf(s)
  const c = CROPS[crop]
  if (farm.field) return note(s, 'Ton champ est déjà semé : récolte d’abord.')
  if (!sowableNow(s.locality, month).includes(crop)) {
    const next = nextSowing(s.locality, month)
    return note(
      s,
      next
        ? `Ce n’est pas la saison ${ofCrop(crop)} ici. Prochains semis : ${MONTHS[next.month - 1]}.`
        : 'Rien ne se sème ici en ce moment.',
    )
  }
  if (!daylight(s)) return note(s, 'Les champs se travaillent de 6 h à 19 h.')
  if (s.life.needs.energy < 15) return note(s, 'Repose-toi avant d’aller au champ.')
  if (s.life.wallet < c.cost)
    return note(
      s,
      `Il faut ${c.cost.toLocaleString('fr-FR')} FCFA pour la parcelle et les semences.`,
    )
  const field: Field = {
    locality: s.locality,
    crop,
    sownDay: s.life.day,
    tended: 0,
    lastTendDay: -1,
  }
  return note(
    tired(
      {
        ...s,
        farm: { ...farm, field },
        life: { ...s.life, wallet: s.life.wallet - c.cost, spent: s.life.spent + c.cost },
      },
      15,
    ),
    `${c.icon} ${c.name} semé : récolte dans ${c.days} jours. Passe au champ chaque jour. −${c.cost.toLocaleString('fr-FR')} FCFA.`,
  )
}

export function tend(s: CityLife): CityLife {
  const status = fieldStatus(s)
  if (status.kind === 'empty') return note(s, 'Ton champ n’est pas semé.')
  if (status.kind === 'ready') return note(s, 'C’est mûr : il est temps de récolter.')
  const field = status.field
  if (field.locality !== s.locality) return note(s, 'Ton champ est dans une autre ville.')
  if (status.tendedToday) return note(s, 'Tu es déjà passé au champ aujourd’hui.')
  if (!daylight(s)) return note(s, 'Les champs se travaillent de 6 h à 19 h.')
  if (s.life.needs.energy < 15) return note(s, 'Repose-toi avant d’aller au champ.')
  return note(
    tired(
      {
        ...s,
        farm: {
          ...farmOf(s),
          field: { ...field, tended: field.tended + 1, lastTendDay: s.life.day },
        },
      },
      15,
    ),
    `Champ désherbé et arrosé. Récolte dans ${status.daysLeft} jour${status.daysLeft > 1 ? 's' : ''}.`,
  )
}

export function harvest(s: CityLife): CityLife {
  const status = fieldStatus(s)
  if (status.kind !== 'ready') return note(s, 'Ce n’est pas encore mûr.')
  if (status.field.locality !== s.locality) return note(s, 'Ton champ est dans une autre ville.')
  if (!daylight(s)) return note(s, 'Les champs se travaillent de 6 h à 19 h.')
  if (s.life.needs.energy < 20) return note(s, 'Repose-toi avant de récolter.')
  const farm = farmOf(s)
  const crop = status.field.crop
  return note(
    tired(
      {
        ...s,
        farm: {
          ...farm,
          field: null,
          stock: { ...farm.stock, [crop]: (farm.stock[crop] ?? 0) + status.kg },
          // The granary counts freshness from the latest harvest of a crop.
          since: { ...farm.since, [crop]: s.life.day },
          checked: farm.checked ?? s.life.day,
        },
      },
      20,
    ),
    `${CROPS[crop].icon} Récolte : ${status.kg} kg de ${CROPS[crop].name.toLowerCase()}, au grenier. ${keepingAdvice(crop)}`,
  )
}

/** « le maïs », « la tomate », « l’igname ». */
export const theCrop = (crop: CropId) => {
  const c = CROPS[crop]
  return `${c.article}${c.article === 'l’' ? '' : ' '}${c.name.toLowerCase()}`
}
/** « du maïs », « de la tomate », « de l’igname ». */
export const ofCrop = (crop: CropId) => {
  const c = CROPS[crop]
  const name = c.name.toLowerCase()
  return c.article === 'le'
    ? `du ${name}`
    : `de ${c.article}${c.article === 'l’' ? '' : ' '}${name}`
}

/** « Ton maïs est mûr : récolte-le… », « Ta tomate est mûre : récolte-la… ». */
export const ripeSaid = (crop: CropId) => {
  const c = CROPS[crop]
  const f = c.feminine === true
  const mine = f && c.article !== 'l’' ? 'Ta' : 'Ton'
  return `${mine} ${c.name.toLowerCase()} est ${f ? 'mûre' : 'mûr'} : récolte-${f ? 'la' : 'le'} dans Mon champ.`
}

/** What a harvest asks once in the granary. */
export function keepingAdvice(crop: CropId): string {
  const c = CROPS[crop]
  if (c.keeps === 'frais') return 'Ça se gâte vite : vends-le dans les jours qui viennent.'
  if (c.keeps === 'racine')
    return c.shelf > 5
      ? `Ça se garde environ ${c.shelf} jours.`
      : 'Ça pourrit vite : vends-le sans attendre.'
  return 'En sac triple fond, ça se garde jusqu’à ce que le marché paie mieux.'
}

/**
 * Sell all the stock of a crop at a price per kg: the survey's price, or an indicative one (the
 * panel says which, see cropPrice).
 */
export function sell(s: CityLife, crop: CropId, pricePerKg: number): CityLife {
  const farm = farmOf(s)
  const kg = farm.stock[crop] ?? 0
  if (kg <= 0) return note(s, 'Rien à vendre.')
  if (!Number.isFinite(pricePerKg) || pricePerKg <= 0 || pricePerKg > 10000)
    return note(s, 'Prix du marché indisponible pour le moment.')
  const total = Math.round(kg * pricePerKg)
  const stock = { ...farm.stock }
  delete stock[crop]
  const since = { ...farm.since }
  delete since[crop]
  return note(
    {
      ...s,
      farm: { ...farm, stock, since },
      life: { ...s.life, wallet: s.life.wallet + total, earned: s.life.earned + total },
    },
    `Vendu : ${kg} kg de ${CROPS[crop].name.toLowerCase()} à ${Math.round(pricePerKg)} FCFA le kg, +${total.toLocaleString('fr-FR')} FCFA.`,
  )
}

/** A line of the price survey, as the prices API gives it. */
export interface PriceLine {
  culture: string
  price: number
  unit: string
  market?: string | null
  observed_at?: string | null
}
export type PriceSource = 'releve' | 'reference' | 'jeu'
export interface CropPrice {
  price: number
  source: PriceSource
  market: string | null
  observedAt: string | null
}

/**
 * The price a crop sells at here: the survey's price of the last 14 days, else the region's
 * undated reference price, else the game's indicative price. Only prices per kg count.
 */
export function cropPrice(crop: CropId, recent: PriceLine[], reference: PriceLine[]): CropPrice {
  const name = CROPS[crop].market
  const ok = (l: PriceLine) => l.culture === name && l.unit === 'kg' && l.price > 0
  const r = recent.find(ok)
  if (r)
    return {
      price: r.price,
      source: 'releve',
      market: r.market ?? null,
      observedAt: r.observed_at ?? null,
    }
  const ref = reference.find(ok)
  if (ref) return { price: ref.price, source: 'reference', market: null, observedAt: null }
  return { price: CROPS[crop].guide, source: 'jeu', market: null, observedAt: null }
}

/** Kg of each crop protected by the bags (dry harvests only, in the order of CROP_IDS). */
export function protectedKg(farm: Farm): Partial<Record<CropId, number>> {
  let room = (farm.bags ?? 0) * BAG_KG
  const out: Partial<Record<CropId, number>> = {}
  for (const crop of CROP_IDS) {
    const kg = farm.stock[crop] ?? 0
    if (kg <= 0 || CROPS[crop].keeps !== 'sec') continue
    const safe = Math.min(kg, room)
    room -= safe
    if (safe > 0) out[crop] = safe
  }
  return out
}

/** Buys triple-layer bags at the market (the game's price). */
export function buyBags(s: CityLife, n: number): CityLife {
  const farm = farmOf(s)
  const have = farm.bags ?? 0
  const count = Math.max(0, Math.min(Math.floor(n), MAX_BAGS - have))
  if (count <= 0) return note(s, `Tu as déjà ${have} sacs : c’est assez pour ton grenier.`)
  const cost = count * BAG_PRICE
  if (s.life.wallet < cost)
    return note(
      s,
      `Il faut ${cost.toLocaleString('fr-FR')} FCFA pour ${count} sac${count > 1 ? 's' : ''}.`,
    )
  return note(
    {
      ...s,
      farm: { ...farm, bags: have + count },
      life: { ...s.life, wallet: s.life.wallet - cost, spent: s.life.spent + cost },
    },
    `${count} sac${count > 1 ? 's' : ''} triple fond acheté${count > 1 ? 's' : ''} : ${(have + count) * BAG_KG} kg de grains à l’abri des charançons. −${cost.toLocaleString('fr-FR')} FCFA.`,
  )
}

/**
 * Brings the granary up to the game's day: fresh produce past its days rots, dry harvests left
 * out of the bags lose a little to weevils each day. Idempotent for a given day.
 */
export function settleStore(s: CityLife): CityLife {
  const farm = s.farm
  if (!farm) return s
  const today = s.life.day
  const from = farm.checked ?? today
  if (from >= today)
    return farm.checked === undefined ? { ...s, farm: { ...farm, checked: today } } : s
  const safe = protectedKg(farm)
  const stock = { ...farm.stock }
  const since = { ...farm.since }
  const lost: string[] = []
  for (const crop of CROP_IDS) {
    const kg = stock[crop] ?? 0
    if (kg <= 0) continue
    const c = CROPS[crop]
    const harvested = farm.since?.[crop] ?? from
    let open = kg - (safe[crop] ?? 0)
    let gone = 0
    // A long absence is counted at most a year of game days.
    for (let d = Math.max(from + 1, today - 365); d <= today && open > 0; d++) {
      if (d - harvested <= c.shelf) continue
      const l = Math.min(open, Math.max(1, Math.ceil(open * c.loss)))
      open -= l
      gone += l
    }
    if (gone <= 0) continue
    const left = kg - gone
    if (left > 0) stock[crop] = left
    else {
      delete stock[crop]
      delete since[crop]
    }
    const what = `${gone} kg de ${c.name.toLowerCase()}`
    lost.push(
      c.keeps === 'sec'
        ? `les charançons ont mangé ${what} (pas en sac)`
        : `${what} ${c.keeps === 'frais' ? 'ont pourri' : 'se sont gâtés'}`,
    )
  }
  const next: CityLife = { ...s, farm: { ...farm, stock, since, checked: today } }
  return lost.length ? note(next, `Au grenier : ${lost.join(', ')}.`) : next
}

/** Saved farm, checked (a saved game can be edited by hand). */
export function decodeFarm(v: unknown): Farm | undefined {
  if (!v || typeof v !== 'object') return undefined
  const raw = v as { field?: unknown; stock?: unknown }
  let field: Field | null = null
  const f = raw.field as Partial<Field> | null | undefined
  if (
    f &&
    isLocalityId(f.locality) &&
    isCrop(f.crop) &&
    Number.isSafeInteger(f.sownDay) &&
    Number.isSafeInteger(f.tended) &&
    Number.isSafeInteger(f.lastTendDay)
  )
    field = {
      locality: f.locality,
      crop: f.crop,
      sownDay: f.sownDay as number,
      tended: Math.max(0, Math.min(CROPS[f.crop].days, f.tended as number)),
      lastTendDay: f.lastTendDay as number,
    }
  const stock: Farm['stock'] = {}
  if (raw.stock && typeof raw.stock === 'object')
    for (const [k, kg] of Object.entries(raw.stock))
      if (isCrop(k) && Number.isSafeInteger(kg) && (kg as number) > 0)
        stock[k] = Math.min(kg as number, CROPS[k].kg * 20)
  const extra = v as { since?: unknown; bags?: unknown; checked?: unknown }
  const day = (n: unknown): n is number => Number.isSafeInteger(n) && (n as number) >= 0
  const since: Farm['since'] = {}
  if (extra.since && typeof extra.since === 'object')
    for (const [k, d] of Object.entries(extra.since))
      if (isCrop(k) && k in stock && day(d)) since[k] = d
  const farm: Farm = { field, stock }
  if (Object.keys(since).length) farm.since = since
  if (day(extra.bags) && extra.bags > 0) farm.bags = Math.min(extra.bags, MAX_BAGS)
  if (day(extra.checked)) farm.checked = extra.checked
  return farm
}
