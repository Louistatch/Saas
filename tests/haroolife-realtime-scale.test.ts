import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { io } from 'socket.io-client'
import type { ChatMessage } from '../lib/haroolife/realtime/protocol'
import { createRealtime } from '../realtime/core'
import { LOCAL_ACCOUNTS } from '../realtime/pglite'
import { WorkGate } from '../realtime/work-gate'
import { memoryWorlds, sectorRoom, viewRooms } from '../realtime/worlds'
import {
  type Client,
  connect,
  delay,
  event,
  fixtureAuth,
  fixtureChat,
  relayUrl,
  tokenFor,
} from './helpers/realtime-fixture'

it('bounds concurrent users per world, preserves duplicate tabs, frees places and expires crashed leases', async () => {
  let now = 1
  const worlds = memoryWorlds(2, () => now)
  const entry = (key: string) => ({ key, name: key, pagne: 1, locality: 'lome' as const })
  const a = await worlds.join('a', 'lome', entry('ama'))
  const b = await worlds.join('b', 'lome', entry('ama'))
  const c = await worlds.join('c', 'lome', entry('kofi'))
  assert.equal(a.world, b.world)
  assert.notEqual(a.world, c.world)
  assert.deepEqual(await worlds.list(a.world), [entry('ama')])
  assert.equal((await worlds.leave('a', 'lome'))?.last, false)
  assert.equal((await worlds.leave('b', 'lome'))?.last, true)
  now += 45_001
  assert.deepEqual(await worlds.renew([{ id: 'c', locality: 'lome' }]), ['c'])
  assert.deepEqual(await worlds.list(c.world), [])
  const d = await worlds.join('d', 'kara', { ...entry('yawa'), locality: 'kara' })
  assert.ok(d.world.startsWith('kara:'))
})

it('backpressure refuses excess work without queueing and releases permits after failures', async () => {
  const gate = new WorkGate(2)
  let finish: () => void = () => {}
  const held = gate.run(
    () =>
      new Promise<void>((r) => {
        finish = r
      }),
  )
  const held2 = gate.run(async () => {
    await assert.rejects(() => gate.run(async () => true))
    throw new Error('provider failed')
  })
  await assert.rejects(held2, /provider failed/)
  assert.equal(gate.active, 1)
  assert.equal(gate.refused, 1)
  assert.equal(await gate.run(async () => 42), 42)
  finish()
  await held
  assert.equal(gate.active, 0)
})

it('a sector border preserves overlap but never subscribes a far city or another world', () => {
  const rooms = viewRooms('lome:1', 23.9, 24)
  assert.equal(rooms.length, 9)
  assert.ok(rooms.includes(sectorRoom('lome:1', '1:1')))
  assert.ok(!rooms.includes(sectorRoom('lome:2', '1:1')))
  assert.ok(!rooms.includes(sectorRoom('lome:1', '8:8')))
})

describe('bounded realtime transport', () => {
  let relay: ReturnType<typeof createRealtime>
  let chat: Awaited<ReturnType<typeof fixtureChat>>
  const clients: Client[] = []
  before(async () => {
    chat = await fixtureChat()
    relay = createRealtime({
      auth: fixtureAuth,
      chat,
      origins: ['http://localhost:3000'],
      worlds: memoryWorlds(2),
    })
    await relay.listen(0, '127.0.0.1')
  })
  after(async () => {
    for (const c of clients) c.disconnect()
    await relay.close()
  })
  const player = (who: 'ama' | 'yawa' | 'kofi', focused = false) => {
    const c = connect(relayUrl(relay), who, focused)
    clients.push(c)
    return c
  }

  it('prevents city-wide poses and limits each instance even with three genuine SQL accounts', async () => {
    const a = player('ama')
    const b = player('yawa')
    const c = player('kofi')
    await Promise.all([
      event(a, 'system:hello'),
      event(b, 'system:hello'),
      event(c, 'system:hello'),
    ])
    const pa = await a.timeout(4000).emitWithAck('presence:join', { locality: 'lome' })
    const pb = await b.timeout(4000).emitWithAck('presence:join', { locality: 'lome' })
    const pc = await c.timeout(4000).emitWithAck('presence:join', { locality: 'lome' })
    assert.ok(pa.ok && pb.ok && pc.ok)
    if (!(pa.ok && pb.ok && pc.ok)) return
    assert.equal(pa.world, pb.world)
    assert.notEqual(pa.world, pc.world)
    assert.equal(pc.present.length, 0)
    a.emit('player:pose', { x: 50, z: 30, heading: 0, mode: 'walk', n: 1 })
    b.emit('player:pose', { x: 200, z: 200, heading: 0, mode: 'idle', n: 1 })
    c.emit('player:pose', { x: 50, z: 30, heading: 0, mode: 'walk', n: 1 })
    await delay()
    let far = 0
    let other = 0
    b.on('player:snapshot', () => far++)
    c.on('player:snapshot', () => other++)
    for (let n = 2; n <= 5; n++) {
      a.emit('player:pose', { x: 50 + n / 10, z: 30, heading: 0, mode: 'walk', n })
      await delay()
    }
    assert.equal(far, 0)
    assert.equal(other, 0)
    // Travel resets sector subscriptions; both players meet at Kara and can see one another.
    await a.timeout(4000).emitWithAck('presence:join', { locality: 'kara' })
    await b.timeout(4000).emitWithAck('presence:join', { locality: 'kara' })
    b.emit('player:pose', { x: 52, z: 30, heading: 0, mode: 'idle', n: 20 })
    await delay()
    const incoming = event(b, 'player:snapshot')
    a.emit('player:pose', { x: 50, z: 30, heading: 0, mode: 'walk', n: 20 })
    assert.equal((await incoming).pose.x, 50)
    for (const p of [a, b, c]) p.disconnect()
    await delay()
  })

  it('focuses public subscriptions, loads durable history on opening, retains private channels', async () => {
    const a = player('ama')
    const b = player('yawa', true)
    await Promise.all([event(a, 'system:hello'), event(b, 'system:hello')])
    let messages = 0
    b.on('chat:new', (m) => {
      if (m.room === 'world:togo') messages++
    })
    const activity = event(b, 'chat:activity')
    const sent = await a.timeout(4000).emitWithAck('chat:send', {
      v: 1,
      room: 'world:togo',
      body: 'Bonjour Togo',
      clientId: crypto.randomUUID(),
    })
    assert.ok(sent.ok)
    await delay()
    assert.equal(messages, 0)
    const hint = await activity
    assert.equal(hint.room, 'world:togo')
    assert.equal(hint.events.length, 1)
    assert.equal('body' in hint.events[0], false, 'unread hints do not stream message bodies')
    const watched = await b.timeout(4000).emitWithAck('chat:watch', { room: 'world:togo' })
    assert.ok(watched.ok && watched.messages.some((m: ChatMessage) => m.body === 'Bonjour Togo'))
    await a.timeout(4000).emitWithAck('chat:send', {
      v: 1,
      room: 'world:togo',
      body: 'En direct',
      clientId: crypto.randomUUID(),
    })
    await delay()
    assert.equal(messages, 1)
    await b.timeout(4000).emitWithAck('chat:watch', { room: null })
    assert.equal(
      (
        await b
          .timeout(4000)
          .emitWithAck('chat:watch', { room: 'canton:cccccccc-0000-4000-8000-0000000000ca' })
      ).ok,
      false,
    )
    a.disconnect()
    b.disconnect()
    await delay()
  })

  it('coalesces nearby actors into a single bounded packet without the observer seeing itself', async () => {
    const small = createRealtime({ auth: fixtureAuth, chat, origins: ['http://localhost:3000'] })
    await small.listen(0, '127.0.0.1')
    const a = connect(relayUrl(small), 'ama')
    const b = connect(relayUrl(small), 'yawa')
    const watcher = connect(relayUrl(small), 'kofi', true)
    try {
      const hello = await Promise.all([
        event(a, 'system:hello'),
        event(b, 'system:hello'),
        event(watcher, 'system:hello'),
      ])
      for (const c of [a, b, watcher])
        await c.timeout(4000).emitWithAck('presence:join', { locality: 'lome' })
      watcher.emit('player:pose', { x: 52, z: 30, heading: 0, mode: 'walk', n: 1 })
      await delay()
      const batch = event(watcher, 'player:batch')
      a.emit('player:pose', { x: 50, z: 30, heading: 0, mode: 'walk', n: 1 })
      b.emit('player:pose', { x: 51, z: 30, heading: 0, mode: 'walk', n: 1 })
      const got = await batch
      assert.deepEqual(
        new Set(got.map((s) => s.key)),
        new Set(hello.slice(0, 2).map((h) => h.me.key)),
      )
      assert.ok(got.length <= 24)
    } finally {
      a.disconnect()
      b.disconnect()
      watcher.disconnect()
      await small.close()
    }
  })

  it('enforces connection admission and checks Origin on actual WebSocket upgrades', async () => {
    let verified = 0
    const small = createRealtime({
      auth: {
        async verify(token) {
          verified++
          return fixtureAuth.verify(token)
        },
      },
      chat,
      origins: ['http://localhost:3000'],
      maxConnections: 1,
    })
    await small.listen(0, '127.0.0.1')
    const a = connect(relayUrl(small), 'ama')
    await event(a, 'system:hello')
    const b = connect(relayUrl(small), 'yawa')
    await new Promise((r) => b.once('connect_error', r))
    assert.equal(verified, 1)
    b.disconnect()
    a.disconnect()
    await small.close()
    const c = io(relayUrl(relay), {
      transports: ['websocket'],
      reconnection: false,
      auth: { token: tokenFor(LOCAL_ACCOUNTS.ama.id) },
      extraHeaders: { Origin: 'https://attacker.example' },
    })
    await new Promise((r) => c.once('connect_error', r))
    c.disconnect()
  })

  it('drains readiness before refusing new clients while liveness remains reachable', async () => {
    relay.drain()
    assert.equal((await fetch(`${relayUrl(relay)}/ready`)).status, 503)
    assert.equal((await fetch(`${relayUrl(relay)}/health`)).status, 200)
    const c = player('kofi')
    const rejected = await new Promise<Error>((resolve) => c.once('connect_error', resolve))
    assert.ok(rejected)
    c.disconnect()
  })
})
