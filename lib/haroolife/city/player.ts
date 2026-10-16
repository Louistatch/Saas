import { type CollisionBody, touchesBody, bodiesOverlap } from './collisions'
/**
 * Continuous player controller for the single 3D world: positions in floating cell
 * units, analogue input, acceleration and braking, capsule-against-cells collision,
 * smooth turning, route following, a drivable vehicle and a third-person camera rig.
 *
 * Pure TypeScript, no React and no PlayCanvas: the renderer steps it once per frame
 * (fixed 60 Hz sub-steps, clamped delta) and reads `pos`, `heading`, `mode` and the
 * camera. The React layer only receives low-rate events (cell changes, arrivals,
 * vehicle changes) so no state update happens per frame.
 *
 * Coordinates: x grows east, z grows south, one unit = one world cell (the renderer's
 * `worldPos(x, y)` maps cell (x, y) to its centre; cell = round(p)).
 */

export interface Vec2 {
  x: number
  z: number
}
export interface InputState {
  /** Right (+x) and forward (+y) on screen, each −1..1, magnitude ≤ 1. */
  x: number
  y: number
  run: boolean
}
export type Mode = 'idle' | 'walk' | 'run' | 'inside' | 'drive' | 'travel'
export type PlayerEvent =
  | { type: 'cell'; x: number; y: number }
  | { type: 'reached'; x: number; y: number }
  | { type: 'blocked' }
  | { type: 'mode'; mode: Mode }
  | { type: 'vehicle'; state: 'entered' | 'left' }

export interface VehicleState {
  x: number
  z: number
  /** Degrees, same convention as the avatar (0 = facing +z/south, 90 = +x/east). */
  heading: number
  speed: number
}
export interface CameraRig {
  tx: number
  tz: number
  distance: number
  angle: number
  /** Follow the player (true) or stay where the player panned it (false). */
  follow: boolean
}

export interface PlayerConfig {
  walkSpeed: number
  runSpeed: number
  accel: number
  decel: number
  /** Degrees per second. */
  turnRate: number
  radius: number
  /** Analogue magnitude above which the avatar runs. */
  runThreshold: number
  vehicle: {
    maxSpeed: number
    reverseSpeed: number
    accel: number
    brake: number
    friction: number
    /** Degrees per second at full steering and cruising speed. */
    steerRate: number
    enterRadius: number
    exitSpeed: number
  }
}
/**
 * Speeds in cells/s (× CELL = render units/s). V3: chosen with the figure size (STREET_SCALE,
 * about 1.2 units tall) so the walk and run clips play near their natural rate (≈ 2× at
 * most) instead of gliding: the former 2.6 / 5 cells/s were 4–7× faster than the feet.
 */
export const DEFAULT_CONFIG: PlayerConfig = {
  walkSpeed: 0.9,
  runSpeed: 2,
  accel: 16,
  decel: 24,
  turnRate: 600,
  radius: 0.28,
  runThreshold: 0.92,
  vehicle: {
    maxSpeed: 9,
    reverseSpeed: 3,
    accel: 6,
    brake: 14,
    friction: 4,
    steerRate: 130,
    enterRadius: 1.8,
    exitSpeed: 0.6,
  },
}

/** World queries the controller needs; integers in cell units. */
export interface WorldQuery {
  /** Where a pedestrian may stand. */
  walkable(x: number, y: number): boolean
  /** Where a vehicle may drive. */
  drivable(x: number, y: number): boolean
}

const STEP = 1 / 60
const MAX_DT = 0.25 // a 4 FPS frame still advances the world in real time, without a spiral of death
const DEG = 180 / Math.PI
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))
/** Shortest signed difference between two angles in degrees. */
export function angleDelta(from: number, to: number): number {
  let d = (to - from) % 360
  if (d > 180) d -= 360
  if (d < -180) d += 360
  return d
}
/** Normalises a raw joystick vector: dead zone, unit clamp, run intensity. */
export function joystickVector(
  dx: number,
  dy: number,
  radius: number,
  deadZone = 0.12,
): { x: number; y: number; magnitude: number } {
  const mx = dx / radius
  const my = -dy / radius // screen y grows downwards; forward is up
  const len = Math.hypot(mx, my)
  if (len < deadZone) return { x: 0, y: 0, magnitude: 0 }
  const k = Math.min(1, len) / len
  // Re-scale so the usable range after the dead zone still spans 0..1.
  const m = Math.min(1, (len - deadZone) / (1 - deadZone))
  return { x: (mx * k * m) / Math.min(1, len), y: (my * k * m) / Math.min(1, len), magnitude: m }
}
/** Camera-relative basis on the ground: forward and right for a camera azimuth in degrees. */
export function cameraBasis(angleDeg: number): { forward: Vec2; right: Vec2 } {
  const a = angleDeg / DEG
  return {
    forward: { x: -Math.sin(a), z: -Math.cos(a) },
    right: { x: Math.cos(a), z: -Math.sin(a) },
  }
}

export class PlayerController {
  pos: Vec2
  /** Visible moving traffic and physical street objects, refreshed by the street renderer. */
  obstacles: CollisionBody[] = []
  vehicleDimensions = { halfWidth: 0.27, halfLength: 0.67 }
  /** Degrees around the vertical axis (0 = facing +z). */
  heading = 0
  vel: Vec2 = { x: 0, z: 0 }
  mode: Mode = 'idle'
  input: InputState = { x: 0, y: 0, run: false }
  /** Cells still to visit when auto-walking (centre of each). */
  route: Vec2[] = []
  vehicle: VehicleState | null = null
  /** Which vehicle the player drives (null on foot). */
  driving = false
  automaticDriving = false
  turning = false
  /** Physical street lane used by the service, also drawn by the renderer. */
  get shownVehicle() {
    const v = this.vehicle
    if (!v) return null
    const lane = this.automaticDriving && this.driving ? 0.3 : 0
    const angle = v.heading / DEG
    return { ...v, x: v.x + Math.cos(angle) * lane, z: v.z - Math.sin(angle) * lane }
  }
  private vehicleBlocked(x: number, z: number, heading = this.vehicle?.heading ?? 0) {
    if (!this.vehicle) return false
    const lane = this.automaticDriving && this.driving ? 0.3 : 0
    const angle = heading / DEG
    const body = {
      x: x + Math.cos(angle) * lane,
      z: z - Math.sin(angle) * lane,
      heading,
      ...this.vehicleDimensions,
    }
    return this.obstacles.some((o) => bodiesOverlap(body, o, 0.015))
  }
  private turnClear(x: number, z: number, heading: number, wanted: number) {
    const delta = angleDelta(heading, wanted)
    const steps = Math.max(1, Math.ceil(Math.abs(delta) / 10))
    for (let i = 0; i <= steps; i++)
      if (this.vehicleBlocked(x, z, heading + (delta * i) / steps)) return false
    return true
  }
  private drivingRoute: Vec2[] = []
  private trafficWait = 0
  private automaticGoal: Vec2 | null = null
  drivingRouteState: 'idle' | 'moving' | 'arrived' | 'blocked' = 'idle'
  camera: CameraRig
  readonly config: PlayerConfig
  private acc = 0
  private lastCell: { x: number; y: number }
  private events: PlayerEvent[] = []
  private blockedSince = 0
  constructor(
    private world: WorldQuery,
    start: { x: number; y: number },
    camera: Partial<CameraRig> = {},
    config: PlayerConfig = DEFAULT_CONFIG,
  ) {
    this.config = config
    this.pos = { x: start.x, z: start.y }
    this.lastCell = { x: start.x, y: start.y }
    this.camera = {
      tx: start.x,
      tz: start.y,
      distance: FOLLOW_DISTANCE,
      angle: 35,
      follow: true,
      ...camera,
    }
  }

  /** The integer cell the avatar (or the vehicle when driving) stands on. */
  get cell(): { x: number; y: number } {
    const p = this.driving && this.vehicle ? this.vehicle : this.pos
    return { x: Math.round(p.x), y: Math.round(p.z) }
  }
  get speed(): number {
    return Math.hypot(this.vel.x, this.vel.z)
  }
  /** Events since the last drain, oldest first. */
  drain(): PlayerEvent[] {
    const out = this.events
    this.events = []
    return out
  }
  /** Places the avatar on a cell without animation (loading, leaving a building, travel). */
  teleport(cell: { x: number; y: number }, heading?: number) {
    this.pos = { x: cell.x, z: cell.y }
    this.vel = { x: 0, z: 0 }
    this.route = []
    this.lastCell = { x: cell.x, y: cell.y }
    if (heading !== undefined) this.heading = heading
    this.camera.tx = cell.x
    this.camera.tz = cell.y
  }
  setInside(inside: boolean) {
    const mode: Mode = inside ? 'inside' : 'idle'
    if (inside) {
      this.vel = { x: 0, z: 0 }
      this.route = []
    }
    this.setMode(mode)
  }
  setTravelling(on: boolean) {
    this.setMode(on ? 'travel' : 'idle')
  }
  private setMode(m: Mode) {
    if (this.mode === m) return
    this.mode = m
    this.events.push({ type: 'mode', mode: m })
  }

  /** Advances the simulation by a frame; sub-stepped at 60 Hz, delta clamped at 50 ms. */
  update(dt: number) {
    if (!Number.isFinite(dt) || dt <= 0) return
    this.acc += Math.min(dt, MAX_DT)
    while (this.acc >= STEP) {
      this.acc -= STEP
      if (this.driving && this.vehicle) this.stepVehicle(STEP)
      else if (this.mode !== 'inside' && this.mode !== 'travel') this.stepWalk(STEP)
    }
    this.stepCamera(Math.min(dt, MAX_DT))
    const c = this.cell
    if (c.x !== this.lastCell.x || c.y !== this.lastCell.y) {
      this.lastCell = c
      this.events.push({ type: 'cell', x: c.x, y: c.y })
    }
  }

  private stepWalk(dt: number) {
    const cfg = this.config
    const { forward, right } = cameraBasis(this.camera.angle)
    let want: Vec2 = { x: 0, z: 0 }
    let running = false
    const mag = Math.hypot(this.input.x, this.input.y)
    if (mag > 0) {
      // Joystick wins over an automatic route.
      if (this.route.length) this.route = []
      const m = Math.min(1, mag)
      running = this.input.run || m >= cfg.runThreshold
      const speed = (running ? cfg.runSpeed : cfg.walkSpeed) * (running ? 1 : Math.max(0.35, m))
      const dx = (forward.x * this.input.y + right.x * this.input.x) / m
      const dz = (forward.z * this.input.y + right.z * this.input.x) / m
      want = { x: dx * speed, z: dz * speed }
    } else if (this.route.length) {
      const next = this.route[0]
      const dx = next.x - this.pos.x
      const dz = next.z - this.pos.z
      const d = Math.hypot(dx, dz)
      if (d < 0.08) {
        this.pos = { x: next.x, z: next.z }
        this.route.shift()
        this.events.push({ type: 'reached', x: next.x, y: next.z })
        if (!this.route.length) this.vel = { x: 0, z: 0 }
      } else {
        // Guided routes jog (run pace): long enough trips stay short, feet still match.
        const speed = Math.min(cfg.runSpeed, d / dt)
        want = { x: (dx / d) * speed, z: (dz / d) * speed }
      }
    }
    // Accelerate towards the wanted velocity, brake harder than we accelerate.
    const rate = Math.hypot(want.x, want.z) > this.speed ? cfg.accel : cfg.decel
    this.vel.x = approach(this.vel.x, want.x, rate * dt)
    this.vel.z = approach(this.vel.z, want.z, rate * dt)
    if (Math.abs(this.vel.x) < 1e-3) this.vel.x = 0
    if (Math.abs(this.vel.z) < 1e-3) this.vel.z = 0
    // Turn the body towards the motion (or the stick when pushing into a wall).
    const face = this.speed > 0.05 ? this.vel : want
    if (Math.hypot(face.x, face.z) > 0.05) {
      const target = Math.atan2(face.x, face.z) * DEG
      const delta = angleDelta(this.heading, target)
      const maxTurn = cfg.turnRate * dt
      this.heading = (this.heading + clamp(delta, -maxTurn, maxTurn) + 360) % 360
    }
    // Move with sliding collision, one axis at a time.
    const moved = this.slide(this.vel.x * dt, this.vel.z * dt)
    if (!moved && Math.hypot(want.x, want.z) > 0) {
      this.blockedSince += dt
      if (this.blockedSince > 0.25) {
        this.blockedSince = 0
        this.events.push({ type: 'blocked' })
      }
    } else this.blockedSince = 0
    const s = this.speed
    // Standing still, or pushing into a wall, reads as idle; otherwise walk or run.
    this.setMode(!moved || s < 0.05 ? 'idle' : running || s > cfg.walkSpeed + 0.3 ? 'run' : 'walk')
  }

  /** Tries to move by (dx, dz); each axis is blocked independently. True if any axis moved. */
  private slide(dx: number, dz: number): boolean {
    let moved = false
    if (dx !== 0) {
      const nx = this.pos.x + dx
      if (this.fits(nx, this.pos.z)) {
        this.pos.x = nx
        moved = true
      } else this.vel.x = 0
    }
    if (dz !== 0) {
      const nz = this.pos.z + dz
      if (this.fits(this.pos.x, nz)) {
        this.pos.z = nz
        moved = true
      } else this.vel.z = 0
    }
    return moved
  }
  /** The capsule's footprint (four corners) stands on walkable cells. */
  private fits(x: number, z: number): boolean {
    const r = this.config.radius
    if (this.obstacles.some((body) => touchesBody(x, z, r, body))) return false
    if (
      !this.driving &&
      this.vehicle &&
      touchesBody(x, z, r, { ...this.vehicle, ...this.vehicleDimensions })
    )
      return false
    for (const [ox, oz] of [
      [-r, -r],
      [r, -r],
      [-r, r],
      [r, r],
    ])
      if (!this.world.walkable(Math.round(x + ox), Math.round(z + oz))) return false
    return true
  }

  /* ------------------------------------------------------------------ vehicle */
  /** Whether the avatar stands close enough to the vehicle to get in. */
  canEnterVehicle(): boolean {
    if (!this.vehicle || this.driving || this.mode === 'inside') return false
    return (
      Math.hypot(this.vehicle.x - this.pos.x, this.vehicle.z - this.pos.z) <=
      this.config.vehicle.enterRadius
    )
  }
  enterVehicle(): boolean {
    if (!this.canEnterVehicle() || !this.vehicle) return false
    this.driving = true
    this.vel = { x: 0, z: 0 }
    this.route = []
    this.vehicle.speed = 0
    this.setMode('drive')
    this.events.push({ type: 'vehicle', state: 'entered' })
    return true
  }
  canExitVehicle(): boolean {
    return (
      this.driving && !!this.vehicle && Math.abs(this.vehicle.speed) < this.config.vehicle.exitSpeed
    )
  }
  /** Steps out on the kerb side (right of the car), or where the car stands. */
  exitVehicle(): boolean {
    if (!this.canExitVehicle() || !this.vehicle) return false
    const v = this.vehicle
    v.speed = 0
    const a = (v.heading + 90) / DEG
    const candidates: Vec2[] = [
      { x: v.x + Math.sin(a) * 1.1, z: v.z + Math.cos(a) * 1.1 },
      { x: v.x - Math.sin(a) * 1.1, z: v.z - Math.cos(a) * 1.1 },
      { x: v.x, z: v.z },
    ]
    const spot = candidates.find((c) => this.fits(c.x, c.z)) ?? { x: v.x, z: v.z }
    this.driving = false
    this.stopAutomaticDriving()
    this.pos = { ...spot }
    this.heading = v.heading
    this.vel = { x: 0, z: 0 }
    this.setMode('idle')
    this.events.push({ type: 'vehicle', state: 'left' })
    return true
  }

  /** A road route is separate from the avatar's walking route. Inputs cannot override it. */
  driveAutomatically(route: readonly Vec2[]): boolean {
    if (!this.driving || !this.vehicle || !route.length) return false
    let previous = { x: Math.round(this.vehicle.x), z: Math.round(this.vehicle.z) }
    for (const point of route) {
      if (
        !this.world.drivable(point.x, point.z) ||
        Math.abs(point.x - previous.x) + Math.abs(point.z - previous.z) > 1
      )
        return false
      previous = point
    }
    this.automaticDriving = true
    this.drivingRoute = route.map((p) => ({ ...p }))
    this.automaticGoal = { ...route[route.length - 1] }
    this.drivingRouteState = 'moving'
    this.trafficWait = 0
    this.vehicle.speed = 0
    return true
  }

  stopAutomaticDriving(): void {
    this.turning = false
    this.automaticDriving = false
    this.drivingRoute = []
    this.drivingRouteState = 'idle'
    this.automaticGoal = null
    if (this.vehicle) this.vehicle.speed = 0
  }

  /** A persistent traffic jam changes the route, never the position or the fare payment. */
  private avoidTraffic(): void {
    const v = this.vehicle
    const end = this.automaticGoal
    if (!v || !end) return
    const centre = { x: Math.round(v.x), z: Math.round(v.z) }
    const angle = v.heading / DEG
    const retreat = {
      x: Math.round(v.x - Math.sin(angle) * 1.5),
      z: Math.round(v.z - Math.cos(angle) * 1.5),
    }
    const close = this.obstacles.some((o) => Math.hypot(o.x - v.x, o.z - v.z) < 2)
    const candidates = [
      centre,
      { x: centre.x + 1, z: centre.z },
      { x: centre.x - 1, z: centre.z },
      { x: centre.x, z: centre.z + 1 },
      { x: centre.x, z: centre.z - 1 },
    ]
      .filter((p) => this.world.drivable(p.x, p.z) && !this.vehicleBlocked(p.x, p.z))
      .sort((a, b) => Math.hypot(a.x - v.x, a.z - v.z) - Math.hypot(b.x - v.x, b.z - v.z))[0]
    const start =
      close &&
      this.world.drivable(retreat.x, retreat.z) &&
      !this.vehicleBlocked(retreat.x, retreat.z)
        ? retreat
        : candidates
    if (!start) return
    // Finish at a free kerb next to a crowded stop when the precise road cell is occupied.
    const goals = [
      end,
      { x: end.x + 1, z: end.z },
      { x: end.x - 1, z: end.z },
      { x: end.x, z: end.z + 1 },
      { x: end.x, z: end.z - 1 },
    ].filter((p) => this.world.drivable(p.x, p.z) && !this.vehicleBlocked(p.x, p.z))
    if (!goals.length) return
    const key = (p: Vec2) => `${p.x}:${p.z}`
    const queue = [start]
    const seen = new Set([key(start)])
    const previous = new Map<string, Vec2>()
    for (let i = 0; i < queue.length && i < 5000; i++) {
      const at = queue[i]
      if (i && goals.some((p) => p.x === at.x && p.z === at.z)) {
        const route: Vec2[] = []
        let point = at
        while (key(point) !== key(start)) {
          route.push(point)
          const parent = previous.get(key(point))
          if (!parent) return
          point = parent
        }
        route.reverse()
        // First return to the centre of this road cell, then follow adjacent cells only.
        if (Math.hypot(v.x - start.x, v.z - start.z) > 0.02) route.unshift(start)
        this.drivingRoute = route
        return
      }
      for (const [dx, dz] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const p = { x: at.x + dx, z: at.z + dz }
        const k = key(p)
        if (seen.has(k) || !this.world.drivable(p.x, p.z) || this.vehicleBlocked(p.x, p.z)) continue
        seen.add(k)
        previous.set(k, at)
        queue.push(p)
      }
    }
  }

  private stepAutomaticVehicle(dt: number): void {
    const v = this.vehicle
    const next = this.drivingRoute[0]
    if (!v || !next) return
    if (!this.world.drivable(next.x, next.z)) {
      this.drivingRoute = []
      this.drivingRouteState = 'blocked'
      v.speed = 0
      return
    }
    const dx = next.x - v.x
    const dz = next.z - v.z
    const distance = Math.hypot(dx, dz)
    if (distance < 0.015) {
      v.x = next.x
      v.z = next.z
      this.drivingRoute.shift()
      if (!this.drivingRoute.length) {
        v.speed = 0
        this.drivingRouteState = 'arrived'
      }
    } else {
      const wanted = Math.atan2(dx, dz) * DEG
      const turn = angleDelta(v.heading, wanted)
      // Back away before a tight U-turn, so the body and its lane do not sweep through
      // the vehicle that made us reroute. Reversing is slow and still collision checked.
      if (
        Math.abs(turn) > 100 &&
        this.obstacles.some((o) => Math.hypot(o.x - v.x, o.z - v.z) < 2)
      ) {
        const step = Math.min(distance, dt * 0.9)
        const nx = v.x + (dx / distance) * step
        const nz = v.z + (dz / distance) * step
        if (!this.vehicleBlocked(nx, nz)) {
          v.x = nx
          v.z = nz
          v.speed = -0.9
        } else v.speed = 0
        this.pos = { x: v.x, z: v.z }
        this.heading = v.heading
        return
      }
      if (Math.abs(turn) > 8 && !this.turnClear(v.x, v.z, v.heading, wanted)) {
        this.turning = false
        v.speed = 0
        this.trafficWait += dt
        if (this.trafficWait > 4) {
          this.trafficWait = 0
          this.avoidTraffic()
        }
        return
      }
      this.turning = Math.abs(turn) > 8
      const previousHeading = v.heading
      v.heading = (v.heading + clamp(turn, -210 * dt, 210 * dt) + 360) % 360
      if (this.vehicleBlocked(v.x, v.z)) {
        v.heading = previousHeading
        v.speed = 0
        this.trafficWait += dt
        if (this.trafficWait > 4) {
          this.trafficWait = 0
          this.avoidTraffic()
        }
        return
      }
      // Turn at the centre of intersections; never cut the corner across a building.
      if (Math.abs(turn) > 8) v.speed = approach(v.speed, 0, this.config.vehicle.brake * dt)
      else {
        const last = this.drivingRoute.length === 1
        const speed = Math.min(3, Math.sqrt(2 * this.config.vehicle.brake * distance))
        v.speed = approach(v.speed, last ? speed : 3, this.config.vehicle.accel * dt)
        const step = Math.min(distance, v.speed * dt)
        const nx = v.x + (dx / distance) * step
        const nz = v.z + (dz / distance) * step
        if (this.vehicleBlocked(nx, nz)) {
          v.speed = 0
          this.trafficWait += dt
          if (this.trafficWait > 4) {
            this.trafficWait = 0
            this.avoidTraffic()
          }
          return
        }
        this.trafficWait = 0
        v.x = nx
        v.z = nz
      }
    }
    this.pos = { x: v.x, z: v.z }
    this.heading = v.heading
  }

  private stepVehicle(dt: number) {
    const v = this.vehicle
    if (!v) return
    if (this.automaticDriving) {
      this.stepAutomaticVehicle(dt)
      return
    }
    const cfg = this.config.vehicle
    const throttle = clamp(this.input.y, -1, 1)
    // Throttle forward, reverse, brake against the motion, or coast with friction.
    if (throttle > 0.05) {
      v.speed =
        v.speed < -0.05
          ? approach(v.speed, 0, cfg.brake * dt)
          : Math.min(cfg.maxSpeed, v.speed + cfg.accel * throttle * dt)
    } else if (throttle < -0.05) {
      v.speed =
        v.speed > 0.05
          ? approach(v.speed, 0, cfg.brake * dt)
          : Math.max(-cfg.reverseSpeed, v.speed + cfg.accel * throttle * dt)
    } else v.speed = approach(v.speed, 0, cfg.friction * dt)
    if (Math.abs(v.speed) < 1e-3) v.speed = 0
    // Steering turns faster at speed and reverses when backing up.
    const steer = clamp(this.input.x, -1, 1)
    if (Math.abs(v.speed) > 0.05 && steer !== 0) {
      const k = Math.min(1, Math.abs(v.speed) / 2.5) * Math.sign(v.speed)
      v.heading = (v.heading + steer * cfg.steerRate * k * dt + 360) % 360
    }
    if (v.speed === 0) return
    const a = v.heading / DEG
    const nx = v.x + Math.sin(a) * v.speed * dt
    const nz = v.z + Math.cos(a) * v.speed * dt
    // The car must keep its wheels on the road: front and back axle points.
    const ok = [0.45, -0.45].every((o) =>
      this.world.drivable(Math.round(nx + Math.sin(a) * o), Math.round(nz + Math.cos(a) * o)),
    )
    if (ok && !this.vehicleBlocked(nx, nz)) {
      v.x = nx
      v.z = nz
    } else {
      v.speed = 0
      this.events.push({ type: 'blocked' })
    }
    this.pos = { x: v.x, z: v.z }
    this.heading = v.heading
  }

  /* ------------------------------------------------------------------ camera */
  private stepCamera(dt: number) {
    const cam = this.camera
    if (!cam.follow) return
    const target = this.driving && this.vehicle ? this.vehicle : this.pos
    // Look a little ahead of the motion so the avatar sits in the lower part of the frame.
    const lead =
      this.driving && this.vehicle ? Math.min(2.5, Math.abs(this.vehicle.speed) * 0.25) : 0
    const a = this.heading / DEG
    const tx = target.x + Math.sin(a) * lead
    const tz = target.z + Math.cos(a) * lead
    const k = 1 - Math.exp(-dt * (this.driving ? 6 : 9))
    cam.tx += (tx - cam.tx) * k
    cam.tz += (tz - cam.tz) * k
  }
}

/** Moves `v` towards `target` by at most `step`. */
function approach(v: number, target: number, step: number): number {
  if (v < target) return Math.min(target, v + step)
  if (v > target) return Math.max(target, v - step)
  return v
}

/**
 * Game camera: the follow distance behind the player (about 40° above the street, the figure
 * 80–140 px tall on a 412 × 915 phone) and the aerial distance of the city map view.
 */
export const FOLLOW_DISTANCE = 8
export const MAP_DISTANCE = 100

/** Camera pitch (degrees, negative looks down) for a follow distance: closer = flatter. */
export function cameraPitch(distance: number): number {
  const t = clamp((distance - FOLLOW_DISTANCE) / 20, 0, 1)
  return -40 - 14 * t
}
