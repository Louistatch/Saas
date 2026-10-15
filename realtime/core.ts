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
import { Server, type Socket } from 'socket.io'
import { z } from 'zod'
import {
  type Ack,
  type ChatMessage,
  type ClientToServer,
  type ErrorCode,
  KEY_PATTERN,
  LIMITS,
  LOCALITIES,
  type Locality,
  type Me,
  PROTOCOL_VERSION,
  type Peer,
  type Pose,
  type PresenceEntry,
  ROOM_PATTERN,
  type ServerToClient,
} from '../lib/haroolife/realtime/protocol'

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
  resume: z.object({ cursors: z.record(room, z.number().int().nonnegative()) }),
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
  // Presence of this instance: author key → entry and its sockets (a person may have two tabs).
  const present = new Map<string, { entry: PresenceEntry; sockets: Set<string> }>()

  const http: HttpServer = createServer((req: IncomingMessage, res: ServerResponse) => {
    if (req.url === '/health') {
      const sorted = [...metrics.ackMs].sort((a, b) => a - b)
      const p = (q: number) =>
        sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] ?? null
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
      res.end(
        JSON.stringify({
          ok: !opts.disabled?.(),
          v: PROTOCOL_VERSION,
          connections: metrics.connections,
          connectionsTotal: metrics.connectionsTotal,
          present: present.size,
          messagesStored: metrics.messagesStored,
          messagesDuplicate: metrics.messagesDuplicate,
          rejected: metrics.rejected,
          posesRelayed: metrics.posesRelayed,
          posesDropped: metrics.posesDropped,
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
    try {
      const user = await opts.auth.verify(token)
      if (!user) {
        reject('auth')
        return next(Object.assign(new Error('auth_required'), { data: { code: 'auth_expired' } }))
      }
      const me = await opts.chat.me(token)
      socket.data = {
        token,
        me,
        locality: null,
        sendTimes: [],
        lastTyping: 0,
        lastPose: null,
        poseTimes: [],
      }
      next()
    } catch (e) {
      const code = e instanceof RepoError ? e.code : 'unavailable'
      reject(code)
      next(Object.assign(new Error(code), { data: { code } }))
    }
  })

  const leavePresence = (s: Sock) => {
    const key = s.data.me.key
    const p = present.get(key)
    if (!p) return
    p.sockets.delete(s.id)
    if (p.sockets.size === 0) {
      present.delete(key)
      if (p.entry.locality)
        io.to(`here:${p.entry.locality}`).emit('presence:leave', {
          key,
          locality: p.entry.locality,
        })
    }
  }

  io.on('connection', (s: Sock) => {
    metrics.connections++
    metrics.connectionsTotal++
    const me = s.data.me
    for (const r of me.rooms) if (ROOM_PATTERN.test(r)) void s.join(r)
    void s.join(`user:${me.key}`)
    s.emit('system:hello', { v: PROTOCOL_VERSION, me })
    log('connect', { key: me.key, rooms: me.rooms.length })
    const allowed = (r: string) => me.rooms.includes(r)

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
        const stored = await opts.chat.send(s.data.token, p.data.room, p.data.body, p.data.clientId)
        metrics.ackMs.push(Math.round(performance.now() - t0))
        if (metrics.ackMs.length > 500) metrics.ackMs.shift()
        if (stored.duplicate) metrics.messagesDuplicate++
        else {
          metrics.messagesStored++
          // Stored first, then broadcast: everyone in the room, the sender's other tabs included.
          io.to(p.data.room).emit('chat:new', forRoom(stored))
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
      for (const t of await io.in(`user:${key}`).fetchSockets()) {
        if (!t.data.me.rooms.includes(room)) t.data.me.rooms.push(room)
        t.join(room)
        t.emit('dm:opened', { room, peer })
      }
    }
    const revoke = async (key: string, room: string) => {
      for (const t of await io.in(`user:${key}`).fetchSockets()) {
        t.data.me.rooms = t.data.me.rooms.filter((r) => r !== room)
        t.leave(room)
        t.emit('dm:closed', { room })
      }
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

    // Presence: slow state only (connected, which locality). Never a position.
    s.on('presence:join', (raw, ack) => {
      if (typeof ack !== 'function') return
      const p = schemas.presence.safeParse(raw)
      if (!p.success) return ack(fail('invalid', 'Localité inconnue.'))
      const loc = p.data.locality
      if (s.data.locality && s.data.locality !== loc) {
        void s.leave(`here:${s.data.locality}`)
        leavePresence(s)
      }
      s.data.locality = loc
      s.data.lastPose = null
      void s.join(`here:${loc}`)
      const entry: PresenceEntry = { key: me.key, name: me.name, pagne: me.pagne, locality: loc }
      const cur = present.get(me.key)
      if (cur) {
        cur.sockets.add(s.id)
        cur.entry = entry
      } else present.set(me.key, { entry, sockets: new Set([s.id]) })
      s.to(`here:${loc}`).emit('presence:join', entry)
      ack({
        ok: true,
        present: [...present.values()]
          .map((x) => x.entry)
          .filter((e) => e.locality === loc && e.key !== me.key),
      })
    })

    // Movement: a few snapshots per second, to the same locality only, plausibility-checked.
    s.on('player:pose', (raw) => {
      const loc = s.data.locality
      const p = schemas.pose.safeParse(raw)
      if (!loc || !p.success) {
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
          s.data.lastPose = { x: p.data.x, z: p.data.z, t: now }
          return
        }
      }
      s.data.poseTimes.push(now)
      s.data.lastPose = { x: p.data.x, z: p.data.z, t: now }
      metrics.posesRelayed++
      const pose: Pose = { ...p.data, heading: ((p.data.heading % 360) + 360) % 360 }
      s.to(`here:${loc}`).volatile.emit('player:snapshot', { key: me.key, pose, t: now })
    })

    s.on('disconnect', () => {
      metrics.connections--
      leavePresence(s)
      log('disconnect', { key: me.key })
    })
  })

  return {
    io,
    http,
    metrics,
    listen: (port: number, host = '0.0.0.0') =>
      new Promise<void>((resolve) => http.listen(port, host, () => resolve())),
    close: () =>
      new Promise<void>((resolve) => {
        io.close(() => resolve())
      }),
  }
}
