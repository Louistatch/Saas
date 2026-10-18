/** Reproducible, bounded LOCAL network benchmark. No production accounts, SQL or real payments. */
import { fork } from 'node:child_process'
import { createHmac, randomBytes } from 'node:crypto'
import { writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { monitorEventLoopDelay } from 'node:perf_hooks'
import { setTimeout as pause } from 'node:timers/promises'
import { createClient } from 'redis'
import { type Socket, io } from 'socket.io-client'
import type { ClientToServer, ServerToClient } from '../lib/haroolife/realtime/protocol'

async function main() {
  const args = process.argv.slice(2)
  const arg = (name: string, fallback: string) =>
    args[args.indexOf(name) + 1] && args.includes(name) ? args[args.indexOf(name) + 1] : fallback
  const clientsCount = Number(arg('--clients', '500'))
  const seconds = Number(arg('--seconds', '20'))
  const nodes = Number(arg('--nodes', '2'))
  const output = arg('--output', '/tmp/haroolife-network-load.json')
  const redisUrl = arg('--redis-url', '')
  const baseline = arg('--baseline-file', '')
  if (
    !Number.isInteger(clientsCount) ||
    clientsCount < 1 ||
    clientsCount > 10_000 ||
    !Number.isInteger(nodes) ||
    nodes < 1 ||
    nodes > 8 ||
    !Number.isFinite(seconds) ||
    seconds < 5 ||
    seconds > 300
  )
    throw new Error('Local limits: clients 1..10000, nodes 1..8, seconds 5..300')
  if (
    (nodes > 1 && !redisUrl) ||
    (redisUrl && !['127.0.0.1', 'localhost', '[::1]'].includes(new URL(redisUrl).hostname))
  )
    throw new Error(
      'Use an isolated loopback Redis for multiple workers; production targets are refused',
    )
  if (baseline && nodes !== 1) throw new Error('The historical relay supports one instance only')
  const secret = randomBytes(32).toString('hex')
  const pool = `load_${randomBytes(8).toString('hex')}`
  const workers: ReturnType<typeof fork>[] = []
  const clients: Socket<ServerToClient, ClientToServer>[] = []
  const urls: string[] = []
  const histogram = new Uint32Array(1001)
  let sent = 0
  let received = 0
  let errors = 0
  let drops = 0
  let measuring = false
  const health: unknown[] = []
  const loop = monitorEventLoopDelay({ resolution: 20 })
  const percentile = (q: number) => {
    const n = histogram.reduce((a, b) => a + b, 0)
    const target = Math.ceil(n * q)
    if (!n) return null
    let count = 0
    for (let i = 0; i < histogram.length; i++) {
      count += histogram[i]
      if (count >= target) return i * 5
    }
    return 5000
  }
  try {
    for (let i = 0; i < nodes; i++) {
      const worker = fork(resolve('scripts/haroolife-load-worker.ts'), [], {
        execArgv: ['--import', 'tsx'],
        stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
        env: {
          PATH: process.env.PATH,
          NODE_ENV: 'test',
          HAROOLIFE_LOAD_SECRET: secret,
          HAROOLIFE_LOAD_REDIS_URL: redisUrl,
          HAROOLIFE_LOAD_POOL: pool,
          HAROOLIFE_LOAD_BASELINE_FILE: baseline ? resolve(baseline) : '',
        },
      })
      workers.push(worker)
      worker.stderr?.on('data', (d) => process.stderr.write(d))
      const port = await new Promise<number>((resolvePort, reject) => {
        const timer = setTimeout(() => reject(new Error('Worker startup timeout')), 15_000)
        worker.once('error', reject)
        worker.once('exit', (code) => {
          if (code) reject(new Error(`Worker exited ${code}`))
        })
        worker.once('message', (m) => {
          clearTimeout(timer)
          resolvePort((m as { port: number }).port)
        })
      })
      urls.push(`http://127.0.0.1:${port}`)
    }
    const startConnect = performance.now()
    for (let start = 0; start < clientsCount; start += 20) {
      await Promise.all(
        Array.from({ length: Math.min(20, clientsCount - start) }, async (_, j) => {
          const id = start + j
          const token = `${id}.${createHmac('sha256', secret).update(String(id)).digest('hex')}`
          const c: Socket<ServerToClient, ClientToServer> = io(urls[id % nodes], {
            transports: ['websocket'],
            reconnection: false,
            forceNew: true,
            auth: { token, subscriptions: 'focused' },
          })
          clients.push(c)
          const receivedPose = (s: { t: number }) => {
            if (!measuring) return
            received++
            histogram[Math.min(1000, Math.max(0, Math.ceil((Date.now() - s.t) / 5)))]++
          }
          c.on('player:snapshot', receivedPose)
          c.on('player:batch', (batch) => {
            for (const s of batch) receivedPose(s)
          })
          c.on('disconnect', () => {
            if (measuring) drops++
          })
          await new Promise<void>((ready, reject) => {
            const timer = setTimeout(() => reject(new Error('Connection timeout')), 10_000)
            c.once('system:hello', () => {
              clearTimeout(timer)
              ready()
            })
            c.once('connect_error', (e) => {
              clearTimeout(timer)
              errors++
              reject(e)
            })
          })
          const ack = await c.timeout(8000).emitWithAck('presence:join', { locality: 'lome' })
          if (!ack.ok) {
            errors++
            throw new Error(`Join failed: ${ack.code}`)
          }
        }),
      )
      // Admission ramp: no synthetic connection stampede in the steady-state comparison.
      await pause(100)
    }
    const connectMs = performance.now() - startConnect
    const emit = (n: number) => {
      for (let i = 0; i < clients.length; i++) {
        const x = 10 + (i % 20) * 12 + Math.sin(n / 10) * 0.2
        const z = 10 + (Math.floor(i / 20) % 20) * 12
        clients[i].volatile.emit('player:pose', {
          x,
          z,
          n,
          heading: 0,
          mode: i % 5 === 0 ? 'drive:taxi' : 'walk',
        })
        if (measuring) sent++
      }
    }
    emit(0)
    await pause(1000)
    const sample = async () => {
      for (let i = 0; i < urls.length; i++) {
        const data = await fetch(`${urls[i]}/health`, { signal: AbortSignal.timeout(5000) }).then(
          (r) => r.json(),
        )
        health.push({ node: i, at: Date.now(), ...data })
      }
    }
    await sample()
    loop.enable()
    measuring = true
    const started = performance.now()
    let n = 1
    const timer = setInterval(() => emit(n++), 200)
    try {
      for (let s = 0; s < seconds; s++) {
        await pause(1000)
        await sample()
      }
    } finally {
      clearInterval(timer)
      measuring = false
      loop.disable()
    }
    const elapsedSeconds = (performance.now() - started) / 1000
    const result = {
      generatedAt: new Date().toISOString(),
      scope:
        'loopback network only; synthetic verified identities; no production SQL/Auth/GPU capacity claim',
      baseline: !!baseline,
      redis: !!redisUrl,
      nodes,
      clients: clientsCount,
      connected: clients.filter((c) => c.connected).length,
      elapsedSeconds,
      connectMs,
      sent,
      received,
      deliveriesPerSecond: received / elapsedSeconds,
      deliveriesPerPose: received / Math.max(1, sent),
      errors,
      drops,
      deliveryMs: {
        p50: percentile(0.5),
        p95: percentile(0.95),
        bucketWidthMs: 5,
        cappedAtMs: 5000,
      },
      loadGeneratorEventLoopP95Ms: loop.percentile(95) / 1e6,
      health,
    }
    await writeFile(output, `${JSON.stringify(result, null, 2)}\n`)
    const { health: _samples, ...summary } = result
    process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`)
    if (errors || drops || result.connected !== clientsCount) process.exitCode = 1
  } finally {
    for (const c of clients) c.disconnect()
    await Promise.all(
      workers.map(
        (worker) =>
          new Promise<void>((done) => {
            if (worker.exitCode !== null) return done()
            const timer = setTimeout(() => worker.kill('SIGKILL'), 8000)
            worker.once('exit', () => {
              clearTimeout(timer)
              done()
            })
            worker.send('stop')
          }),
      ),
    )
    if (redisUrl) {
      const redis = createClient({ url: redisUrl })
      redis.on('error', () => {})
      await redis.connect()
      for await (const keys of redis.scanIterator({ MATCH: `${pool}:*`, COUNT: 1000 }))
        if (keys.length) await redis.unlink(keys)
      await redis.close()
    }
  }
}
void main().catch((error) => {
  process.stderr.write(`${String(error)}\n`)
  process.exitCode = 1
})
