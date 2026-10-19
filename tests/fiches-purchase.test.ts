/**
 * POST /api/fiches/[id]/purchase et GET /api/purchases/mine — B2, B3, B4, B8,
 * B10 (une seule demande de paiement, même pour deux requêtes simultanées).
 * Vrai lib/payments/fedapay.ts, FedaPay simulé par fetch ; faux Supabase.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, test } from 'node:test'
import {
  type PendingPurchaseRow,
  isSameBuyer,
  minutesBeforeNewRequest,
  pickRival,
} from '../lib/fiches/pending-claim'
import { mobileMoneyPhoneKey, normalizeMobileMoneyPhone } from '../lib/fiches/phone'
import { type OpLog, installFetch, installStubs, json, resetStore } from './fiches-fake-db'

for (const level of ['log', 'info', 'warn', 'error', 'debug'] as const) console[level] = () => {}

const state = installStubs()
const { NextRequest } = require('next/server') as typeof import('next/server')
const purchaseRoute = require('../app/api/fiches/[id]/purchase/route') as {
  POST: (
    req: InstanceType<typeof NextRequest>,
    ctx: { params: Promise<{ id: string }> },
  ) => Promise<Response>
}
const mineRoute = require('../app/api/purchases/mine/route') as { GET: () => Promise<Response> }

const FICHE = '0f0f0f0f-0000-4000-8000-0000000000aa'
let ipSeq = 0
let sendStatus = 200
let createStatus = 200
let tokenStatus = 200
let fedaCalls: Array<{ url: string; method: string; body: unknown }> = []
/** Modes « direct » (POST /v1/{mode}) : Sandbox et les cinq opérateurs live. */
const SEND_PATHS = ['/momo_test', '/mtn_open', '/moov', '/sbin', '/moov_tg', '/togocel']

function setEnv(env: 'sandbox' | 'live') {
  process.env.FEDAPAY_ENV = env
  process.env.FEDAPAY_SECRET_KEY = env === 'live' ? 'sk_live_test' : 'sk_sandbox_test'
}

beforeEach(() => {
  resetStore(state)
  setEnv('sandbox')
  sendStatus = 200
  createStatus = 200
  tokenStatus = 200
  state.store.rows('fiches_techniques').push({
    id: FICHE,
    title: 'Soja',
    price_non_member: 1000,
    currency: 'XOF',
    status: 'published',
  })
  fedaCalls = installFetch(state.store, [
    (url, init) => {
      if (!url.includes('fedapay.com')) return null
      const path = url.replace(/^https:\/\/[^/]+\/v1/, '')
      if (path === '/transactions' && init.method === 'POST')
        return createStatus === 200
          ? json({ 'v1/transaction': { id: 501, status: 'pending' } })
          : json({ message: 'boom' }, createStatus)
      if (path === '/transactions/501/token')
        return tokenStatus === 200
          ? json({ token: 'tok_abcdefgh12345', url: 'https://checkout.fedapay.test/x' })
          : json({ message: 'boom' }, tokenStatus)
      if (SEND_PATHS.includes(path))
        return sendStatus === 200 ? json({}) : json({ message: 'timeout' }, sendStatus)
      if (path === '/transactions/501')
        return json({ 'v1/transaction': { id: 501, status: 'pending' } })
      return null
    },
  ])
})
afterEach(() => setEnv('sandbox'))

function buy(body: Record<string, unknown>, ip = `10.0.0.${++ipSeq}`) {
  const req = new NextRequest(`https://app.test/api/fiches/${FICHE}/purchase`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
    body: JSON.stringify(body),
  })
  return purchaseRoute.POST(req, { params: Promise.resolve({ id: FICHE }) })
}

const purchases = () => state.store.rows('purchases')
const base = { name: 'Ama Koffi', country: 'tg', provider: 'moov_tg' }

test('normalizeMobileMoneyPhone : Togo 8 chiffres, Bénin 8 ou 10, indicatif retiré', () => {
  assert.equal(normalizeMobileMoneyPhone('tg', '90 12 34 56'), '90123456')
  assert.equal(normalizeMobileMoneyPhone('tg', '+228 90-12-34-56'), '90123456')
  assert.equal(normalizeMobileMoneyPhone('tg', '0022890123456'), '90123456')
  assert.equal(normalizeMobileMoneyPhone('tg', '9012345'), null)
  assert.equal(normalizeMobileMoneyPhone('tg', '0190123456'), null)
  assert.equal(normalizeMobileMoneyPhone('bj', '+229 01 97 00 00 01'), '0197000001')
  assert.equal(normalizeMobileMoneyPhone('bj', '64000001'), '64000001')
  assert.equal(normalizeMobileMoneyPhone('bj', '22964000001'), '64000001')
  assert.equal(normalizeMobileMoneyPhone('bj', 'abcdefgh'), null)
  assert.equal(normalizeMobileMoneyPhone('tg', 'abcdefgh'), null)
  // Bénin à 10 chiffres : toujours « 01 » + l'ancien numéro.
  assert.equal(normalizeMobileMoneyPhone('bj', '9700000100'), null)
})

test('mobileMoneyPhoneKey : une clé par ligne — pays inclus, Bénin 8 et 10 chiffres confondus', () => {
  const key = (country: 'tg' | 'bj', raw: string) => {
    const national = normalizeMobileMoneyPhone(country, raw)
    assert.ok(national, raw)
    return mobileMoneyPhoneKey(country, national)
  }
  assert.equal(key('tg', '90 12 34 56'), '+22890123456')
  assert.equal(key('tg', '+228 90 12 34 56'), '+22890123456')
  // Même ligne béninoise, ancienne et nouvelle écriture : même clé.
  assert.equal(key('bj', '97 00 00 01'), '+2290197000001')
  assert.equal(key('bj', '+229 01 97 00 00 01'), '+2290197000001')
  assert.equal(key('bj', '0022997000001'), '+2290197000001')
  // Mêmes chiffres, pays différents : deux lignes.
  assert.notEqual(key('tg', '97000003'), key('bj', '97000003'))
})

test('B4 : numéro « abcdefgh » → 400 Numéro Mobile Money invalide, aucune ligne', async () => {
  const res = await buy({ ...base, phone: 'abcdefgh' })
  assert.equal(res.status, 400)
  assert.equal((await res.json()).error, 'Numéro Mobile Money invalide')
  assert.equal(purchases().length, 0)
  assert.equal(fedaCalls.length, 0)
})

test('B4 : numéro normalisé et e-mail en minuscules enregistrés', async () => {
  const res = await buy({ ...base, phone: '+228 90 11 22 33', email: 'Ama.Koffi@Example.ORG' })
  assert.equal(res.status, 200)
  // Clé de la ligne, avec son pays (lib/fiches/phone.ts).
  assert.equal(purchases()[0]?.buyer_phone, '+22890112233')
  assert.equal(purchases()[0]?.buyer_email, 'ama.koffi@example.org')
})

test('B2 : envoi POST /{mode} en échec → achat pending, id de transaction enregistré, 502 avec purchase_id', async () => {
  sendStatus = 504
  const res = await buy({ ...base, phone: '90000002' })
  assert.equal(res.status, 502)
  const body = await res.json()
  const row = purchases()[0]
  assert.ok(row)
  assert.equal(body.purchase_id, row.id)
  assert.equal(row.payment_status, 'pending')
  assert.equal(row.provider_transaction_id, '501')
  // L'id a été écrit AVANT la demande de prélèvement.
  const sendIdx = fedaCalls.findIndex(
    (c) => c.url.endsWith('/moov_tg') || c.url.endsWith('/momo_test'),
  )
  assert.ok(sendIdx > 0)
})

test('B2 : jeton FedaPay en échec (aucun envoi possible) → achat failed, pas de verrou de 15 min', async () => {
  tokenStatus = 500
  const res = await buy({ ...base, phone: '90000005' })
  assert.equal(res.status, 502)
  assert.equal((await res.json()).purchase_id, undefined)
  assert.equal(purchases()[0]?.payment_status, 'failed')
  tokenStatus = 200
  const retry = await buy({ ...base, phone: '90000005' })
  assert.equal(retry.status, 200)
})

test('Direct obligatoire : sans opérateur (ou vide) → 400 qui dit de choisir, aucune ligne, aucun appel FedaPay', async () => {
  for (const provider of [undefined, '', 'checkout:moov_tg', 'tmoney']) {
    const res = await buy({ name: 'Ama Koffi', country: 'tg', phone: '90000011', provider })
    assert.equal(res.status, 400, String(provider))
    const body = await res.json()
    assert.equal(body.error, 'Choisissez votre opérateur Mobile Money.')
    assert.deepEqual(body.details.provider, ['Choisissez votre opérateur Mobile Money.'])
    assert.equal(body.url, undefined)
  }
  // Nom absent ET opérateur absent : le message général reste.
  const both = await buy({ country: 'tg', phone: '90000011' })
  assert.equal((await both.json()).error, 'Nom et téléphone requis')
  assert.equal(purchases().length, 0)
  assert.equal(fedaCalls.length, 0)
})

test('Direct : aucune réponse ne contient de lien FedaPay, même si FedaPay en renvoie un', async () => {
  // Le jeton simulé contient une `url` (page FedaPay) : elle ne sort jamais.
  const res = await buy({ ...base, phone: '90000013' })
  assert.equal(res.status, 200)
  const text = await res.text()
  assert.deepEqual(JSON.parse(text), { purchase_id: purchases()[0]?.id, direct: true })
  assert.ok(!text.includes('fedapay'))
  assert.equal(phoneRequests(), 1)
})

test('B2 : id de transaction non enregistré → 502 sans lien, achat failed, rien au téléphone', async () => {
  state.store.failUpdate.purchases = (payload) =>
    'provider_transaction_id' in payload ? { code: '57014', message: 'timeout' } : null
  const res = await buy({ ...base, phone: '90000012' })
  assert.equal(res.status, 502)
  const body = await res.json()
  assert.equal(body.url, undefined)
  assert.equal(body.purchase_id, undefined)
  const row = purchases().find((p) => p.buyer_phone === '+22890000012')
  assert.equal(row?.payment_status, 'failed')
  assert.equal(row?.provider_transaction_id ?? null, null)
  assert.equal(phoneRequests(), 0)
})

test('custom_metadata : la transaction porte l’achat et la fiche (revérifiés au règlement)', async () => {
  const res = await buy({ ...base, phone: '90000014' })
  const { purchase_id } = await res.json()
  const created = fedaCalls.find((c) => c.url.endsWith('/transactions') && c.method === 'POST')
    ?.body as { custom_metadata?: unknown; amount: number }
  assert.deepEqual(created.custom_metadata, { purchase_id, fiche_id: FICHE })
  assert.equal(created.amount, 1000)
})

test('B2 : création de la transaction en échec → achat failed (rien chez FedaPay)', async () => {
  createStatus = 500
  const res = await buy({ ...base, phone: '90000003' })
  assert.equal(res.status, 502)
  assert.equal(purchases()[0]?.payment_status, 'failed')
  assert.equal(purchases()[0]?.provider_transaction_id, undefined)
})

test('Live : chaque opérateur part sur son mode documenté (mtn_open, moov, sbin, moov_tg, togocel), jamais momo_test', async () => {
  setEnv('live')
  const cases = [
    { provider: 'mtn_bj', country: 'bj', phone: '97100001', path: '/mtn_open' },
    { provider: 'moov_bj', country: 'bj', phone: '97100002', path: '/moov' },
    { provider: 'celtiis_bj', country: 'bj', phone: '97100003', path: '/sbin' },
    { provider: 'moov_tg', country: 'tg', phone: '97100004', path: '/moov_tg' },
    { provider: 'togocel_tg', country: 'tg', phone: '97100005', path: '/togocel' },
  ]
  for (const c of cases) {
    const before = fedaCalls.length
    const res = await buy({ name: 'Ama Koffi', ...c })
    assert.equal(res.status, 200, c.provider)
    const sends = fedaCalls
      .slice(before)
      .filter((x) => SEND_PATHS.some((p) => x.url.endsWith(`/v1${p}`)))
    assert.deepEqual(
      sends.map((x) => x.url),
      [`https://api.fedapay.com/v1${c.path}`],
      c.provider,
    )
    const body = sends[0]?.body as {
      token: string
      phone_number: { number: string; country: string }
    }
    assert.deepEqual(body.phone_number, { number: c.phone, country: c.country })
    assert.equal(body.token, 'tok_abcdefgh12345')
  }
  assert.ok(!fedaCalls.some((x) => x.url.includes('momo_test') || x.url.includes('sandbox')))
})

test('Sandbox : tous les opérateurs partent en momo_test, jamais un mode live', async () => {
  for (const [i, provider] of ['mtn_bj', 'moov_bj', 'celtiis_bj'].entries()) {
    const res = await buy({ name: 'Bio Sounon', country: 'bj', provider, phone: `6400000${i + 1}` })
    assert.equal(res.status, 200, provider)
  }
  const sends = fedaCalls.filter((x) => SEND_PATHS.some((p) => x.url.endsWith(`/v1${p}`)))
  assert.deepEqual(
    sends.map((x) => x.url),
    Array(3).fill('https://sandbox-api.fedapay.com/v1/momo_test'),
  )
})

test('FEDAPAY_DISABLED_PROVIDERS : opérateur masqué → 400 qui dit d’en choisir un autre, aucune ligne', async () => {
  process.env.FEDAPAY_DISABLED_PROVIDERS = ' Togocel_TG , inconnu'
  try {
    const res = await buy({ ...base, provider: 'togocel_tg', phone: '90000004' })
    assert.equal(res.status, 400)
    const body = await res.json()
    assert.equal(
      body.error,
      'Mixx by Yas (T-Money) est momentanément indisponible : choisissez un autre opérateur.',
    )
    assert.deepEqual(body.details.provider, [body.error])
    assert.equal(purchases().length, 0)
    assert.equal(fedaCalls.length, 0)
    // Les autres opérateurs restent proposés.
    assert.equal((await buy({ ...base, phone: '90000006' })).status, 200)
  } finally {
    Reflect.deleteProperty(process.env, 'FEDAPAY_DISABLED_PROVIDERS')
  }
})

test('Opérateur d’un autre pays → 400 explicite, aucune ligne', async () => {
  const res = await buy({ ...base, provider: 'mtn_bj', phone: '90000007' })
  assert.equal(res.status, 400)
  assert.match((await res.json()).error, /choisissez un opérateur du pays de votre numéro/)
  assert.equal(purchases().length, 0)
})

test('B4 : 4e achat vers le même numéro en 15 min → 429, sans 4e ligne', async () => {
  for (let i = 0; i < 3; i++) {
    const res = await buy({ ...base, phone: '91000001' })
    assert.equal(res.status, 200, `achat ${i + 1}`)
    // L'acheteur a refusé sur son téléphone : plus rien « en cours ».
    for (const r of purchases()) r.payment_status = 'failed'
  }
  const res = await buy({ ...base, phone: '91 00 00 01' })
  assert.equal(res.status, 429)
  assert.equal(purchases().length, 3)
})

test('B4 : 6e tentative depuis la même IP en 10 min → 429', async () => {
  const statuses: number[] = []
  for (let i = 0; i < 6; i++) {
    const res = await buy({ ...base, phone: `9200000${i}` }, '10.9.9.9')
    statuses.push(res.status)
  }
  assert.deepEqual(statuses.slice(0, 5), [200, 200, 200, 200, 200])
  assert.equal(statuses[5], 429)
})

test('B8 (c) : paiement en cours pour ce numéro → 409 sans divulguer l’id', async () => {
  const first = await buy({ ...base, phone: '93000001' })
  const { purchase_id } = await first.json()
  const res = await buy({ ...base, phone: '93000001' })
  assert.equal(res.status, 409)
  const text = await res.text()
  assert.equal(
    JSON.parse(text).error,
    'Une demande de paiement est déjà en cours pour ce numéro : validez-la sur votre téléphone. Pour en recevoir une nouvelle, réessayez dans 15 min ou payez avec un autre numéro.',
  )
  assert.ok(!text.includes(purchase_id))
  assert.equal(purchases().length, 1)
  // Le délai annoncé suit l'âge de la demande en cours.
  const row = purchases()[0] as Record<string, unknown>
  row.created_at = new Date(Date.now() - 11 * 60_000 - 5_000).toISOString()
  const later = await buy({ ...base, phone: '93000001' })
  assert.equal(later.status, 409)
  assert.match((await later.json()).error, /réessayez dans 4 min/)
})

test('minutesBeforeNewRequest : au moins 1 min, 15 min pour une demande toute neuve', () => {
  const now = Date.parse('2026-10-19T10:00:00Z')
  const at = (msAgo: number) => new Date(now - msAgo).toISOString()
  assert.equal(minutesBeforeNewRequest(at(0), now), 15)
  assert.equal(minutesBeforeNewRequest(at(14 * 60_000 + 59_000), now), 1)
  assert.equal(minutesBeforeNewRequest(at(20 * 60_000), now), 1)
  assert.equal(minutesBeforeNewRequest('n/a', now), 15)
})

test('B8 : erreur à l’enregistrement de l’achat → 500 qui dit quoi faire, rien chez FedaPay', async () => {
  state.store.failInsert.purchases = { code: '57014', message: 'timeout' }
  const res = await buy({ ...base, phone: '93000002' })
  assert.equal(res.status, 500)
  assert.equal(
    (await res.json()).error,
    'Achat impossible pour le moment. Réessayez dans quelques minutes.',
  )
  assert.equal(fedaCalls.length, 0)
})

test('B8 (b) : reprise avec resume_purchase_id (même fiche, même numéro) → aucune nouvelle demande', async () => {
  const first = await buy({ ...base, phone: '94000001' })
  const { purchase_id } = await first.json()
  const callsBefore = fedaCalls.length
  const res = await buy({ ...base, phone: '+228 94 00 00 01', resume_purchase_id: purchase_id })
  assert.equal(res.status, 200)
  // Sans `direct` : la route ne sait pas si ce paiement attend au téléphone ou sur une page FedaPay.
  assert.deepEqual(await res.json(), { purchase_id, resumed: true })
  assert.equal(purchases().length, 1)
  assert.equal(fedaCalls.length, callsBefore)
  // Autre numéro : pas de reprise (et blocage (c) inapplicable : autre numéro).
  const other = await buy({ ...base, phone: '94000002', resume_purchase_id: purchase_id })
  const otherBody = await other.json()
  assert.notEqual(otherBody.purchase_id, purchase_id)
})

test('B8 (b) : reprise limitée à 15 min — au-delà, NOUVELLE demande au téléphone (autre opérateur possible)', async () => {
  const first = await buy({ ...base, phone: '94000011' })
  const { purchase_id } = await first.json()
  // Demande jamais arrivée (ou manquée) ; FedaPay la garde « pending ».
  const old = purchases().find((p) => p.id === purchase_id) as Record<string, unknown>
  old.created_at = new Date(Date.now() - 25 * 60_000).toISOString()
  const sendsBefore = fedaCalls.filter((c) => SEND_PATHS.some((s) => c.url.endsWith(s))).length
  const res = await buy({
    ...base,
    provider: 'togocel_tg',
    phone: '94000011',
    resume_purchase_id: purchase_id,
  })
  assert.equal(res.status, 200)
  const body = await res.json()
  assert.equal(body.direct, true)
  assert.notEqual(body.purchase_id, purchase_id)
  assert.equal(
    fedaCalls.filter((c) => SEND_PATHS.some((s) => c.url.endsWith(s))).length,
    sendsBefore + 1,
  )
  // L'ancien achat reste réglé d'après FedaPay (cron), jamais effacé.
  assert.equal(old.payment_status, 'pending')
})

test('B2 : envoi REFUSÉ net par FedaPay (4xx) → achat failed (numéro libéré), 502 sans achat, nouvel essai possible', async () => {
  sendStatus = 422
  const res = await buy({ ...base, phone: '90123456' })
  assert.equal(res.status, 502)
  const body = await res.json()
  assert.equal(body.purchase_id, undefined)
  assert.match(body.error, /refusé la demande.*Vérifiez le numéro et l’opérateur/)
  const row = purchases()[0]
  assert.equal(row?.payment_status, 'failed')
  // Transaction gardée : relue par le cron et le webhook si FedaPay l'approuvait.
  assert.equal(row?.provider_transaction_id, '501')
  // Même numéro, autre opérateur, aussitôt : nouvelle demande (pas de 409, pas de reprise).
  sendStatus = 200
  const retry = await buy({ ...base, provider: 'togocel_tg', phone: '90123456' })
  assert.equal(retry.status, 200)
  assert.equal((await retry.json()).direct, true)
  // Délai, 408 ou 5xx : la demande a pu partir → achat suivi, jamais marqué failed.
  for (const [i, status] of [408, 409, 500, 504].entries()) {
    resetStore(state)
    state.store.rows('fiches_techniques').push({
      id: FICHE,
      title: 'Soja',
      price_non_member: 1000,
      currency: 'XOF',
      status: 'published',
    })
    sendStatus = status
    const r = await buy({ ...base, phone: `9012346${i}` })
    assert.equal(r.status, 502, String(status))
    assert.ok((await r.json()).purchase_id, String(status))
    assert.equal(purchases()[0]?.payment_status, 'pending', String(status))
  }
})

test('Journal : FEDAPAY_ENV « live » avec retour à la ligne → live, et aucun numéro ni transaction brute journalisés', async () => {
  process.env.FEDAPAY_ENV = 'live\n'
  process.env.FEDAPAY_SECRET_KEY = 'sk_live_test'
  const lines: string[] = []
  const saved = { info: console.info, log: console.log, error: console.error, warn: console.warn }
  for (const level of ['info', 'log', 'error', 'warn'] as const)
    console[level] = (...a: unknown[]) => {
      lines.push(a.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(' '))
    }
  try {
    const res = await buy({ ...base, phone: '90 12 34 56' })
    assert.equal(res.status, 200)
    sendStatus = 504
    await buy({ ...base, phone: '90 12 34 57' })
  } finally {
    Object.assign(console, saved)
  }
  // L'API live a bien été appelée, avec le mode live.
  assert.ok(fedaCalls.some((c) => c.url.startsWith('https://api.fedapay.com/v1/moov_tg')))
  const all = lines.join('\n')
  assert.ok(!/90123456|90 12 34 56|90123457/.test(all), 'aucun numéro')
  assert.ok(!/raw_phone|normalized_phone|customer_phone_sent|FedaPay Create|FedaPay Send/.test(all))
})

test('B8 (a) : compte connecté qui a déjà acheté → achat réutilisé, sans nouveau paiement', async () => {
  state.session.authUser = { id: 'u-1', email: 'ama@example.org' }
  purchases().push({
    id: 'p-owned',
    fiche_id: FICHE,
    user_id: 'u-1',
    payment_status: 'completed',
    access_granted: true,
    created_at: '2026-10-01T00:00:00Z',
  })
  const res = await buy({ ...base, phone: '95000001' })
  assert.equal(res.status, 200)
  assert.deepEqual(await res.json(), { purchase_id: 'p-owned', already: true })
  assert.equal(purchases().length, 1)
  assert.equal(fedaCalls.length, 0)
})

// ── B3 : « Mes achats » ──────────────────────────────────────────────────────

test('B3 : Mes achats = user_id OU e-mail vérifié (auth), jamais toutes les ventes', async () => {
  // Le faux client n'applique pas la RLS : c'est le cas d'un super_admin
  // (purchases_admin_all), qui voit tout — le filtre de la route doit suffire.
  const recent = new Date().toISOString()
  const old = new Date(Date.now() - 10 * 86_400_000).toISOString()
  state.store.rows('fiches_techniques').push({ id: 'f-arch', title: 'Retirée', status: 'archived' })
  purchases().push(
    {
      id: 'mine-uid',
      fiche_id: FICHE,
      user_id: 'u-1',
      payment_status: 'completed',
      created_at: recent,
    },
    {
      id: 'mine-mail',
      fiche_id: 'f-arch',
      user_id: null,
      buyer_email: 'Ama@Example.org',
      payment_status: 'completed',
      created_at: recent,
    },
    {
      id: 'mine-pending',
      fiche_id: FICHE,
      user_id: 'u-1',
      payment_status: 'pending',
      created_at: recent,
    },
    {
      id: 'mine-old-pending',
      fiche_id: FICHE,
      user_id: 'u-1',
      payment_status: 'pending',
      created_at: old,
    },
    {
      id: 'mine-failed',
      fiche_id: FICHE,
      user_id: 'u-1',
      payment_status: 'failed',
      created_at: recent,
    },
    {
      id: 'other',
      fiche_id: FICHE,
      user_id: 'u-2',
      buyer_email: 'autre@example.org',
      payment_status: 'completed',
      created_at: recent,
    },
  )
  state.session.authUser = { id: 'u-1', email: 'ama@example.org', email_confirmed_at: recent }
  const res = await mineRoute.GET()
  const { purchases: list } = (await res.json()) as {
    purchases: Array<{ id: string; status: string; fiches_techniques: { title: string } | null }>
  }
  assert.deepEqual(list.map((p) => p.id).sort(), ['mine-mail', 'mine-pending', 'mine-uid'])
  assert.equal(list.find((p) => p.id === 'mine-pending')?.status, 'pending')
  // Fiche archivée : titre conservé (lu par le client de service).
  assert.equal(list.find((p) => p.id === 'mine-mail')?.fiches_techniques?.title, 'Retirée')

  // E-mail non vérifié : seul user_id compte.
  state.session.authUser = { id: 'u-3', email: 'autre@example.org', email_confirmed_at: null }
  const res2 = await mineRoute.GET()
  assert.deepEqual((await res2.json()).purchases, [])
  // Jamais profiles.email.
  assert.ok(!state.store.ops.some((o) => o.table === 'profiles'))
})

// ── B10 : une seule demande de paiement par fiche et par numéro ─────────────

/** purchases_one_pending_request_uidx (20261019_100000_purchases_one_pending.sql). */
function enforceOnePendingIndex() {
  state.store.unique.purchases = [
    {
      name: 'purchases_one_pending_request_uidx',
      columns: ['fiche_id', 'buyer_phone'],
      where: (r) => r.payment_status === 'pending' && (r.provider_transaction_id ?? null) === null,
    },
  ]
}

const isPurchaseInsert = (op: OpLog) => op.table === 'purchases' && op.op === 'insert'
const txCreations = () =>
  fedaCalls.filter((c) => c.url.endsWith('/transactions') && c.method === 'POST').length
const phoneRequests = () =>
  fedaCalls.filter((c) => c.url.endsWith('/moov_tg') || c.url.endsWith('/momo_test')).length

/**
 * Deux requêtes simultanées : chaque insertion d'achat est retenue jusqu'à ce
 * que les deux requêtes en soient là — les deux ont donc passé le contrôle (c).
 */
function holdInsertsTogether() {
  let waiting: Array<() => void> = []
  state.store.gate = (op) => {
    if (!isPurchaseInsert(op)) return
    return new Promise<void>((resolve) => {
      waiting.push(resolve)
      if (waiting.length < 2) return
      state.store.gate = null
      for (const release of waiting) release()
      waiting = []
    })
  }
}

test('B10 : double clic simultané → UNE demande FedaPay, les deux réponses visent le même achat', async () => {
  enforceOnePendingIndex()
  holdInsertsTogether()
  const [a, b] = await Promise.all([
    buy({ ...base, phone: '96000001' }),
    buy({ ...base, phone: '96 00 00 01' }),
  ])
  const bodies = [await a.json(), await b.json()]
  assert.deepEqual([a.status, b.status], [200, 200])
  assert.equal(purchases().length, 1, 'aucun 2e achat')
  const id = purchases()[0]?.id
  assert.deepEqual(
    bodies.map((x) => x.purchase_id),
    [id, id],
  )
  assert.deepEqual(bodies.map((x) => Boolean(x.resumed)).sort(), [false, true])
  assert.deepEqual(
    bodies.find((x) => x.resumed),
    { purchase_id: id, resumed: true },
  )
  assert.equal(txCreations(), 1)
  assert.equal(phoneRequests(), 1)
  // La 2e insertion a bien été refusée par la base, pas évitée par chance.
  assert.equal(state.store.ops.filter(isPurchaseInsert).length, 2)
})

test('B10 : violation d’unicité (23505) → reprise de l’achat gagnant, aucun appel FedaPay', async () => {
  enforceOnePendingIndex()
  // L'autre requête insère juste après notre contrôle (c), avant notre insertion.
  state.store.gate = (op) => {
    if (!isPurchaseInsert(op)) return
    state.store.gate = null
    purchases().push({
      id: 'p-winner',
      fiche_id: FICHE,
      buyer_phone: '+22896000002',
      buyer_name: 'Ama Koffi',
      buyer_email: null,
      user_id: null,
      payment_status: 'pending',
      provider: 'fedapay',
      provider_transaction_id: null,
      created_at: new Date().toISOString(),
    })
  }
  const res = await buy({ ...base, phone: '96000002' })
  assert.equal(res.status, 200)
  assert.deepEqual(await res.json(), { purchase_id: 'p-winner', resumed: true })
  assert.equal(purchases().length, 1)
  assert.equal(fedaCalls.length, 0)
})

test('B10 : 23505 pour un autre acheteur du même numéro → 409 sans l’id, aucun appel FedaPay', async () => {
  enforceOnePendingIndex()
  state.store.gate = (op) => {
    if (!isPurchaseInsert(op)) return
    state.store.gate = null
    purchases().push({
      id: 'p-other-buyer',
      fiche_id: FICHE,
      buyer_phone: '+22896000003',
      buyer_name: 'Kossi Mensah',
      buyer_email: null,
      user_id: null,
      payment_status: 'pending',
      provider_transaction_id: null,
      created_at: new Date().toISOString(),
    })
  }
  const res = await buy({ ...base, phone: '96000003' })
  assert.equal(res.status, 409)
  const text = await res.text()
  assert.match(text, /déjà en cours pour ce numéro/)
  assert.ok(!text.includes('p-other-buyer'))
  assert.equal(purchases().length, 1)
  assert.equal(fedaCalls.length, 0)
})

test('B10 : insertion arrivée APRÈS l’enregistrement de la transaction du 1er → elle cède, une seule demande', async () => {
  enforceOnePendingIndex()
  // 1re insertion retenue jusqu'à l'arrivée de la 2e (contrôle (c) passé par
  // les deux) ; la 2e retenue jusqu'à ce que la 1re ait écrit sa transaction,
  // donc quitté l'index : la base l'accepte, la relecture doit la faire céder.
  let inserts = 0
  let releaseFirst: (() => void) | null = null
  let releaseSecond: (() => void) | null = null
  state.store.gate = (op) => {
    if (isPurchaseInsert(op)) {
      inserts++
      if (inserts === 1)
        return new Promise<void>((r) => {
          releaseFirst = r
        })
      if (inserts === 2) {
        releaseFirst?.()
        return new Promise<void>((r) => {
          releaseSecond = r
        })
      }
      return
    }
    const payload = op.payload as Record<string, unknown>
    if (op.table === 'purchases' && op.op === 'update' && 'provider_transaction_id' in payload)
      setImmediate(() => releaseSecond?.()) // après l'écriture de la transaction
  }
  const [a, b] = await Promise.all([
    buy({ ...base, phone: '96000004' }),
    buy({ ...base, phone: '96000004' }),
  ])
  const bodies = [await a.json(), await b.json()]
  assert.deepEqual([a.status, b.status], [200, 200])
  const winner = purchases().find((p) => p.provider_transaction_id === '501')
  assert.ok(winner)
  assert.deepEqual(
    bodies.map((x) => x.purchase_id),
    [winner.id, winner.id],
  )
  assert.equal(txCreations(), 1)
  assert.equal(phoneRequests(), 1)
  // L'achat inséré par la requête qui a cédé n'a jamais vu FedaPay : en échec.
  const loser = purchases().find((p) => p.id !== winner.id)
  assert.equal(loser?.payment_status, 'failed')
  assert.equal(loser?.provider_transaction_id ?? null, null)
  assert.equal(purchases().filter((p) => p.payment_status === 'pending').length, 1)
})

test('B10 : sans l’index (migration non appliquée) → la route marche, relecture après insertion : une seule demande', async () => {
  holdInsertsTogether()
  const [a, b] = await Promise.all([
    buy({ ...base, phone: '96000005' }),
    buy({ ...base, phone: '96000005' }),
  ])
  const bodies = [await a.json(), await b.json()]
  assert.deepEqual([a.status, b.status], [200, 200])
  assert.equal(bodies[0].purchase_id, bodies[1].purchase_id)
  assert.equal(txCreations(), 1)
  assert.equal(phoneRequests(), 1)
  assert.equal(purchases().filter((p) => p.payment_status === 'pending').length, 1)
})

test('B10 : comportements inchangés — achat abandonné il y a plus de 15 min, avec ou sans transaction : nouvel achat', async () => {
  enforceOnePendingIndex()
  const old = new Date(Date.now() - 20 * 60_000).toISOString()
  purchases().push(
    {
      id: 'p-abandoned',
      fiche_id: FICHE,
      buyer_phone: '+22896000006',
      payment_status: 'pending',
      provider_transaction_id: '400',
      created_at: old,
    },
    {
      // Création interrompue (aucune transaction) : tient la place de l'index.
      id: 'p-orphan',
      fiche_id: FICHE,
      buyer_phone: '+22896000006',
      payment_status: 'pending',
      provider_transaction_id: null,
      created_at: old,
    },
  )
  const res = await buy({ ...base, phone: '96000006' })
  assert.equal(res.status, 200)
  const body = await res.json()
  assert.ok(!['p-abandoned', 'p-orphan'].includes(body.purchase_id))
  assert.equal(body.resumed, undefined)
  assert.equal(phoneRequests(), 1)
  const byId = (id: string) => purchases().find((p) => p.id === id)
  // Abandonné avec transaction : laissé au rapprochement (il peut encore être payé).
  assert.equal(byId('p-abandoned')?.payment_status, 'pending')
  // Sans transaction, il ne peut plus être payé : libéré.
  assert.equal(byId('p-orphan')?.payment_status, 'failed')
  assert.equal(byId(body.purchase_id)?.provider_transaction_id, '501')
})

test('B10 : achat plus « pending » au moment d’écrire la transaction → rien n’est envoyé au téléphone', async () => {
  // Ex. achat repris en main entre-temps : la requête ne le possède plus.
  state.store.gate = (op) => {
    const payload = op.payload as Record<string, unknown>
    if (op.table === 'purchases' && op.op === 'update' && 'provider_transaction_id' in payload)
      for (const p of purchases()) p.payment_status = 'failed'
  }
  const res = await buy({ ...base, phone: '96000007' })
  assert.equal(res.status, 502)
  assert.equal((await res.json()).purchase_id, undefined)
  assert.equal(phoneRequests(), 0)
})

const benin = { name: 'Ama Koffi', country: 'bj', provider: 'mtn_bj' }

test('B10 : Bénin, même ligne en 8 et en 10 chiffres dans deux onglets → UNE demande', async () => {
  enforceOnePendingIndex()
  holdInsertsTogether()
  const [a, b] = await Promise.all([
    buy({ ...benin, phone: '97 00 00 01' }),
    buy({ ...benin, phone: '+229 01 97 00 00 01' }),
  ])
  const bodies = [await a.json(), await b.json()]
  assert.deepEqual([a.status, b.status], [200, 200])
  assert.equal(bodies[0].purchase_id, bodies[1].purchase_id)
  assert.equal(purchases().length, 1)
  assert.equal(purchases()[0]?.buyer_phone, '+2290197000001')
  assert.equal(txCreations(), 1)
  assert.equal(phoneRequests(), 1)
  // FedaPay reçoit le numéro tel que saisi par l'onglet qui a gagné.
  const sent = fedaCalls.find((c) => c.url.endsWith('/momo_test'))?.body as {
    phone_number: { number: string; country: string }
  }
  assert.ok(['97000001', '0197000001'].includes(sent.phone_number.number))
  assert.equal(sent.phone_number.country, 'bj')
})

test('B10 : Bénin, 2e essai avec l’autre écriture du même numéro → bloqué, aucune 2e demande', async () => {
  const first = await buy({ ...benin, phone: '97000002' })
  assert.equal(first.status, 200)
  const second = await buy({ ...benin, phone: '0197000002' })
  assert.equal(second.status, 409)
  assert.equal(purchases().length, 1)
  assert.equal(phoneRequests(), 1)
  // Le 8 chiffres reste envoyé tel quel (numéros de test du Sandbox).
  const sent = fedaCalls.find((c) => c.url.endsWith('/momo_test'))?.body as {
    phone_number: { number: string }
  }
  assert.equal(sent.phone_number.number, '97000002')
})

test('B10 : mêmes chiffres au Togo et au Bénin = deux lignes, deux acheteurs : aucun blocage', async () => {
  enforceOnePendingIndex()
  const togo = await buy({ ...base, phone: '97000003' })
  const bj = await buy({ name: 'Bio Sounon', country: 'bj', provider: 'mtn_bj', phone: '97000003' })
  assert.deepEqual([togo.status, bj.status], [200, 200])
  assert.deepEqual(
    purchases()
      .map((p) => p.buyer_phone)
      .sort(),
    ['+22897000003', '+2290197000003'],
  )
  assert.equal(phoneRequests(), 2)
  // Même instant : l'index ne les confond pas non plus.
  resetStore(state)
  state.store.rows('fiches_techniques').push({
    id: FICHE,
    title: 'Soja',
    price_non_member: 1000,
    currency: 'XOF',
    status: 'published',
  })
  enforceOnePendingIndex()
  holdInsertsTogether()
  const [a, b] = await Promise.all([
    buy({ ...base, phone: '97000004' }),
    buy({ name: 'Bio Sounon', country: 'bj', provider: 'mtn_bj', phone: '97000004' }),
  ])
  assert.deepEqual([a.status, b.status], [200, 200])
  assert.notEqual((await a.json()).purchase_id, (await b.json()).purchase_id)
})

test('B10 : achat créé autrefois par la page FedaPay, encore en cours → repris sans nouvelle demande', async () => {
  // Achat « checkout » d'avant le paiement direct : transaction, pas de mode.
  purchases().push({
    id: '0b0b0b0b-0000-4000-8000-0000000000c1',
    fiche_id: FICHE,
    buyer_phone: '+22896000010',
    buyer_name: 'Ama Koffi',
    payment_status: 'pending',
    provider: 'fedapay',
    provider_transaction_id: '777',
    created_at: new Date().toISOString(),
  })
  const res = await buy({
    ...base,
    phone: '96000010',
    resume_purchase_id: '0b0b0b0b-0000-4000-8000-0000000000c1',
  })
  assert.deepEqual(await res.json(), {
    purchase_id: '0b0b0b0b-0000-4000-8000-0000000000c1',
    resumed: true,
  })
  assert.equal(fedaCalls.length, 0)
})

test('B10 : pickRival — ordre partagé, rival avec transaction toujours prioritaire', () => {
  const row = (id: string, at: string, tx: string | null = null): PendingPurchaseRow => ({
    id,
    created_at: at,
    provider_transaction_id: tx,
    buyer_name: 'Ama',
    buyer_email: null,
    user_id: null,
  })
  const a = row('a', '2026-10-19T10:00:00.000Z')
  const b = row('b', '2026-10-19T10:00:00.000Z')
  const c = row('c', '2026-10-19T10:00:01.000Z', '9')
  // Insertion refusée : le plus ancien en cours.
  assert.equal(pickRival([c, b, a], null)?.id, 'a')
  // Même instant : départage par id, le même pour les deux requêtes.
  assert.equal(pickRival([a, b], a), null)
  assert.equal(pickRival([a, b], b)?.id, 'a')
  // Un rival qui a déjà sa transaction passe avant, même plus récent.
  assert.equal(pickRival([a, c], a)?.id, 'c')
  assert.equal(pickRival([], null), null)
  assert.ok(isSameBuyer(a, { name: 'Ama', email: null, userId: null }))
  assert.ok(!isSameBuyer(a, { name: 'Ama', email: 'ama@example.org', userId: null }))
  assert.ok(!isSameBuyer(a, { name: 'Ama', email: null, userId: 'u-1' }))
})

test('B10 : migration — ne touche aucune ligne, passe malgré des doublons existants, idempotente, réversible', async () => {
  const { PGlite } = (await import('@electric-sql/pglite')) as typeof import('@electric-sql/pglite')
  const db = new PGlite()
  try {
    await db.exec(`create table public.purchases (
      id uuid primary key default gen_random_uuid(),
      fiche_id uuid not null,
      buyer_phone text,
      payment_status text not null default 'pending',
      provider_transaction_id text,
      created_at timestamptz not null default now());`)
    // Doublons « pending » déjà présents, avec et sans transaction.
    await db.exec(`insert into public.purchases (fiche_id, buyer_phone, provider_transaction_id, created_at) values
      ('${FICHE}', '90000001', null, now() - interval '2 days'),
      ('${FICHE}', '90000001', null, now() - interval '1 day'),
      ('${FICHE}', '90000002', '1', now()),
      ('${FICHE}', '90000002', '2', now());`)
    const snapshot = async () =>
      JSON.stringify((await db.query('select * from public.purchases order by id')).rows)
    const before = await snapshot()
    const migration = readFileSync(
      new URL(
        '../supabase/migrations/20261019_100000_purchases_one_pending.sql',
        `file://${__filename}`,
      ),
      'utf8',
    )
    await db.exec(migration)
    await db.exec(migration)
    assert.equal(await snapshot(), before, 'aucune ligne modifiée')

    const insert = () =>
      db.query(
        'insert into public.purchases (fiche_id, buyer_phone) values ($1, $2) returning id',
        [FICHE, '90000001'],
      )
    const first = (await insert()).rows[0] as { id: string }
    await assert.rejects(insert, (e: { code?: string }) => e.code === '23505')
    // Transaction enregistrée : sort de l'index, une nouvelle demande est possible.
    await db.query(`update public.purchases set provider_transaction_id = '9' where id = $1`, [
      first.id,
    ])
    await insert()

    await db.exec('drop index if exists public.purchases_one_pending_request_uidx;')
    await insert()
  } finally {
    await db.close()
  }
})
