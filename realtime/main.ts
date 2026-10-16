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
import { supabaseAdapters } from './supabase'

const env = process.env
const say = (line: string) => process.stdout.write(`[realtime] ${line}\n`)

async function main(url: string, anonKey: string) {
  const adapters = supabaseAdapters(url, anonKey)
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
      ])
    : null
  const chat = localChat ?? adapters.chat
  const origins = (env.HAROOLIFE_REALTIME_ORIGINS ?? 'http://127.0.0.1:3000,http://localhost:3000')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  const relay = createRealtime({
    auth: adapters.auth,
    chat,
    origins,
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
  const stop = () => void relay.close().then(() => process.exit(0))
  process.on('SIGTERM', stop)
  process.on('SIGINT', stop)
}

const url = env.SUPABASE_URL ?? env.NEXT_PUBLIC_SUPABASE_URL
const anonKey = env.SUPABASE_ANON_KEY ?? env.NEXT_PUBLIC_SUPABASE_ANON_KEY
if (!url || !anonKey) {
  process.stderr.write('[realtime] SUPABASE_URL and SUPABASE_ANON_KEY are required.\n')
  process.exit(1)
} else {
  void main(url, anonKey)
}
