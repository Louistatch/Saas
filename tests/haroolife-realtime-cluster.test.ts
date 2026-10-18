import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { createClient } from 'redis'
import { createRealtime } from '../realtime/core'
import { connectRedis } from '../realtime/redis'
import {
  type Client,
  connect,
  delay,
  event,
  fixtureAuth,
  fixtureChat,
  relayUrl,
  uniquePool,
} from './helpers/realtime-fixture'

const url = process.env.HAROOLIFE_TEST_REDIS_URL
if (process.env.HAROOLIFE_REQUIRE_REDIS_TEST === '1' && !url)
  throw new Error('HAROOLIFE_TEST_REDIS_URL must point to an isolated Redis 7+ for these tests')

describe(
  'two real relay instances, Redis 7 sharded adapter and real SQL/RLS',
  { skip: !url, timeout: 30_000 },
  () => {
    const prefix = uniquePool()
    const clients: Client[] = []
    const relays: ReturnType<typeof createRealtime>[] = []
    const clusters: Awaited<ReturnType<typeof connectRedis>>[] = []
    before(async () => {
      const chat = await fixtureChat()
      for (let i = 0; i < 2; i++) {
        const cluster = await connectRedis({ url, prefix, capacity: 2 })
        clusters.push(cluster)
        const relay = createRealtime({
          auth: fixtureAuth,
          chat,
          origins: ['http://localhost:3000'],
          adapter: cluster.adapter,
          motion: cluster.motion,
          activity: cluster.activity,
          worlds: cluster.worlds,
          ready: cluster.ready,
          allowChat: cluster.allowChat,
        })
        await relay.listen(0, '127.0.0.1')
        relays.push(relay)
      }
      await delay(100)
    })
    after(async () => {
      for (const c of clients) c.disconnect()
      for (const relay of relays) await relay.close()
      for (const cluster of clusters) await cluster.close()
      // Remove only this test's random namespace, never FLUSHDB or other application keys.
      const redis = createClient({ url })
      redis.on('error', () => {})
      await redis.connect()
      for await (const keys of redis.scanIterator({ MATCH: `${prefix}:*`, COUNT: 100 }))
        if (keys.length) await redis.unlink(keys)
      redis.destroy()
    })
    const player = (node: number, who: 'ama' | 'yawa' | 'kofi', focused = false) => {
      const c = connect(relayUrl(relays[node]), who, focused)
      clients.push(c)
      return c
    }

    it('shares bounded presence, near poses and capacity allocation across different workers', async () => {
      const a = player(0, 'ama')
      const b = player(1, 'yawa', true)
      const c = player(1, 'kofi')
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
      assert.equal(pb.present.length, 1)
      assert.equal(pc.present.length, 0)
      assert.equal(pb.present[0].name, 'Ama (test)')
      b.emit('player:pose', { x: 52, z: 30, heading: 0, mode: 'walk', n: 1 })
      await delay(100)
      const pose = event(b, 'player:batch')
      a.emit('player:pose', { x: 50, z: 30, heading: 0, mode: 'drive:taxi', n: 1 })
      assert.equal((await pose)[0].pose.mode, 'drive:taxi')
      const left = event(b, 'presence:leave')
      a.disconnect()
      assert.equal((await left).key, pb.present[0].key)
      const again = player(0, 'ama')
      await event(again, 'system:hello')
      const back = await again.timeout(4000).emitWithAck('presence:join', { locality: 'lome' })
      assert.ok(back.ok && back.world === pa.world, 'freed place reused across nodes')
      for (const p of [b, c, again]) p.disconnect()
      await delay(100)
    })

    it('grants and revokes a DM on the owning remote worker; duplicates stay single durable messages', async () => {
      const a = player(0, 'ama')
      const b = player(1, 'yawa')
      const outsider = player(1, 'kofi')
      const [ha, hb] = await Promise.all([
        event(a, 'system:hello'),
        event(b, 'system:hello'),
        event(outsider, 'system:hello'),
      ])
      const announced = event(b, 'dm:opened')
      const dm = await a.timeout(4000).emitWithAck('dm:open', { key: hb.me.key })
      assert.ok(dm.ok)
      if (!dm.ok) return
      assert.equal((await announced).peer.key, ha.me.key)
      const incoming = event(a, 'chat:new')
      const clientId = crypto.randomUUID()
      const send = () =>
        b.timeout(4000).emitWithAck('chat:send', {
          v: 1,
          room: dm.room,
          body: 'Depuis un autre serveur',
          clientId,
        })
      const one = await send()
      assert.ok(one.ok)
      assert.equal((await incoming).body, 'Depuis un autre serveur')
      const two = await send()
      assert.ok(two.ok)
      if (one.ok && two.ok) assert.equal(one.message.id, two.message.id)
      assert.equal(
        (await outsider.timeout(4000).emitWithAck('chat:history', { room: dm.room })).ok,
        false,
      )
      const closed = event(a, 'dm:closed')
      assert.ok((await b.timeout(4000).emitWithAck('player:block', { key: ha.me.key })).ok)
      await closed
      assert.equal(
        (
          await a.timeout(4000).emitWithAck('chat:send', {
            v: 1,
            room: dm.room,
            body: 'interdit',
            clientId: crypto.randomUUID(),
          })
        ).ok,
        false,
      )
      for (const p of [a, b, outsider]) p.disconnect()
      await delay(100)
    })

    it('reserves atomically under parallel joins, reclaims dead leases and counts a person with two tabs once', async () => {
      const entries = Array.from({ length: 25 }, (_, i) => ({
        key: String(i),
        name: `test ${i}`,
        pagne: 0,
        locality: 'kara' as const,
      }))
      const joined = await Promise.all(
        entries.map((e, i) => clusters[i % 2].worlds.join(`load${i}`, 'kara', e)),
      )
      const groups = new Map<string, number>()
      for (const j of joined) groups.set(j.world, (groups.get(j.world) ?? 0) + 1)
      assert.ok([...groups.values()].every((n) => n <= 2))
      const e = { key: 'two-tabs', name: 'test', pagne: 0, locality: 'dapaong' as const }
      const first = await clusters[0].worlds.join('tab1', 'dapaong', e)
      const second = await clusters[1].worlds.join('tab2', 'dapaong', e)
      assert.equal(first.world, second.world)
      assert.equal((await clusters[0].worlds.list(first.world)).length, 1)
      assert.equal((await clusters[0].worlds.leave('tab1', 'dapaong'))?.last, false)
      const redis = createClient({ url })
      redis.on('error', () => {})
      await redis.connect()
      await redis.zAdd(`${prefix}:{dapaong}:leases`, { value: 'tab2', score: 1 })
      assert.deepEqual(await clusters[1].worlds.renew([{ id: 'tab2', locality: 'dapaong' }]), [
        'tab2',
      ])
      assert.deepEqual(await clusters[0].worlds.list(first.world), [])
      redis.destroy()
      for (let i = 0; i < entries.length; i++) await clusters[0].worlds.leave(`load${i}`, 'kara')
    })

    it('shares room backpressure and refuses distributed traffic after a Redis connection loss', async () => {
      const room = 'world:togo'
      await clusters[0].activity.record(room, { seq: 1001, key: 'ama' })
      await clusters[1].activity.record(room, { seq: 1002, key: 'yawa' })
      const hints = await Promise.all(clusters.map((cluster) => cluster.activity.flush(room)))
      assert.equal(hints.filter((h) => h !== null).length, 1)
      assert.deepEqual(
        hints
          .flatMap((h) => h ?? [])
          .map((h) => h.seq)
          .sort(),
        [1001, 1002],
      )
      const results = await Promise.all(
        Array.from({ length: 20 }, (_, i) => clusters[i % 2].allowChat(room)),
      )
      assert.equal(results.filter(Boolean).length, 5, 'global budget is not multiplied by workers')
      await clusters[0].close()
      assert.equal((await fetch(`${relayUrl(relays[0])}/ready`)).status, 503)
      assert.equal((await fetch(`${relayUrl(relays[1])}/ready`)).status, 200)
      const c = player(0, 'kofi')
      await new Promise((r) => c.once('connect_error', r))
      c.disconnect()
    })
  },
)
