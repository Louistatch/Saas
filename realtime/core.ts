/**
 * HarooLife Socket.IO relay (D4+, M1): transport, authorisation of rooms, durable chat with
 * acknowledgements and cursor catch-up, slow presence by locality, throttled movement snapshots.
 *
 * Everything that matters is decided here or in Postgres, never by the client:
 * - identity comes from the person's Supabase access token, checked at connection;
 * - rooms are joined only from the list the database grants (`haroolife_chat_me`);
 * - every chat payload is validated (Zod), size- and rate-limited, then stored by an authorised,
 *   idempotent SQL function BEFORE it is broadcast; the sender gets the stored message as ack.
 */
import {
  type Server as HttpServer,
  type IncomingMessage,
  type ServerResponse,
  createServer,
} from 'node:http'
import { monitorEventLoopDelay } from 'node:perf_hooks'
import { Server, type ServerOptions, type Socket } from 'socket.io'
import { z } from 'zod'
import {
  type Ack,
  type ChatActivity,
  type ChatMessage,
  type ClientToServer,
  type ErrorCode,
  KEY_PATTERN,
  LIMITS,
  LOCALITIES,
  type Locality,
  type Me,
  type MovementSnapshot,
  PROTOCOL_VERSION,
  type Peer,
  type Pose,
  type PresenceEntry,
  ROOM_PATTERN,
  type ServerToClient,
} from '../lib/haroolife/realtime/protocol'
import { WorkGate } from './work-gate'
import { type WorldStore, memoryWorlds, sector, sectorRoom, viewRooms, worldRoom } from './worlds'

export class RepoError extends Error {
  constructor(
    public code: ErrorCode,
    message: string,
  ) {
    super(message)
  }
}
/** Durable chat, executed AS the person (their token), so database rules apply to them. */
export interface ChatRepository {
  me(token: string): Promise<Me>
  send(
    token: string,
    room: string,
    body: string,
    clientId: string,
  ): Promise<ChatMessage & { duplicate: boolean }>
  history(
    token: string,
    room: string,
    after: number | null,
    before: number | null,
    limit: number,
  ): Promise<ChatMessage[]>
  edit(token: string, id: string, body: string): Promise<ChatMessage>
  remove(token: string, id: string): Promise<ChatMessage>
  report(token: string, id: string, reason: string): Promise<void>
  block(token: string, id: string): Promise<string>
  dmOpen(token: string, key: string): Promise<{ room: string; peer: Peer }>
  dmPeers(token: string): Promise<Record<string, Peer>>
  blockKey(token: string, key: string): Promise<string>
  reportUser(token: string, key: string, reason: string): Promise<void>
}
/** Checks the access token with the identity provider (Supabase Auth). */
export interface RealtimeAuth {
  verify(token: string): Promise<{ userId: string } | null>
}
export interface RealtimeMetrics {
  connections: number
  connectionsTotal: number
  messagesStored: number
  messagesDuplicate: number
  rejected: Record<string, number>
  posesRelayed: number
  posesDropped: number
  ackMs: number[]
}
export interface RealtimeOptions {
  auth: RealtimeAuth
  chat: ChatRepository
  /** Allowed browser origins (CORS for the handshake). */
  origins: string[]
  /** Kill switch: refuse every connection with code `disabled`. */
  disabled?: () => boolean
  path?: string
  log?: (event: string, data?: Record<string, unknown>) => void
  adapter?: ServerOptions['adapter']
  worlds?: WorldStore
  motion?: import('./worlds').MotionBus
  activity?: import('./worlds').ActivityStore
  ready?: () => boolean
  maxConnections?: number
  maxAuthenticating?: number
  allowChat?: (room: string) => Promise<boolean>
}

const uuid = z.string().uuid()
const room = z.string().regex(ROOM_PATTERN)
const schemas = {
  send: z.object({
    v: z.literal(1),
    room,
    body: z
      .string()
      .min(1)
      .max(LIMITS.body * 2),
    clientId: uuid,
  }),
  history: z.object({
    room,
    before: z.number().int().positive().nullish(),
    limit: z.number().int().min(1).max(100).optional(),
  }),
  edit: z.object({
    id: uuid,
    body: z
      .string()
      .min(1)
      .max(LIMITS.body * 2),
  }),
  id: z.object({ id: uuid }),
  report: z.object({ id: uuid, reason: z.string().max(200) }),
  typing: z.object({ room }),
  resume: z.object({
    cursors: z
      .record(room, z.number().int().nonnegative())
      .refine((r) => Object.keys(r).length <= 32),
  }),
  presence: z.object({ locality: z.enum(LOCALITIES) }),
  key: z.object({ key: z.string().regex(KEY_PATTERN) }),
  reportKey: z.object({ key: z.string().regex(KEY_PATTERN), reason: z.string().max(200) }),
  pose: z.object({
    x: z.number().finite().min(-10).max(400),
    z: z.number().finite().min(-10).max(400),
    heading: z.number().finite(),
    mode: z.string().max(12),
    n: z.number().int().nonnegative(),
  }),
}

interface SocketData {
  token: string
  me: Me
  locality: Locality | null
  sendTimes: number[]
  lastTyping: number
  lastPose: { x: number; z: number; t: number } | null
  poseTimes: number[]
  world: string | null
  views: string[]
  joining: boolean
  expiresAt: number
  eventWindow: number
  eventCount: number
  focused: boolean
}
type IO = Server<ClientToServer, ServerToClient, Record<string, never>, SocketData>
type Sock = Socket<ClientToServer, ServerToClient, Record<string, never>, SocketData>

const fail = (code: ErrorCode, error: string) => ({ ok: false as const, code, error })
const asFail = (e: unknown) =>
  e instanceof RepoError
    ? fail(e.code, e.message)
    : fail('unavailable', 'Service momentanément indisponible.')

/** What other people may see of a stored message (no client id, no "mine"). */
const forRoom = (m: ChatMessage): ChatMessage => ({
  id: m.id,
  seq: m.seq,
  room: m.room,
  body: m.body,
  deleted: m.deleted,
  edited: m.edited,
  created_at: m.created_at,
  author: m.author,
})

export function createRealtime(opts: RealtimeOptions) {
  const log = opts.log ?? (() => {})
  const metrics: RealtimeMetrics = {
    connections: 0,
    connectionsTotal: 0,
    messagesStored: 0,
    messagesDuplicate: 0,
    rejected: {},
    posesRelayed: 0,
    posesDropped: 0,
    ackMs: [],
  }
  const reject = (code: string) => {
    metrics.rejected[code] = (metrics.rejected[code] ?? 0) + 1
  }
  const worlds = opts.worlds ?? memoryWorlds()
  const gate = new WorkGate(opts.maxAuthenticating ?? 32)
  const maxConnections = opts.maxConnections ?? 5000
  const lag = monitorEventLoopDelay({ resolution: 20 })
  lag.enable()
  let draining = false
  const healthy = () => !draining && !opts.disabled?.() && (opts.ready?.() ?? true)
  const cleanup = new Set<Promise<unknown>>()
  const track = (p: Promise<unknown>) => {
    cleanup.add(p)
    void p.then(
      () => cleanup.delete(p),
      () => cleanup.delete(p),
    )
  }

  const http: HttpServer = createServer((req: IncomingMessage, res: ServerResponse) => {
    if (req.url === '/health' || req.url === '/ready') {
      const sorted = [...metrics.ackMs].sort((a, b) => a - b)
      const p = (q: number) =>
        sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] ?? null
      res.writeHead(req.url === '/ready' && !healthy() ? 503 : 200, {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
      })
      res.end(
        JSON.stringify({
          ok: healthy(),
          v: PROTOCOL_VERSION,
          connections: metrics.connections,
          connectionsTotal: metrics.connectionsTotal,
          worlds: new Set([...io.sockets.sockets.values()].map((s) => s.data.world).filter(Boolean))
            .size,
          authenticating: gate.active,
          admissionRefused: gate.refused,
          capacity: maxConnections,
          draining,
          memory: process.memoryUsage(),
          eventLoopP95Ms: Number((lag.percentile(95) / 1e6).toFixed(2)),
          uptimeSeconds: Math.floor(process.uptime()),
          messagesStored: metrics.messagesStored,
          messagesDuplicate: metrics.messagesDuplicate,
          rejected: metrics.rejected,
          posesRelayed: metrics.posesRelayed,
          posesDropped: metrics.posesDropped,
          batchesSent,
          snapshotsSent,
          backpressureDropped,
          storeAckMs: { p50: p(0.5), p95: p(0.95), n: sorted.length },
        }),
      )
      return
    }
    res.writeHead(404)
    res.end()
  })

  const io: IO = new Server(http, {
    path: opts.path ?? '/socket.io',
    // WebSocket only: no long-polling, hence no sticky sessions needed behind several instances
    // (and Vercel's guide requires it). Heartbeat tolerant of 3G/4G in Togo.
    transports: ['websocket'],
    pingInterval: 25_000,
    pingTimeout: 20_000,
    maxHttpBufferSize: LIMITS.maxPayloadBytes,
    cors: { origin: opts.origins, credentials: false },
    serveClient: false,
    adapter: opts.adapter,
    connectTimeout: 10_000,
    perMessageDeflate: false,
    allowRequest: (req, done) => {
      // CORS alone does not protect WebSocket upgrades. Non-browser service clients have no Origin.
      const origin = req.headers.origin
      done(
        null,
        !draining &&
          (opts.ready?.() ?? true) &&
          (!origin || opts.origins.includes(origin)) &&
          io.engine.clientsCount < maxConnections,
      )
    },
  })

  // Connection: verify the token, read the person's rooms from the database, join only those.
  io.use(async (socket, next) => {
    if (opts.disabled?.()) {
      reject('disabled')
      return next(Object.assign(new Error('disabled'), { data: { code: 'disabled' } }))
    }
    const token =
      typeof socket.handshake.auth?.token === 'string' ? socket.handshake.auth.token : ''
    if (!token || token.length > 4096) {
      reject('auth')
      return next(Object.assign(new Error('auth_required'), { data: { code: 'auth_expired' } }))
    }
    if (!healthy() || metrics.connections + gate.active >= maxConnections) {
      reject('capacity')
      return next(Object.assign(new Error('unavailable'), { data: { code: 'unavailable' } }))
    }
    try {
      const me = await gate.run(async () => {
        const user = await opts.auth.verify(token)
        if (!user) {
          reject('auth')
          throw new RepoError('auth_expired', 'Connexion requise.')
        }
        return opts.chat.me(token)
      })
      if (socket.conn.readyState !== 'open') return
      // Identity was verified above. Decoding exp here only schedules re-authentication.
      let expiresAt = Number.POSITIVE_INFINITY
      try {
        const exp = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString()).exp
        if (typeof exp === 'number') expiresAt = exp * 1000
      } catch {
        /* Non-JWT test/identity providers still run through verify(). */
      }
      socket.data = {
        token,
        me,
        locality: null,
        sendTimes: [],
        lastTyping: 0,
        lastPose: null,
        poseTimes: [],
        world: null,
        views: [],
        joining: false,
        expiresAt,
        eventWindow: Date.now(),
        eventCount: 0,
        focused: socket.handshake.auth?.subscriptions === 'focused',
      }
      next()
    } catch (e) {
      const code = e instanceof RepoError ? e.code : 'unavailable'
      reject(code)
      next(Object.assign(new Error(code), { data: { code } }))
    }
  })

  const activityRooms = new Set<string>()
  const localActivity = new Map<string, ChatActivity[]>()
  let activityBusy = false
  const activityTimer = setInterval(() => {
    if (activityBusy || !healthy() || !activityRooms.size) return
    activityBusy = true
    track(
      (async () => {
        for (const room of activityRooms) {
          const events = opts.activity
            ? await opts.activity.flush(room)
            : (localActivity.get(room) ?? [])
          if (events === null) continue
          activityRooms.delete(room)
          localActivity.delete(room)
          if (events.length) io.to(`notify:${room}`).emit('chat:activity', { room, events })
        }
      })()
        .catch(() => reject('activity_unavailable'))
        .finally(() => {
          activityBusy = false
        }),
    )
  }, 1000)
  activityTimer.unref()

  const viewers = new Map<string, { sockets: Set<string>; unsubscribe: () => void }>()
  const pendingPoses = new Map<string, Map<string, MovementSnapshot>>()
  let batchesSent = 0
  let snapshotsSent = 0
  let backpressureDropped = 0
  const receivePoses = (room: string, snapshots: MovementSnapshot[]) => {
    for (const id of viewers.get(room)?.sockets ?? []) {
      const socket = io.sockets.sockets.get(id)
      if (!socket) continue
      for (const snapshot of snapshots) {
        if (snapshot.key === socket.data.me.key) continue
        if (!socket.data.focused) {
          socket.volatile.emit('player:snapshot', snapshot)
          continue
        }
        const pending = pendingPoses.get(id) ?? new Map<string, MovementSnapshot>()
        pending.set(snapshot.key, snapshot)
        if (pending.size > 96) pending.delete(pending.keys().next().value as string)
        pendingPoses.set(id, pending)
      }
    }
  }
  const setViews = (socket: Sock, rooms: string[]) => {
    const wanted = new Set(rooms)
    for (const room of socket.data.views) {
      if (wanted.has(room)) continue
      const view = viewers.get(room)
      view?.sockets.delete(socket.id)
      if (view && !view.sockets.size) {
        view.unsubscribe()
        viewers.delete(room)
      }
    }
    for (const room of rooms) {
      let view = viewers.get(room)
      if (!view) {
        view = {
          sockets: new Set(),
          unsubscribe:
            opts.motion?.subscribe(room, (snapshots) => receivePoses(room, snapshots)) ??
            (() => {}),
        }
        viewers.set(room, view)
      }
      view.sockets.add(socket.id)
    }
    socket.data.views = rooms
  }
  const poseTimer = setInterval(() => {
    for (const [id, pending] of pendingPoses) {
      const socket = io.sockets.sockets.get(id)
      if (!socket?.connected) continue
      const point = socket.data.lastPose
      const snapshots = [...pending.values()]
      if (point)
        snapshots.sort(
          (a, b) =>
            (a.pose.x - point.x) ** 2 +
            (a.pose.z - point.z) ** 2 -
            (b.pose.x - point.x) ** 2 -
            (b.pose.z - point.z) ** 2,
        )
      const nearest = snapshots.slice(0, 24)
      if (socket.conn.transport.writable) {
        socket.volatile.emit('player:batch', nearest)
        batchesSent++
        snapshotsSent += nearest.length
      } else backpressureDropped += nearest.length
    }
    pendingPoses.clear()
  }, 50)
  poseTimer.unref()
  const publishPose = (room: string, snapshot: MovementSnapshot) => {
    receivePoses(room, [snapshot])
    opts.motion?.publish(room, snapshot)
  }

  const leavePresence = async (s: Sock) => {
    const loc = s.data.locality
    const old = s.data.world
    s.data.locality = null
    s.data.world = null
    s.data.lastPose = null
    if (old) {
      await s.leave(worldRoom(old))
    }
    setViews(s, [])
    pendingPoses.delete(s.id)
    if (!loc) return
    try {
      const left = await worlds.leave(s.id, loc)
      if (left?.last)
        io.to(worldRoom(left.world)).emit('presence:leave', { key: left.key, locality: loc })
    } catch {
      reject('presence_unavailable')
    }
  }

  let heartbeatBusy = false
  const heartbeat = setInterval(() => {
    if (heartbeatBusy || draining) return
    if (!healthy()) {
      // A live TCP socket is not evidence that distributed presence still works.
      for (const s of io.sockets.sockets.values()) s.disconnect(true)
      return
    }
    heartbeatBusy = true
    const run = async () => {
      const now = Date.now()
      for (const s of io.sockets.sockets.values()) if (s.data.expiresAt <= now) s.disconnect(true)
      const leases = [...io.sockets.sockets.values()]
        .filter((s) => s.data.locality && !s.data.joining)
        .map((s) => ({ id: s.id, locality: s.data.locality as Locality }))
      const leaseLocalities = new Map(leases.map((l) => [l.id, l.locality]))
      for (const id of await worlds.renew(leases)) {
        const socket = io.sockets.sockets.get(id)
        if (socket && socket.data.locality === leaseLocalities.get(id)) socket.disconnect(true)
      }
      const active = new Set(
        [...io.sockets.sockets.values()].map((s) => s.data.world).filter((w): w is string => !!w),
      )
      for (const world of active) {
        const entries = worlds.refresh ? await worlds.refresh(world) : await worlds.list(world)
        if (entries) io.to(worldRoom(world)).emit('presence:state', { present: entries })
      }
    }
    track(
      run()
        .catch(() => reject('presence_unavailable'))
        .finally(() => {
          heartbeatBusy = false
        }),
    )
    lag.reset()
  }, 15_000)
  heartbeat.unref()

  io.on('connection', (s: Sock) => {
    metrics.connections++
    metrics.connectionsTotal++
    const me = s.data.me
    const broad = (r: string) => r.startsWith('world:') || r.startsWith('locality:')
    for (const r of me.rooms)
      if (ROOM_PATTERN.test(r)) {
        if (!s.data.focused || !broad(r)) void s.join(r)
        else void s.join(`notify:${r}`)
      }
    void s.join(`user:${me.key}`)
    s.emit('system:hello', { v: PROTOCOL_VERSION, me })
    log('connect', { key: me.key, rooms: me.rooms.length })
    // Adapter room membership is authoritative on the owning worker. RemoteSocket.data is a copy.
    const allowed = (r: string) =>
      ROOM_PATTERN.test(r) && (s.rooms.has(r) || (!r.startsWith('dm:') && me.rooms.includes(r)))
    s.use(([event, ...args], next) => {
      const now = Date.now()
      if (now >= s.data.expiresAt || !healthy()) {
        const ack = args[args.length - 1]
        if (typeof ack === 'function')
          ack(
            fail(
              now >= s.data.expiresAt ? 'auth_expired' : 'unavailable',
              'Reconnecte-toi dans quelques instants.',
            ),
          )
        return
      }
      if (event !== 'player:pose' && event !== 'chat:typing') {
        if (now - s.data.eventWindow >= 10_000) {
          s.data.eventWindow = now
          s.data.eventCount = 0
        }
        if (++s.data.eventCount > 60) {
          reject('rate_limited')
          const ack = args[args.length - 1]
          if (typeof ack === 'function')
            ack(fail('rate_limited', 'Trop de demandes : patiente un instant.'))
          return
        }
      }
      next()
    })

    s.on('chat:watch', async (raw, ack) => {
      if (typeof ack !== 'function') return
      const p = z.object({ room: room.nullable() }).safeParse(raw)
      if (!p.success || (p.data.room && !allowed(p.data.room)))
        return ack(fail('forbidden', 'Salon non autorisé.'))
      if (s.data.focused) for (const r of s.rooms) if (broad(r)) void s.leave(r)
      if (!p.data.room) return ack({ ok: true, messages: [] })
      try {
        void s.join(p.data.room)
        const messages = await opts.chat.history(s.data.token, p.data.room, null, null, 30)
        ack({ ok: true, messages })
      } catch (e) {
        ack(asFail(e))
      }
    })

    s.on('chat:send', async (raw, ack) => {
      if (typeof ack !== 'function') return
      const p = schemas.send.safeParse(raw)
      if (!p.success) return ack(fail('invalid', 'Message invalide.'))
      if (!allowed(p.data.room) || !me.can_write) {
        reject('forbidden')
        return ack(fail('forbidden', 'Vous ne pouvez pas écrire dans ce salon.'))
      }
      const now = Date.now()
      s.data.sendTimes = s.data.sendTimes.filter((t) => now - t < 10_000)
      if (s.data.sendTimes.length >= 8) {
        reject('rate_limited')
        return ack(fail('rate_limited', 'Trop de messages : patientez quelques secondes.'))
      }
      s.data.sendTimes.push(now)
      const t0 = performance.now()
      try {
        if (opts.allowChat && !(await opts.allowChat(p.data.room))) {
          reject('room_rate_limited')
          return ack(fail('rate_limited', 'Ce salon est très actif. Réessaie dans un instant.'))
        }
        const stored = await opts.chat.send(s.data.token, p.data.room, p.data.body, p.data.clientId)
        metrics.ackMs.push(Math.round(performance.now() - t0))
        if (metrics.ackMs.length > 500) metrics.ackMs.shift()
        if (stored.duplicate) metrics.messagesDuplicate++
        else {
          metrics.messagesStored++
          // Stored first, then broadcast: everyone in the room, the sender's other tabs included.
          io.to(p.data.room).emit('chat:new', forRoom(stored))
          if (broad(p.data.room)) {
            const event = { seq: stored.seq, key: stored.author.key }
            if (opts.activity) {
              try {
                await opts.activity.record(p.data.room, event)
              } catch {
                reject('activity_unavailable')
              }
            } else {
              const list = localActivity.get(p.data.room) ?? []
              list.push(event)
              // Notification hints are ephemeral and bounded; chat itself remains durable.
              localActivity.set(p.data.room, list.slice(-100))
            }
            activityRooms.add(p.data.room)
          }
        }
        const { duplicate: _d, ...message } = stored
        ack({ ok: true, message })
      } catch (e) {
        reject(e instanceof RepoError ? e.code : 'unavailable')
        ack(asFail(e))
      }
    })

    s.on('chat:history', async (raw, ack) => {
      if (typeof ack !== 'function') return
      const p = schemas.history.safeParse(raw)
      if (!p.success || !allowed(p.data.room)) return ack(fail('forbidden', 'Salon non autorisé.'))
      try {
        const messages = await opts.chat.history(
          s.data.token,
          p.data.room,
          null,
          p.data.before ?? null,
          p.data.limit ?? LIMITS.historyPage,
        )
        ack({ ok: true, messages })
      } catch (e) {
        ack(asFail(e))
      }
    })

    s.on('sync:resume', async (raw, ack) => {
      if (typeof ack !== 'function') return
      const p = schemas.resume.safeParse(raw)
      if (!p.success) return ack(fail('invalid', 'Curseurs invalides.'))
      const out: Record<string, ChatMessage[]> = {}
      try {
        for (const [r, after] of Object.entries(p.data.cursors)) {
          if (!allowed(r)) continue
          out[r] = await opts.chat.history(s.data.token, r, after, null, 100)
        }
        ack({ ok: true, messages: out })
      } catch (e) {
        ack(asFail(e))
      }
    })

    const mutate =
      (event: 'chat:edit' | 'chat:delete', run: (raw: unknown) => Promise<ChatMessage>) =>
      async (raw: unknown, ack: (r: Ack<{ message: ChatMessage }>) => void) => {
        if (typeof ack !== 'function') return
        try {
          const m = await run(raw)
          if (!allowed(m.room)) return ack(fail('forbidden', 'Salon non autorisé.'))
          io.to(m.room).emit(event, forRoom(m))
          ack({ ok: true, message: m })
        } catch (e) {
          ack(asFail(e))
        }
      }
    s.on(
      'chat:edit',
      mutate('chat:edit', async (raw) => {
        const p = schemas.edit.safeParse(raw)
        if (!p.success) throw new RepoError('invalid', 'Message invalide.')
        return opts.chat.edit(s.data.token, p.data.id, p.data.body)
      }),
    )
    s.on(
      'chat:delete',
      mutate('chat:delete', async (raw) => {
        const p = schemas.id.safeParse(raw)
        if (!p.success) throw new RepoError('invalid', 'Message invalide.')
        return opts.chat.remove(s.data.token, p.data.id)
      }),
    )
    s.on('chat:report', async (raw, ack) => {
      if (typeof ack !== 'function') return
      const p = schemas.report.safeParse(raw)
      if (!p.success) return ack(fail('invalid', 'Signalement invalide.'))
      try {
        await opts.chat.report(s.data.token, p.data.id, p.data.reason)
        ack({ ok: true })
      } catch (e) {
        ack(asFail(e))
      }
    })
    s.on('chat:block', async (raw, ack) => {
      if (typeof ack !== 'function') return
      const p = schemas.id.safeParse(raw)
      if (!p.success) return ack(fail('invalid', 'Message invalide.'))
      try {
        const key = await opts.chat.block(s.data.token, p.data.id)
        if (!me.blocked.includes(key)) me.blocked.push(key)
        // A block also closes any private conversation with that person.
        const room = `dm:${[me.key, key].sort().join(':')}`
        await revoke(me.key, room)
        await revoke(key, room)
        ack({ ok: true, key })
      } catch (e) {
        ack(asFail(e))
      }
    })

    // Private conversations: the database decides (consent, blocks, daily cap); the relay then
    // joins both people's sockets (every tab) to the room and tells them.
    const grant = async (key: string, room: string, peer: Peer) => {
      io.in(`user:${key}`).socketsJoin(room)
      io.to(`user:${key}`).emit('dm:opened', { room, peer })
    }
    const revoke = async (key: string, room: string) => {
      io.in(`user:${key}`).socketsLeave(room)
      io.to(`user:${key}`).emit('dm:closed', { room })
    }
    s.on('dm:open', async (raw, ack) => {
      if (typeof ack !== 'function') return
      const p = schemas.key.safeParse(raw)
      if (!p.success || p.data.key === me.key) return ack(fail('invalid', 'Joueur inconnu.'))
      try {
        const { room, peer } = await opts.chat.dmOpen(s.data.token, p.data.key)
        await grant(me.key, room, peer)
        await grant(peer.key, room, { key: me.key, name: me.name, pagne: me.pagne })
        ack({ ok: true, room, peer })
      } catch (e) {
        reject(e instanceof RepoError ? e.code : 'unavailable')
        ack(asFail(e))
      }
    })
    s.on('dm:peers', async (_raw, ack) => {
      if (typeof ack !== 'function') return
      try {
        ack({ ok: true, peers: await opts.chat.dmPeers(s.data.token) })
      } catch (e) {
        ack(asFail(e))
      }
    })
    s.on('player:block', async (raw, ack) => {
      if (typeof ack !== 'function') return
      const p = schemas.key.safeParse(raw)
      if (!p.success) return ack(fail('invalid', 'Joueur inconnu.'))
      try {
        const key = await opts.chat.blockKey(s.data.token, p.data.key)
        if (!me.blocked.includes(key)) me.blocked.push(key)
        const room = `dm:${[me.key, key].sort().join(':')}`
        await revoke(me.key, room)
        await revoke(key, room)
        ack({ ok: true, key })
      } catch (e) {
        ack(asFail(e))
      }
    })
    s.on('player:report', async (raw, ack) => {
      if (typeof ack !== 'function') return
      const p = schemas.reportKey.safeParse(raw)
      if (!p.success) return ack(fail('invalid', 'Signalement invalide.'))
      try {
        await opts.chat.reportUser(s.data.token, p.data.key, p.data.reason)
        ack({ ok: true })
      } catch (e) {
        ack(asFail(e))
      }
    })

    s.on('chat:typing', (raw) => {
      const p = schemas.typing.safeParse(raw)
      if (!p.success || !allowed(p.data.room) || !me.can_write) return
      const now = Date.now()
      if (now - s.data.lastTyping < LIMITS.typingEveryMs) return
      s.data.lastTyping = now
      s.to(p.data.room).volatile.emit('chat:typing', {
        room: p.data.room,
        key: me.key,
        name: me.name,
      })
    })

    // Public presence is bounded by a server-assigned world, never the whole city population.
    s.on('presence:join', async (raw, ack) => {
      if (typeof ack !== 'function') return
      const p = schemas.presence.safeParse(raw)
      if (!p.success) return ack(fail('invalid', 'Localité inconnue.'))
      if (s.data.joining) return ack(fail('rate_limited', 'Changement de ville en cours.'))
      s.data.joining = true
      const loc = p.data.locality
      try {
        if (s.data.locality && s.data.locality !== loc) await leavePresence(s)
        const entry: PresenceEntry = { key: me.key, name: me.name, pagne: me.pagne, locality: loc }
        const membership = await worlds.join(s.id, loc, entry)
        if (!s.connected) {
          await worlds.leave(s.id, loc)
          return
        }
        const changed = s.data.world !== membership.world
        if (changed && s.data.world) {
          await s.leave(worldRoom(s.data.world))
          setViews(s, [])
          pendingPoses.delete(s.id)
          s.data.lastPose = null
        }
        s.data.locality = loc
        s.data.world = membership.world
        await s.join(worldRoom(membership.world))
        if (changed && !s.data.focused) setViews(s, [`waiting:${membership.world}`])
        if (changed) s.to(worldRoom(membership.world)).emit('presence:join', entry)
        ack({ ok: true, present: membership.present, world: membership.world })
      } catch {
        reject('presence_unavailable')
        ack(fail('unavailable', 'Le quartier se reconnecte, réessaie.'))
      } finally {
        s.data.joining = false
      }
    })

    // Movement: a few snapshots per second, to the same locality only, plausibility-checked.
    s.on('player:pose', (raw) => {
      const world = s.data.world
      const p = schemas.pose.safeParse(raw)
      if (!world || !p.success) {
        metrics.posesDropped++
        return
      }
      const now = Date.now()
      s.data.poseTimes = s.data.poseTimes.filter((t) => now - t < 1000)
      if (s.data.poseTimes.length >= LIMITS.poseHz + 2) {
        metrics.posesDropped++
        return
      }
      const last = s.data.lastPose
      if (last) {
        const dt = Math.max(0.05, (now - last.t) / 1000)
        // Taxi tops at 9 cells/s; anything far beyond is a teleport or a forged pose.
        if (Math.hypot(p.data.x - last.x, p.data.z - last.z) / dt > 14) {
          metrics.posesDropped++
          return
        }
      }
      s.data.poseTimes.push(now)
      s.data.lastPose = { x: p.data.x, z: p.data.z, t: now }
      metrics.posesRelayed++
      const pose: Pose = { ...p.data, heading: ((p.data.heading % 360) + 360) % 360 }
      const views = viewRooms(world, pose.x, pose.z)
      if (views[0] !== s.data.views[0]) setViews(s, views)
      const snapshot = { key: me.key, pose, t: now }
      publishPose(sectorRoom(world, sector(pose.x, pose.z)), snapshot)
      // Legacy clients get a short bootstrap until their first pose. Modern clients send a
      // coalesced batch through the existing interpolation feed, never through React state.
      if (!s.data.focused) publishPose(`waiting:${world}`, snapshot)
    })

    s.on('disconnect', () => {
      metrics.connections--
      track(leavePresence(s))
      log('disconnect', { key: me.key })
    })
  })

  return {
    io,
    http,
    metrics,
    drain: () => {
      draining = true
    },
    listen: (port: number, host = '0.0.0.0') =>
      new Promise<void>((resolve, reject) => {
        http.once('error', reject)
        http.listen(port, host, () => {
          http.off('error', reject)
          resolve()
        })
      }),
    close: async () => {
      draining = true
      clearInterval(heartbeat)
      clearInterval(poseTimer)
      clearInterval(activityTimer)
      for (const view of viewers.values()) view.unsubscribe()
      viewers.clear()
      pendingPoses.clear()
      lag.disable()
      await new Promise<void>((resolve) => io.close(() => resolve()))
      await Promise.allSettled([...cleanup])
    },
  }
}
