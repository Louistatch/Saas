import { randomUUID } from 'node:crypto'
import { createShardedAdapter } from '@socket.io/redis-adapter'
import { createClient, createCluster } from 'redis'
import type {
  ChatActivity,
  MovementSnapshot,
  PresenceEntry,
} from '../lib/haroolife/realtime/protocol'
import { type ActivityStore, LEASE_MS, type MotionBus, type WorldStore } from './worlds'

/** All keys of a locality share a Redis Cluster hash slot. No KEYS, global scan or SQL. */
const common = `
local base = ARGV[1]
local time = redis.call('TIME')
local now = tonumber(time[1]) * 1000 + math.floor(tonumber(time[2]) / 1000)
local function remove(id)
  local world = redis.call('HGET', KEYS[2], id)
  if not world then return nil end
  local room = base .. ':room:' .. world
  local entry = redis.call('HGET', room, id)
  redis.call('HDEL', room, id)
  redis.call('HDEL', KEYS[2], id)
  redis.call('ZREM', KEYS[1], id)
  local size = redis.call('HLEN', room)
  if size == 0 then redis.call('ZREM', KEYS[3], world)
  else redis.call('ZADD', KEYS[3], size, world) end
  return {world, entry or '{}', room}
end
-- Bounded reclamation: expired workers cannot hold slots forever.
local expired = redis.call('ZRANGEBYSCORE', KEYS[1], '-inf', now, 'LIMIT', 0, 256)
for _, id in ipairs(expired) do remove(id) end
for _, key in ipairs(KEYS) do redis.call('EXPIRE', key, 3600) end
`
const joinScript = `${common}
local id = ARGV[3]
local world = redis.call('HGET', KEYS[2], id)
if not world then
  local first = redis.call('ZRANGE', KEYS[3], 0, 0, 'WITHSCORES')
  if #first > 0 and tonumber(first[2]) < tonumber(ARGV[5]) then world = first[1]
  else world = ARGV[6] .. ':' .. redis.call('INCR', KEYS[4]) end
  redis.call('HSET', KEYS[2], id, world)
end
local room = base .. ':room:' .. world
redis.call('HSET', room, id, ARGV[4])
redis.call('ZADD', KEYS[1], now + tonumber(ARGV[7]), id)
redis.call('ZADD', KEYS[3], redis.call('HLEN', room), world)
redis.call('EXPIRE', room, 120)
for _, key in ipairs(KEYS) do redis.call('EXPIRE', key, 3600) end
local entries = {}
local all = redis.call('HGETALL', room)
for i = 1, #all, 2 do
  if tonumber(redis.call('ZSCORE', KEYS[1], all[i]) or '0') > now then
    table.insert(entries, all[i + 1])
  else remove(all[i]) end
end
return {world, entries}
`
const leaveScript = `${common}
local out = remove(ARGV[3])
if not out then return {} end
local key = cjson.decode(out[2]).key
if not key then return {} end
local last = 1
for _, entry in ipairs(redis.call('HVALS', out[3])) do
  if cjson.decode(entry).key == key then last = 0 break end
end
return {out[1], key, last}
`
const renewScript = `${common}
local lost = {}
for i = 4, #ARGV do
  local id = ARGV[i]
  if redis.call('HEXISTS', KEYS[2], id) == 1 and tonumber(redis.call('ZSCORE', KEYS[1], id) or '0') > now then
    redis.call('ZADD', KEYS[1], now + tonumber(ARGV[3]), id)
    redis.call('EXPIRE', base .. ':room:' .. redis.call('HGET', KEYS[2], id), 120)
  else remove(id) table.insert(lost, id) end
end
return lost
`
const listScript = `${common}
local out = {}
local all = redis.call('HGETALL', base .. ':room:' .. ARGV[3])
for i = 1, #all, 2 do
  if tonumber(redis.call('ZSCORE', KEYS[1], all[i]) or '0') > now then
    table.insert(out, all[i + 1])
  else remove(all[i]) end
end
return out
`
const refreshScript = `
local refresh = ARGV[1] .. ':refresh:' .. ARGV[3]
if not redis.call('SET', refresh, '1', 'NX', 'PX', 10000) then return nil end
${listScript.replace(
  'return out',
  `
local fingerprint = redis.sha1hex(table.concat(out, '|'))
local key = ARGV[1] .. ':roster:' .. ARGV[3]
if redis.call('GET', key) == fingerprint then return nil end
redis.call('SET', key, fingerprint, 'PX', 120000)
return out`,
)}
`

export async function connectRedis(config: {
  url?: string
  clusterUrls?: string[]
  prefix: string
  capacity: number
  /** Safe event name only: never print URLs, which may contain credentials. */
  onError?: () => void
}) {
  if (!/^[a-zA-Z0-9_-]{1,40}$/.test(config.prefix)) throw new Error('Invalid Redis namespace')
  const defaults = {
    disableOfflineQueue: true,
    commandsQueueMaxLength: 10_000,
    socket: { connectTimeout: 5000 },
  }
  const client = config.clusterUrls?.length
    ? createCluster({ rootNodes: config.clusterUrls.map((url) => ({ url })), defaults })
    : createClient({ ...defaults, url: config.url })
  const pub = client.duplicate()
  const sub = client.duplicate()
  const connections = [client, pub, sub]
  for (const c of connections) c.on('error', () => config.onError?.())
  try {
    await Promise.all(connections.map((c) => c.connect()))
  } catch {
    for (const c of connections) if (c.isOpen) c.destroy()
    throw new Error('Redis unavailable; distributed relay startup refused')
  }
  let closing = false
  let subscriptionsHealthy = true
  const wanted = new Map<string, (message: Buffer, channel: Buffer) => void>()
  const pending = new Set<Promise<unknown>>()
  const subscription = (work: Promise<unknown>) => {
    const safe = work
      .catch(() => {
        subscriptionsHealthy = false
        config.onError?.()
      })
      .finally(() => pending.delete(safe))
    pending.add(safe)
    return safe
  }
  // The upstream sharded adapter does not await subscribe/unsubscribe promises. Handle their
  // rejection explicitly, and replay desired channels after Redis reconnects.
  const adapterSub = {
    sSubscribe(channel: string, listener: (message: Buffer, channel: Buffer) => void) {
      wanted.set(channel, listener)
      return subscription(sub.sSubscribe(channel, listener, true))
    },
    sUnsubscribe(channels: string | string[]) {
      for (const channel of Array.isArray(channels) ? channels : [channels]) wanted.delete(channel)
      if (closing || !sub.isReady) return Promise.resolve()
      return subscription(sub.sUnsubscribe(channels))
    },
  }
  sub.on('ready', () => {
    if (closing) return
    subscriptionsHealthy = true
    for (const [channel, listener] of wanted) subscription(sub.sSubscribe(channel, listener, true))
  })
  const source = randomUUID()
  const outgoing = new Map<string, Map<string, MovementSnapshot>>()
  const motion: MotionBus = {
    subscribe(room, receive) {
      const channel = `${config.prefix}:motion:${room}`
      void adapterSub.sSubscribe(channel, (buffer) => {
        try {
          const data = JSON.parse(buffer.toString()) as {
            source: string
            snapshots: MovementSnapshot[]
          }
          if (data.source !== source) receive(data.snapshots)
        } catch {
          config.onError?.()
        }
      })
      return () => {
        void adapterSub.sUnsubscribe(channel)
      }
    },
    publish(room, snapshot) {
      const batch = outgoing.get(room) ?? new Map<string, MovementSnapshot>()
      batch.set(snapshot.key, snapshot)
      outgoing.set(room, batch)
    },
  }
  const flushMotion = setInterval(() => {
    if (closing) return
    for (const [room, entries] of outgoing) {
      if (pub.isReady)
        void pub
          .sPublish(
            `${config.prefix}:motion:${room}`,
            JSON.stringify({ source, snapshots: [...entries.values()] }),
          )
          .catch(() => config.onError?.())
    }
    outgoing.clear()
  }, 50)
  flushMotion.unref()
  const keys = (locality: string) => {
    const base = `${config.prefix}:{${locality}}`
    return { base, keys: [`${base}:leases`, `${base}:members`, `${base}:loads`, `${base}:seq`] }
  }
  const evalScript = (script: string, locality: string, args: string[]) => {
    const k = keys(locality)
    return client.withCommandOptions({ abortSignal: AbortSignal.timeout(3000) }).eval(script, {
      keys: k.keys,
      arguments: [k.base, String(Date.now()), ...args],
    })
  }
  const worlds: WorldStore = {
    async join(id, locality, entry) {
      const out = (await evalScript(joinScript, locality, [
        id,
        JSON.stringify(entry),
        String(config.capacity),
        locality,
        String(LEASE_MS),
      ])) as [string, string[]]
      const present = new Map<string, PresenceEntry>()
      for (const json of out[1]) {
        const other = JSON.parse(json) as PresenceEntry
        if (other.key !== entry.key) present.set(other.key, other)
      }
      return { world: out[0], present: [...present.values()] }
    },
    async leave(id, locality) {
      const out = (await evalScript(leaveScript, locality, [id])) as [] | [string, string, number]
      return out.length ? { world: out[0], key: out[1], last: out[2] === 1 } : null
    },
    async renew(leases) {
      const groups = new Map<string, string[]>()
      for (const l of leases) {
        const ids = groups.get(l.locality) ?? []
        ids.push(l.id)
        groups.set(l.locality, ids)
      }
      const lost: string[] = []
      // Bound Lua runtime, including on a large relay.
      for (const [locality, ids] of groups)
        for (let offset = 0; offset < ids.length; offset += 256)
          lost.push(
            ...((await evalScript(renewScript, locality, [
              String(LEASE_MS),
              ...ids.slice(offset, offset + 256),
            ])) as string[]),
          )
      return lost
    },
    async list(world) {
      const locality = world.split(':')[0]
      const unique = new Map<string, PresenceEntry>()
      for (const json of (await evalScript(listScript, locality, [world])) as string[]) {
        const entry = JSON.parse(json) as PresenceEntry
        unique.set(entry.key, entry)
      }
      return [...unique.values()]
    },
    async refresh(world) {
      const out = await evalScript(refreshScript, world.split(':')[0], [world])
      if (!out) return null
      const unique = new Map<string, PresenceEntry>()
      for (const json of out as string[]) {
        const entry = JSON.parse(json) as PresenceEntry
        unique.set(entry.key, entry)
      }
      return [...unique.values()]
    },
  }
  const activity: ActivityStore = {
    async record(room, event) {
      await client
        .withCommandOptions({ abortSignal: AbortSignal.timeout(3000) })
        .eval(
          `redis.call('HSET', KEYS[1], ARGV[1], ARGV[2]) redis.call('PEXPIRE', KEYS[1], 30000) return 1`,
          {
            keys: [`${config.prefix}:activity:{${room}}`],
            arguments: [String(event.seq), event.key],
          },
        )
    },
    async flush(room) {
      const out = (await client.withCommandOptions({ abortSignal: AbortSignal.timeout(3000) }).eval(
        `if not redis.call('SET', KEYS[2], '1', 'NX', 'PX', 1000) then return nil end
         local out = redis.call('HGETALL', KEYS[1]) redis.call('DEL', KEYS[1]) return out`,
        {
          keys: [`${config.prefix}:activity:{${room}}`, `${config.prefix}:activity-lock:{${room}}`],
          arguments: [],
        },
      )) as string[] | null
      if (!out) return null
      const events: ChatActivity[] = []
      for (let i = 0; i < out.length; i += 2) events.push({ seq: Number(out[i]), key: out[i + 1] })
      return events
    },
  }
  return {
    worlds,
    motion,
    activity,
    async allowChat(room: string) {
      const global = room.startsWith('world:')
      // Shared per-room budget: one user's reconnects cannot multiply broad channel traffic.
      const result = await client
        .withCommandOptions({ abortSignal: AbortSignal.timeout(3000) })
        .eval(
          `local n = tonumber(redis.call('GET', KEYS[1]) or '0')
         if n >= tonumber(ARGV[1]) then return 0 end
         redis.call('INCR', KEYS[1])
         if n == 0 then redis.call('PEXPIRE', KEYS[1], 1000) end
         return 1`,
          { keys: [`${config.prefix}:chat:${room}`], arguments: [global ? '5' : '20'] },
        )
      return result === 1
    },
    adapter: createShardedAdapter(pub, adapterSub, {
      channelPrefix: `${config.prefix}:io`,
      subscriptionMode: 'dynamic',
    }),
    ready: () => !closing && subscriptionsHealthy && connections.every((c) => c.isReady),
    async close() {
      closing = true
      clearInterval(flushMotion)
      outgoing.clear()
      await Promise.allSettled([...pending])
      await Promise.allSettled(connections.map((c) => (c.isOpen ? c.close() : Promise.resolve())))
    },
  }
}
