import assert from 'node:assert/strict'
import { beforeEach, test } from 'node:test'
import { NextRequest } from 'next/server'
import type * as AccessModule from '../app/api/ce-it/access/route'
import type * as CatalogueModule from '../app/api/ce-it/catalogue/route'
import type * as ReviewModule from '../app/api/ce-it/review-files/route'
import type * as StudioModule from '../app/api/ce-it/studio/route'
import type * as VersionsModule from '../app/api/ce-it/versions/route'
import type * as PaymentModule from '../lib/ce-it/payment-adapter'
import { documentInput } from './ce-it-fixture'
import { installStubs, resetStore } from './fiches-fake-db'

const state = installStubs()
let pinOk = false
let pinCalls = 0
let pinUnavailable = false
const Module = require('node:module') as {
  _load: (request: string, parent: unknown, isMain: boolean) => unknown
}
const load = Module._load
Module._load = function (this: unknown, request: string, parent: unknown, isMain: boolean) {
  if (request === '@/lib/security/card-pin')
    return {
      loginWithCardPin: async () => {
        pinCalls++
        if (pinUnavailable) return { ok: false, reason: 'not_configured' }
        return pinOk ? { ok: true, memberId: 'member-proof' } : { ok: false, reason: 'wrong_pin' }
      },
    }
  if (request === '@/lib/utils/rate-limit-persistent') return { applyRateLimit: async () => null }
  if (request === '@/lib/security/assert-access')
    return {
      assertAuthenticated: async () =>
        state.ctx
          ? { ok: true, ctx: { ...state.ctx, supabase: state.session } }
          : { ok: false, response: new Response(null, { status: 401 }) },
    }
  return load.call(this, request, parent, isMain)
}
const access = require('../app/api/ce-it/access/route') as typeof AccessModule
const studio = require('../app/api/ce-it/studio/route') as typeof StudioModule
const versions = require('../app/api/ce-it/versions/route') as typeof VersionsModule
const review = require('../app/api/ce-it/review-files/route') as typeof ReviewModule
const catalogue = require('../app/api/ce-it/catalogue/route') as typeof CatalogueModule
const payment = require('../lib/ce-it/payment-adapter') as typeof PaymentModule
const id = '00000000-0000-4000-8000-000000000001'
const token = 'a'.repeat(64)
const req = (body: unknown, path = 'access') =>
  new NextRequest(`http://localhost/api/ce-it/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
beforeEach(() => {
  resetStore(state)
  pinOk = false
  pinCalls = 0
  pinUnavailable = false
  process.env.CE_IT_MODULE_ENABLED = 'true'
})
test('disabled module refuses catalogue and mutations before any SQL or PIN lookup', async () => {
  process.env.CE_IT_MODULE_ENABLED = 'false'
  assert.equal((await access.POST(req({ action: 'card' }))).status, 404)
  assert.equal(
    (await catalogue.GET(new NextRequest('http://localhost/api/ce-it/catalogue'))).status,
    404,
  )
  assert.equal((await studio.GET()).status, 404)
  assert.equal(state.store.rpcCalls.length, 0)
  assert.equal(pinCalls, 0)
})
test('public caller cannot author, upload or obtain reviewer files', async () => {
  assert.equal((await studio.POST(req({ action: 'create', data: {} }))).status, 401)
  assert.equal((await versions.POST(req({}))).status, 401)
  assert.equal((await review.POST(req({ version: id }))).status, 401)
  assert.equal(state.store.ops.length, 0)
})
test('bad PIN and forged member/payment fields never reach the service grant RPC', async () => {
  const data = { action: 'card', product_id: id, card_number: 'COO-12345', pin: '654321' }
  assert.equal((await access.POST(req(data))).status, 403)
  assert.equal(pinCalls, 1)
  assert.equal((await access.POST(req({ ...data, member_id: id }))).status, 400)
  assert.equal(
    (await access.POST(req({ ...data, payment_status: 'completed', price: 0 }))).status,
    400,
  )
  assert.equal(state.store.rpcCalls.length, 0)
})
test('missing existing PIN configuration reports service unavailable instead of blaming the card holder', async () => {
  pinUnavailable = true
  const response = await access.POST(
    req({ action: 'card', product_id: id, card_number: 'COO-12345', pin: '654321' }),
  )
  assert.equal(response.status, 503)
  assert.equal(state.store.rpcCalls.length, 0)
})
test('correct PIN still requires the current SQL tree policy and returns no links on denial', async () => {
  pinOk = true
  state.store.tables.member_cards = [{ id, card_number: 'COO-12345', member_id: 'member-proof' }]
  state.admin.rpcHandlers.ceit_grant_card = () => ({
    data: null,
    error: { code: '42501', message: 'card access denied' },
  })
  const response = await access.POST(
    req({ action: 'card', product_id: id, card_number: 'COO-12345', pin: '654321' }),
  )
  assert.equal(response.status, 403)
  assert.equal(state.store.storageCalls.length, 0)
  assert.equal('token' in (await response.json()), false)
})
test('successful card access sends only a token hash to SQL and searches available candidates', async () => {
  pinOk = true
  state.store.tables.member_cards = [{ id, card_number: 'COO-12345', member_id: 'member-proof' }]
  state.admin.rpcHandlers.ceit_grant_card = () => ({ data: id, error: null })
  state.admin.rpcHandlers.ceit_candidates = () => ({
    data: [{ agronome_id: id, name: 'Afi K.', location_rank: 0 }],
    error: null,
  })
  const response = await access.POST(
    req({ action: 'card', product_id: id, card_number: 'COO-12345', pin: '654321' }),
  )
  assert.equal(response.status, 200)
  const body = await response.json()
  assert.equal(body.grant_id, id)
  assert.match(body.token, /^[a-f0-9]{64}$/)
  assert.equal(body.candidates.length, 1)
  assert.ok(!JSON.stringify(state.store.rpcCalls).includes(body.token))
  assert.ok(!JSON.stringify(body).includes('654321'))
})
test('invalid download proof and foreign storage keys never generate a signed URL', async () => {
  state.admin.rpcHandlers.ceit_check_grant = () => ({
    data: null,
    error: { code: '42501', message: 'access denied' },
  })
  assert.equal((await access.POST(req({ action: 'download', grant_id: id, token }))).status, 403)
  state.admin.rpcHandlers.ceit_check_grant = () => ({
    data: { product_id: id, version_id: id, ce_key: 'foreign/file.pdf', it_key: 'foreign/it.pdf' },
    error: null,
  })
  assert.equal((await access.POST(req({ action: 'download', grant_id: id, token }))).status, 400)
  assert.equal(state.store.storageCalls.length, 0)
})
test('anonymous purchase confirmation is not an accepted command', async () => {
  const response = await access.POST(
    req({ action: 'purchase', product_id: id, amount: 1500, status: 'completed' }),
  )
  assert.equal(response.status, 400)
  assert.equal(state.store.rpcCalls.length, 0)
})
function author() {
  state.ctx = { userId: id, role: 'none', cooperativeId: null, cooperativeLevel: null }
  state.store.tables.ceit_products = [{ id, title: 'Compte de test' }]
}
function versionRequest() {
  const form = new FormData()
  form.set('product_id', id)
  form.set('data', JSON.stringify(documentInput))
  return new NextRequest('http://localhost/api/ce-it/versions', { method: 'POST', body: form })
}
test('visible reviewer product is insufficient to upload: editable permission is independently checked', async () => {
  author()
  state.session.rpcHandlers.ceit_can_edit = () => ({ data: false, error: null })
  assert.equal((await versions.POST(versionRequest())).status, 403)
  assert.equal(state.store.storageCalls.length, 0)
})
test('generated PDF pair stays private, carries hashes and uses the authenticated author', async () => {
  author()
  state.session.rpcHandlers.ceit_can_edit = () => ({ data: true, error: null })
  state.admin.rpcHandlers.ceit_add_version = () => ({ data: id, error: null })
  const response = await versions.POST(versionRequest())
  assert.equal(response.status, 201)
  const uploads = state.store.storageCalls.filter((c) => c.op === 'upload')
  assert.equal(uploads.length, 2)
  assert.ok(uploads.every((c) => c.bucket === 'ceit-documents'))
  const args = state.store.rpcCalls.find((c) => c.name === 'ceit_add_version')?.args as {
    actor: string
    ce_hash: string
    it_hash: string
  }
  assert.equal(args.actor, id)
  assert.match(args.ce_hash, /^[a-f0-9]{64}$/)
  assert.match(args.it_hash, /^[a-f0-9]{64}$/)
  assert.ok(!state.store.storageCalls.some((c) => c.op === 'createSignedUrl'))
})
test('revocation between the permission preflight and SQL insert removes both just-uploaded PDFs', async () => {
  author()
  state.session.rpcHandlers.ceit_can_edit = () => ({ data: true, error: null })
  state.admin.rpcHandlers.ceit_add_version = () => ({
    data: null,
    error: { code: '42501', message: 'mandate revoked' },
  })
  const response = await versions.POST(versionRequest())
  assert.equal(response.status, 403)
  const uploads = state.store.storageCalls.filter((c) => c.op === 'upload').map((c) => c.args[0])
  const removed = state.store.storageCalls.find((c) => c.op === 'remove')?.args[0]
  assert.equal(uploads.length, 2)
  assert.deepEqual(removed, uploads)
})
test('oversized multipart upload is rejected before any storage access', async () => {
  author()
  const request = new NextRequest('http://localhost/api/ce-it/versions', {
    method: 'POST',
    headers: { 'content-length': '5000000' },
    body: 'x',
  })
  assert.equal((await versions.POST(request)).status, 413)
  assert.equal(state.store.storageCalls.length, 0)
})
test('paid access requires a buyer session and cannot accept an actor ID from the browser', async () => {
  assert.equal((await access.POST(req({ action: 'purchased', grant_id: id }))).status, 401)
  assert.equal(
    (await access.POST(req({ action: 'purchased', grant_id: id, actor: id }))).status,
    400,
  )
  author()
  state.admin.rpcHandlers.ceit_check_grant = () => ({
    data: null,
    error: { code: '42501', message: 'not buyer' },
  })
  assert.equal((await access.POST(req({ action: 'purchased', grant_id: id }))).status, 403)
  assert.equal(state.store.storageCalls.length, 0)
  const args = state.store.rpcCalls.find((c) => c.name === 'ceit_check_grant')?.args as {
    actor: string
  }
  assert.equal(args.actor, id)
})
test('receipt adapter accepts only 1500 XOF and fails closed while SQL activation is off', async () => {
  const receipt = {
    productId: id,
    versionId: id,
    purchaseId: id,
    buyerUserId: id,
    providerTransactionId: 'transaction-123',
    amount: 1500 as const,
    currency: 'XOF' as const,
  }
  await assert.rejects(() =>
    payment.settleVerifiedCeItPurchase({ ...receipt, amount: 250 as 1500 }),
  )
  assert.equal(state.store.rpcCalls.length, 0)
  state.admin.rpcHandlers.ceit_confirm_purchase = () => ({
    data: null,
    error: { code: 'P0001', message: 'payment adapter disabled' },
  })
  await assert.rejects(() => payment.settleVerifiedCeItPurchase(receipt))
  assert.equal(state.store.rpcCalls.at(-1)?.name, 'ceit_confirm_purchase')
})
