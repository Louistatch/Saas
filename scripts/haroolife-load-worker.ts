/** Loopback-only network benchmark fixture. NEVER imported by realtime/main.ts or production. */
import { createHmac, timingSafeEqual } from 'node:crypto'
import type { AddressInfo } from 'node:net'
import { pathToFileURL } from 'node:url'
import { type ChatRepository, createRealtime } from '../realtime/core'
import { connectRedis } from '../realtime/redis'
import { memoryWorlds } from '../realtime/worlds'

async function main() {
  if (!process.send || !process.env.HAROOLIFE_LOAD_SECRET || process.env.NODE_ENV === 'production')
    throw new Error('This fixture requires the local load runner')
  const secret = process.env.HAROOLIFE_LOAD_SECRET
  const unexpected = async (): Promise<never> => {
    throw new Error('Durable chat is excluded from this network fixture')
  }
  const chat: ChatRepository = {
    async me(token) {
      const id = token.split('.')[0]
      return {
        key: Number(id).toString(16).padStart(16, '0'),
        name: `Load ${id}`,
        pagne: Number(id) % 12,
        rooms: ['world:togo', 'locality:lome'],
        blocked: [],
        can_write: true,
      }
    },
    send: unexpected,
    history: unexpected,
    edit: unexpected,
    remove: unexpected,
    report: unexpected,
    block: unexpected,
    dmOpen: unexpected,
    dmPeers: unexpected,
    blockKey: unexpected,
    reportUser: unexpected,
  }
  const redisUrl = process.env.HAROOLIFE_LOAD_REDIS_URL
  const cluster = redisUrl
    ? await connectRedis({
        url: redisUrl,
        prefix: process.env.HAROOLIFE_LOAD_POOL ?? 'local_load',
        capacity: 96,
      })
    : null
  let factory = createRealtime
  if (process.env.HAROOLIFE_LOAD_BASELINE_FILE) {
    const module = await import(pathToFileURL(process.env.HAROOLIFE_LOAD_BASELINE_FILE).href)
    factory = module.createRealtime
  }
  const relay = factory({
    chat,
    origins: ['http://localhost:3000'],
    adapter: cluster?.adapter,
    motion: cluster?.motion,
    worlds: cluster?.worlds ?? memoryWorlds(),
    ready: cluster?.ready,
    maxConnections: 12_000,
    maxAuthenticating: 64,
    auth: {
      async verify(token) {
        const [id, sig] = token.split('.')
        if (!/^\d{1,6}$/.test(id) || !/^[0-9a-f]{64}$/.test(sig ?? '')) return null
        const mac = createHmac('sha256', secret).update(id).digest()
        return timingSafeEqual(mac, Buffer.from(sig, 'hex')) ? { userId: id } : null
      },
    },
  })
  await relay.listen(0, '127.0.0.1')
  process.send({ ready: true, port: (relay.http.address() as AddressInfo).port })
  let stopping = false
  const stop = async () => {
    if (stopping) return
    stopping = true
    await relay.close()
    await cluster?.close()
    process.exit(0)
  }
  process.on('message', (m) => {
    if (m === 'stop') void stop()
  })
  process.on('SIGTERM', () => void stop())
}
void main().catch((error) => {
  process.stderr.write(`${String(error)}\n`)
  process.exit(1)
})
