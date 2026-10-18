import assert from 'node:assert/strict'
import { it } from 'node:test'
import { connectRedis } from '../realtime/redis'
import { uniquePool } from './helpers/realtime-fixture'

const seeds = process.env.HAROOLIFE_TEST_REDIS_CLUSTER_URLS?.split(',')
it(
  'routes leased worlds and coalesced motion across three real Redis Cluster masters',
  { skip: !seeds, timeout: 20_000 },
  async () => {
    const prefix = uniquePool()
    const a = await connectRedis({ clusterUrls: seeds, prefix, capacity: 2 })
    const b = await connectRedis({ clusterUrls: seeds, prefix, capacity: 2 })
    let unsubscribe = () => {}
    try {
      const entry = { key: 'ama', name: 'Ama test', pagne: 1, locality: 'lome' as const }
      const one = await a.worlds.join('master-a', 'lome', entry)
      const two = await b.worlds.join('master-b', 'lome', { ...entry, key: 'yawa' })
      assert.equal(one.world, two.world)
      assert.equal(two.present[0].key, 'ama')
      const delivered = new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('No cluster motion')), 5000)
        unsubscribe = b.motion.subscribe('view:test-sector', (batch) => {
          assert.equal(batch[0].key, 'ama')
          clearTimeout(timeout)
          resolve()
        })
      })
      // Give the sharded subscription a round-trip, then send a genuine pose through the bus.
      await new Promise((r) => setTimeout(r, 200))
      a.motion.publish('view:test-sector', {
        key: 'ama',
        t: Date.now(),
        pose: { x: 50, z: 30, heading: 0, n: 1, mode: 'walk' },
      })
      await delivered
      assert.equal((await a.worlds.refresh?.(one.world))?.length, 2)
      assert.equal(await b.worlds.refresh?.(one.world), null, 'one roster refresh owner per world')
      await a.worlds.leave('master-a', 'lome')
      await b.worlds.leave('master-b', 'lome')
    } finally {
      unsubscribe()
      await a.close()
      await b.close()
    }
  },
)
