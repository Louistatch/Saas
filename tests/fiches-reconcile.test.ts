/**
 * B7 — GET /api/cron/purchases-reconcile : rapprochement des achats en attente,
 * transitions décidées par decidePurchaseTransition (via settlePurchase).
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { beforeEach, test } from 'node:test'
import { installFetch, installStubs, json, resetStore } from './fiches-fake-db'

for (const level of ['log', 'info', 'warn', 'error', 'debug'] as const) console[level] = () => {}
process.env.FEDAPAY_SECRET_KEY = 'sk_sandbox_test'
process.env.FEDAPAY_ENV = 'sandbox'
process.env.CRON_SECRET = 'cron-secret-0123456789'

const state = installStubs()
const { NextRequest } = require('next/server') as typeof import('next/server')
const route = require('../app/api/cron/purchases-reconcile/route') as {
  GET: (req: InstanceType<typeof NextRequest>) => Promise<Response>
}

const FICHE = '0f0f0f0f-0000-4000-8000-0000000000r1'
const ago = (ms: number) => new Date(Date.now() - ms).toISOString()
const MIN = 60_000
const HOUR = 60 * MIN
const DAY = 24 * HOUR

// Horloge pilotée : chaque relecture FedaPay « coûte » `latencyMs` (décalage de
// Date.now, que lisent le délai du cron et ses fenêtres).
const realNow = Date.now.bind(Date)
let offset = 0
let latencyMs = 0
Date.now = () => realNow() + offset
/** Relectures FedaPay, dans l'ordre (id de transaction). */
let reads: string[] = []

const call = (auth?: string) =>
  route.GET(
    new NextRequest('https://app.test/api/cron/purchases-reconcile', {
      headers: auth ? { authorization: auth } : {},
    }),
  )

const fedapay: Record<string, string | 500> = {}

beforeEach(() => {
  resetStore(state)
  offset = 0
  latencyMs = 0
  reads = []
  for (const k of Object.keys(fedapay)) delete fedapay[k]
  state.store.rows('fiches_techniques').push({ id: FICHE, title: 'Soja', cooperative_id: null })
  installFetch(state.store, [
    (url) => {
      const m = url.match(/\/transactions\/([A-Z0-9]+)$/)
      if (!m) return null
      offset += latencyMs
      reads.push(m[1] as string)
      const s = fedapay[m[1] as string]
      if (s === undefined) return null
      if (s === 500) return json({ message: 'down' }, 500)
      return json({
        'v1/transaction': { id: 1, status: s, amount: 1000, currency: { iso: 'XOF' } },
      })
    },
  ])
})

function add(
  id: string,
  createdAgo: number,
  tx: string | null,
  over: Record<string, unknown> = {},
) {
  state.store.rows('purchases').push({
    id,
    fiche_id: FICHE,
    amount: 1000,
    currency: 'XOF',
    payment_status: 'pending',
    access_granted: false,
    provider: 'fedapay',
    provider_transaction_id: tx,
    paid_at: null,
    created_at: ago(createdAgo),
    ...over,
  })
}
const status = (id: string) =>
  state.store.rows('purchases').find((r) => r.id === id)?.payment_status

test('401 sans secret, avec un mauvais secret, ou sans CRON_SECRET configuré', async () => {
  assert.equal((await call()).status, 401)
  assert.equal((await call('Bearer wrong')).status, 401)
  assert.equal((await call('cron-secret-0123456789')).status, 401)
  const saved = process.env.CRON_SECRET
  process.env.CRON_SECRET = ''
  assert.equal((await call('Bearer ')).status, 401)
  process.env.CRON_SECRET = saved
  assert.equal(state.store.ops.length, 0)
})

test('transitions : payé, refusé, abandon après 48 h, orphelin après 1 h, fenêtres respectées', async () => {
  add('paid', HOUR, 'A1')
  fedapay.A1 = 'transferred'
  add('declined', 2 * HOUR, 'B1')
  fedapay.B1 = 'declined'
  add('stale', 3 * DAY, 'C1')
  fedapay.C1 = 'pending'
  add('waiting', HOUR, 'D1')
  fedapay.D1 = 'pending'
  add('too-recent', 5 * MIN, 'E1')
  fedapay.E1 = 'approved'
  add('too-old', 8 * DAY, 'F1')
  fedapay.F1 = 'approved'
  add('orphan', 2 * HOUR, null)
  add('fresh-orphan', 30 * MIN, null)
  add('lookup-down', 3 * DAY, 'J1')
  fedapay.J1 = 500
  add('done', HOUR, 'K1', { payment_status: 'completed', access_granted: true })
  fedapay.K1 = 'refunded'

  const res = await call('Bearer cron-secret-0123456789')
  assert.equal(res.status, 200)
  const body = await res.json()
  assert.deepEqual(body, {
    checked: 5,
    transitions: { 'pending→completed': 1, 'pending→failed': 1 },
    stale_failed: 1,
    orphan_failed: 1,
    lookup_failed: 1,
    // Échecs écrits par CE passage (refus, abandon après 48 h) : pas relus aussitôt.
    failed_rechecked: 0,
    unfinished: [],
  })
  assert.equal(reads.filter((r) => r === 'B1').length, 1)
  assert.equal(reads.filter((r) => r === 'C1').length, 1)
  assert.equal(status('paid'), 'completed')
  assert.equal(state.store.rows('purchases').find((r) => r.id === 'paid')?.access_granted, true)
  assert.equal(status('declined'), 'failed')
  assert.equal(status('stale'), 'failed')
  assert.equal(status('waiting'), 'pending')
  assert.equal(status('too-recent'), 'pending')
  assert.equal(status('too-old'), 'pending')
  assert.equal(status('orphan'), 'failed')
  assert.equal(status('fresh-orphan'), 'pending')
  // FedaPay injoignable : jamais d'échec décidé à l'aveugle.
  assert.equal(status('lookup-down'), 'pending')
  // Seuls les « pending » sont rapprochés par le cron.
  assert.equal(status('done'), 'completed')
  // Toutes les écritures « failed » sont gardées par payment_status = pending :
  // aucune ligne réglée n'a été touchée.
  assert.ok(
    state.store.ops
      .filter((o) => o.table === 'purchases' && o.op === 'update')
      .every((o) => o.client === 'admin'),
  )
})

test('cron déclaré dans vercel.json, une fois par jour', () => {
  const vercel = JSON.parse(readFileSync(path.join(__dirname, '..', 'vercel.json'), 'utf8')) as {
    crons: Array<{ path: string; schedule: string }>
  }
  const cron = vercel.crons.find((c) => c.path === '/api/cron/purchases-reconcile')
  assert.ok(cron)
  assert.match(cron.schedule, /^\d+ \d+ \* \* \*$/)
})

// ── Budget et fenêtres (achats en attente d'abord, échecs relus ensuite) ────

const failedAt = (createdAgo: number, failedAgo: number) => ({
  payment_status: 'failed',
  created_at: ago(createdAgo),
  updated_at: ago(failedAgo),
})
const cron = async () => {
  const res = await call('Bearer cron-secret-0123456789')
  assert.equal(res.status, 200)
  return res.json()
}

test('budget : 60 refus récents et FedaPay lent → l’achat payé en attente est réglé quand même', async () => {
  for (let i = 0; i < 60; i++) {
    add(`f${i}`, 2 * HOUR + i * MIN, `F${i}`, failedAt(2 * HOUR + i * MIN, HOUR + i * MIN))
    fedapay[`F${i}`] = 'declined'
  }
  // Payé, webhook perdu, fenêtre fermée.
  add('paid', 3 * HOUR, 'P1')
  fedapay.P1 = 'approved'
  latencyMs = 800
  const body = await cron()
  assert.equal(status('paid'), 'completed')
  assert.equal(body.checked, 1)
  // Échecs : plafonnés, les plus récents d'abord ; le reste au passage suivant, signalé.
  assert.equal(body.failed_rechecked, 40)
  assert.deepEqual(body.unfinished, ['failed'])
  assert.deepEqual(reads.slice(0, 3), ['P1', 'F0', 'F1'])
  assert.ok(!reads.includes('F59'))
})

test('budget : achats en attente trop nombreux → les échecs gardent leur part de temps', async () => {
  for (let i = 0; i < 80; i++) {
    add(`w${i}`, 2 * HOUR + i * MIN, `W${i}`)
    fedapay[`W${i}`] = 'pending'
  }
  // Refusé puis approuvé chez FedaPay, webhook perdu.
  add('late', 5 * HOUR, 'L1', failedAt(5 * HOUR, 4 * HOUR))
  fedapay.L1 = 'approved'
  latencyMs = 800
  const body = await cron()
  assert.ok(body.checked > 0 && body.checked < 80, `checked=${body.checked}`)
  assert.deepEqual(body.unfinished, ['pending'])
  assert.equal(body.failed_rechecked, 1)
  assert.equal(status('late'), 'completed')
  assert.equal(body.transitions['failed→completed'], 1)
})

test('fenêtre : abandonné après 48 h puis approuvé chez FedaPay → réglé au passage du lendemain', async () => {
  // Créé 71 h 20 avant le passage : l'étape 2 l'abandonne (FedaPay encore « pending »).
  add('stale', 71 * HOUR + 20 * MIN, 'S1')
  fedapay.S1 = 'pending'
  const first = await cron()
  assert.equal(first.stale_failed, 1)
  assert.equal(status('stale'), 'failed')
  // FedaPay l'approuve ensuite ; webhook perdu. Passage suivant, 24 h plus tard :
  // la fenêtre de relecture part du passage en échec, pas de la création.
  fedapay.S1 = 'approved'
  offset += DAY
  const next = await cron()
  assert.equal(next.failed_rechecked, 1)
  assert.equal(status('stale'), 'completed')
})

test('fenêtre : échec de plus de 72 h ou trop récent → pas relu', async () => {
  add('old-fail', 5 * DAY, 'O1', failedAt(5 * DAY, 73 * HOUR))
  fedapay.O1 = 'approved'
  add('fresh', 5 * MIN, 'N1', failedAt(5 * MIN, 4 * MIN))
  fedapay.N1 = 'approved'
  const body = await cron()
  assert.equal(body.failed_rechecked, 0)
  assert.deepEqual(reads, [])
  assert.equal(status('old-fail'), 'failed')
  assert.equal(status('fresh'), 'failed')
})
