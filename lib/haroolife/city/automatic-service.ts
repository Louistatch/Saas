import { type Fare, type VehicleKind, canDrop, drivingRoute, planServiceFare } from './fares'
import type { PlayerController } from './player'
import type { Lot } from './world'

export type ServiceCustomer = { name: string; x: number; y: number }
export type ServiceSnapshot = {
  phase: 'off' | 'searching' | 'pickup' | 'trip' | 'paid'
  customer: ServiceCustomer | null
  fare: Fare | null
  stopRequested: boolean
  completed: number
  earned: number
}
export type ServiceEvent =
  | { type: 'paid'; fare: Fare; kind: VehicleKind }
  | { type: 'notice'; message: string }

/** The entire service runs without React, buttons, timers paying money, or player input. */
export class AutomaticDrivingService {
  private state: ServiceSnapshot = {
    phase: 'off',
    customer: null,
    fare: null,
    stopRequested: false,
    completed: 0,
    earned: 0,
  }
  private kind: VehicleKind = 'moto'
  private time = 0
  private readyAt = 0
  constructor(
    private controller: PlayerController,
    private env: {
      drivable: (x: number, y: number) => boolean
      places: () => Lot[]
      random: () => number
    },
  ) {}
  snapshot(): ServiceSnapshot {
    return { ...this.state }
  }
  start(kind: VehicleKind): void {
    this.kind = kind
    this.controller.automaticDriving = true
    this.state = {
      phase: 'searching',
      customer: null,
      fare: null,
      stopRequested: false,
      completed: 0,
      earned: 0,
    }
    this.readyAt = this.time + 1
  }
  offer(customer: ServiceCustomer | null): void {
    if (this.state.phase === 'searching') this.state.customer = customer
  }
  stop(): void {
    this.controller.stopAutomaticDriving()
    this.state = { ...this.state, phase: 'off', customer: null, fare: null, stopRequested: false }
  }
  requestStop(): void {
    if (this.state.phase === 'trip') this.state.stopRequested = true
    else {
      this.stop()
      this.controller.exitVehicle()
    }
  }
  update(seconds: number): ServiceEvent[] {
    this.time += Math.min(seconds, 0.5)
    if (this.state.phase === 'off') return []
    const v = this.controller.vehicle
    if (!this.controller.driving || !v) {
      this.stop()
      return []
    }
    const state = this.state
    if (state.phase === 'paid' && this.time >= this.readyAt)
      this.state = { ...state, phase: 'searching', customer: null }
    if (this.state.phase === 'searching' && this.time >= this.readyAt && this.state.customer) {
      const route = drivingRoute(v, this.state.customer, this.env.drivable)
      if (route && this.controller.driveAutomatically(route.map((p) => ({ x: p.x, z: p.y }))))
        this.state = { ...this.state, phase: 'pickup' }
      else this.state.customer = null
      return []
    }
    if (this.controller.drivingRouteState === 'blocked') {
      this.controller.stopAutomaticDriving()
      this.controller.automaticDriving = true
      this.state = { ...state, phase: 'searching', fare: null, customer: null }
      this.readyAt = this.time + 2
      return [{ type: 'notice', message: 'Route coupée : recherche d’une autre course.' }]
    }
    if (this.controller.drivingRouteState !== 'arrived') return []
    if (state.phase === 'pickup' && state.customer) {
      const plan = planServiceFare(
        state.customer.name,
        v,
        this.kind,
        this.env.random,
        this.env.drivable,
        this.env.places(),
      )
      if (
        !plan ||
        !this.controller.driveAutomatically(plan.route.map((p) => ({ x: p.x, z: p.y })))
      ) {
        this.state = { ...state, phase: 'searching', fare: null, customer: null }
        this.readyAt = this.time + 2
        return [
          {
            type: 'notice',
            message: 'Aucune destination accessible : recherche d’un autre client.',
          },
        ]
      }
      this.state = { ...state, phase: 'trip', fare: plan.fare }
      return [
        {
          type: 'notice',
          message: `${plan.fare.passenger} monte. Trajet automatique vers ${plan.fare.to.name}.`,
        },
      ]
    }
    if (state.phase === 'trip' && state.fare && canDrop(state.fare, v, v.speed)) {
      const fare = state.fare
      // Change phase before emitting the payment: another tick cannot pay this fare again.
      this.state = {
        ...state,
        phase: 'paid',
        fare: null,
        customer: null,
        completed: state.completed + 1,
        earned: state.earned + fare.price,
      }
      this.readyAt = this.time + 2
      if (state.stopRequested) {
        this.stop()
        this.controller.exitVehicle()
      }
      return [{ type: 'paid', fare, kind: this.kind }]
    }
    return []
  }
}
