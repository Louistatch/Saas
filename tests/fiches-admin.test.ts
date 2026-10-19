/**
 * Administration des comptes d'exploitation :
 *   B6  DELETE /api/fiches/[id] (refus si ventes, suppression par le client de
 *       service) et GET /api/admin/fiches/[id]/files (vendeur uniquement) ;
 *   B9  PATCH /api/fiches/[id] (files, confirm_free, publication sans fichier) ;
 *   B12 GET /api/admin/fiches (totaux exacts, ?status=) et revérification.
 */
import assert from 'node:assert/strict'
import { beforeEach, test } from 'node:test'
import { canReverifyPurchase } from '../lib/fiches/purchase-state'
import { installFetch, installStubs, json, resetStore } from './fiches-fake-db'

for (const level of ['log', 'info', 'warn', 'error', 'debug'] as const) console[level] = () => {}
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://proj.supabase.test'
process.env.FEDAPAY_SECRET_KEY = 'sk_sandbox_test'
process.env.FEDAPAY_ENV = 'sandbox'

const state = installStubs()
const { NextRequest } = require('next/server') as typeof import('next/server')
type Ctx = { params: Promise<{ id: string }> }
type Handler = (req: InstanceType<typeof NextRequest>, ctx: Ctx) => Promise<Response>
const ficheRoute = require('../app/api/fiches/[id]/route') as { PATCH: Handler; DELETE: Handler }
const filesRoute = require('../app/api/admin/fiches/[id]/files/route') as { GET: Handler }
const adminFiches = require('../app/api/admin/fiches/route') as {
  GET: (req: InstanceType<typeof NextRequest>) => Promise<Response>
}
const reverifyRoute = require('../app/api/admin/purchases/[id]/reverify/route') as { POST: Handler }

const FICHE = '0f0f0f0f-0000-4000-8000-0000000000e1'
const COOP = '0c0c0c0c-0000-4000-8000-0000000000e2'
const OTHER = '0c0c0c0c-0000-4000-8000-0000000000e3'
const ZIP = [0x50, 0x4b, 0x03, 0x04, 1, 2, 3, 4]
const PDF = [0x25, 0x50, 0x44, 0x46, 1, 2, 3, 4]
const COVER =
  'https://proj.supabase.test/storage/v1/object/public/fiches-covers/plateforme/c-1.webp'
const superAdmin = {
  userId: 'u-s',
  role: 'super_admin',
  cooperativeId: null,
  cooperativeLevel: null,
}

const req = (url: string, init?: { method?: string; body?: unknown }) =>
  new NextRequest(`https://app.test${url}`, {
    method: init?.method ?? 'GET',
    headers: { 'content-type': 'application/json' },
    ...(init?.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
  })
const ctx = (id = FICHE): Ctx => ({ params: Promise.resolve({ id }) })

function addFiche(over: Record<string, unknown> = {}) {
  const row = {
    id: FICHE,
    title: 'Soja',
    status: 'published',
    price_non_member: 1000,
    cooperative_id: null,
    cover_url: COVER,
    files: [{ name: 'Compte soja.xlsx', url: 'plateforme/1-a.xlsx', type: 'xlsx', size: 8 }],
    ...over,
  }
  state.store.rows('fiches_techniques').push(row)
  return row
}

beforeEach(() => {
  resetStore(state)
  state.ctx = superAdmin
  installFetch(state.store, [])
  state.store.put('fiches-techniques', 'plateforme/1-a.xlsx', ZIP)
  state.store.put('fiches-covers', 'plateforme/c-1.webp', [1, 2, 3])
})

// ── B6 : suppression ────────────────────────────────────────────────────────

test('DELETE : une fiche avec un achat (même pending) → 409, rien supprimé', async () => {
  addFiche()
  state.store.rows('purchases').push({ id: 'p1', fiche_id: FICHE, payment_status: 'pending' })
  const res = await ficheRoute.DELETE(req(`/api/fiches/${FICHE}`, { method: 'DELETE' }), ctx())
  assert.equal(res.status, 409)
  assert.match((await res.json()).error, /retirez-le de la vente/)
  assert.equal(state.store.rows('fiches_techniques').length, 1)
  assert.equal(state.store.rows('purchases').length, 1)
  assert.ok(state.store.bucket('fiches-techniques').has('plateforme/1-a.xlsx'))
  assert.ok(!state.store.storageCalls.some((c) => c.op === 'remove'))
})

test('DELETE : fiche jamais vendue → ligne, fichiers, dossier et couverture effacés par le client de service', async () => {
  addFiche()
  state.store.put('fiches-techniques', `plateforme/${FICHE}/v2.pdf`, PDF)
  state.store.put('fiches-techniques', 'plateforme/autre-fiche.xlsx', ZIP)
  const res = await ficheRoute.DELETE(req(`/api/fiches/${FICHE}`, { method: 'DELETE' }), ctx())
  assert.equal(res.status, 200)
  assert.equal(state.store.rows('fiches_techniques').length, 0)
  const bucket = state.store.bucket('fiches-techniques')
  assert.equal(bucket.has('plateforme/1-a.xlsx'), false)
  assert.equal(bucket.has(`plateforme/${FICHE}/v2.pdf`), false)
  assert.equal(bucket.has('plateforme/autre-fiche.xlsx'), true)
  assert.equal(state.store.bucket('fiches-covers').size, 0)
  // Tout par le client de service : jamais la session.
  const del = state.store.ops.find((o) => o.table === 'fiches_techniques' && o.op === 'delete')
  assert.equal(del?.client, 'admin')
  assert.ok(
    state.store.storageCalls.filter((c) => c.op === 'remove').every((c) => c.client === 'admin'),
  )
})

test('DELETE : contrainte RESTRICT (achat arrivé entre-temps) → 409, fichiers intacts', async () => {
  addFiche()
  state.store.failDelete.fiches_techniques = { code: '23503', message: 'violates foreign key' }
  const res = await ficheRoute.DELETE(req(`/api/fiches/${FICHE}`, { method: 'DELETE' }), ctx())
  assert.equal(res.status, 409)
  assert.ok(state.store.bucket('fiches-techniques').has('plateforme/1-a.xlsx'))
})

test('DELETE : fiche de la plateforme réservée au super_admin', async () => {
  addFiche()
  state.ctx = {
    userId: 'u-f',
    role: 'cooperative_admin',
    cooperativeId: COOP,
    cooperativeLevel: 'faitiere',
  }
  const res = await ficheRoute.DELETE(req(`/api/fiches/${FICHE}`, { method: 'DELETE' }), ctx())
  assert.equal(res.status, 403)
})

test('PATCH/DELETE : la faîtière propriétaire gère SA fiche, jamais celle d’une autre', async () => {
  const faitiere = (cooperativeId: string) => ({
    userId: 'u-f',
    role: 'cooperative_admin',
    cooperativeId,
    cooperativeLevel: 'faitiere',
  })
  addFiche({
    cooperative_id: COOP,
    status: 'draft',
    files: [],
  })
  state.store.put('fiches-techniques', `${COOP}/${FICHE}/compte.xlsx`, ZIP)

  // Faîtière d'une autre organisation : refus, rien écrit.
  state.ctx = faitiere(OTHER)
  const denied = await ficheRoute.PATCH(
    req(`/api/fiches/${FICHE}`, { method: 'PATCH', body: { status: 'archived' } }),
    ctx(),
  )
  assert.equal(denied.status, 403)
  assert.equal(state.store.rows('fiches_techniques')[0]?.status, 'draft')
  const deniedDel = await ficheRoute.DELETE(
    req(`/api/fiches/${FICHE}`, { method: 'DELETE' }),
    ctx(),
  )
  assert.equal(deniedDel.status, 403)
  assert.equal(state.store.rows('fiches_techniques').length, 1)

  // Admin d'une coopérative (pas une faîtière) de la même organisation : refus.
  state.ctx = { ...faitiere(COOP), cooperativeLevel: 'cooperative' }
  const notFaitiere = await ficheRoute.PATCH(
    req(`/api/fiches/${FICHE}`, { method: 'PATCH', body: { status: 'archived' } }),
    ctx(),
  )
  assert.equal(notFaitiere.status, 403)

  // Faîtière propriétaire : fichiers joints au brouillon et mise en vente.
  state.ctx = faitiere(COOP)
  const ok = await ficheRoute.PATCH(
    req(`/api/fiches/${FICHE}`, {
      method: 'PATCH',
      body: {
        files: [{ name: 'Compte.xlsx', url: `${COOP}/${FICHE}/compte.xlsx`, type: 'xlsx' }],
        status: 'published',
      },
    }),
    ctx(),
  )
  assert.equal(ok.status, 200)
  const row = state.store.rows('fiches_techniques')[0] as { status: string; files: unknown[] }
  assert.equal(row.status, 'published')
  assert.equal(row.files.length, 1)

  // … et suppression tant qu'elle n'a jamais été vendue.
  const del = await ficheRoute.DELETE(req(`/api/fiches/${FICHE}`, { method: 'DELETE' }), ctx())
  assert.equal(del.status, 200)
  assert.equal(state.store.rows('fiches_techniques').length, 0)
})

test('PATCH : fiche de la plateforme refusée à une faîtière', async () => {
  addFiche()
  state.ctx = {
    userId: 'u-f',
    role: 'cooperative_admin',
    cooperativeId: COOP,
    cooperativeLevel: 'faitiere',
  }
  const res = await ficheRoute.PATCH(
    req(`/api/fiches/${FICHE}`, { method: 'PATCH', body: { price_non_member: 5 } }),
    ctx(),
  )
  assert.equal(res.status, 403)
  assert.equal(state.store.rows('fiches_techniques')[0]?.price_non_member, 1000)
})

test('GET /api/admin/fiches/[id]/files : vendeur seulement, liens 10 min au nom d’origine', async () => {
  addFiche({
    cooperative_id: COOP,
    files: [{ name: 'Compte.pdf', url: `${COOP}/1-a.pdf`, type: 'pdf' }],
  })
  state.store.put('fiches-techniques', `${COOP}/1-a.pdf`, PDF)
  state.ctx = {
    userId: 'u-f',
    role: 'cooperative_admin',
    cooperativeId: OTHER,
    cooperativeLevel: 'faitiere',
  }
  assert.equal((await filesRoute.GET(req(`/api/admin/fiches/${FICHE}/files`), ctx())).status, 403)
  state.ctx = {
    userId: 'u-f',
    role: 'cooperative_admin',
    cooperativeId: COOP,
    cooperativeLevel: 'union',
  }
  assert.equal((await filesRoute.GET(req(`/api/admin/fiches/${FICHE}/files`), ctx())).status, 403)
  state.ctx = null
  assert.equal((await filesRoute.GET(req(`/api/admin/fiches/${FICHE}/files`), ctx())).status, 401)

  state.ctx = {
    userId: 'u-f',
    role: 'cooperative_admin',
    cooperativeId: COOP,
    cooperativeLevel: 'faitiere',
  }
  const res = await filesRoute.GET(req(`/api/admin/fiches/${FICHE}/files`), ctx())
  assert.equal(res.status, 200)
  const { files } = await res.json()
  assert.ok(files[0].url)
  const sign = state.store.storageCalls.find((c) => c.op === 'createSignedUrl')
  assert.deepEqual(sign?.args, [`${COOP}/1-a.pdf`, 600, { download: 'Compte.pdf' }])
  assert.equal(sign?.client, 'admin')
})

// ── B9 : PATCH ──────────────────────────────────────────────────────────────

test('PATCH : prix > 0 → 0 exige confirm_free', async () => {
  addFiche()
  const refused = await ficheRoute.PATCH(
    req(`/api/fiches/${FICHE}`, { method: 'PATCH', body: { price_non_member: 0 } }),
    ctx(),
  )
  assert.equal(refused.status, 400)
  assert.ok((await refused.json()).details.price_non_member[0])
  assert.equal(state.store.rows('fiches_techniques')[0]?.price_non_member, 1000)

  const ok = await ficheRoute.PATCH(
    req(`/api/fiches/${FICHE}`, {
      method: 'PATCH',
      body: { price_non_member: 0, confirm_free: true },
    }),
    ctx(),
  )
  assert.equal(ok.status, 200)
  const row = state.store.rows('fiches_techniques')[0]
  assert.equal(row?.price_non_member, 0)
  assert.equal('confirm_free' in (row ?? {}), false)
})

test('PATCH files seul : accepté, contrôlé, anciens objets du dossier de la fiche effacés', async () => {
  addFiche({ files: [{ name: 'v1.pdf', url: `plateforme/${FICHE}/v1.pdf`, type: 'pdf' }] })
  state.store.put('fiches-techniques', `plateforme/${FICHE}/v1.pdf`, PDF)
  state.store.put('fiches-techniques', `plateforme/${FICHE}/v2.xlsx`, ZIP)
  const res = await ficheRoute.PATCH(
    req(`/api/fiches/${FICHE}`, {
      method: 'PATCH',
      body: { files: [{ name: 'v2.xlsx', url: `plateforme/${FICHE}/v2.xlsx` }] },
    }),
    ctx(),
  )
  assert.equal(res.status, 200)
  const row = state.store.rows('fiches_techniques')[0]
  assert.deepEqual(row?.files, [
    {
      name: 'v2.xlsx',
      url: `plateforme/${FICHE}/v2.xlsx`,
      type: 'xlsx',
      size: 8,
      mime: 'application/octet-stream',
    },
  ])
  const bucket = state.store.bucket('fiches-techniques')
  assert.equal(bucket.has(`plateforme/${FICHE}/v1.pdf`), false)
  assert.equal(bucket.has(`plateforme/${FICHE}/v2.xlsx`), true)
  // Fichier partagé hors du dossier de la fiche : jamais touché.
  assert.equal(bucket.has('plateforme/1-a.xlsx'), true)
})

test('PATCH : mettre en vente une fiche sans fichier → 400 par champ', async () => {
  addFiche({ status: 'draft', files: [] })
  const res = await ficheRoute.PATCH(
    req(`/api/fiches/${FICHE}`, { method: 'PATCH', body: { status: 'published' } }),
    ctx(),
  )
  assert.equal(res.status, 400)
  assert.ok((await res.json()).details.files[0])
})

test('PATCH : fichier d’une autre faîtière → 400, rien enregistré', async () => {
  addFiche()
  state.store.put('fiches-techniques', `${OTHER}/x.pdf`, PDF)
  const res = await ficheRoute.PATCH(
    req(`/api/fiches/${FICHE}`, {
      method: 'PATCH',
      body: { files: [{ name: 'x.pdf', url: `${OTHER}/x.pdf` }] },
    }),
    ctx(),
  )
  assert.equal(res.status, 400)
  assert.equal(state.store.bucket('fiches-techniques').has(`${OTHER}/x.pdf`), true)
})

// ── B12 : ventes ────────────────────────────────────────────────────────────

test('GET /api/admin/fiches : totaux exacts sur tous les achats réglés/remboursés, ?status=', async () => {
  addFiche()
  const rows = state.store.rows('purchases')
  for (let i = 0; i < 1203; i++)
    rows.push({
      id: `p-${String(i).padStart(5, '0')}`,
      fiche_id: FICHE,
      amount: 1000,
      payment_status: i < 1200 ? 'completed' : 'refunded',
      created_at: new Date(Date.UTC(2026, 9, 1, 0, 0, i)).toISOString(),
      provider_transaction_id: String(i),
    })
  rows.push({
    id: 'p-pending',
    fiche_id: FICHE,
    amount: 1000,
    payment_status: 'pending',
    created_at: '2026-10-17T00:00:00Z',
  })
  const res = await adminFiches.GET(req('/api/admin/fiches'))
  const body = await res.json()
  assert.equal(body.totals.sales, 1200)
  assert.equal(body.totals.revenue, 1_200_000)
  assert.equal(body.totals.refunded, 3)
  assert.equal(body.totals.complete, true)
  assert.deepEqual(body.totals_by_fiche[FICHE], { sales: 1200, revenue: 1_200_000, refunded: 3 })
  assert.equal(body.purchases.length, 500)
  const selected = (table: string) =>
    state.store.ops
      .filter((o) => o.table === table && o.op === 'select')
      .map((o) => o.columns ?? '')
  assert.ok(selected('purchases').some((c) => c.includes('provider_transaction_id')))
  // Totaux : requête dédiée, trois colonnes seulement.
  assert.ok(selected('purchases').includes('amount, fiche_id, payment_status'))
  for (const col of ['cover_url', 'region_id', 'prefecture_id', 'canton_id'])
    assert.ok(
      selected('fiches_techniques').some((c) => c.includes(col)),
      col,
    )

  const pending = await (await adminFiches.GET(req('/api/admin/fiches?status=pending'))).json()
  assert.deepEqual(
    pending.purchases.map((p: { id: string }) => p.id),
    ['p-pending'],
  )
  assert.equal((await adminFiches.GET(req('/api/admin/fiches?status=bogus'))).status, 400)
})

test('POST /api/admin/purchases/[id]/reverify : relit FedaPay via settlePurchase', async () => {
  addFiche()
  const id = '0a0a0a0a-0000-4000-8000-0000000000e9'
  state.store.rows('purchases').push({
    id,
    fiche_id: FICHE,
    amount: 1000,
    currency: 'XOF',
    payment_status: 'pending',
    access_granted: false,
    provider: 'fedapay',
    provider_transaction_id: '88',
  })
  installFetch(state.store, [
    (url) =>
      url.endsWith('/transactions/88')
        ? json({
            'v1/transaction': {
              id: 88,
              status: 'approved',
              amount: 1000,
              currency: { iso: 'XOF' },
            },
          })
        : null,
  ])
  const res = await reverifyRoute.POST(
    req(`/api/admin/purchases/${id}/reverify`, { method: 'POST' }),
    ctx(id),
  )
  assert.equal(res.status, 200)
  const body = await res.json()
  assert.equal(body.purchase.payment_status, 'completed')
  assert.deepEqual(body.changed, { from: 'pending', to: 'completed' })

  state.ctx = {
    userId: 'u-f',
    role: 'cooperative_admin',
    cooperativeId: COOP,
    cooperativeLevel: 'faitiere',
  }
  const denied = await reverifyRoute.POST(
    req(`/api/admin/purchases/${id}/reverify`, { method: 'POST' }),
    ctx(id),
  )
  assert.equal(denied.status, 403)
})

test('Revérifier : aussi pour un achat en échec avec transaction (paiement approuvé après un refus)', async () => {
  assert.equal(
    canReverifyPurchase({ payment_status: 'pending', provider_transaction_id: '1' }),
    true,
  )
  assert.equal(
    canReverifyPurchase({ payment_status: 'failed', provider_transaction_id: '1' }),
    true,
  )
  for (const p of [
    { payment_status: 'failed', provider_transaction_id: null },
    { payment_status: 'pending', provider_transaction_id: null },
    { payment_status: 'completed', provider_transaction_id: '1' },
    { payment_status: 'refunded', provider_transaction_id: '1' },
  ])
    assert.equal(canReverifyPurchase(p), false, JSON.stringify(p))
  // La page d'administration affiche le bouton d'après cette règle.
  const page = require('node:fs').readFileSync(
    require('node:path').join(__dirname, '..', 'app', 'admin', 'comptes-exploitation', 'page.tsx'),
    'utf8',
  ) as string
  assert.ok(page.includes('{canReverifyPurchase(p) ? ('))

  // Débité après l'échec, webhook perdu : la revérification ouvre l'accès.
  addFiche()
  const id = '0a0a0a0a-0000-4000-8000-0000000000f1'
  state.store.rows('purchases').push({
    id,
    fiche_id: FICHE,
    amount: 1000,
    currency: 'XOF',
    payment_status: 'failed',
    access_granted: false,
    provider: 'fedapay',
    provider_transaction_id: '89',
  })
  installFetch(state.store, [
    (url) =>
      url.endsWith('/transactions/89')
        ? json({
            'v1/transaction': {
              id: 89,
              status: 'approved',
              amount: 1000,
              currency: { iso: 'XOF' },
            },
          })
        : null,
  ])
  state.ctx = superAdmin
  const res = await reverifyRoute.POST(
    req(`/api/admin/purchases/${id}/reverify`, { method: 'POST' }),
    ctx(id),
  )
  assert.equal(res.status, 200)
  const body = await res.json()
  assert.deepEqual(body.changed, { from: 'failed', to: 'completed' })
  assert.equal(body.purchase.access_granted, true)
})
