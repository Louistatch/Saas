/** Fictional civic rules. All amounts are game currency, never real fines or legal advice. */
import type { CityLife } from './life'
import { type LocalityId, isLocalityId } from './locality'
import { lotById } from './world'

export const PEDESTRIAN_FINE = 500
export interface CivicState {
  warnings: number
  fines: number
  paid: number
  reports: Partial<Record<LocalityId, number>>
}
export const emptyCivic = (): CivicState => ({ warnings: 0, fines: 0, paid: 0, reports: {} })
const integer = (v: unknown, max = 1_000_000) =>
  typeof v === 'number' && Number.isSafeInteger(v) ? Math.max(0, Math.min(max, v)) : 0
export function decodeCivic(value: unknown): CivicState {
  if (!value || typeof value !== 'object') return emptyCivic()
  const v = value as Partial<CivicState>
  return {
    warnings: integer(v.warnings),
    fines: integer(v.fines),
    paid: integer(v.paid),
    reports: Object.fromEntries(
      Object.entries(v.reports ?? {})
        .filter(
          ([k, n]) => isLocalityId(k) && typeof n === 'number' && Number.isFinite(n) && n >= 0,
        )
        .map(([k, n]) => [k, Math.min(Number(n), 2_400_000)]),
    ),
  }
}
export const gameHour = (s: CityLife) => (s.life.day - 1) * 24 + s.life.hour
export const municipalRepairDone = (s: CityLife) => {
  const reported = s.civic?.reports[s.locality]
  return reported !== undefined && gameHour(s) >= reported + 2
}
export function municipalStatus(s: CityLife): string {
  const reported = s.civic?.reports[s.locality]
  if (reported === undefined) return 'Feux en panne : signale-les au tableau de la mairie. Gratuit.'
  if (municipalRepairDone(s))
    return 'Équipe communale passée : tous les feux du quartier fonctionnent.'
  return `Dossier reçu · équipe attendue dans ${Math.ceil(reported + 2 - gameHour(s))} h de jeu. Le ruban attendra : les piétons d’abord !`
}
export function reportMunicipalSignal(s: CityLife): CityLife {
  if (!s.insideLot || lotById(s.insideLot)?.type !== 'townhall') return s
  const civic = s.civic ?? emptyCivic()
  const next =
    civic.reports[s.locality] === undefined
      ? { ...s, civic: { ...civic, reports: { ...civic.reports, [s.locality]: gameHour(s) } } }
      : s
  const message = municipalStatus(next)
  return {
    ...next,
    life: { ...next.life, lastEvent: message, events: [message, ...next.life.events].slice(0, 8) },
  }
}
export type PedestrianReason = 'outside-crossing' | 'red-light'
export function pedestrianTicket(s: CityLife, reason: PedestrianReason): CityLife {
  const c = s.civic ?? emptyCivic()
  // No debt trap: the first stop is educational; a poor player receives another warning.
  const amount = c.warnings > 0 && s.life.wallet >= PEDESTRIAN_FINE ? PEDESTRIAN_FINE : 0
  const message = `${reason === 'red-light' ? 'Feu piéton rouge' : 'Traversée hors passage piéton'} : ${amount ? `amende fictive de ${amount} FCFA` : 'avertissement, aucun paiement'}. Chef, ton pied n’est pas un zémidjan ! Le passage est là pour toi aussi.`
  return {
    ...s,
    route: [],
    target: null,
    civic: {
      ...c,
      warnings: c.warnings + 1,
      fines: c.fines + (amount ? 1 : 0),
      paid: c.paid + amount,
    },
    life: {
      ...s.life,
      wallet: s.life.wallet - amount,
      spent: s.life.spent + amount,
      lastEvent: message,
      events: [message, ...s.life.events].slice(0, 8),
    },
  }
}
