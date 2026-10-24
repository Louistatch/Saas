import { spawn } from 'node:child_process'
import { createWriteStream, rmSync } from 'node:fs'
import { once } from 'node:events'

// Entire stack shares one local network namespace. No credentials or production writes.
const env = {
  ...process.env,
  NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54329',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'local-anon',
  SUPABASE_SERVICE_ROLE_KEY: 'local-service',
  FAITIERE_LOCAL_VERIFY: '1',
  NEXT_TELEMETRY_DISABLED: '1',
}
const processes = []
function start(args, log) {
  const stream = createWriteStream(log)
  const child = spawn(process.execPath, args, { env, stdio: ['ignore', stream, stream] })
  processes.push(child)
  return child
}
async function ready(url) {
  for (let i = 0; i < 80; i++) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(1000) })
      if (r.ok) return
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  throw new Error(`Local test service unavailable: ${url}`)
}
try {
  rmSync('.next/cache/turbopack', { recursive: true, force: true })
  const build = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'build'], {
    env,
    stdio: 'inherit',
  })
  const [code] = await once(build, 'exit')
  if (code !== 0) throw new Error('Test build failed')
  start(['e2e/fixtures/mock-supabase.mjs'], '/tmp/production-browser-mock.log')
  await ready('http://127.0.0.1:54329/rest/v1/regions')
  start(
    ['node_modules/next/dist/bin/next', 'start', '--hostname', '127.0.0.1'],
    '/tmp/production-browser-next.log',
  )
  await ready('http://127.0.0.1:3000/legal/cookies')
  const tests = spawn(
    process.execPath,
    [
      'node_modules/@playwright/test/cli.js',
      'test',
      '--config=e2e/production-playwright.config.ts',
    ],
    { env, stdio: 'inherit' },
  )
  const [result] = await once(tests, 'exit')
  process.exitCode = result ?? 1
} finally {
  for (const child of processes) child.kill('SIGTERM')
}
