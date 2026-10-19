/**
 * Petits ajouts serveur du parcours d'achat (UI) :
 *   - GET /api/purchases/[id] renvoie la référence FedaPay (à citer au support),
 *     jamais les coordonnées de l'acheteur ;
 *   - POST /api/fiches : refus de la RLS (42501) → 403 au message clair, et
 *     l'id + dossier (cooperative_id) renvoyés pour l'envoi des fichiers ;
 *   - PATCH /api/fiches/[id] : couverture remplacée → ancienne image propre à
 *     la fiche effacée, jamais celle d'une autre fiche.
 */
import assert from 'node:assert/strict'
import { beforeEach, test } from 'node:test'
import { installFetch, installStubs, resetStore } from './fiches-fake-db'

for (const level of ['log', 'info', 'warn', 'error', 'debug'] as const) console[level] = () => {}
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://proj.supabase.test'
process.env.FEDAPAY_SECRET_KEY = 'sk_sandbox_test'
process.env.FEDAPAY_ENV = 'sandbox'

const state = installStubs()
const { NextRequest } = require('next/server') as typeof import('next/server')
type Ctx = { params: Promise<{ id: string }> }
type Handler = (req: InstanceType<typeof NextRequest>, ctx: Ctx) => Promise<Response>
const purchaseRoute = require('../app/api/purchases/[id]/route') as { GET: Handler }
const fichesRoute = require('../app/api/fiches/route') as {
  POST: (req: InstanceType<typeof NextRequest>) => Promise<Response>
}
const ficheRoute = require('../app/api/fiches/[id]/route') as { PATCH: Handler }

const FICHE = '0f0f0f0f-0000-4000-8000-0000000000f1'
const PURCHASE = '0e0e0e0e-0000-4000-8000-0000000000f2'
const FAITIERE = '0c0c0c0c-0000-4000-8000-0000000000f3'
const COVERS = 'https://proj.supabase.test/storage/v1/object/public/fiches-covers/'

const req = (url: string, init?: { method?: string; body?: unknown }) =>
  new NextRequest(`https://app.test${url}`, {
    method: init?.method ?? 'GET',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': '10.0.0.9' },
    ...(init?.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
  })
const ctx = (id: string): Ctx => ({ params: Promise.resolve({ id }) })

beforeEach(() => {
  resetStore(state)
  installFetch(state.store, [])
  state.store.rows('cultures').push({ name: 'Mais' })
})

test('GET /api/purchases/[id] : référence FedaPay renvoyée, sans téléphone ni nom', async () => {
  state.store.rows('fiches_techniques').push({ id: FICHE, title: 'Maïs', cooperative_id: null })
  state.store.rows('purchases').push({
    id: PURCHASE,
    fiche_id: FICHE,
    amount: 1000,
    payment_status: 'completed',
    access_granted: true,
    paid_at: '2026-10-18T10:00:00Z',
    provider_transaction_id: '4242',
    buyer_phone: '90000000',
    buyer_name: 'Ama',
  })
  const res = await purchaseRoute.GET(req(`/api/purchases/${PURCHASE}`), ctx(PURCHASE))
  assert.equal(res.status, 200)
  const body = await res.json()
  assert.equal(body.reference, '4242')
  assert.equal(body.seller_name, 'FaîtiereHub')
  assert.equal('buyer_phone' in body, false)
  assert.equal('buyer_name' in body, false)
})

test('POST /api/fiches : brouillon accepté → id et dossier (cooperative_id) renvoyés', async () => {
  state.ctx = { userId: 'u-s', role: 'super_admin', cooperativeId: null, cooperativeLevel: null }
  const res = await fichesRoute.POST(
    req('/api/fiches', {
      method: 'POST',
      body: {
        title: 'Maïs pluvial',
        culture: 'Maïs',
        type_agriculture: 'conventionnel',
        price_non_member: 1000,
        status: 'draft',
        platform: true,
      },
    }),
  )
  assert.equal(res.status, 201)
  const { fiche } = await res.json()
  assert.ok(fiche.id)
  assert.equal(fiche.cooperative_id, null)
  assert.equal(fiche.culture, 'Mais')
})

test('POST /api/fiches : refus de la RLS (faîtière) → 403 clair, pas un 500 muet', async () => {
  state.ctx = {
    userId: 'u-f',
    role: 'cooperative_admin',
    cooperativeId: FAITIERE,
    cooperativeLevel: 'faitiere',
  }
  state.store.failInsert.fiches_techniques = {
    code: '42501',
    message: 'new row violates row-level security policy',
  }
  const res = await fichesRoute.POST(
    req('/api/fiches', {
      method: 'POST',
      body: {
        title: 'Maïs pluvial',
        culture: 'Mais',
        type_agriculture: 'conventionnel',
        status: 'draft',
      },
    }),
  )
  assert.equal(res.status, 403)
  assert.match((await res.json()).error, /ne peut pas encore publier/)
})

test('PATCH /api/fiches/[id] : couverture remplacée → ancienne image de la fiche effacée', async () => {
  state.ctx = { userId: 'u-s', role: 'super_admin', cooperativeId: null, cooperativeLevel: null }
  const oldCover = `plateforme/${FICHE}.webp`
  state.store.rows('fiches_techniques').push({
    id: FICHE,
    title: 'Maïs',
    status: 'draft',
    price_non_member: 1000,
    cooperative_id: null,
    cover_url: `${COVERS}${oldCover}`,
    files: [],
  })
  state.store.put('fiches-covers', oldCover, [1])
  state.store.put('fiches-covers', `plateforme/${FICHE}-k1.webp`, [2])
  const res = await ficheRoute.PATCH(
    req(`/api/fiches/${FICHE}`, {
      method: 'PATCH',
      body: { cover_url: `${COVERS}plateforme/${FICHE}-k1.webp` },
    }),
    ctx(FICHE),
  )
  assert.equal(res.status, 200)
  const covers = state.store.bucket('fiches-covers')
  assert.equal(covers.has(oldCover), false)
  assert.equal(covers.has(`plateforme/${FICHE}-k1.webp`), true)
})

test('PATCH /api/fiches/[id] : image d’une autre fiche jamais effacée', async () => {
  state.ctx = { userId: 'u-s', role: 'super_admin', cooperativeId: null, cooperativeLevel: null }
  const foreign = 'plateforme/autre-fiche.webp'
  state.store.rows('fiches_techniques').push({
    id: FICHE,
    title: 'Maïs',
    status: 'draft',
    price_non_member: 1000,
    cooperative_id: null,
    cover_url: `${COVERS}${foreign}`,
    files: [],
  })
  state.store.put('fiches-covers', foreign, [1])
  const res = await ficheRoute.PATCH(
    req(`/api/fiches/${FICHE}`, { method: 'PATCH', body: { cover_url: null } }),
    ctx(FICHE),
  )
  assert.equal(res.status, 200)
  assert.equal(state.store.bucket('fiches-covers').has(foreign), true)
})
