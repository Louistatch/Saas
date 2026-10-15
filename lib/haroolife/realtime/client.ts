/**
 * Browser side of the HarooLife realtime relay (D4+, M1). Framework-free: React reads it through
 * `subscribe` / `snapshot`; movement snapshots go to a separate listener (never React state).
 *
 * Guarantees the UI relies on:
 * - a message typed offline waits in a bounded outbox and is sent on reconnection with the SAME
 *   clientId (the database makes the resend idempotent): never lost, never doubled;
 * - after any reconnection the client asks for everything stored after its last seq per room;
 * - messages are deduplicated by id and kept sorted by seq.
 */
import type { Socket } from 'socket.io-client'
import {
  type ChatMessage,
  type ClientToServer,
  LIMITS,
  type Locality,
  type Me,
  type Peer,
  type Pose,
  type PresenceEntry,
  type RoomId,
  type ServerToClient,
} from './protocol'

export type RealtimeStatus =
  | 'idle'
  | 'connecting'
  | 'online'
  | 'offline'
  | 'signed-out'
  | 'denied'
  | 'disabled'
export interface Outgoing {
  clientId: string
  room: RoomId
  body: string
  state: 'sending' | 'queued' | 'error'
  error?: string
  at: number
}
export interface RealtimeSnapshot {
  status: RealtimeStatus
  me: Me | null
  rooms: Record<RoomId, ChatMessage[]>
  outbox: Outgoing[]
  unread: Record<RoomId, number>
  typing: Record<RoomId, { key: string; name: string }[]>
  present: PresenceEntry[]
  /** The other person of each private conversation (room → peer). */
  peers: Record<RoomId, Peer>
  /** Last change, for cheap memo keys. */
  version: number
}
type Snap = { key: string; pose: Pose; t: number }
type IOSocket = Socket<ServerToClient, ClientToServer>
const KEEP = 200

/** RFC 4122 v4 id. crypto.randomUUID needs a secure context, which a phone on the LAN over
 * plain http is not; getRandomValues works everywhere. */
export function uuid(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  const b = crypto.getRandomValues(new Uint8Array(16))
  b[6] = (b[6] & 0x0f) | 0x40
  b[8] = (b[8] & 0x3f) | 0x80
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}

export class RealtimeClient {
  private socket: IOSocket | null = null
  private state: RealtimeSnapshot = {
    status: 'idle',
    me: null,
    rooms: {},
    outbox: [],
    unread: {},
    typing: {},
    present: [],
    peers: {},
    version: 0,
  }
  private listeners = new Set<() => void>()
  private poseListeners = new Set<(s: Snap) => void>()
  private presentMap = new Map<string, PresenceEntry>()
  /** Connection health for the in-game diagnostic panel (read on demand, never rendered from). */
  private health = { attempts: 0, reconnects: 0, onlineSince: 0, lastDropAt: 0, lastDrop: '' }
  private typingTimers = new Map<string, number>()
  private lastTyping = 0
  private locality: Locality | null = null
  private reading: RoomId | null = null
  private loadedOnce = false
  private stopped = false
  private flushQueued = false

  constructor(
    private url: string,
    private token: () => Promise<string | null>,
  ) {}

  snapshot = () => this.state
  subscribe = (fn: () => void) => {
    this.listeners.add(fn)
    return () => {
      this.listeners.delete(fn)
    }
  }
  onPose(fn: (s: Snap) => void) {
    this.poseListeners.add(fn)
    return () => {
      this.poseListeners.delete(fn)
    }
  }

  private set(patch: Partial<RealtimeSnapshot>) {
    this.state = { ...this.state, ...patch, version: this.state.version + 1 }
    if (this.flushQueued) return
    this.flushQueued = true
    queueMicrotask(() => {
      this.flushQueued = false
      for (const fn of this.listeners) fn()
    })
  }

  async start() {
    if (this.socket || this.stopped) return
    const first = await this.token()
    if (!first) {
      this.set({ status: 'signed-out' })
      return
    }
    this.set({ status: 'connecting' })
    const { io } = await import('socket.io-client')
    const socket: IOSocket = io(this.url, {
      // WebSocket only (no long-polling: no sticky sessions, Vercel-compatible).
      transports: ['websocket'],
      auth: (cb) => {
        void this.token().then((token) => cb({ token: token ?? '' }))
      },
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 30_000,
      randomizationFactor: 0.5,
      timeout: 10_000,
    })
    this.socket = socket
    socket.io.on('reconnect_attempt', (n) => {
      this.health.attempts = n
    })
    socket.on('system:hello', ({ me }) => {
      if (this.health.onlineSince || this.health.lastDropAt) this.health.reconnects++
      this.health.attempts = 0
      this.health.onlineSince = Date.now()
      this.set({ me, status: 'online' })
      void this.afterConnect()
    })
    socket.on('disconnect', (reason) => {
      this.health.onlineSince = 0
      this.health.lastDropAt = Date.now()
      this.health.lastDrop = reason
      // A disconnect decided by the relay is not retried by Socket.IO on its own.
      if (reason === 'io server disconnect' && !this.stopped)
        window.setTimeout(() => socket.connect(), 2000)
      this.presentMap.clear()
      this.set({ status: this.stopped ? 'idle' : 'offline', present: [], typing: {} })
    })
    socket.on('connect_error', (err: Error & { data?: { code?: string } }) => {
      const code = err.data?.code
      if (code === 'disabled' || code === 'forbidden') {
        // Kill switch, or an account the database gives no room to: stop, do not hammer.
        socket.disconnect()
        this.set({ status: code === 'disabled' ? 'disabled' : 'denied' })
      } else if (code === 'auth_expired') {
        // A refreshed token is fetched on the next attempt; with no session, stop trying.
        void this.token().then((t) => {
          if (!t) {
            socket.disconnect()
            this.set({ status: 'signed-out' })
          } else this.set({ status: 'offline' })
        })
      } else this.set({ status: 'offline' })
    })
    socket.on('chat:new', (m) => this.receive([m], true))
    socket.on('chat:edit', (m) => this.receive([m], false))
    socket.on('chat:delete', (m) => this.receive([m], false))
    socket.on('chat:typing', ({ room, key, name }) => {
      if (key === this.state.me?.key) return
      const list = (this.state.typing[room] ?? []).filter((t) => t.key !== key)
      this.set({ typing: { ...this.state.typing, [room]: [...list, { key, name }] } })
      const id = `${room}:${key}`
      window.clearTimeout(this.typingTimers.get(id))
      this.typingTimers.set(
        id,
        window.setTimeout(() => {
          const rest = (this.state.typing[room] ?? []).filter((t) => t.key !== key)
          this.set({ typing: { ...this.state.typing, [room]: rest } })
        }, 4000),
      )
    })
    socket.on('dm:opened', ({ room, peer }) => {
      const me = this.state.me
      if (!me) return
      this.set({
        me: me.rooms.includes(room) ? me : { ...me, rooms: [...me.rooms, room] },
        peers: { ...this.state.peers, [room]: peer },
      })
    })
    socket.on('dm:closed', ({ room }) => {
      const me = this.state.me
      if (!me) return
      const { [room]: _gone, ...rooms } = this.state.rooms
      const { [room]: _peer, ...peers } = this.state.peers
      this.set({ me: { ...me, rooms: me.rooms.filter((r) => r !== room) }, rooms, peers })
    })
    socket.on('presence:join', (e) => {
      this.presentMap.set(e.key, e)
      this.set({ present: [...this.presentMap.values()] })
    })
    socket.on('presence:leave', ({ key }) => {
      this.presentMap.delete(key)
      this.set({ present: [...this.presentMap.values()] })
    })
    socket.on('player:snapshot', (s) => {
      for (const fn of this.poseListeners) fn(s)
    })
    socket.on('system:error', ({ error }) => {
      this.set({ status: 'offline' })
      console.warn('[realtime]', error)
    })
    window.addEventListener('online', this.onOnline)
  }

  /** Reconnection attempts in progress, reconnections since start, and the last drop. */
  diagnostics() {
    return { ...this.health, connected: this.socket?.connected ?? false }
  }

  private onOnline = () => {
    if (this.socket && !this.socket.connected) this.socket.connect()
  }

  stop() {
    this.stopped = true
    window.removeEventListener('online', this.onOnline)
    for (const t of this.typingTimers.values()) window.clearTimeout(t)
    this.socket?.disconnect()
    this.socket = null
    this.set({ status: 'idle' })
  }

  /** First connection: recent history; later ones: only what was missed (by seq cursor). */
  private async afterConnect() {
    const s = this.socket
    const me = this.state.me
    if (!s || !me) return
    try {
      // Who each private conversation is with (names for the phone).
      if (me.rooms.some((r) => r.startsWith('dm:'))) {
        const p = await s.timeout(LIMITS.ackTimeoutMs).emitWithAck('dm:peers', {})
        if (p.ok) this.set({ peers: { ...this.state.peers, ...p.peers } })
      }
      if (!this.loadedOnce) {
        for (const room of me.rooms) {
          const r = await s
            .timeout(LIMITS.ackTimeoutMs)
            .emitWithAck('chat:history', { room, limit: 30 })
          if (r.ok) this.receive(r.messages, false)
        }
        this.loadedOnce = true
      } else {
        const cursors: Record<RoomId, number> = {}
        for (const room of me.rooms) cursors[room] = this.cursor(room)
        const r = await s.timeout(LIMITS.ackTimeoutMs).emitWithAck('sync:resume', { cursors })
        if (r.ok)
          for (const list of Object.values(r.messages) as ChatMessage[][]) this.receive(list, true)
      }
    } catch {
      // Timed out: the next reconnection resumes from the same cursors.
    }
    if (this.locality) void this.join(this.locality)
    await this.flush()
  }

  private cursor(room: RoomId) {
    const list = this.state.rooms[room]
    return list?.length ? list[list.length - 1].seq : 0
  }

  private receive(list: ChatMessage[], fresh: boolean) {
    if (!list.length) return
    const rooms = { ...this.state.rooms }
    const unread = { ...this.state.unread }
    const blocked = new Set(this.state.me?.blocked ?? [])
    let outbox = this.state.outbox
    for (const m of list) {
      if (blocked.has(m.author.key)) continue
      const cur = rooms[m.room] ?? []
      const i = cur.findIndex((x) => x.id === m.id)
      let next: ChatMessage[]
      if (i >= 0) next = cur.map((x) => (x.id === m.id ? m : x))
      else {
        next = [...cur, m].sort((a, b) => a.seq - b.seq).slice(-KEEP)
        const mine = m.author.key === this.state.me?.key
        if (fresh && !mine && this.reading !== m.room) unread[m.room] = (unread[m.room] ?? 0) + 1
      }
      rooms[m.room] = next
      if (m.client_id) outbox = outbox.filter((o) => o.clientId !== m.client_id)
    }
    this.set({ rooms, unread, outbox })
  }

  /** Send now if online, otherwise queue (bounded). Same clientId on every retry. */
  send(room: RoomId, body: string): string | null {
    const text = body.trim()
    if (!text) return null
    if (this.state.outbox.length >= LIMITS.outbox)
      return 'Trop de messages en attente : reconnecte-toi.'
    const item: Outgoing = {
      clientId: uuid(),
      room,
      body: text.slice(0, LIMITS.body),
      state: this.socket?.connected ? 'sending' : 'queued',
      at: Date.now(),
    }
    this.set({ outbox: [...this.state.outbox, item] })
    void this.deliver(item)
    return null
  }

  retry(clientId: string) {
    const item = this.state.outbox.find((o) => o.clientId === clientId)
    if (!item) return
    const next = { ...item, state: 'sending' as const, error: undefined }
    this.set({ outbox: this.state.outbox.map((o) => (o.clientId === clientId ? next : o)) })
    void this.deliver(next)
  }

  discard(clientId: string) {
    this.set({ outbox: this.state.outbox.filter((o) => o.clientId !== clientId) })
  }

  private async flush() {
    for (const o of this.state.outbox) if (o.state !== 'error') await this.deliver(o)
  }

  private async deliver(item: Outgoing) {
    const s = this.socket
    if (!s?.connected) return
    const update = (patch: Partial<Outgoing>) =>
      this.set({
        outbox: this.state.outbox.map((o) =>
          o.clientId === item.clientId ? { ...o, ...patch } : o,
        ),
      })
    try {
      const r = await s.timeout(LIMITS.ackTimeoutMs).emitWithAck('chat:send', {
        v: 1,
        room: item.room,
        body: item.body,
        clientId: item.clientId,
      })
      if (r.ok) this.receive([{ ...r.message, client_id: item.clientId }], false)
      else if (r.code === 'auth_expired') {
        // The relay holds the token from the handshake: reconnect so a refreshed one is sent;
        // the queued message goes out again (same clientId) once connected.
        update({ state: 'queued' })
        this.reauth()
      } else if (r.code === 'unavailable') update({ state: 'queued' })
      else update({ state: 'error', error: r.error })
    } catch {
      // No ack in time: maybe stored, maybe not. The resend (same clientId) settles it.
      update({ state: 'queued' })
    }
  }

  private reauthing = false
  private reauth() {
    const s = this.socket
    if (!s || this.reauthing) return
    this.reauthing = true
    s.disconnect()
    window.setTimeout(() => {
      this.reauthing = false
      if (!this.stopped) s.connect()
    }, 500)
  }

  async olderThan(room: RoomId) {
    const s = this.socket
    const first = this.state.rooms[room]?.[0]
    if (!s?.connected || !first) return 0
    const r = await s
      .timeout(LIMITS.ackTimeoutMs)
      .emitWithAck('chat:history', { room, before: first.seq, limit: LIMITS.historyPage })
      .catch(() => null)
    if (!r?.ok) return 0
    this.receive(r.messages, false)
    return r.messages.length
  }

  typing(room: RoomId) {
    const now = Date.now()
    if (!this.socket?.connected || now - this.lastTyping < LIMITS.typingEveryMs) return
    this.lastTyping = now
    this.socket.emit('chat:typing', { room })
  }

  /** The room on screen: its messages count as read. */
  read(room: RoomId | null) {
    this.reading = room
    if (room && this.state.unread[room]) this.set({ unread: { ...this.state.unread, [room]: 0 } })
  }

  async remove(id: string) {
    const r = await this.socket
      ?.timeout(LIMITS.ackTimeoutMs)
      .emitWithAck('chat:delete', { id })
      .catch(() => null)
    return r?.ok ? null : r && !r.ok ? r.error : 'Hors connexion.'
  }
  async report(id: string, reason: string) {
    const r = await this.socket
      ?.timeout(LIMITS.ackTimeoutMs)
      .emitWithAck('chat:report', { id, reason })
      .catch(() => null)
    return r?.ok ? null : r && !r.ok ? r.error : 'Hors connexion.'
  }
  async block(id: string) {
    const r = await this.socket
      ?.timeout(LIMITS.ackTimeoutMs)
      .emitWithAck('chat:block', { id })
      .catch(() => null)
    if (!r?.ok) return r && !r.ok ? r.error : 'Hors connexion.'
    const me = this.state.me
    if (me) {
      const rooms: Record<RoomId, ChatMessage[]> = {}
      for (const [k, v] of Object.entries(this.state.rooms))
        rooms[k] = v.filter((m) => m.author.key !== r.key)
      this.set({ me: { ...me, blocked: [...me.blocked, r.key] }, rooms })
    }
    return null
  }

  /**
   * A private conversation with a player met in the street (by their presence key). Returns the
   * room, or an error message (blocked, cap reached, offline…).
   */
  async openDm(key: string): Promise<{ room: RoomId; peer: Peer } | { error: string }> {
    const r = await this.socket
      ?.timeout(LIMITS.ackTimeoutMs)
      .emitWithAck('dm:open', { key })
      .catch(() => null)
    if (!r?.ok) return { error: r && !r.ok ? r.error : 'Hors connexion.' }
    const me = this.state.me
    if (me)
      this.set({
        me: me.rooms.includes(r.room) ? me : { ...me, rooms: [...me.rooms, r.room] },
        peers: { ...this.state.peers, [r.room]: r.peer },
      })
    // Earlier messages of this conversation, if any.
    const h = await this.socket
      ?.timeout(LIMITS.ackTimeoutMs)
      .emitWithAck('chat:history', { room: r.room, limit: 30 })
      .catch(() => null)
    if (h?.ok) this.receive(h.messages, false)
    return { room: r.room, peer: r.peer }
  }
  /** From a player's sheet: block (their messages disappear, conversations close) or report. */
  async blockPlayer(key: string) {
    const r = await this.socket
      ?.timeout(LIMITS.ackTimeoutMs)
      .emitWithAck('player:block', { key })
      .catch(() => null)
    if (!r?.ok) return r && !r.ok ? r.error : 'Hors connexion.'
    const me = this.state.me
    if (me) {
      const rooms: Record<RoomId, ChatMessage[]> = {}
      for (const [k, v] of Object.entries(this.state.rooms))
        rooms[k] = v.filter((m) => m.author.key !== key)
      this.set({ me: { ...me, blocked: [...me.blocked, key] }, rooms })
    }
    return null
  }
  async reportPlayer(key: string, reason: string) {
    const r = await this.socket
      ?.timeout(LIMITS.ackTimeoutMs)
      .emitWithAck('player:report', { key, reason })
      .catch(() => null)
    return r?.ok ? null : r && !r.ok ? r.error : 'Hors connexion.'
  }

  /** Where the player is (slow presence). Re-sent after each reconnection. */
  async join(locality: Locality) {
    this.locality = locality
    const s = this.socket
    if (!s?.connected) return
    const r = await s
      .timeout(LIMITS.ackTimeoutMs)
      .emitWithAck('presence:join', { locality })
      .catch(() => null)
    if (!r?.ok) return
    this.presentMap.clear()
    for (const e of r.present) this.presentMap.set(e.key, e)
    this.set({ present: [...this.presentMap.values()] })
  }

  /** Close the transport as a lost network would (tests, and « Se reconnecter » in the UI). */
  drop() {
    this.socket?.io.engine?.close()
  }

  /** A movement snapshot (the caller throttles to a few Hz; volatile: dropped when offline). */
  pose(p: Pose) {
    if (this.socket?.connected && this.locality) this.socket.volatile.emit('player:pose', p)
  }
}
