import assert from 'node:assert/strict'
import { beforeEach, test } from 'node:test'
import type * as MembersRoute from '../app/api/members/route'
import type * as PricesRoute from '../app/api/market-prices/route'
import type * as VisitsRoute from '../app/api/track-visit/route'
import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { collectPages } from '../lib/utils/collect-pages'
import { memberSearchFilters } from '../lib/members/search'
import { ANALYTICS_CHOICE, analyticsPath, readAnalyticsChoice } from '../lib/analytics/privacy'

const COOP = '11111111-1111-4111-8111-111111111111'
const OTHER = '22222222-2222-4222-8222-222222222222'
const requests: URL[] = []
const inserts: Record<string, unknown>[] = []
let allowed = true
let rpcFailure = false
const fixture = Array.from({ length: 1203 }, (_, i) => ({
  id: String(i),
  cooperative_id: COOP,
  first_name: i === 1100 ? 'Kossi' : 'Autre',
  last_name: i === 1100 ? 'Agbo' : `Membre ${i}`,
}))
const supabase = createClient('https://fixture.supabase.co', 'public-test-key', {
  auth: { persistSession: false, autoRefreshToken: false },
  global: {
    fetch: async (input, init) => {
      const url = new URL(String(input))
      requests.push(url)
      if (url.pathname.includes('/rpc/')) {
        if (rpcFailure) return Response.json({ message: 'timeout', code: '57014' }, { status: 500 })
        const params = JSON.parse(String(init?.body))
        if (url.pathname.endsWith('get_market_location_counts')) {
          assert.equal(params.p_scope, 'region')
          return Response.json([
            { scope_id: COOP, price_count: 24 },
            { scope_id: OTHER, price_count: 25 },
          ])
        }
        assert.equal(params.p_scope, 'region')
        return Response.json([
          {
            culture_id: 'maize',
            scope: 'region',
            scope_id: COOP,
            region_id: COOP,
            price: 225,
            markets: ['A', 'B'],
            last_observed: '2026-10-24',
            trend: 'up',
          },
        ])
      }
      assert.equal(url.pathname, '/rest/v1/members')
      assert.equal(url.searchParams.get('cooperative_id'), `eq.${COOP}`)
      assert.equal(url.searchParams.get('deleted_at'), 'is.null')
      assert.equal(url.searchParams.get('order'), 'last_name.asc,first_name.asc,id.asc')
      let rows = fixture
      for (const filter of url.searchParams.getAll('or')) {
        const word = filter.match(/first_name\.ilike\.%([^%]*)%/)?.[1] ?? ''
        rows = rows.filter((r) =>
          `${r.first_name} ${r.last_name}`.toLowerCase().includes(word.toLowerCase()),
        )
      }
      const from = Number(url.searchParams.get('offset') ?? 0)
      const size = Number(url.searchParams.get('limit') ?? 20)
      return Response.json(rows.slice(from, from + size), {
        headers: {
          'content-range': `${from}-${Math.min(rows.length - 1, from + size - 1)}/${rows.length}`,
        },
      })
    },
  },
})
const Module = require('node:module') as { _load: (r: string, p: unknown, m: boolean) => unknown }
const originalLoad = Module._load
Module._load = function (r, p, m) {
  if (r === '@/lib/security/assert-access')
    return {
      assertRole: async () =>
        allowed
          ? { ok: true, ctx: { supabase } }
          : {
              ok: false,
              response: NextResponse.json({ error: 'Connexion requise' }, { status: 401 }),
            },
      assertTenantAccess: async (id: string) =>
        id === COOP
          ? { ok: true }
          : { ok: false, response: NextResponse.json({ error: 'Accès refusé' }, { status: 403 }) },
    }
  if (r === '@/lib/supabase/public') return { createPublicClient: () => supabase }
  if (r === '@/lib/supabase/server') return { createClient: () => supabase }
  if (r === '@/lib/supabase/admin')
    return {
      createClient: () => ({
        from: () => ({
          insert: async (row: Record<string, unknown>) => {
            inserts.push(row)
            return { error: null }
          },
        }),
      }),
    }
  if (r === '@/lib/utils/rate-limit-persistent') return { applyRateLimit: async () => null }
  return originalLoad.call(this, r, p, m)
}
const members = require('../app/api/members/route') as typeof MembersRoute
const prices = require('../app/api/market-prices/route') as typeof PricesRoute
const visits = require('../app/api/track-visit/route') as typeof VisitsRoute
beforeEach(() => {
  requests.length = 0
  inserts.length = 0
  allowed = true
  rpcFailure = false
})

test('pagination complète et erreur tardive sans résultat partiel', async () => {
  const source = Array.from({ length: 1501 }, (_, i) => i)
  const complete = await collectPages(async (from, to) => ({
    data: source.slice(from, to + 1),
    error: null,
  }))
  assert.deepEqual(complete.data, source)
  const failure = await collectPages(async (from, to) =>
    from >= 1000
      ? { data: null, error: { message: 'offline' } }
      : { data: source.slice(from, to + 1), error: null },
  )
  assert.equal(failure.data, null)
  assert.equal(failure.error?.message, 'offline')
  await assert.rejects(
    collectPages(async () => ({ data: [], error: null }), 1001),
    RangeError,
  )
})
test('recherche serveur au-delà de 1000 membres, mots répartis sur prénom et nom', async () => {
  const r = await members.GET(
    new NextRequest(`https://example.test/api/members?cooperative_id=${COOP}&q=Kossi+Agbo`),
  )
  const body = await r.json()
  assert.equal(r.status, 200)
  assert.equal(body.total, 1)
  assert.equal(body.members[0].id, '1100')
  assert.equal(requests[0].searchParams.getAll('or').length, 2)
  assert.equal(r.headers.get('cache-control'), 'private, no-store')
  const page = await (
    await members.GET(
      new NextRequest(`https://example.test/api/members?cooperative_id=${COOP}&page=56`),
    )
  ).json()
  assert.equal(page.total, 1203)
  assert.equal(page.members[0].id, '1100')
  assert.equal(page.members.length, 20)
})
test('refus de tenant, absence de session et pagination invalide avant toute lecture', async () => {
  assert.equal(
    (await members.GET(new NextRequest(`https://example.test/api/members?cooperative_id=${OTHER}`)))
      .status,
    403,
  )
  allowed = false
  assert.equal(
    (await members.GET(new NextRequest(`https://example.test/api/members?cooperative_id=${COOP}`)))
      .status,
    401,
  )
  allowed = true
  assert.equal(
    (
      await members.GET(
        new NextRequest(`https://example.test/api/members?cooperative_id=${COOP}&limit=1001`),
      )
    ).status,
    400,
  )
  assert.equal(requests.length, 0)
})
test('la recherche ne peut pas introduire de filtre PostgREST', () => {
  const clauses = memberSearchFilters('a),cooperative_id.eq.autre,%_"')
  assert.equal(clauses.length, 1)
  assert.equal(clauses[0].split(',').length, 4)
  assert.ok(!clauses[0].includes(')'))
  assert.ok(clauses[0].includes('\\%\\_'))
})
test('prix courants via RPC public ; aucune observation historique en cas d’échec', async () => {
  const counts = await (
    await prices.GET(new NextRequest('https://example.test/api/market-prices?action=regions'))
  ).json()
  assert.deepEqual(counts.regionCounts, { [COOP]: 24, [OTHER]: 25 })
  const current = await prices.GET(new NextRequest('https://example.test/api/market-prices'))
  assert.equal((await current.json()).mode, 'current')
  assert.match(current.headers.get('cache-control') ?? '', /public/)
  rpcFailure = true
  assert.equal(
    (await prices.GET(new NextRequest('https://example.test/api/market-prices'))).status,
    503,
  )
  assert.ok(requests.every((r) => r.pathname.includes('/rpc/')))
})
test('mesure d’audience : URL nettoyée, expiration et stockage indisponible', () => {
  assert.equal(
    analyticsPath(`/dashboard/members/${COOP}?token=secret#email`),
    '/dashboard/members/:id',
  )
  assert.equal(analyticsPath('/auth/callback?code=secret'), '/auth/callback')
  assert.equal(analyticsPath('/kossi@example.com/private'), '/autre')
  assert.equal(
    readAnalyticsChoice({
      getItem: () => {
        throw new Error('blocked')
      },
    }),
    null,
  )
  assert.equal(readAnalyticsChoice({ getItem: () => '{invalid' }), null)
  assert.equal(
    readAnalyticsChoice({ getItem: () => JSON.stringify({ choice: 'granted', at: 100 }) }, 101),
    'granted',
  )
  assert.equal(
    readAnalyticsChoice(
      { getItem: () => JSON.stringify({ choice: 'granted', at: 100 }) },
      100 + 181 * 86400000,
    ),
    null,
  )
})
test('aucun suivi sans accord ; stockage nettoyé et retrait du cookie', async () => {
  const request = (cookie = '') =>
    new NextRequest('https://example.test/api/track-visit', {
      method: 'POST',
      headers: { cookie },
      body: JSON.stringify({
        path: `/dashboard/members/${COOP}?token=secret`,
        referrer: 'https://outside.test/path?email=secret',
      }),
    })
  assert.equal((await visits.POST(request())).status, 204)
  assert.equal(inserts.length, 0)
  const response = await visits.POST(request(`${ANALYTICS_CHOICE}=granted`))
  assert.equal(inserts.length, 1)
  assert.equal(inserts[0].path, '/dashboard/members/:id')
  assert.equal(inserts[0].referrer, 'https://outside.test')
  assert.match(response.headers.get('set-cookie') ?? '', /Max-Age=15552000/)
  assert.match((await visits.DELETE()).headers.get('set-cookie') ?? '', /Max-Age=0/)
})
