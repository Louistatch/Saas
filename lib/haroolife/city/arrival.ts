/**
 * Arriving in HarooLife: the birth lottery (the family one is born into, drawn by fate) and the
 * first home. Together with the look and the two traits, they make the new game the visitor
 * starts with. Game money only (FCFA of the game); every amount stays under the 100 000 FCFA a
 * first online save accepts (supabase/migrations/…_haroolife_saves.sql).
 *
 * The family pays the caution and the advance of the first home (as the default home of
 * housing.ts); the player pays the agency month, so a dearer home leaves less to start with.
 */
import type { TraitId } from '../traits'
import {
  AGENCY_MONTHS,
  CAUTION_MONTHS,
  type HousingKind,
  defaultHousing,
  quartierById,
} from './housing'
import { type CityLife, initialCityLife } from './life'

export type OriginId =
  | 'nana-benz'
  | 'diaspora'
  | 'fonctionnaire'
  | 'tontine'
  | 'enseignant'
  | 'village'

export interface Origin {
  icon: string
  name: string
  /** What the card says, in the game's voice. */
  text: string
  wallet: number
  /** Extra meals in the bag, extra skill points, a tontine advance to repay. */
  meals?: number
  skills?: number
  tontine?: { total: number; weekly: number }
}

export const ORIGINS: Record<OriginId, Origin> = {
  'nana-benz': {
    icon: '👑',
    name: 'Enfant de Nana Benz',
    text: 'Maman vend le wax au Grand Marché depuis 1978. Tu démarres à l’aise… et tout le quartier le sait.',
    wallet: 95000,
  },
  diaspora: {
    icon: '✈️',
    name: 'Neveu ou nièce de la diaspora',
    text: 'Tonton de Paris envoie de l’argent quand il se souvient de toi. Ce mois-ci, il s’est souvenu.',
    wallet: 70000,
  },
  fonctionnaire: {
    icon: '🏛️',
    name: 'Enfant de fonctionnaire',
    text: 'Papa attend le salaire du 25 comme on attend la pluie. Tu as appris à compter les jours.',
    wallet: 50000,
  },
  tontine: {
    icon: '🪙',
    name: 'Bébé tontine',
    text: 'La tontine du quartier t’avance 30 000 FCFA. Tu rends 6 000 FCFA chaque semaine pendant 6 semaines, sinon la présidente vient frapper.',
    wallet: 30000,
    tontine: { total: 36000, weekly: 6000 },
  },
  enseignant: {
    icon: '📚',
    name: 'Enfant d’enseignant',
    text: 'Grandi entre les cahiers corrigés et « Tu as appris tes leçons ? ». Tu pars avec 10 points de compétences.',
    wallet: 30000,
    skills: 10,
  },
  village: {
    icon: '🌽',
    name: 'Enfant du village',
    text: 'Arrivé·e de Kpalimé avec un sac de maïs et beaucoup d’ambition. 5 repas d’avance dans le sac.',
    wallet: 22000,
    meals: 5,
  },
}
export const ORIGIN_IDS = Object.keys(ORIGINS) as OriginId[]
/** Fate can be asked again, but not forever. */
export const REDRAWS = 2

/** The birth lottery: every family is as likely (`random` in [0, 1)). */
export const drawOrigin = (random: number): OriginId =>
  ORIGIN_IDS[Math.min(ORIGIN_IDS.length - 1, Math.floor(random * ORIGIN_IDS.length))]

export interface StartHome {
  id: string
  quartier: string
  kind: HousingKind
  title: string
  tag: string
  text: string
}

export const START_HOMES: StartHome[] = [
  {
    id: 'adidogome-chambre',
    quartier: 'adidogome',
    kind: 'chambre',
    title: 'Chambre en cour commune · Adidogomé',
    tag: 'Départ difficile',
    text: 'Une pièce, la cour partagée, et le voisin qui met la radio à fond dès 5 h. Loyer bas, grands rêves.',
  },
  {
    id: 'be-chambre',
    quartier: 'be',
    kind: 'chambre',
    title: 'Chambre · Bè',
    tag: 'Ambiance',
    text: 'Le marché de Bè à côté et les tam-tams du week-end. Tu dormiras quand tu seras riche.',
  },
  {
    id: 'tokoin-chambre-salon',
    quartier: 'tokoin',
    kind: 'chambre-salon',
    title: 'Chambre-salon · Tokoin',
    tag: 'Équilibré',
    text: 'Ton propre salon pour recevoir, à deux pas du CHU et du marché de Tokoin.',
  },
  {
    id: 'agoe-deux-chambres',
    quartier: 'agoe',
    kind: 'deux-chambres',
    title: '2 chambres · Agoè',
    tag: 'Confort',
    text: 'De la place pour la famille… qui viendra sans prévenir.',
  },
]
export const startHome = (id: string) => START_HOMES.find((h) => h.id === id) ?? null

/** The monthly rent of a start home (and whether it was seen in real listings). */
export function homeRent(home: StartHome): { amount: number; observed: boolean } {
  const q = quartierById(home.quartier)
  return q ? q.rents[home.kind] : { amount: 0, observed: false }
}

/** What is left after the agency month: the money the player starts with (null: too dear). */
export function startMoney(origin: OriginId, home: StartHome): number | null {
  const left = ORIGINS[origin].wallet - homeRent(home).amount * AGENCY_MONTHS
  return left >= 0 ? left : null
}

/** The new game of someone who chose their traits, was born into `origin` and rents `home`. */
export function arrivalLife(choice: {
  traits: TraitId[]
  origin: OriginId
  home: StartHome
}): CityLife {
  const s = initialCityLife()
  const o = ORIGINS[choice.origin]
  const rent = homeRent(choice.home).amount
  const wallet = startMoney(choice.origin, choice.home) ?? 0
  const base = defaultHousing(s.life.day)
  const q = quartierById(choice.home.quartier)
  const msg = `${o.name} · ${choice.home.title}. Bienvenue à Lomé !`
  return {
    ...s,
    origin: choice.origin,
    skills: s.skills + (o.skills ?? 0),
    tontine: o.tontine ? { left: o.tontine.total, weekly: o.tontine.weekly, week: 0 } : undefined,
    housing: {
      ...base,
      quartier: q?.id ?? base.quartier,
      kind: choice.home.kind,
      rent,
      caution: rent * CAUTION_MONTHS,
    },
    life: {
      ...s.life,
      wallet,
      meals: s.life.meals + (o.meals ?? 0),
      traits: choice.traits.length ? [...choice.traits] : undefined,
      lastEvent: msg,
      events: [msg, ...s.life.events].slice(0, 8),
    },
  }
}
