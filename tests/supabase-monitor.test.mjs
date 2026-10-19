import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import { PGlite } from '@electric-sql/pglite'
import { probe, readConfiguration } from '../ops/supabase-monitor/main.mjs'

const config = { origin: 'https://project.supabase.co', key: 'fixture-server-key' }

test('probe verifies both REST and the SQL value, sends credentials only to configured HTTPS origin', async () => {
  const calls = []
  const result = await probe(config, async (url, options) => {
    calls.push({ url, options })
    return options.method === 'HEAD' ? new Response(null, { status: 200 }) : Response.json(1)
  })
  assert.equal(result.ok, true)
  assert.equal(calls.length, 2)
  assert.equal(calls[0].url, `${config.origin}/rest/v1/`)
  assert.equal(calls[1].url, `${config.origin}/rest/v1/rpc/infrastructure_healthcheck`)
  for (const { url, options } of calls) {
    assert.equal(new URL(url).origin, config.origin)
    assert.equal(options.redirect, 'error')
    assert.equal(options.cache, 'no-store')
    assert.equal(options.headers.apikey, config.key)
    assert.ok(options.signal instanceof AbortSignal)
  }
  assert.equal(calls[1].options.body, '{}')
  assert.ok(!JSON.stringify(result).includes(config.key))
})

test('HTTP 200 with wrong SQL result, missing RPC, and transport failure all fail closed', async () => {
  for (const sqlResponse of [
    Response.json(0),
    Response.json({ error: 'missing' }, { status: 404 }),
    new Response('not-json'),
  ]) {
    const result = await probe(config, async (_, { method }) =>
      method === 'HEAD' ? new Response(null) : sqlResponse,
    )
    assert.equal(result.ok, false)
    assert.equal(result.checks.find((c) => c.name === 'rest').ok, true)
  }
  const result = await probe(config, async () => {
    throw new Error(`request failed, secret=${config.key}`)
  })
  assert.equal(result.ok, false)
  assert.ok(!JSON.stringify(result).includes(config.key))
})

test('monitor refuses missing credentials and unsafe URLs without guessing an origin', () => {
  assert.throws(() => readConfiguration({}))
  for (const url of [
    'http://project.supabase.co',
    'https://user:password@project.supabase.co',
    'https://project.supabase.co/?key=secret',
    'https://project.supabase.co/rest/v1/',
    'https://project.supabase.co/#secret',
  ]) {
    assert.throws(() =>
      readConfiguration({ SUPABASE_URL: url, SUPABASE_SERVICE_ROLE_KEY: config.key }),
    )
  }
  assert.deepEqual(
    readConfiguration({
      NEXT_PUBLIC_SUPABASE_URL: config.origin,
      SUPABASE_SERVICE_KEY: config.key,
    }),
    config,
  )
})

test('SQL migration is repeatable, read-only and inaccessible to anonymous/authenticated roles', async () => {
  const db = new PGlite()
  try {
    await db.exec(
      'create role anon; create role authenticated; create role service_role; grant usage on schema public to anon, authenticated, service_role;',
    )
    const sql = await readFile(
      'supabase/migrations/20261017180000_infrastructure_healthcheck.sql',
      'utf8',
    )
    await db.exec(sql)
    await db.exec(sql)
    for (const role of ['anon', 'authenticated']) {
      await db.exec(`set role ${role}`)
      await assert.rejects(
        db.query('select public.infrastructure_healthcheck()'),
        (error) => error.code === '42501',
      )
      await db.exec('reset role')
    }
    await db.exec('begin read only; set local role service_role;')
    assert.deepEqual((await db.query('select public.infrastructure_healthcheck() as value')).rows, [
      { value: 1 },
    ])
    await db.exec('rollback;')
    const result = await db.query(
      "select prosecdef, provolatile from pg_proc where oid = 'public.infrastructure_healthcheck()'::regprocedure",
    )
    assert.deepEqual(result.rows, [{ prosecdef: false, provolatile: 's' }])
  } finally {
    await db.close()
  }
})
