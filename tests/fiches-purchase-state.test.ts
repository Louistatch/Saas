/**
 * B1 — Règlement d'un achat de compte d'exploitation d'après FedaPay.
 * Matrice de la fonction pure decidePurchaseTransition, puis settlePurchase
 * de bout en bout (faux Supabase, fetch FedaPay simulé).
 */
import assert from 'node:assert/strict'
import { beforeEach, test } from 'node:test'
import { decidePurchaseTransition } from '../lib/fiches/purchase-state'
import type * as PurchasesModule from '../lib/fiches/purchases'
import { flushAfter, installFetch, installStubs, json, resetStore } from './fiches-fake-db'

process.env.FEDAPAY_SECRET_KEY = 'sk_sandbox_test'
process.env.FEDAPAY_ENV = 'sandbox'
const logged: string[] = []
for (const level of ['log', 'info', 'warn', 'error', 'debug'] as const)
  console[level] = (...a: unknown[]) => {
    logged.push(a.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(' '))
  }

const state = installStubs()
const { settlePurchase } = require('../lib/fiches/purchases') as typeof PurchasesModule

const NOW = new Date('2026-10-18T10:00:00Z')
const pending = { amount: 1000, payment_status: 'pending' }
const completed = { amount: 1000, payment_status: 'completed' }
const tx = (status: string, amount = 1000, currencyIso: string | null = 'XOF') => ({
  status,
  amount,
  currencyIso,
})

test('matrice pending : approved / transferred débloquent, échecs, remboursement, attente', () => {
  for (const status of ['approved', 'transferred']) {
    const d = decidePurchaseTransition(tx(status), pending, NOW)
    assert.deepEqual(d, {
      action: 'update',
      from: 'pending',
      next: { payment_status: 'completed', access_granted: true, paid_at: NOW.toISOString() },
      event: 'paid',
    })
  }
  for (const status of ['declined', 'canceled', 'cancelled', 'expired']) {
    const d = decidePurchaseTransition(tx(status), pending, NOW)
    assert.equal(d.action, 'update')
    assert.ok(d.action === 'update' && d.next.payment_status === 'failed' && d.event === 'failed')
  }
  const refunded = decidePurchaseTransition(tx('refunded'), pending, NOW)
  assert.ok(refunded.action === 'update')
  assert.deepEqual(refunded.action === 'update' && refunded.next, {
    payment_status: 'refunded',
    access_granted: false,
  })
  assert.deepEqual(decidePurchaseTransition(tx('pending'), pending, NOW), { action: 'none' })
  // Statut inconnu : jamais de silence, jamais d'écriture.
  const unknown = decidePurchaseTransition(tx('on_hold'), pending, NOW)
  assert.equal(unknown.action, 'warn')
})

test('écart de montant ou de devise : échec, même si FedaPay dit approved/transferred', () => {
  for (const status of ['approved', 'transferred']) {
    const low = decidePurchaseTransition(tx(status, 999), pending, NOW)
    assert.ok(low.action === 'update' && low.event === 'mismatch')
    assert.deepEqual(low.action === 'update' && low.next, { payment_status: 'failed' })
    const eur = decidePurchaseTransition(tx(status, 1000, 'EUR'), pending, NOW)
    assert.ok(eur.action === 'update' && eur.event === 'mismatch')
    const nan = decidePurchaseTransition(tx(status, Number.NaN), pending, NOW)
    assert.ok(nan.action === 'update' && nan.event === 'mismatch')
  }
  // Devise absente de la réponse : tolérée (FedaPay ne la renvoie pas toujours).
  const noCurrency = decidePurchaseTransition(tx('approved', 1000, null), pending, NOW)
  assert.ok(noCurrency.action === 'update' && noCurrency.event === 'paid')
})

test('completed + refunded : accès retiré, garde sur completed ; sinon rien', () => {
  const d = decidePurchaseTransition(tx('refunded'), completed, NOW)
  assert.deepEqual(d, {
    action: 'update',
    from: 'completed',
    next: { payment_status: 'refunded', access_granted: false },
    event: 'refunded',
  })
  assert.deepEqual(decidePurchaseTransition(tx('approved'), completed, NOW), { action: 'none' })
  assert.deepEqual(decidePurchaseTransition(tx('transferred'), completed, NOW), { action: 'none' })
  assert.equal(decidePurchaseTransition(tx('declined'), completed, NOW).action, 'warn')
  // États terminaux : jamais rouverts.
  for (const s of ['failed', 'refunded'])
    assert.deepEqual(
      decidePurchaseTransition(tx('approved'), { amount: 1000, payment_status: s }),
      {
        action: 'none',
      },
    )
})

// ── settlePurchase de bout en bout ───────────────────────────────────────────

const FICHE = '0f0f0f0f-0000-4000-8000-000000000001'
const COOP = '0c0c0c0c-0000-4000-8000-000000000002'
let fedaStatus = 'transferred'

beforeEach(() => {
  resetStore(state)
  fedaStatus = 'transferred'
  installFetch(state.store, [
    (url) =>
      url.startsWith('https://sandbox-api.fedapay.com/v1/transactions/')
        ? json({
            'v1/transaction': {
              id: 77,
              status: fedaStatus,
              amount: 1000,
              currency: { iso: 'XOF' },
            },
          })
        : null,
  ])
  state.store
    .rows('fiches_techniques')
    .push({ id: FICHE, title: 'Maïs pluvial', cooperative_id: COOP })
  state.store.rows('cooperatives').push({ id: COOP, name: 'FENOMAT' })
})

function addPurchase(over: Record<string, unknown> = {}) {
  const row = {
    id: crypto.randomUUID(),
    fiche_id: FICHE,
    amount: 1000,
    currency: 'XOF',
    payment_status: 'pending',
    access_granted: false,
    provider: 'fedapay',
    provider_transaction_id: '77',
    paid_at: null,
    buyer_email: 'ama@example.org',
    buyer_name: 'Ama Koffi',
    created_at: new Date().toISOString(),
    ...over,
  }
  state.store.rows('purchases').push(row)
  return row
}

test('settlePurchase : transferred → completed + accès, reçu « compte d’exploitation » et alerte, une seule fois', async () => {
  const p = addPurchase()
  const settled = await settlePurchase(p.id)
  assert.equal(settled?.payment_status, 'completed')
  assert.equal(settled?.access_granted, true)
  await flushAfter(state)
  assert.equal(state.emails.length, 1)
  const receipt = state.emails[0]
  assert.equal(receipt?.to, 'ama@example.org')
  assert.match(receipt?.subject ?? '', /compte d’exploitation/)
  for (const part of [
    'Ama Koffi',
    'Maïs pluvial',
    'FENOMAT',
    '1',
    'Référence FedaPay : 77',
    'Date :',
  ])
    assert.ok(receipt?.text.includes(part), `reçu sans « ${part} »`)
  assert.ok(!receipt?.text.includes('fiche technique'))
  assert.equal(state.superAdminAlerts.length, 1)
  assert.match(state.superAdminAlerts[0]?.subject ?? '', /Nouvelle vente/)

  // Deuxième passage (webhook après retour navigateur) : rien de plus.
  await settlePurchase(p.id)
  await flushAfter(state)
  assert.equal(state.emails.length, 1)
  assert.equal(state.superAdminAlerts.length, 1)
})

test('settlePurchase : completed puis refunded → refunded, accès retiré, pas de reçu', async () => {
  const p = addPurchase({
    payment_status: 'completed',
    access_granted: true,
    paid_at: NOW.toISOString(),
  })
  fedaStatus = 'refunded'
  const settled = await settlePurchase(p.id)
  assert.equal(settled?.payment_status, 'refunded')
  assert.equal(settled?.access_granted, false)
  const row = state.store.rows('purchases').find((r) => r.id === p.id)
  assert.equal(row?.access_granted, false)
  const update = state.store.ops.find((o) => o.table === 'purchases' && o.op === 'update')
  assert.equal(update?.client, 'admin')
  await flushAfter(state)
  assert.equal(state.emails.length, 0)
})

test('settlePurchase : statut inconnu → journalisé, achat inchangé', async () => {
  const p = addPurchase()
  fedaStatus = 'mystery'
  logged.length = 0
  const settled = await settlePurchase(p.id)
  assert.equal(settled?.payment_status, 'pending')
  assert.ok(logged.some((l) => l.includes('FedaPay status not handled') && l.includes('mystery')))
  assert.ok(!state.store.ops.some((o) => o.table === 'purchases' && o.op === 'update'))
})

test('settlePurchase : écart de montant → failed, sans accès ni reçu', async () => {
  const p = addPurchase({ amount: 5000 })
  fedaStatus = 'approved'
  const settled = await settlePurchase(p.id)
  assert.equal(settled?.payment_status, 'failed')
  assert.equal(settled?.access_granted, false)
  await flushAfter(state)
  assert.equal(state.emails.length, 0)
})
