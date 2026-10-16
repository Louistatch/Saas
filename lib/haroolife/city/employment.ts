import { advanceLifeHour } from '../lome-life-engine'
import type { CityLife } from './life'
import type { LocalityId } from './locality'
import { lotById, worldLots } from './world'

/** Fictional shifts paid in game FCFA, without a partnership or real recruitment claim. */
export const EMPLOYERS = [
  {
    id: 'mixx',
    name: 'Mixx by Yas',
    icon: '📱',
    hourlyRate: 1200,
    task: 'Accueillir les clients et expliquer les services du kiosque.',
  },
  {
    id: 'moov',
    name: 'Moov Africa',
    icon: '📶',
    hourlyRate: 1200,
    task: 'Conseiller les visiteurs et ranger les produits du point de vente.',
  },
] as const
export type EmployerId = (typeof EMPLOYERS)[number]['id']
export type HourlyShift = { employer: EmployerId; locality: LocalityId; lot: string; hours: number }
export type Employment = {
  day: number
  hoursToday: number
  earned: number
  shift: HourlyShift | null
}
export const employmentOf = (s: CityLife): Employment =>
  s.employment ?? { day: s.life.day, hoursToday: 0, earned: 0, shift: null }
const note = (s: CityLife, message: string): CityLife => ({
  ...s,
  life: { ...s.life, lastEvent: message, events: [message, ...s.life.events].slice(0, 8) },
})
export function employerLot(id: EmployerId) {
  return worldLots().find((lot) => lot.employer === id) ?? null
}
export function startHourlyShift(s: CityLife, employer: EmployerId): CityLife {
  const e = EMPLOYERS.find((e) => e.id === employer)
  const lot = s.insideLot ? lotById(s.insideLot) : null
  const old = employmentOf(s)
  const hoursToday = old.day === s.life.day ? old.hoursToday : 0
  if (!e || lot?.employer !== employer)
    return note(s, 'Entre dans le point de vente avant de commencer ton service.')
  if (old.shift) return note(s, 'Un service est déjà en cours.')
  if (s.duty) return note(s, 'Termine ton service taxi ou zémidjan avant de travailler au kiosque.')
  if (hoursToday >= 4)
    return note(s, 'Tes quatre heures de kiosque sont terminées pour aujourd’hui. Reviens demain.')
  if (s.life.hour < 7 || s.life.hour >= 19)
    return note(s, 'Le kiosque recrute de 7 h à 19 h dans le jeu.')
  if (s.life.needs.energy < 20 || s.life.needs.hunger < 20)
    return note(s, 'Mange et repose-toi avant de commencer le service.')
  return note(
    {
      ...s,
      employment: {
        ...old,
        day: s.life.day,
        hoursToday,
        shift: { employer, locality: s.locality, lot: lot.id, hours: 0 },
      },
    },
    `Service ${e.name} commencé : ${e.hourlyRate} FCFA par heure de jeu terminée. Reste au kiosque ; le temps avance automatiquement.`,
  )
}
export function stopHourlyShift(s: CityLife): CityLife {
  const old = employmentOf(s)
  return old.shift
    ? note(
        { ...s, employment: { ...old, shift: null } },
        'Service terminé. Les heures complètes ont été payées ; aucune heure incomplète n’est facturée.',
      )
    : s
}
/** Called once per visible 11-second game hour, never for elapsed offline time or manual clock jumps. */
export function advanceHourlyShift(s: CityLife): CityLife {
  const old = employmentOf(s)
  const shift = old.shift
  if (!shift) return s
  if (
    s.locality !== shift.locality ||
    s.insideLot !== shift.lot ||
    s.duty ||
    s.life.hour < 7 ||
    s.life.hour >= 19 ||
    old.hoursToday >= 4 ||
    s.life.needs.energy < 10 ||
    s.life.needs.hunger < 10
  )
    return stopHourlyShift(s)
  const e = EMPLOYERS.find((e) => e.id === shift.employer)
  if (!e) return stopHourlyShift(s)
  const life = advanceLifeHour(s.life)
  const hoursToday = old.hoursToday + 1
  return note(
    {
      ...s,
      employment: {
        day: old.day,
        hoursToday,
        earned: old.earned + e.hourlyRate,
        shift: hoursToday >= 4 || life.hour >= 19 ? null : { ...shift, hours: shift.hours + 1 },
      },
      life: {
        ...life,
        wallet: life.wallet + e.hourlyRate,
        earned: life.earned + e.hourlyRate,
        needs: { ...life.needs, energy: Math.max(0, life.needs.energy - 5) },
      },
    },
    `${e.name} : heure ${shift.hours + 1} terminée, +${e.hourlyRate} FCFA du jeu versés.${hoursToday >= 4 || life.hour >= 19 ? ' Service terminé.' : ' Le service continue.'}`,
  )
}
export function decodeEmployment(value: unknown, day: number): Employment {
  const data = value as Partial<Employment> | null
  return {
    day:
      data && typeof data.day === 'number' && Number.isSafeInteger(data.day) && data.day >= 0
        ? data.day
        : day,
    hoursToday:
      data && typeof data.hoursToday === 'number' && Number.isInteger(data.hoursToday)
        ? Math.max(0, Math.min(4, data.hoursToday))
        : 0,
    earned:
      data &&
      typeof data.earned === 'number' &&
      Number.isSafeInteger(data.earned) &&
      data.earned >= 0
        ? data.earned
        : 0,
    // Reloading never starts an unattended shift; the player explicitly resumes on site.
    shift: null,
  }
}
