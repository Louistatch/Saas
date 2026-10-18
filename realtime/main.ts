/**
 * HarooLife realtime relay entry point. Always-on Node process, separate from the Next.js app.
 *
 *   npm run realtime            # PORT=3001, Supabase adapters (needs SUPABASE_URL / SUPABASE_ANON_KEY)
 *   HAROOLIFE_REALTIME_REPO=pglite npm run realtime   # local: real migrations in PGlite
 *   npm run realtime:build && npm run realtime:start  # production: one bundled file, no tsx
 *
 * HAROOLIFE_REALTIME_DISABLED=true refuses every connection at once (kill switch); clients then
 * fall back to the existing HTTP place messages.
 */
import { resolve } from 'node:path'
import { createRealtime } from './core'
import { connectRedis } from './redis'
import { supabaseAdapters } from './supabase'
import { WORLD_CAPACITY, memoryWorlds } from './worlds'

const env = process.env
const say = (line: string) => process.stdout.write(`[realtime] ${line}\n`)

function integer(name: string, fallback: number, min: number, max: number) {
  const n = Number(env[name] ?? fallback)
  if (!Number.isInteger(n) || n < min || n > max) throw new Error(`Invalid ${name}`)
  return n
}

async function main(url: string, anonKey: string) {
  const adapters = supabaseAdapters(url, anonKey, {
    claims: env.HAROOLIFE_REALTIME_AUTH_MODE === 'claims',
    maxRequests: integer('HAROOLIFE_REALTIME_MAX_DB_REQUESTS', 64, 1, 512),
  })
  const redisUrl = env.HAROOLIFE_REDIS_URL
  const clusterUrls = env.HAROOLIFE_REDIS_CLUSTER_URLS?.split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  if (env.HAROOLIFE_REALTIME_DISTRIBUTED === 'true' && !redisUrl && !clusterUrls?.length)
    throw new Error('Distributed mode requires HAROOLIFE_REDIS_URL or HAROOLIFE_REDIS_CLUSTER_URLS')
  const cluster =
    redisUrl || clusterUrls?.length
      ? await connectRedis({
          url: redisUrl,
          clusterUrls,
          prefix: env.HAROOLIFE_REALTIME_POOL ?? 'haroolife',
          capacity: integer('HAROOLIFE_REALTIME_WORLD_CAPACITY', WORLD_CAPACITY, 2, 256),
          onError: () => say('Redis unavailable (details redacted)'),
        })
      : null
  const local = env.HAROOLIFE_REALTIME_REPO === 'pglite'
  // PGlite (local and tests only) is loaded on demand: production never needs it installed.
  const pglite = local ? await import('./pglite') : null
  const localChat = pglite
    ? await pglite.pgliteChat([
        resolve('supabase/migrations/20261013_120000_haroolife_realtime_chat.sql'),
        resolve('supabase/migrations/20261015_130000_haroolife_chat_dm.sql'),
        resolve('supabase/migrations/20261015_140000_haroolife_dm_inbox.sql'),
        resolve('supabase/migrations/20261015_150000_haroolife_money.sql'),
        resolve('supabase/migrations/20261016_120000_haroolife_saves.sql'),
        resolve('supabase/migrations/20261016_130000_haroolife_moderation.sql'),
        resolve('supabase/migrations/20261017_130000_haroolife_invites.sql'),
        resolve('supabase/migrations/20261017_140000_haroolife_push.sql'),
        resolve('supabase/migrations/20261017_160000_haroolife_usernames.sql'),
        resolve('supabase/migrations/20261017_170000_haroolife_username_adult.sql'),
        resolve('supabase/migrations/20261017_190000_haroolife_board_posts.sql'),
      ])
    : null
  const chat = localChat ?? adapters.chat
  const origins = (
    env.HAROOLIFE_REALTIME_ORIGINS ??
    'https://faitierehub.com,https://www.faitierehub.com,http://127.0.0.1:3000,http://localhost:3000'
  )
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  const relay = createRealtime({
    auth: adapters.auth,
    chat,
    origins,
    adapter: cluster?.adapter,
    motion: cluster?.motion,
    activity: cluster?.activity,
    worlds:
      cluster?.worlds ??
      memoryWorlds(integer('HAROOLIFE_REALTIME_WORLD_CAPACITY', WORLD_CAPACITY, 2, 256)),
    allowChat: cluster?.allowChat,
    ready: cluster?.ready,
    maxConnections: integer('HAROOLIFE_REALTIME_MAX_CONNECTIONS', 5000, 1, 50_000),
    maxAuthenticating: integer('HAROOLIFE_REALTIME_MAX_AUTHENTICATING', 32, 1, 512),
    disabled: () => env.HAROOLIFE_REALTIME_DISABLED === 'true',
    log:
      env.HAROOLIFE_REALTIME_LOG === '1'
        ? (e, d) => say(`${e} ${JSON.stringify(d ?? {})}`)
        : undefined,
  })
  const port = Number(env.PORT ?? 3001)
  await relay.listen(port, env.HOST ?? '0.0.0.0')
  say(`listening on :${port} (${local ? 'pglite' : 'supabase'})`)
  if (pglite && localChat) {
    // The dashboard's RPCs, forwarded by the mock Supabase (local and tests only).
    await pglite.serveLocalRpc(localChat, port + 1)
    say(`local rpc on 127.0.0.1:${port + 1}`)
  }
  let stopping = false
  const stop = () => {
    if (stopping) return
    stopping = true
    relay.drain()
    // Let the load balancer observe /ready=503 before clients reconnect elsewhere.
    const deadline = setTimeout(() => process.exit(1), 25_000)
    deadline.unref()
    setTimeout(() => {
      void relay
        .close()
        .then(() => cluster?.close())
        .then(() => process.exit(0))
    }, 2000)
  }
  process.on('SIGTERM', stop)
  process.on('SIGINT', stop)
}

const url = env.SUPABASE_URL ?? env.NEXT_PUBLIC_SUPABASE_URL
const anonKey = env.SUPABASE_ANON_KEY ?? env.NEXT_PUBLIC_SUPABASE_ANON_KEY
if (!url || !anonKey) {
  process.stderr.write('[realtime] SUPABASE_URL and SUPABASE_ANON_KEY are required.\n')
  process.exit(1)
} else {
  void main(url, anonKey).catch(() => {
    // Provider errors may contain URLs/tokens. Keep credentials out of platform logs.
    process.stderr.write(
      '[realtime] Startup failed; check database, Redis and capacity configuration.\n',
    )
    process.exit(1)
  })
}
