import type { CityLife } from './life'
import type { Fare, VehicleKind } from './fares'
import { landmarks } from './world'

/** Consumption and maintenance are accelerated game rules; pump price is a dated official reference. */
export const VEHICLE_RULES = {
  taxi: { tankMl: 4000, mlPerCell: 2.6, maintenancePerKm: 18 },
  moto: { tankMl: 2000, mlPerCell: 1, maintenancePerKm: 10 },
} as const
export const FUEL_REFERENCE = {
  product: 'Super sans plomb',
  fcfaPerLitre: 817,
  effective: '2026-09-11',
  checked: '2026-10-16',
  source:
    'https://www.republiquetogolaise.tg/gouvernance-economique/1109-12268-nouveaux-tarifs-pour-les-produits-petroliers-a-partir-de-ce-vendredi',
} as const
export const GAME_FUEL_PER_LITRE = FUEL_REFERENCE.fcfaPerLitre
export type VehicleReceipt = {
  gross: number
  fuel: number
  maintenance: number
  net: number
  destination: string
}
export type VehicleCare = {
  fuelMl: number
  fuelReserve: number
  maintenanceReserve: number
  km: number
  sinceMaintenanceKm: number
  courses: number
  checks: number
  refills: number
  services: number
  gross: number
  expenses: number
  lastReceipt?: VehicleReceipt
}
export type Fleet = Partial<Record<VehicleKind, VehicleCare>>
export function vehicleCare(s: CityLife, kind: VehicleKind): VehicleCare {
  return (
    s.fleet?.[kind] ?? {
      fuelMl: VEHICLE_RULES[kind].tankMl,
      fuelReserve: 0,
      maintenanceReserve: 0,
      km: 0,
      sinceMaintenanceKm: 0,
      courses: 0,
      checks: 0,
      refills: 0,
      services: 0,
      gross: 0,
      expenses: 0,
    }
  )
}
export function decodeFleet(value: unknown): Fleet {
  const fleet: Fleet = {}
  if (!value || typeof value !== 'object') return fleet
  for (const kind of ['taxi', 'moto'] as const) {
    const raw = (value as Fleet)[kind]
    if (!raw || typeof raw !== 'object') continue
    const care = vehicleCare({} as CityLife, kind)
    for (const key of Object.keys(care) as (keyof VehicleCare)[]) {
      const n = raw[key]
      if (typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 1e9)
        (care as unknown as Record<string, number>)[key] = n
    }
    care.fuelMl = Math.min(VEHICLE_RULES[kind].tankMl, care.fuelMl)
    care.courses = Math.floor(care.courses)
    care.checks = Math.floor(care.checks)
    const r = raw.lastReceipt
    if (
      r &&
      [r.gross, r.fuel, r.maintenance, r.net].every((n) => Number.isSafeInteger(n) && n >= 0) &&
      r.net === r.gross - r.fuel - r.maintenance &&
      typeof r.destination === 'string'
    )
      care.lastReceipt = { ...r, destination: r.destination.slice(0, 160) }
    fleet[kind] = care
  }
  return fleet
}
/** Called only by a real completed ride. Replacement fuel and maintenance are provisioned once. */
export function settleVehicleFare(
  s: CityLife,
  fare: Fare,
  kind: VehicleKind,
  traveledCells: number,
): CityLife {
  const care = vehicleCare(s, kind)
  const rules = VEHICLE_RULES[kind]
  const cells = Math.max(fare.cells, Number.isFinite(traveledCells) ? traveledCells : 0)
  const km = cells * 0.04
  const ml = cells * rules.mlPerCell
  // A very remote pickup must never create debt or erase the player's existing wallet.
  const fuel = Math.min(Math.ceil((ml * GAME_FUEL_PER_LITRE) / 1000), Math.floor(fare.price * 0.6))
  const maintenance = Math.min(
    Math.ceil(km * rules.maintenancePerKm),
    Math.floor(fare.price * 0.15),
  )
  const receipt: VehicleReceipt = {
    gross: fare.price,
    fuel,
    maintenance,
    net: fare.price - fuel - maintenance,
    destination: fare.to.name,
  }
  const next: VehicleCare = {
    ...care,
    fuelMl: Math.max(0, care.fuelMl - ml),
    fuelReserve: care.fuelReserve + fuel,
    maintenanceReserve: care.maintenanceReserve + maintenance,
    km: care.km + km,
    sinceMaintenanceKm: care.sinceMaintenanceKm + km,
    courses: care.courses + 1,
    gross: care.gross + fare.price,
    expenses: care.expenses + fuel + maintenance,
    lastReceipt: receipt,
  }
  const msg = `${fare.passenger} déposé·e : recette ${fare.price}, essence −${fuel}, réserve entretien −${maintenance} ; net +${receipt.net} FCFA du jeu.`
  return {
    ...s,
    fleet: { ...s.fleet, [kind]: next },
    life: {
      ...s.life,
      wallet: s.life.wallet + receipt.net,
      earned: s.life.earned + fare.price,
      spent: s.life.spent + fuel + maintenance,
      lastEvent: msg,
      events: [msg, ...s.life.events].slice(0, 8),
    },
  }
}
export type ServiceStopKind = 'fuel' | 'garage' | 'police'
export type ServiceStop = { service: ServiceStopKind; name: string; x: number; y: number }
export function nextVehicleStop(s: CityLife, kind: VehicleKind): ServiceStop | null {
  const c = vehicleCare(s, kind)
  const service: ServiceStopKind | null =
    c.fuelMl <= VEHICLE_RULES[kind].tankMl * 0.25 && c.fuelReserve > 0
      ? 'fuel'
      : c.sinceMaintenanceKm >= 8 && c.maintenanceReserve > 0
        ? 'garage'
        : c.courses >= (c.checks + 1) * 3
          ? 'police'
          : null
  const lot = service ? landmarks().find((p) => p.service === service) : null
  return lot && service ? { service, name: lot.name!, x: lot.door.x, y: lot.door.y } : null
}
/** Stop costs were already provisioned on receipts: never debit the wallet a second time. */
export function finishVehicleStop(
  s: CityLife,
  kind: VehicleKind,
  service: ServiceStopKind,
): CityLife {
  const c = vehicleCare(s, kind)
  let next = { ...c }
  let msg = ''
  if (service === 'fuel') {
    const ml = Math.min(
      VEHICLE_RULES[kind].tankMl - c.fuelMl,
      Math.floor((c.fuelReserve * 1000) / GAME_FUEL_PER_LITRE),
    )
    const bill = Math.min(c.fuelReserve, Math.ceil((ml * GAME_FUEL_PER_LITRE) / 1000))
    next = {
      ...c,
      fuelMl: c.fuelMl + ml,
      fuelReserve: c.fuelReserve - bill,
      refills: c.refills + 1,
    }
    msg = `Plein automatique : ${(ml / 1000).toFixed(2)} L · ${bill} FCFA réglés avec ta provision essence. Aucun second prélèvement.`
  } else if (service === 'garage') {
    next = { ...c, sinceMaintenanceKm: 0, maintenanceReserve: 0, services: c.services + 1 }
    msg = `Freins, pneus et vidange vérifiés : ${c.maintenanceReserve} FCFA réglés avec la réserve d’entretien. Bonne route, patron !`
  } else {
    next = { ...c, checks: c.checks + 1 }
    msg = `Contrôle terminé : papiers de jeu et ${kind === 'moto' ? 'casque' : 'ceinture'} vérifiés. Aucun frais. « Doucement sur la route, on t’attend à la maison ! »`
  }
  return {
    ...s,
    fleet: { ...s.fleet, [kind]: next },
    life: { ...s.life, lastEvent: msg, events: [msg, ...s.life.events].slice(0, 8) },
  }
}
export function manualVehicleQuote(
  s: CityLife,
  kind: VehicleKind,
  service: 'fuel' | 'garage',
): number {
  const c = vehicleCare(s, kind)
  return service === 'fuel'
    ? Math.max(
        0,
        Math.ceil(((VEHICLE_RULES[kind].tankMl - c.fuelMl) * GAME_FUEL_PER_LITRE) / 1000) -
          c.fuelReserve,
      )
    : Math.max(
        0,
        Math.ceil(c.sinceMaintenanceKm * VEHICLE_RULES[kind].maintenancePerKm) -
          c.maintenanceReserve,
      )
}
export function manualVehicleService(s: CityLife, service: 'fuel' | 'garage'): CityLife {
  const kind = s.duty
  if (!kind)
    return {
      ...s,
      life: { ...s.life, lastEvent: 'Choisis d’abord ton taxi ou ton zémidjan dans Métiers.' },
    }
  const price = manualVehicleQuote(s, kind, service)
  if (s.life.wallet < price)
    return {
      ...s,
      life: {
        ...s.life,
        lastEvent:
          'Solde insuffisant pour ce service. Les provisions des prochaines courses financeront l’arrêt automatique.',
      },
    }
  const c = vehicleCare(s, kind)
  const funded = {
    ...c,
    ...(service === 'fuel'
      ? { fuelReserve: c.fuelReserve + price }
      : { maintenanceReserve: c.maintenanceReserve + price }),
  }
  return finishVehicleStop(
    {
      ...s,
      fleet: { ...s.fleet, [kind]: funded },
      life: { ...s.life, wallet: s.life.wallet - price, spent: s.life.spent + price },
    },
    kind,
    service,
  )
}
