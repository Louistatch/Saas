import assert from 'node:assert/strict'
import type { AddressInfo } from 'node:net'
import { after, before, describe, it } from 'node:test'
import { type Socket, io } from 'socket.io-client'
import type {
  ChatMessage,
  ClientToServer,
  ServerToClient,
} from '../lib/haroolife/realtime/protocol'
import { type RealtimeAuth, createRealtime } from '../realtime/core'
import { LOCAL_ACCOUNTS, LOCAL_CANTONS, LOCAL_COOPS, pgliteChat } from '../realtime/pglite'

/**
 * The Socket.IO relay end to end, with real clients and the REAL chat migration (PGlite):
 * authorisation of rooms, store-then-broadcast with ack, idempotent resend, catch-up after a
 * reconnection, presence, movement snapshots, validation, kill switch.
 */
type C = Socket<ServerToClient, ClientToServer>
const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url')
const tokenFor = (sub: string) => `${b64({ alg: 'none' })}.${b64({ sub, exp: 4102444800 })}.x`
// Stand-in for Supabase Auth: accepts only the fixture accounts' tokens.
const known = new Set(Object.values(LOCAL_ACCOUNTS).map((a) => a.id))
const auth: RealtimeAuth = {
  async verify(token) {
    try {
      const sub = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString()).sub
      return known.has(sub) ? { userId: sub } : null
    } catch {
      return null
    }
  },
}
const BE = `canton:${LOCAL_CANTONS.be}`
const KARA = `canton:${LOCAL_CANTONS.kara}`
let disabled = false
let relay: ReturnType<typeof createRealtime>
let url = ''
const clients: C[] = []
const connect = (who: keyof typeof LOCAL_ACCOUNTS | null, token?: string) => {
  const c: C = io(url, {
    transports: ['websocket'],
    auth: { token: token ?? (who ? tokenFor(LOCAL_ACCOUNTS[who].id) : '') },
    reconnection: false,
    forceNew: true,
  })
  clients.push(c)
  return c
}
const ready = (c: C) =>
  new Promise<void>((resolve, reject) => {
    c.once('system:hello', () => resolve())
    c.once('connect_error', reject)
  })
const next = <E extends keyof ServerToClient>(c: C, e: E, ms = 2000) =>
  new Promise<Parameters<ServerToClient[E]>[0]>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`no ${e}`)), ms)
    c.once(e, ((p: Parameters<ServerToClient[E]>[0]) => {
      clearTimeout(t)
      resolve(p)
    }) as never)
  })
const silent = async <E extends keyof ServerToClient>(c: C, e: E, ms = 400) => {
  let got = false
  const on = () => {
    got = true
  }
  c.on(e, on as never)
  await new Promise((r) => setTimeout(r, ms))
  c.off(e, on as never)
  return !got
}
const send = (c: C, room: string, body: string, clientId = crypto.randomUUID()) =>
  c.timeout(4000).emitWithAck('chat:send', { v: 1, room, body, clientId })

describe('HarooLife Socket.IO relay', () => {
  before(async () => {
    const chat = await pgliteChat('supabase/migrations/20261013_120000_haroolife_realtime_chat.sql')
    relay = createRealtime({
      auth,
      chat,
      origins: ['http://127.0.0.1:3000'],
      disabled: () => disabled,
    })
    await relay.listen(0, '127.0.0.1')
    url = `http://127.0.0.1:${(relay.http.address() as AddressInfo).port}`
  })
  after(async () => {
    for (const c of clients) c.disconnect()
    await relay.close()
  })

  it('refuses a connection without a valid session', async () => {
    for (const token of ['', tokenFor('99999999-0000-4000-8000-000000000009'), 'garbage']) {
      const c = connect(null, token)
      const err = await new Promise<Error & { data?: { code: string } }>((r) =>
        c.once('connect_error', r),
      )
      assert.equal(err.data?.code, 'auth_expired')
    }
  })

  it('stores then broadcasts within the canton only, with an ack carrying the stored message', async () => {
    const ama = connect('ama')
    const yawa = connect('yawa')
    const kofi = connect('kofi')
    await Promise.all([ready(ama), ready(yawa), ready(kofi)])
    const incoming = next(yawa, 'chat:new')
    const kofiSilent = silent(kofi, 'chat:new')
    const t0 = performance.now()
    const ack = await send(ama, BE, 'Réunion au marché de Bè à 16 h')
    const rtt = performance.now() - t0
    assert.equal(ack.ok, true)
    if (!ack.ok) return
    assert.ok(ack.message.seq > 0)
    assert.equal(ack.message.author.name, 'Ama (test)')
    const got = await incoming
    assert.equal(got.id, ack.message.id)
    assert.equal(got.body, 'Réunion au marché de Bè à 16 h')
    assert.equal((got as ChatMessage).client_id, undefined, 'no client id for others')
    assert.equal(await kofiSilent, true, 'Kara never receives Bè')
    assert.ok(rtt < 1000, `local store+ack ${rtt.toFixed(0)} ms`)

    // Kofi cannot write into, nor read, the Bè canton or Ama's cooperative.
    const denied = await send(kofi, BE, 'intrus')
    assert.equal(denied.ok, false)
    if (!denied.ok) assert.equal(denied.code, 'forbidden')
    const h = await kofi
      .timeout(3000)
      .emitWithAck('chat:history', { room: `coop:${LOCAL_COOPS.c1}` })
    assert.equal(h.ok, false)
    // Kofi's own canton works.
    assert.equal((await send(kofi, KARA, 'Bonsoir Kara')).ok, true)
    for (const c of [ama, yawa, kofi]) c.disconnect()
  })

  it('a resend with the same clientId is the same message, never broadcast twice', async () => {
    const ama = connect('ama')
    const yawa = connect('yawa')
    await Promise.all([ready(ama), ready(yawa)])
    const id = crypto.randomUUID()
    const seen: string[] = []
    yawa.on('chat:new', (m) => seen.push(m.id))
    const a = await send(ama, 'locality:lome', 'Une seule fois', id)
    const b = await send(ama, 'locality:lome', 'Une seule fois', id)
    assert.ok(a.ok && b.ok)
    if (a.ok && b.ok) assert.equal(a.message.id, b.message.id)
    await new Promise((r) => setTimeout(r, 300))
    assert.equal(seen.length, 1)
    ama.disconnect()
    yawa.disconnect()
  })

  it('catches up after a disconnection by seq cursor, in order, with nothing duplicated', async () => {
    const ama = connect('ama')
    let kofi = connect('kofi')
    await Promise.all([ready(ama), ready(kofi)])
    const last = await send(ama, 'locality:lome', 'avant la coupure')
    assert.ok(last.ok)
    const cursor = last.ok ? last.message.seq : 0
    kofi.disconnect() // the phone loses the network
    const m1 = await send(ama, 'locality:lome', 'pendant la coupure 1')
    const m2 = await send(ama, 'locality:lome', 'pendant la coupure 2')
    kofi = connect('kofi')
    await ready(kofi)
    const r = await kofi
      .timeout(3000)
      .emitWithAck('sync:resume', { cursors: { 'locality:lome': cursor } })
    assert.equal(r.ok, true)
    if (r.ok && m1.ok && m2.ok)
      assert.deepEqual(
        r.messages['locality:lome'].map((m: ChatMessage) => m.id),
        [m1.message.id, m2.message.id],
      )
    // A cursor for a room Kofi may not read is ignored, not answered.
    const r2 = await kofi.timeout(3000).emitWithAck('sync:resume', { cursors: { [BE]: 0 } })
    assert.ok(r2.ok && !(BE in r2.messages))
    ama.disconnect()
    kofi.disconnect()
  })

  it('presence by locality and throttled, plausibility-checked movement snapshots', async () => {
    const ama = connect('ama')
    const kofi = connect('kofi')
    const yawa = connect('yawa')
    await Promise.all([ready(ama), ready(kofi), ready(yawa)])
    const p0 = await ama.timeout(2000).emitWithAck('presence:join', { locality: 'lome' })
    assert.ok(p0.ok && p0.present.length === 0)
    const joined = next(ama, 'presence:join')
    const p1 = await yawa.timeout(2000).emitWithAck('presence:join', { locality: 'lome' })
    assert.ok(p1.ok && p1.present.map((e: { name: string }) => e.name).includes('Ama (test)'))
    assert.equal((await joined).name, 'Yawa (test)')
    await kofi.timeout(2000).emitWithAck('presence:join', { locality: 'kara' })

    // Yawa walks: Ama (Lomé) receives snapshots, Kofi (Kara) does not.
    const snaps: number[] = []
    ama.on('player:snapshot', (s) => snaps.push(s.pose.n))
    const kofiQuiet = silent(kofi, 'player:snapshot', 900)
    for (let n = 1; n <= 6; n++) {
      yawa.emit('player:pose', { x: 50 + n * 0.3, z: 34, heading: 90, mode: 'walk', n })
      await new Promise((r) => setTimeout(r, 125))
    }
    // A teleport across the city is dropped; a flood beyond the rate is dropped.
    yawa.emit('player:pose', { x: 150, z: 120, heading: 0, mode: 'walk', n: 7 })
    for (let n = 8; n < 40; n++)
      yawa.emit('player:pose', { x: 52, z: 34, heading: 90, mode: 'walk', n })
    await new Promise((r) => setTimeout(r, 300))
    assert.equal(await kofiQuiet, true)
    assert.deepEqual(snaps.slice(0, 6), [1, 2, 3, 4, 5, 6])
    assert.ok(!snaps.includes(7), 'teleport dropped')
    assert.ok(snaps.length < 20, `flood throttled (${snaps.length})`)
    assert.ok(relay.metrics.posesDropped > 0)

    const left = next(ama, 'presence:leave')
    yawa.disconnect()
    assert.equal((await left).locality, 'lome')
    ama.disconnect()
    kofi.disconnect()
  })

  it('rejects invalid payloads and honours the kill switch', async () => {
    const ama = connect('ama')
    await ready(ama)
    const bad = await ama.timeout(2000).emitWithAck('chat:send', {
      v: 1,
      room: 'dm:inconnu',
      body: 'x',
      clientId: crypto.randomUUID(),
    })
    assert.equal(bad.ok, false)
    const long = await send(ama, 'locality:lome', 'x'.repeat(501))
    assert.ok(!long.ok)
    ama.disconnect()
    disabled = true
    const c = connect('ama')
    const err = await new Promise<Error & { data?: { code: string } }>((r) =>
      c.once('connect_error', r),
    )
    assert.equal(err.data?.code, 'disabled')
    disabled = false
  })
})
