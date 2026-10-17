import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { runInNewContext } from 'node:vm'

function worker({ offline = false } = {}) {
  const handlers = {}
  const cached = new Map([
    ['https://faitierehub.test/scan/offline', new Response('scanner offline')],
  ])
  const names = new Set(['coopscan-v1', 'coopscan-v2', 'game-assets'])
  const reads = []
  const network = []
  const writes = []
  const key = (request) =>
    typeof request === 'string' ? new URL(request, 'https://faitierehub.test').href : request.url
  const cache = {
    addAll: async () => {},
    put: async (request, response) => {
      writes.push(key(request))
      cached.set(key(request), response)
    },
  }
  runInNewContext(readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8'), {
    URL,
    Response,
    Promise,
    console,
    self: {
      location: { origin: 'https://faitierehub.test' },
      addEventListener: (name, fn) => {
        handlers[name] = fn
      },
      clients: { claim: async () => {} },
      skipWaiting: async () => {},
    },
    caches: {
      open: async () => cache,
      keys: async () => [...names],
      delete: async (name) => names.delete(name),
      match: async (request) => {
        reads.push(key(request))
        return cached.get(key(request))?.clone()
      },
    },
    fetch: async (request) => {
      network.push(key(request))
      if (offline) throw new Error('offline')
      return new Response('network')
    },
  })
  return {
    cached,
    names,
    reads,
    network,
    writes,
    request: (path, options = {}) => {
      let response
      handlers.fetch({
        request: {
          url: new URL(path, 'https://faitierehub.test').href,
          method: 'GET',
          mode: 'cors',
          headers: new Headers(),
          ...options,
        },
        respondWith: (value) => {
          response = value
        },
      })
      return response
    },
    activate: () => new Promise((resolve) => handlers.activate({ waitUntil: resolve })),
  }
}

test('external CAPTCHA/Auth requests, mutations, game pages and private RSC never pass through the cache', () => {
  const sw = worker()
  for (const url of [
    'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit',
    'https://project.supabase.co/auth/v1/user',
    '/haroolife',
    '/auth/login',
    '/dashboard?_rsc=x',
    '/scan?_rsc=x',
  ]) {
    assert.equal(sw.request(url), undefined, url)
    assert.equal(sw.request(url, { mode: 'navigate' }), undefined, url)
  }
  assert.equal(sw.request('/api/haroolife/username', { method: 'POST' }), undefined)
  assert.deepEqual(sw.reads, [])
  assert.deepEqual(sw.writes, [])
  assert.deepEqual(sw.network, [])
})

test('an updated worker removes only its old scanner caches and preserves other application caches', async () => {
  const sw = worker()
  await sw.activate()
  assert.equal(sw.names.has('coopscan-v1'), false)
  assert.equal(sw.names.has('coopscan-v2'), true)
  assert.equal(sw.names.has('game-assets'), true)
})

test('the scanner still opens its offline shell while public local assets remain cacheable', async () => {
  const sw = worker({ offline: true })
  assert.equal(await (await sw.request('/scan', { mode: 'navigate' })).text(), 'scanner offline')
  const online = worker()
  const asset = 'https://faitierehub.test/images/hero.webp'
  online.cached.set(asset, new Response('cached public image'))
  assert.equal(await (await online.request(asset)).text(), 'cached public image')
  assert.deepEqual(online.network, [])
})

test('cached QR/API responses are ignored and fetched fresh', async () => {
  const sw = worker()
  const path = '/api/verify/CARD-123'
  sw.cached.set(`https://faitierehub.test${path}`, new Response('stale private QR data'))
  assert.equal(await (await sw.request(path)).text(), 'network')
  assert.deepEqual(sw.reads, [])
  assert.deepEqual(sw.writes, [])
})
