/**
 * HarooLife — Lomé life: surprise events with a choice and consequences.
 * Pure functions on the fictional life state: no network, no real accounts.
 * Triggering is deterministic from (day, hour) so a save replays identically.
 */
import type { LifeState, Needs } from './lome-life-engine'

export type EventChoice = {
  label: string
  /** Short consequence shown under the label, like "Hygiène −25". */
  hint: string
  apply: (state: LifeState) => LifeState
}
export type LifeEvent = {
  id: string
  icon: string
  title: string
  body: string
  choices: EventChoice[]
}

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)))
const bump = (state: LifeState, delta: Partial<Needs>): LifeState => {
  const needs = { ...state.needs }
  for (const k of Object.keys(delta) as (keyof Needs)[])
    needs[k] = clamp(needs[k] + (delta[k] ?? 0))
  return { ...state, needs }
}
const pay = (state: LifeState, amount: number): LifeState | null =>
  state.wallet < amount
    ? null
    : {
        ...state,
        wallet: state.wallet - amount,
        spent: state.spent + amount,
        city: { ...state.city, coins: state.city.coins + amount },
      }
const say = (state: LifeState, msg: string): LifeState => ({
  ...state,
  lastEvent: msg,
  events: [msg, ...state.events].slice(0, 8),
})

export const LIFE_EVENTS: LifeEvent[] = [
  {
    id: 'inondation-be',
    icon: '🌊',
    title: 'La rue est inondée !',
    body: 'Grosse pluie cette nuit. Le caniveau de Bè a débordé et l’eau arrive aux genoux.',
    choices: [
      {
        label: 'Patauger pour passer',
        hint: 'Hygiène −25 · Énergie −5',
        apply: (s) =>
          say(bump(s, { hygiene: -25, energy: -5 }), 'Tu as traversé l’eau. Une douche s’impose.'),
      },
      {
        label: 'Curer le caniveau avec les voisins',
        hint: 'Social +20 · Énergie −15 · Hygiène −10',
        apply: (s) =>
          say(
            bump(s, { social: 20, energy: -15, hygiene: -10 }),
            'Le caniveau est dégagé. Les voisins te remercient.',
          ),
      },
    ],
  },
  {
    id: 'coupure-ceet',
    icon: '🔌',
    title: 'Coupure de courant',
    body: 'La CEET a coupé le quartier. Pas de télé, pas de ventilateur, et la nuit tombe.',
    choices: [
      {
        label: 'Attendre à la maison',
        hint: 'Loisir −15',
        apply: (s) => say(bump(s, { fun: -15 }), 'Le courant est revenu deux heures plus tard.'),
      },
      {
        label: 'Aller au maquis du coin · 500 FCFA',
        hint: 'Loisir +25 · Social +10',
        apply: (s) => {
          const paid = pay(s, 500)
          if (!paid) return say(s, 'Pas assez d’argent pour le maquis : tu attends chez toi.')
          return say(
            bump(paid, { fun: 25, social: 10 }),
            'Soirée au maquis, −500 FCFA. Le quartier a chanté.',
          )
        },
      },
    ],
  },
  {
    id: 'assigame-ferme',
    icon: '🛒',
    title: 'Le grand marché est fermé',
    body: 'Assigamé n’ouvre pas aujourd’hui. Les vendeuses du quartier sont parties en ville.',
    choices: [
      {
        label: 'Acheter à la boulangerie · 900 FCFA',
        hint: '+1 repas',
        apply: (s) => {
          const paid = pay(s, 900)
          if (!paid) return say(s, 'Pas assez d’argent : tu sautes un repas.')
          return say(
            { ...paid, meals: paid.meals + 1 },
            'Un repas acheté plus cher à la boulangerie.',
          )
        },
      },
      {
        label: 'Jeûner jusqu’à demain',
        hint: 'Faim −10',
        apply: (s) => say(bump(s, { hunger: -10 }), 'Tu serres la ceinture aujourd’hui.'),
      },
    ],
  },
  {
    id: 'greve-zemidjan',
    icon: '🏍️',
    title: 'Grève des zémidjans',
    body: 'Les moto-taxis ne roulent pas aujourd’hui. Le prix du carburant a encore monté.',
    choices: [
      {
        label: 'Marcher',
        hint: 'Énergie −10',
        apply: (s) => say(bump(s, { energy: -10 }), 'Tu as marché sous le soleil.'),
      },
      {
        label: 'Prendre un taxi · 900 FCFA',
        hint: 'Énergie conservée',
        apply: (s) => {
          const paid = pay(s, 900)
          if (!paid) return say(bump(s, { energy: -10 }), 'Pas de quoi payer le taxi : tu marches.')
          return say(paid, 'Taxi partagé, −900 FCFA.')
        },
      },
    ],
  },
  {
    id: 'fete-quartier',
    icon: '🥁',
    title: 'Fête dans le quartier',
    body: 'Les tam-tams résonnent : un voisin célèbre une naissance et tout le monde est invité.',
    choices: [
      {
        label: 'Participer à la fête',
        hint: 'Social +30 · Loisir +25 · Énergie −10',
        apply: (s) =>
          say(
            bump(s, { social: 30, fun: 25, energy: -10 }),
            'Tu as dansé jusqu’à tard. Le quartier t’adore.',
          ),
      },
      {
        label: 'Rester chez soi',
        hint: 'Énergie +10',
        apply: (s) =>
          say(bump(s, { energy: 10 }), 'Tu t’es reposé pendant que la fête battait son plein.'),
      },
    ],
  },
]

export const EVENT_IDS = new Set(LIFE_EVENTS.map((e) => e.id))
export const eventById = (id: string | null | undefined): LifeEvent | null =>
  LIFE_EVENTS.find((e) => e.id === id) ?? null

/**
 * Deterministic draw for a given (day, hour): roughly one event every seven waking hours,
 * never at night, never while another is pending or the player is on the road.
 */
export function rollEvent(state: LifeState): string | null {
  if (state.pendingEvent || state.route.length > 0) return null
  if (state.hour < 7 || state.hour > 20) return null
  const seed = (state.day * 7919 + state.hour * 104729 + 17) % 233
  if (seed % 7 !== 3) return null
  return LIFE_EVENTS[(state.day + state.hour) % LIFE_EVENTS.length].id
}

export function resolveEvent(state: LifeState, choice: number): LifeState {
  const ev = eventById(state.pendingEvent)
  if (!ev) return state
  const pick = ev.choices[choice]
  if (!pick) return state
  return pick.apply({ ...state, pendingEvent: null })
}
