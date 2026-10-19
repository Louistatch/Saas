/**
 * Paiement approuvé par FedaPay APRÈS que l'achat a été marqué en échec
 * (« declined » / « canceled » ne sont pas définitifs chez FedaPay), et API
 * d'état de l'écran d'attente (GET /api/purchases/[id]).
 *
 * Règle : relu chez FedaPay (jamais le corps d'un webhook), un achat « failed »
 * avec transaction passe à « completed » UNE seule fois (un seul reçu) si la
 * transaction est approved/transferred et correspond (montant, devise, fiche) ;
 * jamais pour refunded, jamais sans transaction.
 */
import assert from 'node:assert/strict'
import { beforeEach, test } from 'node:test'
import {
  canRetryPurchase,
  decidePurchaseTransition,
  purchaseStateOf,
} from '../lib/fiches/purchase-state'
import type * as PurchasesModule from '../lib/fiches/purchases'
import {
  type OpLog,
  flushAfter,
  installFetch,
  installStubs,
  json,
  resetStore,
} from './fiches-fake-db'

process.env.FEDAPAY_SECRET_KEY = 'sk_sandbox_test'
process.env.FEDAPAY_ENV = 'sandbox'
process.env.CRON_SECRET = 'cron-secret-0123456789'
const logged: string[] = []
for (const level of ['log', 'info', 'warn', 'error', 'debug'] as const)
  console[level] = (...a: unknown[]) => {
    logged.push(a.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(' '))
  }

const state = installStubs()
const { NextRequest } = require('next/server') as typeof import('next/server')
const { settlePurchaseDetailed } = require('../lib/fiches/purchases') as typeof PurchasesModule
type Ctx = { params: Promise<{ id: string }> }
const statusRoute = require('../app/api/purchases/[id]/route') as {
  GET: (req: InstanceType<typeof NextRequest>, ctx: Ctx) => Promise<Response>
}
const webhookRoute = require('../app/api/payments/fedapay/webhook/route') as {
  POST: (req: InstanceType<typeof NextRequest>) => Promise<Response>
}
const cronRoute = require('../app/api/cron/purchases-reconcile/route') as {
  GET: (req: InstanceType<typeof NextRequest>) => Promise<Response>
}

const FICHE = '0f0f0f0f-0000-4000-8000-00000000la01'
const OTHER_FICHE = '0f0f0f0f-0000-4000-8000-00000000la02'
const MIN = 60_000
const HOUR = 60 * MIN
const ago = (ms: number) => new Date(Date.now() - ms).toISOString()

/** Réponses FedaPay par id de transaction : une file (consommée) ou une valeur fixe. */
type TxBody = Record<string, unknown> | 500
const fedapay: Record<string, TxBody | TxBody[]> = {}
let fedaReads = 0

beforeEach(() => {
  resetStore(state)
  logged.length = 0
  fedaReads = 0
  for (const k of Object.keys(fedapay)) delete fedapay[k]
  state.store.rows('fiches_techniques').push({ id: FICHE, title: 'Soja', cooperative_id: null })
  installFetch(state.store, [
    (url) => {
      const m = url.match(/\/v1\/transactions\/([A-Za-z0-9]+)$/)
      if (!m) return null
      fedaReads++
      const id = m[1] as string
      const entry = fedapay[id]
      if (entry === undefined) return json({ message: 'not found' }, 404)
      const body = Array.isArray(entry) ? (entry.length > 1 ? entry.shift() : entry[0]) : entry
      if (body === 500 || body === undefined) return json({ message: 'down' }, 500)
      return json({
        'v1/transaction': { id: Number(id) || 1, amount: 1000, currency: { iso: 'XOF' }, ...body },
      })
    },
  ])
})

let seq = 0
function addPurchase(over: Record<string, unknown> = {}) {
  const row = {
    id: `0a0a0a0a-0000-4000-8000-${String(++seq).padStart(12, '0')}`,
    fiche_id: FICHE,
    amount: 1000,
    currency: 'XOF',
    payment_status: 'failed',
    access_granted: false,
    provider: 'fedapay',
    provider_transaction_id: String(900 + seq),
    paid_at: null,
    buyer_email: 'ama@example.org',
    buyer_name: 'Ama Koffi',
    created_at: ago(2 * HOUR),
    ...over,
  }
  // Passé en échec à sa création, sauf mention contraire (fenêtre du cron : updated_at).
  const full = { updated_at: row.created_at, ...row }
  state.store.rows('purchases').push(full)
  return full
}
const row = (id: string) => state.store.rows('purchases').find((r) => r.id === id)
const updates = () => state.store.ops.filter((o) => o.table === 'purchases' && o.op === 'update')

// ── Règle pure ──────────────────────────────────────────────────────────────

const failed = {
  amount: 1000,
  payment_status: 'failed',
  id: 'p-1',
  fiche_id: FICHE,
  provider_transaction_id: '9',
}
const tx = (status: string, over: Record<string, unknown> = {}) => ({
  status,
  amount: 1000,
  currencyIso: 'XOF',
  ...over,
})
const NOW = new Date('2026-10-19T10:00:00Z')

test('failed + approved/transferred (transaction qui correspond) → completed, accès, event late_paid', () => {
  for (const s of ['approved', 'transferred'])
    assert.deepEqual(decidePurchaseTransition(tx(s), failed, NOW), {
      action: 'update',
      from: 'failed',
      next: { payment_status: 'completed', access_granted: true, paid_at: NOW.toISOString() },
      event: 'late_paid',
    })
  // custom_metadata qui désigne bien cet achat et cette fiche : accepté.
  const meta = { customMetadata: { purchase_id: 'p-1', fiche_id: FICHE } }
  assert.equal(decidePurchaseTransition(tx('approved', meta), failed, NOW).action, 'update')
})

test('failed : jamais pour refunded, declined, pending, ni sans transaction', () => {
  for (const s of ['refunded', 'declined', 'canceled', 'expired', 'pending', 'mystery'])
    assert.deepEqual(decidePurchaseTransition(tx(s), failed, NOW), { action: 'none' }, s)
  for (const noTx of [null, undefined, ''])
    assert.deepEqual(
      decidePurchaseTransition(tx('approved'), { ...failed, provider_transaction_id: noTx }, NOW),
      { action: 'none' },
    )
})

test('failed : montant, devise, fiche ou achat différents → laissé en échec (warn)', () => {
  const cases = [
    tx('approved', { amount: 999 }),
    tx('approved', { amount: Number.NaN }),
    tx('approved', { currencyIso: 'EUR' }),
    tx('approved', { customMetadata: { fiche_id: OTHER_FICHE } }),
    tx('approved', { customMetadata: { purchase_id: 'p-2', fiche_id: FICHE } }),
  ]
  for (const t of cases) assert.equal(decidePurchaseTransition(t, failed, NOW).action, 'warn')
  // En attente, la même fiche différente vaut écart → échec, jamais l'accès.
  const pending = { ...failed, payment_status: 'pending' }
  const d = decidePurchaseTransition(
    tx('approved', { customMetadata: { fiche_id: OTHER_FICHE } }),
    pending,
    NOW,
  )
  assert.ok(d.action === 'update' && d.event === 'mismatch' && d.next.payment_status === 'failed')
})

test('purchaseStateOf / canRetryPurchase : cinq états, relance possible seulement après échec ou 15 min', () => {
  const s = (payment_status: string, txStatus: string | null = null, access_granted = true) =>
    purchaseStateOf({ payment_status, access_granted }, txStatus)
  assert.equal(s('pending'), 'pending')
  assert.equal(s('completed'), 'completed')
  assert.equal(s('completed', null, false), 'pending')
  assert.equal(s('refunded'), 'refunded')
  assert.equal(s('failed'), 'failed')
  assert.equal(s('failed', 'declined'), 'failed')
  assert.equal(s('failed', 'expired'), 'expired')
  assert.equal(s('failed', 'pending'), 'expired') // abandonné par le cron après 48 h
  assert.equal(s('weird'), 'pending')
  const now = Date.parse('2026-10-19T10:00:00Z')
  const lock = 15 * MIN
  assert.equal(canRetryPurchase('failed', null, lock, now), true)
  assert.equal(canRetryPurchase('expired', null, lock, now), true)
  assert.equal(canRetryPurchase('completed', null, lock, now), false)
  assert.equal(canRetryPurchase('refunded', null, lock, now), false)
  assert.equal(canRetryPurchase('pending', new Date(now - 5 * MIN).toISOString(), lock, now), false)
  assert.equal(canRetryPurchase('pending', new Date(now - 16 * MIN).toISOString(), lock, now), true)
  assert.equal(canRetryPurchase('pending', 'n/a', lock, now), false)
})

// ── settlePurchase ──────────────────────────────────────────────────────────

test('settle : failed puis approved → completed, accès, UN reçu et une alerte « après un échec »', async () => {
  const p = addPurchase()
  fedapay[p.provider_transaction_id] = { status: 'approved' }
  const out = await settlePurchaseDetailed(p.id)
  assert.deepEqual(out.changed, { from: 'failed', to: 'completed' })
  assert.equal(row(p.id)?.access_granted, true)
  assert.ok(row(p.id)?.paid_at)
  // Garde : l'écriture vise payment_status = failed.
  assert.equal(updates().length, 1)
  await flushAfter(state)
  assert.equal(state.emails.length, 1)
  assert.match(state.emails[0]?.text ?? '', /Paiement confirmé/)
  assert.equal(state.superAdminAlerts.length, 1)
  assert.ok(state.superAdminAlerts[0]?.lines.some((l) => /APRÈS un échec/.test(l)))
  assert.ok(logged.some((l) => l.includes('Late FedaPay approval')))

  // 2e passage (webhook, cron, page) : rien de plus.
  const again = await settlePurchaseDetailed(p.id)
  assert.equal(again.changed, null)
  await flushAfter(state)
  assert.equal(state.emails.length, 1)
  assert.equal(state.superAdminAlerts.length, 1)
})

test('settle : failed + refunded / declined / sans transaction / écart → reste failed, aucun reçu', async () => {
  const refunded = addPurchase()
  fedapay[refunded.provider_transaction_id] = { status: 'refunded' }
  const declined = addPurchase()
  fedapay[declined.provider_transaction_id] = { status: 'declined', last_error_code: 'X' }
  const noTx = addPurchase({ provider_transaction_id: null })
  const lowAmount = addPurchase()
  fedapay[lowAmount.provider_transaction_id] = { status: 'approved', amount: 500 }
  const otherFiche = addPurchase()
  fedapay[otherFiche.provider_transaction_id] = {
    status: 'transferred',
    custom_metadata: { purchase_id: otherFiche.id, fiche_id: OTHER_FICHE },
  }
  const otherProvider = addPurchase({ provider: 'cinetpay' })
  fedapay[otherProvider.provider_transaction_id] = { status: 'approved' }

  for (const p of [refunded, declined, noTx, lowAmount, otherFiche, otherProvider]) {
    const out = await settlePurchaseDetailed(p.id)
    assert.equal(out.changed, null, p.id)
    assert.equal(row(p.id)?.payment_status, 'failed', p.id)
    assert.equal(row(p.id)?.access_granted, false, p.id)
  }
  // Sans transaction ou autre prestataire : FedaPay n'est même pas relu.
  assert.equal(fedaReads, 4)
  assert.equal(updates().length, 0)
  await flushAfter(state)
  assert.equal(state.emails.length, 0)
  assert.ok(logged.some((l) => l.includes('après échec, mais montant, devise ou fiche différents')))
})

/** Retient les écritures sur purchases jusqu'à ce que `n` soient arrivées, puis les libère dans l'ordre. */
function holdUpdates(n: number) {
  let waiting: Array<() => void> = []
  state.store.gate = (op: OpLog) => {
    if (op.table !== 'purchases' || op.op !== 'update') return
    return new Promise<void>((resolve) => {
      waiting.push(resolve)
      if (waiting.length < n) return
      state.store.gate = null
      for (const release of waiting) release()
      waiting = []
    })
  }
}

test('concurrence : deux règlements simultanés d’un achat failed approuvé → une transition, un reçu', async () => {
  const p = addPurchase()
  fedapay[p.provider_transaction_id] = { status: 'approved' }
  holdUpdates(2)
  const [a, b] = await Promise.all([settlePurchaseDetailed(p.id), settlePurchaseDetailed(p.id)])
  assert.deepEqual([a.changed, b.changed].filter(Boolean), [{ from: 'failed', to: 'completed' }])
  // Le perdant renvoie l'état réel, réglé.
  assert.equal(a.purchase?.payment_status, 'completed')
  assert.equal(b.purchase?.payment_status, 'completed')
  assert.equal(updates().length, 2)
  await flushAfter(state)
  assert.equal(state.emails.length, 1)
  assert.equal(state.superAdminAlerts.length, 1)
})

test('concurrence : un appel lit « declined », l’autre « approved » → l’achat finit réglé, un seul reçu', async () => {
  const p = addPurchase({ payment_status: 'pending', created_at: ago(5 * MIN) })
  // 1re relecture : ancien refus ; 2e : approbation tardive.
  fedapay[p.provider_transaction_id] = [{ status: 'declined' }, { status: 'approved' }]
  holdUpdates(2)
  const [a, b] = await Promise.all([settlePurchaseDetailed(p.id), settlePurchaseDetailed(p.id)])
  assert.deepEqual(a.changed, { from: 'pending', to: 'failed' })
  // Garde perdue (pending), relecture (failed), puis failed → completed.
  assert.deepEqual(b.changed, { from: 'failed', to: 'completed' })
  assert.equal(row(p.id)?.payment_status, 'completed')
  assert.equal(row(p.id)?.access_granted, true)
  await flushAfter(state)
  assert.equal(state.emails.length, 1)
})

test('concurrence : approved et refunded simultanés sur un achat failed → jamais rouvert par refunded', async () => {
  const p = addPurchase()
  fedapay[p.provider_transaction_id] = [{ status: 'refunded' }, { status: 'approved' }]
  const [a, b] = await Promise.all([settlePurchaseDetailed(p.id), settlePurchaseDetailed(p.id)])
  assert.equal(a.changed, null)
  assert.deepEqual(b.changed, { from: 'failed', to: 'completed' })
  // Puis FedaPay rembourse : l'accès est retiré, sans nouveau reçu.
  fedapay[p.provider_transaction_id] = { status: 'refunded' }
  const c = await settlePurchaseDetailed(p.id)
  assert.deepEqual(c.changed, { from: 'completed', to: 'refunded' })
  assert.equal(row(p.id)?.access_granted, false)
  await flushAfter(state)
  assert.equal(state.emails.length, 1)
})

// ── Webhook ─────────────────────────────────────────────────────────────────

const webhook = (body: unknown) =>
  webhookRoute.POST(
    new NextRequest('https://app.test/api/payments/fedapay/webhook', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
  )

test('webhook : approbation tardive relue chez FedaPay → réglée ; corps du webhook jamais cru', async () => {
  const lied = addPurchase()
  // Le corps dit « approved », FedaPay dit « declined » : rien ne s'ouvre.
  fedapay[lied.provider_transaction_id] = { status: 'declined' }
  await webhook({
    name: 'transaction.approved',
    entity: { id: Number(lied.provider_transaction_id), status: 'approved', amount: 1000 },
  })
  assert.equal(row(lied.id)?.payment_status, 'failed')

  const late = addPurchase()
  fedapay[late.provider_transaction_id] = { status: 'transferred' }
  const res = await webhook({
    name: 'transaction.transferred',
    entity: { id: Number(late.provider_transaction_id) },
  })
  assert.equal(res.status, 200)
  assert.equal(row(late.id)?.payment_status, 'completed')
  assert.equal(row(late.id)?.access_granted, true)
})

// ── API d'état (écran d'attente) ────────────────────────────────────────────

const status = async (id: string, refresh = true) => {
  const res = await statusRoute.GET(
    new NextRequest(`https://app.test/api/purchases/${id}${refresh ? '?refresh=1' : ''}`, {
      headers: { 'x-forwarded-for': `10.1.0.${seq}` },
    }),
    { params: Promise.resolve({ id }) },
  )
  assert.equal(res.status, 200)
  return res.json()
}

test('état : en attente, frais connus → montant débité et frais ; relance bloquée 15 min', async () => {
  const p = addPurchase({ payment_status: 'pending', created_at: ago(MIN) })
  fedapay[p.provider_transaction_id] = {
    status: 'pending',
    mode: 'mtn_open',
    amount_debited: 1042,
    fees: 42,
  }
  const body = await status(p.id)
  assert.deepEqual(
    {
      state: body.state,
      status: body.status,
      can_retry: body.can_retry,
      amount: body.amount,
      currency: body.currency,
      amount_debited: body.amount_debited,
      fees: body.fees,
      failure_reason: body.failure_reason,
      fedapay_status: body.fedapay_status,
      refreshed: body.refreshed,
    },
    {
      state: 'pending',
      status: 'pending',
      can_retry: false,
      amount: 1000,
      currency: 'XOF',
      amount_debited: 1042,
      fees: 42,
      failure_reason: null,
      fedapay_status: 'pending',
      refreshed: true,
    },
  )
  assert.ok(!JSON.stringify(body).includes('buyer'))
  assert.ok(!JSON.stringify(body).includes('custom_metadata'))
})

test('état : frais inconnus (ou incohérents) → null, l’écran annonce des frais possibles', async () => {
  const p = addPurchase({ payment_status: 'pending', created_at: ago(20 * MIN) })
  fedapay[p.provider_transaction_id] = { status: 'pending', amount_debited: null, fees: null }
  const body = await status(p.id)
  assert.equal(body.amount_debited, null)
  assert.equal(body.fees, null)
  // Plus de 15 min : la route d'achat accepterait une nouvelle demande.
  assert.equal(body.can_retry, true)

  const odd = addPurchase({ payment_status: 'pending', created_at: ago(MIN) })
  fedapay[odd.provider_transaction_id] = { status: 'pending', amount_debited: 10, fees: 3 }
  const oddBody = await status(odd.id)
  assert.equal(oddBody.amount_debited, null)
  assert.equal(oddBody.fees, null)
})

test('état : refus avec motif FedaPay → failed + failure_reason + relance possible', async () => {
  const p = addPurchase({ payment_status: 'pending', created_at: ago(MIN) })
  fedapay[p.provider_transaction_id] = { status: 'declined', last_error_code: 'INSUFFICIENT_FUNDS' }
  const body = await status(p.id)
  assert.equal(body.state, 'failed')
  assert.equal(body.status, 'failed')
  assert.equal(body.failure_reason, 'INSUFFICIENT_FUNDS')
  assert.equal(body.can_retry, true)
})

test('état : expiré chez FedaPay → expired, relance possible', async () => {
  const p = addPurchase({ payment_status: 'pending', created_at: ago(25 * HOUR) })
  fedapay[p.provider_transaction_id] = { status: 'expired' }
  const body = await status(p.id)
  assert.equal(body.state, 'expired')
  assert.equal(body.status, 'failed')
  assert.equal(body.can_retry, true)
})

test('état : achat failed approuvé plus tard → la page le règle à la relecture (completed, plus de relance)', async () => {
  const p = addPurchase()
  fedapay[p.provider_transaction_id] = { status: 'approved', amount_debited: 1042, fees: 42 }
  const body = await status(p.id)
  assert.equal(body.state, 'completed')
  assert.equal(body.access_granted, true)
  assert.equal(body.can_retry, false)
  assert.equal(body.failure_reason, null)
  assert.equal(body.amount_debited, 1042)
})

test('état : remboursé → refunded, pas de relance ; sans relecture → état en base, champs FedaPay null', async () => {
  const r = addPurchase({ payment_status: 'refunded' })
  fedapay[r.provider_transaction_id] = { status: 'refunded' }
  const refunded = await status(r.id)
  assert.equal(refunded.state, 'refunded')
  assert.equal(refunded.can_retry, false)

  const p = addPurchase()
  fedapay[p.provider_transaction_id] = { status: 'expired', last_error_code: 'TIMEOUT' }
  const plain = await status(p.id, false)
  assert.equal(plain.refreshed, false)
  assert.equal(plain.state, 'failed')
  assert.equal(plain.fedapay_status, null)
  assert.equal(plain.failure_reason, null)
  assert.equal(plain.amount_debited, null)
  // Remboursé : état terminal, jamais relu ; sans ?refresh=1 : pas de relecture.
  assert.equal(fedaReads, 0)
})

test('compatibilité : achat créé par l’ancienne page FedaPay (sans custom_metadata) → réglé par la relecture', async () => {
  const p = addPurchase({ payment_status: 'pending', created_at: ago(3 * MIN) })
  fedapay[p.provider_transaction_id] = { status: 'approved' } // aucune custom_metadata
  const body = await status(p.id)
  assert.equal(body.state, 'completed')
  assert.equal(row(p.id)?.access_granted, true)
})

// ── Cron ────────────────────────────────────────────────────────────────────

test('cron : relit les échecs avec transaction des 72 dernières heures, et eux seuls', async () => {
  const late = addPurchase({ created_at: ago(30 * HOUR) })
  // Créé il y a 5 jours, abandonné il y a 30 h : la fenêtre part de l'échec.
  const lateStale = addPurchase({ created_at: ago(120 * HOUR), updated_at: ago(30 * HOUR) })
  fedapay[lateStale.provider_transaction_id] = { status: 'approved' }
  fedapay[late.provider_transaction_id] = { status: 'approved' }
  const stillDeclined = addPurchase({ created_at: ago(2 * HOUR) })
  fedapay[stillDeclined.provider_transaction_id] = { status: 'declined' }
  const tooOld = addPurchase({ created_at: ago(80 * HOUR) })
  fedapay[tooOld.provider_transaction_id] = { status: 'approved' }
  const tooRecent = addPurchase({ created_at: ago(2 * MIN) })
  fedapay[tooRecent.provider_transaction_id] = { status: 'approved' }
  const noTx = addPurchase({ provider_transaction_id: null, created_at: ago(2 * HOUR) })
  const down = addPurchase({ created_at: ago(3 * HOUR) })
  fedapay[down.provider_transaction_id] = 500

  const res = await cronRoute.GET(
    new NextRequest('https://app.test/api/cron/purchases-reconcile', {
      headers: { authorization: 'Bearer cron-secret-0123456789' },
    }),
  )
  assert.equal(res.status, 200)
  const body = await res.json()
  assert.equal(body.failed_rechecked, 4)
  assert.deepEqual(body.transitions, { 'failed→completed': 2 })
  assert.equal(body.lookup_failed, 1)
  assert.equal(row(late.id)?.payment_status, 'completed')
  assert.equal(row(lateStale.id)?.payment_status, 'completed')
  for (const p of [stillDeclined, tooOld, tooRecent, noTx, down])
    assert.equal(row(p.id)?.payment_status, 'failed', p.id)
  await flushAfter(state)
  assert.equal(state.emails.length, 2)
})
