/** Fictional civic rules. All amounts are game currency, never real fines or legal advice. */
import type { CityLife } from './life'
import { type LocalityId, isLocalityId } from './locality'
import { isJunction, signalWorks } from './pedestrians'
import { WORLD_H, WORLD_W, isCityRoad, isDriveway, lotById } from './world'

export const PEDESTRIAN_FINE = 500
export interface CivicState {
  warnings: number
  fines: number
  paid: number
  reports: Partial<Record<LocalityId, number>>
  projects?: Partial<Record<LocalityId, MunicipalProject>>
}
export interface MunicipalProject {
  site: { x: number; z: number }
  budget: number
  subsidy: number
}
export const SIGNAL_REPAIR_BUDGET = 250
export const emptyCivic = (): CivicState => ({ warnings: 0, fines: 0, paid: 0, reports: {} })
const integer = (v: unknown, max = 1_000_000) =>
  typeof v === 'number' && Number.isSafeInteger(v) ? Math.max(0, Math.min(max, v)) : 0
export function decodeCivic(value: unknown): CivicState {
  if (!value || typeof value !== 'object') return emptyCivic()
  const v = value as Partial<CivicState>
  const projects = Object.fromEntries(
    Object.entries(v.projects ?? {})
      .filter(
        ([k, p]) =>
          isLocalityId(k) &&
          p &&
          typeof p === 'object' &&
          p.site &&
          Number.isInteger(p.site.x) &&
          p.site.x >= 0 &&
          p.site.x < WORLD_W &&
          Number.isInteger(p.site.z) &&
          p.site.z >= 0 &&
          p.site.z < WORLD_H,
      )
      .map(([k, p]) => [
        k,
        {
          site: { x: p.site.x, z: p.site.z },
          budget: SIGNAL_REPAIR_BUDGET,
          subsidy: integer(p.subsidy, SIGNAL_REPAIR_BUDGET),
        },
      ]),
  )
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
    ...(Object.keys(projects).length ? { projects } : {}),
  }
}
export const gameHour = (s: CityLife) => (s.life.day - 1) * 24 + s.life.hour
export const municipalRepairDone = (s: CityLife) => {
  const reported = s.civic?.reports[s.locality]
  return reported !== undefined && gameHour(s) >= reported + 2
}
export const municipalPending = (s: CityLife) =>
  s.civic?.reports[s.locality] !== undefined && !municipalRepairDone(s)
/** Planned once on accepting a report, never scanned in the rendering loop. */
function repairSite(near: { x: number; y: number }): { x: number; z: number } {
  const road = (x: number, z: number) => isCityRoad(x, z) || isDriveway(x, z)
  let best = { x: near.x, z: near.y }
  let distance = Number.POSITIVE_INFINITY
  for (let z = 0; z < WORLD_H; z++)
    for (let x = 0; x < WORLD_W; x++) {
      if (!isJunction(x, z, road) || signalWorks({ x, z }, false)) continue
      const d = Math.hypot(x - near.x, z - near.y)
      if (d < distance) {
        best = { x, z }
        distance = d
      }
    }
  return best
}
export function municipalStatus(s: CityLife): string {
  const reported = s.civic?.reports[s.locality]
  if (reported === undefined) return 'Feux en panne : signale-les au tableau de la mairie. Gratuit.'
  if (municipalRepairDone(s))
    return 'Équipe communale passée : tous les feux du quartier fonctionnent.'
  return gameHour(s) > reported
    ? 'Équipe communale sur place : réparation et contrôle des feux. Fin dans 1 h de jeu.'
    : 'Dossier reçu · le maire a mandaté et financé l’équipe. Travaux sous 2 h de jeu, temps automatique. Le ruban attendra : les piétons d’abord !'
}
export function reportMunicipalSignal(s: CityLife): CityLife {
  if (!s.insideLot || lotById(s.insideLot)?.type !== 'townhall') return s
  const civic = s.civic ?? emptyCivic()
  let next = s
  if (civic.reports[s.locality] === undefined) {
    const townhall = lotById(s.insideLot)
    if (!townhall) return s
    const subsidy = Math.max(0, SIGNAL_REPAIR_BUDGET - s.life.city.coins)
    next = {
      ...s,
      civic: {
        ...civic,
        reports: { ...civic.reports, [s.locality]: gameHour(s) },
        projects: {
          ...civic.projects,
          [s.locality]: { site: repairSite(townhall.door), budget: SIGNAL_REPAIR_BUDGET, subsidy },
        },
      },
      life: {
        ...s.life,
        city: { ...s.life.city, coins: Math.max(0, s.life.city.coins - SIGNAL_REPAIR_BUDGET) },
      },
    }
  }
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
