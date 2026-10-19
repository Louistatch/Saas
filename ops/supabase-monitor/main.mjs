import { pathToFileURL } from 'node:url'

const TIMEOUT_MS = 8_000

export function readConfiguration(env) {
  const raw = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL
  const key = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_KEY
  if (!raw || !key) throw new Error('SUPABASE_MONITOR_CONFIG_MISSING')
  const url = new URL(raw)
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== '/'
  ) {
    throw new Error('SUPABASE_MONITOR_URL_INVALID')
  }
  return { origin: url.origin, key }
}

/** Two independent probes; no business table reads, writes, or raw responses in logs. */
export async function probe(config, fetcher = fetch) {
  const headers = {
    apikey: config.key,
    Authorization: `Bearer ${config.key}`,
    'Cache-Control': 'no-cache',
  }
  const checks = await Promise.all(
    [
      ['rest', '/rest/v1/', 'HEAD'],
      ['sql', '/rest/v1/rpc/infrastructure_healthcheck', 'POST'],
    ].map(async ([name, path, method]) => {
      const started = performance.now()
      try {
        const response = await fetcher(`${config.origin}${path}`, {
          method,
          headers: { ...headers, 'Content-Type': 'application/json' },
          ...(method === 'POST' ? { body: '{}' } : {}),
          cache: 'no-store',
          redirect: 'error', // Never forward privileged credentials to a redirected host.
          signal: AbortSignal.timeout(TIMEOUT_MS),
        })
        // Await the body inside the same timeout; HTTP 200 alone doesn't prove SQL ran.
        const ok = response.ok && (name !== 'sql' || (await response.json()) === 1)
        await response.body?.cancel().catch(() => {})
        return {
          name,
          ok,
          status: response.status,
          durationMs: Math.round(performance.now() - started),
        }
      } catch {
        return {
          name,
          ok: false,
          error: 'NETWORK_TIMEOUT_OR_INVALID_RESPONSE',
          durationMs: Math.round(performance.now() - started),
        }
      }
    }),
  )
  return { at: new Date().toISOString(), ok: checks.every((check) => check.ok), checks }
}

export async function main(env = process.env) {
  let config
  try {
    config = readConfiguration(env)
  } catch {
    // Do not log URL input, SDK errors, headers, or secrets.
    console.error(JSON.stringify({ ok: false, error: 'SUPABASE_MONITOR_CONFIG_INVALID' }))
    return 1
  }
  const result = await probe(config)
  console.info(JSON.stringify(result))
  return result.ok ? 0 : 1
}

// One shot: Railway Cron starts this process every 5 minutes and it exits.
// A job cannot overlap itself; no persistent web server or idle polling loop.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await main()
}
