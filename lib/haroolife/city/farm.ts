/**
 * « Mon champ » : the player's own plot, sown in the real season of the town they are in, tended
 * each game day, harvested, and sold at the real market price (market_prices, the platform's
 * price survey: see app/api/haroolife/prices). No network or React in here.
 *
 * Seasons: a simplified sowing calendar from the real rains. The south (Lomé, Maritime) has two
 * rainy seasons (the long one from March, the short one from September); the north (Kara) has one,
 * from May to October. The month is the real month in Lomé (UTC+0), so a player in Kara in
 * December finds the sowing over, as a farmer would. Growth, care and yield are in game days.
 */
import type { CityLife } from './life'
import type { LocalityId } from './locality'

export type CropId = 'mais' | 'haricot' | 'soja' | 'sorgho' | 'mil'

export interface Crop {
  name: string
  icon: string
  /** Name of the culture in market_prices. */
  market: string
  /** Game days from sowing to harvest. */
  days: number
  /** Harvest (kg) when tended every day. */
  kg: number
  /** Plot hire and seeds (FCFA of the game). */
  cost: number
}

export const CROPS: Record<CropId, Crop> = {
  mais: { name: 'Maïs', icon: '🌽', market: 'Mais', days: 4, kg: 70, cost: 3000 },
  haricot: { name: 'Haricot', icon: '🫘', market: 'Haricot', days: 3, kg: 22, cost: 3500 },
  soja: { name: 'Soja', icon: '🌱', market: 'Soja', days: 4, kg: 25, cost: 3500 },
  sorgho: { name: 'Sorgho', icon: '🌾', market: 'Sorgho', days: 5, kg: 35, cost: 2500 },
  mil: { name: 'Mil', icon: '🌾', market: 'Mil', days: 5, kg: 30, cost: 2500 },
}

/** Months (1–12) when each crop is sown, by town: a simplified calendar of the real rains. */
export const SOWING: Record<LocalityId, Partial<Record<CropId, number[]>>> = {
  lome: { mais: [3, 4, 5, 9, 10], haricot: [4, 5, 9, 10], soja: [5, 6] },
  kara: { mais: [5, 6, 7], sorgho: [5, 6, 7], mil: [5, 6], soja: [6, 7], haricot: [7, 8] },
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
  /** Harvest kept, not yet sold (kg). */
  stock: Partial<Record<CropId, number>>
}

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
        ? `Ce n’est pas la saison du ${c.name.toLowerCase()} ici. Prochains semis : ${MONTHS[next.month - 1]}.`
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
          field: null,
          stock: { ...farm.stock, [crop]: (farm.stock[crop] ?? 0) + status.kg },
        },
      },
      20,
    ),
    `${CROPS[crop].icon} Récolte : ${status.kg} kg de ${CROPS[crop].name.toLowerCase()}. Vends-les au marché.`,
  )
}

/** Sell all the stock of a crop at a real price per kg (from the town's market survey). */
export function sell(s: CityLife, crop: CropId, pricePerKg: number): CityLife {
  const farm = farmOf(s)
  const kg = farm.stock[crop] ?? 0
  if (kg <= 0) return note(s, 'Rien à vendre.')
  if (!Number.isFinite(pricePerKg) || pricePerKg <= 0 || pricePerKg > 10000)
    return note(s, 'Prix du marché indisponible pour le moment.')
  const total = Math.round(kg * pricePerKg)
  const stock = { ...farm.stock }
  delete stock[crop]
  return note(
    {
      ...s,
      farm: { ...farm, stock },
      life: { ...s.life, wallet: s.life.wallet + total, earned: s.life.earned + total },
    },
    `Vendu : ${kg} kg de ${CROPS[crop].name.toLowerCase()} à ${Math.round(pricePerKg)} FCFA le kg, +${total.toLocaleString('fr-FR')} FCFA.`,
  )
}

/** Saved farm, checked (a saved game can be edited by hand). */
export function decodeFarm(v: unknown): Farm | undefined {
  if (!v || typeof v !== 'object') return undefined
  const raw = v as { field?: unknown; stock?: unknown }
  let field: Field | null = null
  const f = raw.field as Partial<Field> | null | undefined
  if (
    f &&
    (f.locality === 'lome' || f.locality === 'kara') &&
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
  return { field, stock }
}
