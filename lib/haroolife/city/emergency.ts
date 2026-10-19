/** Fictional ambulance dispatch. No real emergency call or payment leaves the game. */
import type { CollisionBody } from './collisions'
import { drivingRoute } from './fares'
import { type CityLife, enterLot } from './life'
import { type LocalityId, isLocalityId } from './locality'
import { type PavementGraph, pickupRoad } from './pedestrians'
import { PlayerController } from './player'
import { WORLD_H, WORLD_W, isCityRoad, isDriveway, landmarks, lotById } from './world'

export type EmergencyPhase = 'dispatch' | 'boarding' | 'transport'
export interface EmergencyOrder {
  id: string
  locality: LocalityId
  hospital: string
  patient: { x: number; z: number }
  pickup: { x: number; z: number }
  depot: { x: number; z: number }
  phase: EmergencyPhase
}
export interface EmergencyState {
  completed: number
  treatedDay: number
  active: EmergencyOrder | null
}
export type EmergencyEvent = {
  id: string
  type: 'boarding' | 'transport' | 'arrived' | 'failed'
  message?: string
}
export const emergencyOf = (s: CityLife): EmergencyState =>
  s.emergency ?? { completed: 0, treatedDay: -1, active: null }
export const emergencyRoad = (x: number, z: number) => isCityRoad(x, z) || isDriveway(x, z)
const note = (s: CityLife, message: string): CityLife => ({
  ...s,
  life: { ...s.life, lastEvent: message, events: [message, ...s.life.events].slice(0, 8) },
})
const validPoint = (p: unknown): p is { x: number; z: number } => {
  if (!p || typeof p !== 'object') return false
  const q = p as { x?: number; z?: number }
  return (
    typeof q.x === 'number' &&
    Number.isFinite(q.x) &&
    q.x >= 0 &&
    q.x < WORLD_W &&
    typeof q.z === 'number' &&
    Number.isFinite(q.z) &&
    q.z >= 0 &&
    q.z < WORLD_H
  )
}

export function callAmbulance(
  s: CityLife,
  patient: { x: number; z: number },
  id: string,
): CityLife {
  const old = emergencyOf(s)
  if (old.active) return note(s, 'Une ambulance est déjà en route. Suis l’intervention en cours.')
  if (old.treatedDay === s.life.day)
    return note(
      s,
      'Tu as déjà reçu les premiers soins aujourd’hui. La consultation reste disponible à l’hôpital.',
    )
  if (s.insideLot || s.life.inside)
    return note(s, 'Sors du bâtiment pour indiquer un point de prise en charge dans la rue.')
  if (s.duty || s.employment?.shift)
    return note(
      s,
      'Termine ton service professionnel avant de demander cette prise en charge fictive.',
    )
  if (!validPoint(patient) || !/^[\w-]{1,64}$/.test(id)) return s
  const pickup = pickupRoad(patient, emergencyRoad)
  if (!pickup)
    return note(s, 'Rejoins un trottoir près d’une route pour que l’ambulance puisse venir.')
  const hospitals = landmarks()
    .filter((l) => l.type === 'hospital')
    .sort(
      (a, b) =>
        Math.hypot(a.door.x - pickup.x, a.door.y - pickup.z) -
        Math.hypot(b.door.x - pickup.x, b.door.y - pickup.z),
    )
  for (const hospital of hospitals) {
    const depot = pickupRoad({ x: hospital.door.x, z: hospital.door.y }, emergencyRoad)
    if (!depot || !drivingRoute(depot, { x: pickup.x, y: pickup.z }, emergencyRoad)) continue
    return note(
      {
        ...s,
        route: [],
        activity: null,
        meal: undefined,
        emergency: {
          ...old,
          active: {
            id,
            locality: s.locality,
            hospital: hospital.id,
            patient: { ...patient },
            pickup,
            depot,
            phase: 'dispatch',
          },
        },
      },
      `Ambulance envoyée depuis ${hospital.name}. Attends ici : transport et premiers soins gratuits dans le jeu.`,
    )
  }
  return note(
    s,
    'Aucun trajet routier ne relie ce point à un hôpital. Rejoins une avenue et réessaie.',
  )
}

/** Only ordered, matching mission events may deliver care; duplicate arrivals never heal twice. */
export function emergencyEvent(s: CityLife, event: EmergencyEvent): CityLife {
  const old = emergencyOf(s)
  const order = old.active
  if (!order || order.id !== event.id || order.locality !== s.locality) return s
  if (event.type === 'failed')
    return note(
      { ...s, emergency: { ...old, active: null } },
      event.message ?? 'Intervention interrompue. Tu peux rappeler gratuitement.',
    )
  if (event.type === 'boarding' && order.phase === 'dispatch')
    return note(
      { ...s, emergency: { ...old, active: { ...order, phase: 'boarding' } } },
      'L’ambulance est arrivée. L’équipe prépare la prise en charge… Chef, on soigne avant le gbairai !',
    )
  if (event.type === 'transport' && order.phase === 'boarding')
    return note(
      { ...s, emergency: { ...old, active: { ...order, phase: 'transport' } } },
      'Tu es à bord. L’ambulance rejoint automatiquement l’hôpital, en respectant la circulation.',
    )
  const hospital = lotById(order.hospital)
  if (event.type !== 'arrived' || order.phase !== 'transport' || hospital?.type !== 'hospital')
    return s
  const recovered: CityLife = {
    ...s,
    at: { ...hospital.door },
    pose: undefined,
    target: hospital.id,
    route: [],
    emergency: { completed: old.completed + 1, treatedDay: s.life.day, active: null },
    life: {
      ...s.life,
      inside: null,
      needs: {
        ...s.life.needs,
        energy: Math.min(100, s.life.needs.energy + 30),
        hygiene: Math.min(100, s.life.needs.hygiene + 20),
      },
    },
  }
  return note(
    enterLot(recovered, hospital),
    `Arrivée à ${hospital.name} : premiers soins terminés, énergie +30 et hygiène +20. Aucun FCFA prélevé.`,
  )
}
export function cancelAmbulance(s: CityLife): CityLife {
  const old = emergencyOf(s)
  return old.active
    ? note(
        { ...s, emergency: { ...old, active: null } },
        'Prise en charge annulée sans frais. Tu peux rappeler depuis un trottoir.',
      )
    : s
}

export function decodeEmergency(value: unknown, locality?: LocalityId): EmergencyState {
  const v = value && typeof value === 'object' ? (value as Partial<EmergencyState>) : {}
  const n = (x: unknown, fallback: number) =>
    typeof x === 'number' && Number.isSafeInteger(x) && x >= 0 ? Math.min(x, 1_000_000) : fallback
  const a = v.active
  // An interrupted journey restarts at dispatch, never completes or grants offline care.
  const active =
    a &&
    typeof a.id === 'string' &&
    /^[\w-]{1,64}$/.test(a.id) &&
    isLocalityId(a.locality) &&
    (!locality || a.locality === locality) &&
    typeof a.hospital === 'string' &&
    a.hospital.length < 160 &&
    validPoint(a.patient) &&
    validPoint(a.pickup) &&
    validPoint(a.depot)
      ? {
          id: a.id,
          locality: a.locality,
          hospital: a.hospital,
          patient: { ...a.patient },
          pickup: { ...a.pickup },
          depot: { ...a.depot },
          phase: 'dispatch' as const,
        }
      : null
  return { completed: n(v.completed, 0), treatedDay: n(v.treatedDay, -1), active }
}

/** One road controller, stepped by the existing street frame. No independent render or timer. */
export class AmbulanceMission {
  readonly driver: PlayerController
  phase: EmergencyPhase = 'dispatch'
  private boarding = 0
  private stuck = 0
  private readonly lastPosition = { x: Number.NaN, z: Number.NaN }
  private finished = false
  private readonly collision: CollisionBody = {
    x: 0,
    z: 0,
    heading: 0,
    halfWidth: 0.24,
    halfLength: 0.7,
  }
  private readonly toPickup: { x: number; z: number }[]
  constructor(
    readonly order: EmergencyOrder,
    private readonly road = emergencyRoad,
  ) {
    this.driver = new PlayerController(
      { walkable: road, drivable: road },
      { x: order.depot.x, y: order.depot.z },
    )
    this.driver.vehicle = { ...order.depot, heading: 0, speed: 0 }
    this.driver.vehicleDimensions = { halfWidth: 0.24, halfLength: 0.7 }
    this.driver.driving = true
    const route = drivingRoute(order.depot, { x: order.pickup.x, y: order.pickup.z }, road)
    this.toPickup = route?.map((p) => ({ x: p.x, z: p.y })) ?? []
    this.driver.driveAutomatically(this.toPickup)
    // Reuse the world's signal graph when attached by StreetWorld, not one BFS per ambulance.
  }
  get position() {
    return this.driver.shownVehicle ?? this.driver.vehicle ?? this.order.depot
  }
  get heading() {
    return this.driver.vehicle?.heading ?? 0
  }
  get approachSeconds() {
    return Math.max(
      2,
      (Math.hypot(this.position.x - this.order.patient.x, this.position.z - this.order.patient.z) *
        5) /
        1.2,
    )
  }
  get medicProgress() {
    return Math.min(1, this.boarding / this.approachSeconds)
  }
  get body(): CollisionBody {
    this.collision.x = this.position.x
    this.collision.z = this.position.z
    this.collision.heading = this.heading
    return this.collision
  }

  update(
    dt: number,
    obstacles: CollisionBody[],
    seconds: number,
    pavements: PavementGraph | null,
    repaired: boolean,
  ): EmergencyEvent | null {
    if (this.finished) return null
    if (!this.toPickup.length)
      return this.fail('Le trajet de l’ambulance est indisponible. Rejoins une avenue et rappelle.')
    const d = this.driver
    d.obstacles = obstacles
    d.pavements = pavements
    d.repairedSignals = repaired
    d.streetSeconds = seconds
    if (this.phase === 'boarding') {
      this.boarding += dt
      if (this.boarding < this.approachSeconds + 2) return null
      const route = drivingRoute(
        d.vehicle ?? this.position,
        { x: this.order.depot.x, y: this.order.depot.z },
        this.road,
      )
      if (!route || !d.driveAutomatically(route.map((p) => ({ x: p.x, z: p.y }))))
        return this.fail(
          'Route de l’hôpital inaccessible. La prise en charge peut être relancée sans frais.',
        )
      this.phase = 'transport'
      return { id: this.order.id, type: 'transport' }
    }
    d.update(dt)
    d.drain()
    const position = this.position
    // Progress is actual movement, not distance to the destination: a necessary detour
    // may temporarily take the ambulance farther away without being a blocked route.
    if (Math.hypot(position.x - this.lastPosition.x, position.z - this.lastPosition.z) > 0.001)
      this.stuck = 0
    else this.stuck += dt
    this.lastPosition.x = position.x
    this.lastPosition.z = position.z
    if (this.stuck > 75 || d.drivingRouteState === 'blocked')
      return this.fail(
        'L’ambulance est bloquée. Intervention arrêtée sans frais : tu peux rappeler.',
      )
    if (
      this.phase === 'dispatch' &&
      Math.hypot(this.position.x - this.order.patient.x, this.position.z - this.order.patient.z) <
        1.8
    ) {
      d.stopAutomaticDriving()
      d.automaticDriving = true
      this.phase = 'boarding'
      this.stuck = 0
      return { id: this.order.id, type: 'boarding' }
    }
    if (this.phase === 'transport' && d.drivingRouteState === 'arrived') {
      this.finished = true
      return { id: this.order.id, type: 'arrived' }
    }
    return null
  }
  private fail(message: string): EmergencyEvent {
    this.finished = true
    this.driver.stopAutomaticDriving()
    return { id: this.order.id, type: 'failed', message }
  }
}
