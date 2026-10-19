/**
 * B11 — API publique des comptes d'exploitation : filtre Culture insensible
 * aux accents, résumé du contenu vendu sans chemin de stockage ; vendeur et
 * limite de relecture FedaPay sur GET /api/purchases/[id] (B4).
 */
import assert from 'node:assert/strict'
import { beforeEach, test } from 'node:test'
import { accentInsensitivePattern } from '../lib/fiches/culture'
import { installFetch, installStubs, json, resetStore } from './fiches-fake-db'

for (const level of ['log', 'info', 'warn', 'error', 'debug'] as const) console[level] = () => {}
process.env.FEDAPAY_SECRET_KEY = 'sk_sandbox_test'
process.env.FEDAPAY_ENV = 'sandbox'

const matches = (input: string, value: string) =>
  new RegExp(accentInsensitivePattern(input), 'iu').test(value)

test('accentInsensitivePattern : « Mais » trouve « Maïs », ancré, casse ignorée', () => {
  assert.equal(accentInsensitivePattern('Mais'), '^m[aàâäáã][iîïíì]s$')
  assert.ok(matches('Mais', 'Maïs'))
  assert.ok(matches('Maïs', 'Mais'))
  assert.ok(matches('mais', 'MAÏS'))
  assert.ok(matches('Pomme de terre', 'Pomme  de terre'))
  assert.ok(matches('Arachide', 'Arachidé'))
  assert.equal(matches('Mais', 'Maïs doux'), false)
  assert.equal(matches('Mai', 'Maïs'), false)
})

test('accentInsensitivePattern : caractères spéciaux échappés (aucune injection de motif)', () => {
  assert.equal(matches('a.b', 'axb'), false)
  assert.ok(matches('a.b', 'a.b'))
  assert.equal(matches('.*', 'Maïs'), false)
  assert.ok(matches('(x)', '(x)'))
  assert.equal(matches('x|Mais', 'Mais'), false)
  assert.ok(matches('[a]', '[a]'))
  assert.ok(matches('a+b', 'a+b'))
  assert.ok(matches('c\\d', 'c\\d'))
  assert.ok(matches('Pois d’angole-rouge/2', 'Pois d’angole-rouge/2'))
  assert.equal(matches('^$', ''), false)
})

// ── Routes ──────────────────────────────────────────────────────────────────

const state = installStubs()
const { NextRequest } = require('next/server') as typeof import('next/server')
const publicRoute = require('../app/api/fiches/public/route') as {
  GET: (req: InstanceType<typeof NextRequest>) => Promise<Response>
}
const purchaseRoute = require('../app/api/purchases/[id]/route') as {
  GET: (
    req: InstanceType<typeof NextRequest>,
    ctx: { params: Promise<{ id: string }> },
  ) => Promise<Response>
}

const COOP = '0c0c0c0c-0000-4000-8000-0000000000p1'
const FICHE = '0f0f0f0f-0000-4000-8000-0000000000p2'
let ipSeq = 0
let fedaReads = 0

beforeEach(() => {
  resetStore(state)
  fedaReads = 0
  installFetch(state.store, [
    (url) => {
      if (!url.includes('fedapay.com')) return null
      fedaReads++
      return json({ 'v1/transaction': { id: 9, status: 'pending', amount: 1000 } })
    },
  ])
  state.store.rows('fiches_techniques').push(
    {
      id: FICHE,
      title: 'Maïs pluvial',
      culture: 'Maïs',
      status: 'published',
      cooperative_id: COOP,
      created_at: '2026-10-01T00:00:00Z',
      files: [
        { name: 'Compte.xlsx', url: `${COOP}/1-secret.xlsx`, type: 'XLSX', size: 2048 },
        { name: 'Guide.pdf', url: `${COOP}/2-secret.pdf`, type: 'pdf' },
      ],
    },
    {
      id: 'f-soja',
      title: 'Soja',
      culture: 'Soja',
      status: 'published',
      files: [],
      created_at: '2026-10-02T00:00:00Z',
    },
  )
  state.store.rows('cooperatives').push({ id: COOP, name: 'FENOMAT' })
})

const get = (qs: string) =>
  publicRoute.GET(
    new NextRequest(`https://app.test/api/fiches/public${qs}`, {
      headers: { 'x-forwarded-for': `10.2.0.${++ipSeq}` },
    }),
  )

test('GET /api/fiches/public?culture=Mais trouve « Maïs » ; résumé des fichiers sans chemin', async () => {
  const res = await get('?culture=Mais')
  const body = await res.json()
  assert.deepEqual(
    body.fiches.map((f: { id: string }) => f.id),
    [FICHE],
  )
  const fiche = body.fiches[0]
  assert.equal(fiche.files_count, 2)
  assert.deepEqual(fiche.files_summary, [
    { type: 'xlsx', size: 2048 },
    { type: 'pdf', size: null },
  ])
  const text = JSON.stringify(body)
  for (const leak of ['secret', 'Compte.xlsx', 'Guide.pdf', '"files"'])
    assert.ok(!text.includes(leak), `fuite : ${leak}`)
})

test('GET /api/fiches/public?id= : une seule fiche publiée (lien « Voir dans la boutique »)', async () => {
  const ONE = 'dddddddd-dddd-4ddd-8ddd-ddddddddddd1'
  state.store.rows('fiches_techniques').push(
    {
      id: ONE,
      title: 'Compte d’exploitation Maïs, 1 hectare (Kara)',
      culture: 'Maïs',
      status: 'published',
      files: [],
      created_at: '2026-10-19T00:00:00Z',
    },
    {
      id: 'dddddddd-dddd-4ddd-8ddd-ddddddddddd2',
      title: 'Brouillon',
      culture: 'Maïs',
      status: 'draft',
      files: [],
      created_at: '2026-10-19T00:00:00Z',
    },
  )
  const one = await (await get(`?id=${ONE}`)).json()
  assert.deepEqual(
    one.fiches.map((f: { id: string }) => f.id),
    [ONE],
  )
  // Un brouillon n'est jamais servi, même par son id.
  const draft = await (await get('?id=dddddddd-dddd-4ddd-8ddd-ddddddddddd2')).json()
  assert.deepEqual(draft.fiches, [])
  // Id abîmé : 400, rien n'est lu.
  assert.equal((await get('?id=abc')).status, 400)
  // Recherche plus longue que 100 caractères : coupée, plus jamais 400.
  assert.equal((await get(`?q=${encodeURIComponent('Compte, '.repeat(30))}`)).status, 200)
})

const purchase = (id: string) =>
  purchaseRoute.GET(new NextRequest(`https://app.test/api/purchases/${id}?refresh=1`), {
    params: Promise.resolve({ id }),
  })

test('GET /api/purchases/[id] : seller_name et titre d’une fiche archivée', async () => {
  const id = '0a0a0a0a-0000-4000-8000-0000000000a1'
  const row = state.store.rows('fiches_techniques')[0]
  if (row) row.status = 'archived'
  state.store.rows('purchases').push({
    id,
    fiche_id: FICHE,
    amount: 1000,
    payment_status: 'completed',
    access_granted: true,
    provider: 'fedapay',
    provider_transaction_id: '9',
  })
  const body = await (await purchase(id)).json()
  assert.equal(body.seller_name, 'FENOMAT')
  assert.equal(body.title, 'Maïs pluvial')
  assert.ok(!JSON.stringify(body).includes('buyer'))
})

test('GET /api/purchases/[id]?refresh=1 : au-delà de 20 relectures/min, état en base sans FedaPay', async () => {
  const id = '0a0a0a0a-0000-4000-8000-0000000000a2'
  state.store.rows('purchases').push({
    id,
    fiche_id: FICHE,
    amount: 1000,
    currency: 'XOF',
    payment_status: 'pending',
    access_granted: false,
    provider: 'fedapay',
    provider_transaction_id: '9',
  })
  for (let i = 0; i < 20; i++) assert.equal((await purchase(id)).status, 200)
  assert.equal(fedaReads, 20)
  const res = await purchase(id)
  assert.equal(res.status, 200)
  const body = await res.json()
  assert.equal(body.status, 'pending')
  assert.equal(body.refreshed, false)
  assert.equal(fedaReads, 20)
})
