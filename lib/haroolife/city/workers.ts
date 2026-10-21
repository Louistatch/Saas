/**
 * Recruiting a worker for « Mon champ » (game money only). The real ones are Haroo workers
 * (haroo_ouvrier_profiles, available): the player proposes 1 to 3 days at WAGE_PER_DAY, the
 * worker answers in the game or on their dashboard, and an accepted proposal is paid through the
 * game's money transfer (supabase/migrations/…_haroolife_field_work.sql). Nothing binds anyone
 * outside the game.
 *
 * When no real worker is available, the village answers instead: fictional neighbours, who always
 * say no, each with an excuse. They never tend the field: only a real worker does.
 *
 * No network or React in here.
 */
import { CROPS, type CropId, type Farm, helperToday } from './farm'
import type { CityLife } from './life'
import { LOCALITIES, type LocalityId } from './locality'

/** A day of field work, in game FCFA (a rural day's wage in Togo is of this order). */
export const WAGE_PER_DAY = 1500
export const MAX_HIRE_DAYS = 3

/** A real worker, as haroolife_field_workers returns them (first name only, never a phone). */
export interface FieldWorker {
  ref: string
  name: string
  skills: string[]
  note: number
  reviews: number
  /** Works in a canton of the player's region. */
  nearby: boolean
}

export type OfferStatus = 'pending' | 'accepted' | 'declined' | 'cancelled' | 'expired'

/** A proposal, as haroolife_field_offers_mine returns it. */
export interface FieldOffer {
  id: string
  status: OfferStatus
  reason: string | null
  days: number
  pay: number
  crop: string
  locality: string
  created_at: string
  expires_at: string
  answered_at: string | null
  /** The player already took the answer into account. */
  seen: boolean
  worker: string
  employer: string
}

export const wageFor = (days: number) => days * WAGE_PER_DAY

/** The administrative region of a town, as the database names it (« Plateaux Ouest » → Plateaux). */
export const regionOf = (locality: LocalityId) => LOCALITIES[locality].region.split(' ')[0]

/** Where an ouvrier signs up on Haroo, to be found by the players. */
export const WORKER_SIGNUP = 'https://www.faitierehub.com/auth/signup/haroo?type=ouvrier'

const money = (n: number) => `${Math.round(n).toLocaleString('fr-FR')} FCFA`
const note = (s: CityLife, msg: string): CityLife => ({
  ...s,
  life: { ...s.life, lastEvent: msg, events: [msg, ...s.life.events].slice(0, 8) },
})
const farmOf = (s: CityLife): Farm => s.farm ?? { field: null, stock: {} }

/** The answer to this proposal was already applied to this game. */
export const answered = (s: CityLife, offer: string) => !!s.farm?.answered?.includes(offer)

/**
 * Applies a worker's answer to the game, once. Accepted: the pay leaves the wallet (the server has
 * already sent it to the worker) and the worker tends the field from today, or tomorrow when the
 * player has already been there today. Refused, withdrawn or expired: nothing is paid.
 */
export function applyAnswer(s: CityLife, offer: FieldOffer): CityLife {
  if (offer.status === 'pending' || answered(s, offer.id)) return s
  const farm = farmOf(s)
  const record: Farm = { ...farm, answered: [offer.id, ...(farm.answered ?? [])].slice(0, 10) }
  const base: CityLife = { ...s, farm: record }
  if (offer.status === 'declined')
    return note(base, `${offer.worker} ne peut pas venir cette fois. Rien n’a été payé.`)
  if (offer.status === 'expired')
    return note(base, `${offer.worker} n’a pas répondu à temps. Rien n’a été payé.`)
  if (offer.status === 'cancelled')
    return note(
      base,
      `Proposition à ${offer.worker} annulée${offer.reason ? ` : ${offer.reason}` : ''}.`,
    )
  const day = s.life.day
  const paid: CityLife = {
    ...base,
    life: {
      ...base.life,
      wallet: Math.max(0, base.life.wallet - offer.pay),
      spent: base.life.spent + offer.pay,
    },
  }
  const field = record.field
  const crop = offer.crop as CropId
  if (!field || field.crop !== crop || field.locality !== offer.locality)
    return note(
      paid,
      `${offer.worker} a fait le trajet, mais ton champ de ${CROPS[crop]?.name.toLowerCase() ?? offer.crop} n’y était plus. −${money(offer.pay)}.`,
    )
  const from = field.lastTendDay === day ? day + 1 : day
  return note(
    {
      ...paid,
      farm: {
        ...record,
        field: {
          ...field,
          helper: { name: offer.worker, offer: offer.id, from, days: offer.days },
        },
      },
    },
    `${offer.worker} a accepté : ${offer.days > 1 ? `${offer.days} jours` : 'une journée'} au champ${from > day ? ' à partir de demain' : ''}. −${money(offer.pay)}.`,
  )
}

/** What the hired worker does now, in words (null without one). */
export function helperSaid(s: CityLife): string | null {
  const field = s.farm?.field
  const h = field?.helper
  if (!field || !h) return null
  const day = s.life.day
  if (helperToday(field, day)) {
    const left = h.from + h.days - day
    return `${h.name} s’occupe de ton champ aujourd’hui${left > 1 ? ` (encore ${left - 1} jour${left > 2 ? 's' : ''} ensuite)` : ''}.`
  }
  if (day < h.from) return `${h.name} commence demain au champ.`
  return `${h.name} a fini ses ${h.days > 1 ? `${h.days} jours` : 'jour'} au champ.`
}

/** A neighbour of the game: not a real person, and never available. */
export interface Neighbour {
  name: string
  trade: string
}

export const NEIGHBOURS: Neighbour[] = [
  { name: 'Kokou', trade: 'Laboure depuis 1998, surtout en théorie' },
  { name: 'Ablavi', trade: 'Désherbe quand il fait frais, donc rarement' },
  { name: 'Yao', trade: 'Champion de belote du quartier' },
  { name: 'Essi', trade: 'Connaît tout le monde au marché' },
  { name: 'Mawuli', trade: 'Spécialiste de la pause' },
  { name: 'Dédé', trade: 'Récolte surtout les nouvelles' },
  { name: 'Kodjovi', trade: 'Porte une houe pour le style' },
  { name: 'Akpéné', trade: 'Arrose ses fleurs, pas les champs' },
  { name: 'Sena', trade: 'Agent de liaison de la tontine' },
  { name: 'Edem', trade: 'Toujours « en route »' },
]

/** Their answer: always no, said the Lomé way. */
export const EXCUSES: string[] = [
  'Aujourd’hui ? Mon dos a déposé un préavis de grève. Le syndicat se réunit jeudi.',
  'J’ai mangé l’akoumé ce matin : le corps a dit qu’on va d’abord faire la sieste.',
  'C’est le jour de la tontine. Si je pars au champ, ils vont partager l’argent sans moi.',
  'Ma houe est partie en voyage à Kpalimé. Elle revient quand elle veut.',
  'Moi je travaille seulement le 30 février. Repasse à ce moment-là.',
  'Le soleil-là n’est pas mon cousin. Attends la pluie… mais pas trop de pluie.',
  'Si je rentre encore avec la boue, ma mère va me faire dormir avec les chèvres.',
  'Je suis en réunion importante avec mon matelas. Ça peut durer.',
  'Mon téléphone a 3 % de batterie. Si je vais au champ, qui va répondre aux gbairai ?',
  'J’ai déjà beaucoup travaillé hier… dans ma tête. C’est fatigant, hein.',
  'On dit que le repos c’est la santé. Moi je suis très, très en santé.',
  'Je dois regarder le match des Éperviers. Même s’il n’y a pas de match.',
  'Mon horoscope a dit : pas de houe cette semaine, sinon malheur.',
  'Je suis allergique au désherbage. Mon cousin qui connaît un docteur l’a dit.',
  'Mon zémidjan m’attend depuis ce matin. Bon, depuis la semaine passée.',
  'Ma grand-mère arrive du village. Elle arrive depuis trois mois, mais elle arrive.',
]

const hash = (text: string) => {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619)
  return h >>> 0
}

/** Three neighbours who « might » help today: the same ones all day, others the next. */
export function neighboursOf(day: number, n = 3): Neighbour[] {
  const start = hash(`voisins:${day}`) % NEIGHBOURS.length
  return Array.from({ length: n }, (_, i) => NEIGHBOURS[(start + i * 3) % NEIGHBOURS.length])
}

/** A neighbour's excuse; asking again the same day brings another one. */
export function excuseOf(name: string, day: number, attempt = 0): string {
  return EXCUSES[hash(`${name}:${day}:${attempt}`) % EXCUSES.length]
}
