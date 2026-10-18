import type {
  ChatActivity,
  Locality,
  MovementSnapshot,
  PresenceEntry,
} from '../lib/haroolife/realtime/protocol'

export interface ActivityStore {
  record(room: string, event: ChatActivity): Promise<void>
  flush(room: string): Promise<ChatActivity[] | null>
}

export interface MotionBus {
  subscribe(room: string, receive: (snapshots: MovementSnapshot[]) => void): () => void
  publish(room: string, snapshot: MovementSnapshot): void
}

/** Ephemeral public presence only. Tokens, account IDs, wallets and chat never go here. */
export interface Membership {
  world: string
  present: PresenceEntry[]
}
export interface Departure {
  world: string
  key: string
  last: boolean
}
export interface Lease {
  id: string
  locality: Locality
}
export interface WorldStore {
  join(id: string, locality: Locality, entry: PresenceEntry): Promise<Membership>
  leave(id: string, locality: Locality): Promise<Departure | null>
  /** Returns leases lost after a stalled worker; those sockets must reconnect. */
  renew(leases: Lease[]): Promise<string[]>
  list(world: string): Promise<PresenceEntry[]>
  /** At most one worker publishes changed state for a world in each refresh window. */
  refresh?: (world: string) => Promise<PresenceEntry[] | null>
}

export const WORLD_CAPACITY = 96
export const LEASE_MS = 45_000
export const worldRoom = (world: string) => `here:${world}`
export const sector = (x: number, z: number) => `${Math.floor(x / 24)}:${Math.floor(z / 24)}`
export const sectorRoom = (world: string, cell: string) => `view:${world}:${cell}`
export function viewRooms(world: string, x: number, z: number): string[] {
  const cx = Math.floor(x / 24)
  const cz = Math.floor(z / 24)
  const rooms: string[] = []
  for (let dx = -1; dx <= 1; dx++)
    for (let dz = -1; dz <= 1; dz++) rooms.push(sectorRoom(world, `${cx + dx}:${cz + dz}`))
  return rooms
}

/** One-process default. Redis uses the exact same capacity and lease contract. */
export function memoryWorlds(capacity = WORLD_CAPACITY, clock = Date.now): WorldStore {
  const members = new Map<string, { world: string; entry: PresenceEntry; until: number }>()
  const worlds = new Map<string, Set<string>>()
  let sequence = 0
  let sweptAt = Number.NEGATIVE_INFINITY
  const remove = (id: string): Departure | null => {
    const m = members.get(id)
    if (!m) return null
    members.delete(id)
    const group = worlds.get(m.world)
    group?.delete(id)
    if (!group?.size) worlds.delete(m.world)
    const last =
      !group || ![...group].some((other) => members.get(other)?.entry.key === m.entry.key)
    return { world: m.world, key: m.entry.key, last }
  }
  return {
    async join(id, locality, entry) {
      if (clock() - sweptAt >= 1000) {
        sweptAt = clock()
        for (const [key, m] of members) if (m.until <= clock()) remove(key)
      }
      let m = members.get(id)
      if (m && m.entry.locality !== locality) {
        remove(id)
        m = undefined
      }
      if (!m) {
        let world = ''
        for (const [key, group] of worlds)
          if (key.startsWith(`${locality}:`) && group.size < capacity) {
            world = key
            break
          }
        if (!world) world = `${locality}:${++sequence}`
        const group = worlds.get(world) ?? new Set<string>()
        group.add(id)
        worlds.set(world, group)
        m = { world, entry: { ...entry }, until: clock() + LEASE_MS }
        members.set(id, m)
      }
      const present = new Map<string, PresenceEntry>()
      for (const key of worlds.get(m.world) ?? []) {
        const other = members.get(key)
        if (other && other.entry.key !== entry.key) present.set(other.entry.key, other.entry)
      }
      return { world: m.world, present: [...present.values()] }
    },
    async leave(id) {
      return remove(id)
    },
    async renew(leases) {
      const lost: string[] = []
      for (const { id } of leases) {
        const m = members.get(id)
        if (!m || m.until <= clock()) {
          remove(id)
          lost.push(id)
        } else m.until = clock() + LEASE_MS
      }
      return lost
    },
    async list(world) {
      const entries = new Map<string, PresenceEntry>()
      for (const id of worlds.get(world) ?? []) {
        const m = members.get(id)
        if (m && m.until > clock()) entries.set(m.entry.key, m.entry)
      }
      return [...entries.values()]
    },
  }
}
