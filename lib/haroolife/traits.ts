/**
 * The two personality traits a player picks when they arrive in HarooLife. Each has the effect
 * its card says, and only that one (applied by lome-life-engine.ts and city/life.ts):
 * - débrouillard·e: +10 % on every wage of the day's job;
 * - gourmand·e: a meal fills hunger by 60 instead of 45;
 * - ambianceur·se: relaxing gives 60 fun instead of 40, but fun drops 3 an hour instead of 2;
 * - grand·e bavard·e: a chat with neighbours gives 57 social instead of 38;
 * - roi/reine de la sieste: energy drops 1 point less each hour;
 * - toujours propre: hygiene drops only every other hour;
 * - sportif·ve: training builds 50 % more fitness.
 * Pure: no imports, so the engine can depend on it.
 */
export type TraitId =
  | 'debrouillard'
  | 'gourmand'
  | 'ambianceur'
  | 'bavard'
  | 'dormeur'
  | 'propre'
  | 'sportif'

export const TRAITS: Record<TraitId, { icon: string; name: string; text: string }> = {
  debrouillard: {
    icon: '💼',
    name: 'Débrouillard·e',
    text: 'Voit l’argent partout, même dans un sachet d’eau pure. +10 % sur chaque salaire.',
  },
  gourmand: {
    icon: '🍲',
    name: 'Gourmand·e',
    text: 'Vit pour la pâte et la sauce gombo. Chaque repas rassasie un tiers de plus.',
  },
  ambianceur: {
    icon: '🎉',
    name: 'Ambianceur·se',
    text: 'Premier·e au maquis, dernier·e à rentrer. Les loisirs comptent plus, mais l’ennui arrive vite.',
  },
  bavard: {
    icon: '💬',
    name: 'Grand·e bavard·e',
    text: 'Connaît la vie de tout le quartier avant le journal de 20 h. Les causeries remplissent 50 % plus.',
  },
  dormeur: {
    icon: '😴',
    name: 'Roi ou reine de la sieste',
    text: 'Dort comme un gardien de nuit. L’énergie baisse moins vite.',
  },
  propre: {
    icon: '🧼',
    name: 'Toujours propre',
    text: 'Se lave trois fois par jour, même en saison sèche. L’hygiène baisse deux fois moins vite.',
  },
  sportif: {
    icon: '💪',
    name: 'Sportif·ve',
    text: 'Footing à la plage de Lomé chaque dimanche. Chaque séance de sport compte 50 % de plus.',
  },
}
export const TRAIT_IDS = Object.keys(TRAITS) as TraitId[]
export const MAX_TRAITS = 2

const isTrait = (v: unknown): v is TraitId => typeof v === 'string' && v in TRAITS

/** The traits of a save: at most two known ones, without duplicates (anything else dropped). */
export function decodeTraits(v: unknown): TraitId[] | undefined {
  if (!Array.isArray(v)) return undefined
  const out = [...new Set(v.filter(isTrait))].slice(0, MAX_TRAITS)
  return out.length ? out : undefined
}

export const hasTrait = (who: { traits?: readonly TraitId[] }, t: TraitId) =>
  who.traits?.includes(t) ?? false
