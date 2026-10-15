/**
 * HarooLife realtime relay entry point. Always-on Node process, separate from the Next.js app.
 *
 *   npm run realtime            # PORT=3001, Supabase adapters (needs SUPABASE_URL / SUPABASE_ANON_KEY)
 *   HAROOLIFE_REALTIME_REPO=pglite npm run realtime   # local: real migration in PGlite
 *
 * HAROOLIFE_REALTIME_DISABLED=true refuses every connection at once (kill switch); clients then
 * fall back to the existing HTTP place messages.
 */
import { resolve } from 'node:path'
import { createRealtime } from './core'
import { pgliteChat } from './pglite'
import { supabaseAdapters } from './supabase'

const env = process.env
const say = (line: string) => process.stdout.write(`[realtime] ${line}\n`)

async function main(url: string, anonKey: string) {
  const adapters = supabaseAdapters(url, anonKey)
  const local = env.HAROOLIFE_REALTIME_REPO === 'pglite'
  const chat = local
    ? await pgliteChat([
        resolve('supabase/migrations/20261013_120000_haroolife_realtime_chat.sql'),
        resolve('supabase/migrations/20261015_120000_haroolife_chat_dm.sql'),
      ])
    : adapters.chat
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
