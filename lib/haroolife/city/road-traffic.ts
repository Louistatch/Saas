import { type CollisionBody, bodiesOverlap, touchesBody } from './collisions'
export type TrafficCar = CollisionBody & {
  id: number
  kind: 'taxi' | 'sedan' | 'van' | 'moto'
  from: { x: number; z: number }
  to: { x: number; z: number }
  t: number
  stopped: boolean
}
const DIRS = [
  [1, 0],
  [0, 1],
  [-1, 0],
  [0, -1],
] as const
/** Local road agents: bounded, smooth motion, right-hand lanes, priority to pedestrians and the player's service. */
export class RoadTraffic {
  readonly cars: TrafficCar[] = []
  private seed = 723
  constructor(
    private readonly road: (x: number, z: number) => boolean,
    readonly count = 6,
  ) {}
  private random() {
    this.seed = (this.seed * 16807) % 2147483647
    return this.seed / 2147483647
  }
  private next(from: { x: number; z: number }, previous: { x: number; z: number }) {
    const choices = DIRS.map(([x, z]) => ({ x: from.x + x, z: from.z + z })).filter((p) =>
      this.road(p.x, p.z),
    )
    const onward = choices.filter((p) => p.x !== previous.x || p.z !== previous.z)
    const list = onward.length ? onward : choices
    const dx = from.x - previous.x
    const dz = from.z - previous.z
    if (dx || dz) {
      // Keep the avenue ahead; random turns at every cell used to gridlock opposite lanes.
      // At the end of a street, prefer the right turn before crossing the oncoming lane.
      for (const [sx, sz] of [
        [dx, dz],
        [dz, -dx],
        [-dz, dx],
      ]) {
        const next = list.find((p) => p.x === from.x + sx && p.z === from.z + sz)
        if (next) return next
      }
    }
    return list.length ? list[Math.floor(this.random() * list.length)] : from
  }
  private pose(car: TrafficCar, t: number): CollisionBody {
    const dx = car.to.x - car.from.x
    const dz = car.to.z - car.from.z
    // Right-hand traffic: oncoming vehicles use the opposite side of the centre line.
    return {
      x: car.from.x + dx * t + dz * 0.3,
      z: car.from.z + dz * t - dx * 0.3,
      heading: (Math.atan2(dx, dz) * 180) / Math.PI,
      halfWidth: car.halfWidth,
      halfLength: car.halfLength,
    }
  }
  private spawn(id: number, cx: number, cz: number, obstacles: CollisionBody[]): TrafficCar | null {
    for (let n = 0; n < 150; n++) {
      const from = {
        x: Math.round(cx) + Math.floor(this.random() * 23) - 11,
        z: Math.round(cz) + Math.floor(this.random() * 23) - 11,
      }
      if (!this.road(from.x, from.z) || Math.hypot(from.x - cx, from.z - cz) < 3) continue
      const kind = (['taxi', 'sedan', 'moto', 'van', 'moto'] as const)[id % 5]
      const to = this.next(from, from)
      if (to.x === from.x && to.z === from.z) continue
      const car: TrafficCar = {
        id,
        kind,
        from,
        to,
        t: 0,
        stopped: false,
        x: from.x,
        z: from.z,
        heading: 0,
        halfWidth: kind === 'moto' ? 0.09 : 0.2,
        halfLength: kind === 'moto' ? 0.31 : 0.54,
      }
      Object.assign(car, this.pose(car, 0))
      if (
        !obstacles.some((b) => bodiesOverlap(car, b, 0.2)) &&
        !this.cars.some((b) => bodiesOverlap(car, b, 0.2))
      )
        return car
    }
    return null
  }
  step(dt: number, cx: number, cz: number, blockers: CollisionBody[] = []): void {
    const elapsed = Math.min(0.25, Math.max(0, dt))
    const steps = Math.max(1, Math.ceil(elapsed / 0.05))
    for (let i = 0; i < steps; i++) this.advance(elapsed / steps, cx, cz, blockers)
  }
  private advance(delta: number, cx: number, cz: number, blockers: CollisionBody[]): void {
    for (let id = 0; id < this.count; id++) {
      let car = this.cars.find((c) => c.id === id)
      if (!car || Math.hypot(car.x - cx, car.z - cz) > 17) {
        if (car) this.cars.splice(this.cars.indexOf(car), 1)
        car = this.spawn(id, cx, cz, blockers) ?? undefined
        if (!car) continue
        this.cars.push(car)
      }
      const t = Math.min(1, car.t + delta * (car.kind === 'moto' ? 1.4 : 1.05))
      const candidate = this.pose(car, t)
      const angle = (candidate.heading * Math.PI) / 180
      const ahead = {
        ...candidate,
        x: candidate.x + Math.sin(angle) * 0.18,
        z: candidate.z + Math.cos(angle) * 0.18,
        halfLength: candidate.halfLength + 0.18,
      }
      const approaching = (body: CollisionBody) =>
        Math.hypot(candidate.x - body.x, candidate.z - body.z) <=
        Math.hypot(car.x - body.x, car.z - body.z) + 0.001
      // Never stop a vehicle from clearing the way: a following taxi is behind it, not an
      // obstacle ahead. Inflating both ends used to freeze the two vehicles permanently.
      car.stopped =
        blockers.some((body) => approaching(body) && bodiesOverlap(ahead, body, 0.015)) ||
        this.cars.some(
          (body) => body.id !== id && approaching(body) && bodiesOverlap(ahead, body, 0.02),
        )
      if (car.stopped) continue
      Object.assign(car, candidate)
      car.t = t
      if (t >= 1) {
        const previous = car.from
        car.from = car.to
        car.to = this.next(car.from, previous)
        car.t = 0
      }
    }
  }
  blocks(x: number, z: number, radius: number) {
    return this.cars.some((c) => touchesBody(x, z, radius, c))
  }
}
