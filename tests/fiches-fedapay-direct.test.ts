/**
 * Paiement FedaPay toujours « direct » : table des opérateurs (modes de la
 * section No-Redirect de la documentation), gardes Sandbox / live, opérateurs
 * masqués par FEDAPAY_DISABLED_PROVIDERS, GET /api/payments/fedapay/providers
 * et lecture des champs de la transaction (montant débité, frais, motif).
 */
import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'
import { providersFromReply } from '../lib/fiches/purchase-submit'
import {
  FEDAPAY_PROVIDERS,
  FedaPayConfigError,
  SANDBOX_MODE,
  offeredProviders,
  parseDisabledProviders,
  resolveFedaPayMode,
} from '../lib/payments/fedapay-providers'
import { installFetch, installStubs, json } from './fiches-fake-db'

for (const level of ['log', 'info', 'warn', 'error', 'debug'] as const) console[level] = () => {}

const stubs = installStubs()
const providersRoute = require('../app/api/payments/fedapay/providers/route') as {
  GET: () => Response
}
type FedaPayModule = typeof import('../lib/payments/fedapay')
const { createCheckout, readTx } = require('../lib/payments/fedapay') as FedaPayModule

function setEnv(env: 'sandbox' | 'live', disabled?: string) {
  process.env.FEDAPAY_ENV = env
  process.env.FEDAPAY_SECRET_KEY = env === 'live' ? 'sk_live_test' : 'sk_sandbox_test'
  if (disabled === undefined) Reflect.deleteProperty(process.env, 'FEDAPAY_DISABLED_PROVIDERS')
  else process.env.FEDAPAY_DISABLED_PROVIDERS = disabled
}
afterEach(() => setEnv('sandbox'))

const LIVE_MODES = {
  mtn_bj: 'mtn_open',
  moov_bj: 'moov',
  celtiis_bj: 'sbin',
  moov_tg: 'moov_tg',
  togocel_tg: 'togocel',
} as const

test('table : cinq opérateurs, modes live de la documentation (No-Redirect), libellé Mixx by Yas', () => {
  assert.deepEqual(Object.fromEntries(FEDAPAY_PROVIDERS.map((p) => [p.id, p.live])), LIVE_MODES)
  assert.equal(FEDAPAY_PROVIDERS.find((p) => p.id === 'togocel_tg')?.label, 'Mixx by Yas (T-Money)')
  // Aucun ancien identifiant non documenté.
  for (const p of FEDAPAY_PROVIDERS) assert.ok(!['mtn', 'mtn_benin', SANDBOX_MODE].includes(p.live))
})

test('resolveFedaPayMode : live → mode de l’opérateur, Sandbox → momo_test, jamais l’inverse', () => {
  for (const p of FEDAPAY_PROVIDERS) {
    const country = p.country as 'tg' | 'bj'
    const live = resolveFedaPayMode({ environment: 'live', selectedProvider: p.id, country })
    assert.equal(live, LIVE_MODES[p.id])
    assert.notEqual(live, SANDBOX_MODE)
    assert.equal(
      resolveFedaPayMode({ environment: 'sandbox', selectedProvider: p.id, country }),
      SANDBOX_MODE,
    )
  }
})

test('resolveFedaPayMode : inconnu, autre pays, masqué → erreur explicite (jamais de repli muet)', () => {
  const err = (fn: () => unknown, re: RegExp) =>
    assert.throws(fn, (e: unknown) => e instanceof FedaPayConfigError && re.test(e.message))
  err(
    () => resolveFedaPayMode({ environment: 'live', selectedProvider: 'tmoney', country: 'tg' }),
    /Opérateur inconnu.*Choisissez/,
  )
  err(
    () => resolveFedaPayMode({ environment: 'sandbox', selectedProvider: 'mtn_bj', country: 'tg' }),
    /pas disponible pour ce pays/,
  )
  for (const environment of ['sandbox', 'live'] as const)
    err(
      () =>
        resolveFedaPayMode({
          environment,
          selectedProvider: 'celtiis_bj',
          country: 'bj',
          disabled: new Set(['celtiis_bj']),
        }),
      /momentanément indisponible : choisissez un autre opérateur/,
    )
})

test('parseDisabledProviders : virgules, casse et espaces ; ids inconnus mis à part', () => {
  const { disabled, unknown } = parseDisabledProviders(' MTN_BJ,, togocel_tg ,mtn ')
  assert.deepEqual([...disabled].sort(), ['mtn_bj', 'togocel_tg'])
  assert.deepEqual(unknown, ['mtn'])
  assert.equal(parseDisabledProviders(undefined).disabled.size, 0)
  assert.equal(parseDisabledProviders('').disabled.size, 0)
  // Écritures courantes de l'interrupteur d'urgence : espaces, points-virgules,
  // guillemets (interface Vercel), modes FedaPay live de la documentation.
  const both = ['celtiis_bj', 'togocel_tg']
  for (const raw of [
    'celtiis_bj togocel_tg',
    'celtiis_bj;togocel_tg',
    '"celtiis_bj","togocel_tg"',
    '"celtiis_bj, togocel_tg"',
    "'celtiis_bj'\n togocel_tg",
    'sbin togocel',
    'SBIN;TOGOCEL',
  ]) {
    const r = parseDisabledProviders(raw)
    assert.deepEqual([...r.disabled].sort(), both, raw)
    assert.deepEqual(r.unknown, [], raw)
  }
  for (const [mode, id] of Object.entries({
    mtn_open: 'mtn_bj',
    moov: 'moov_bj',
    sbin: 'celtiis_bj',
    moov_tg: 'moov_tg',
    togocel: 'togocel_tg',
  }))
    assert.deepEqual([...parseDisabledProviders(mode).disabled], [id], mode)
  // Une faute de frappe ne masque rien, mais elle est rendue pour être signalée.
  assert.deepEqual(parseDisabledProviders('togocell').unknown, ['togocell'])
  assert.equal(parseDisabledProviders('momo_test').disabled.size, 0)
  assert.deepEqual(
    offeredProviders(new Set(['moov_bj'])).map((p) => p.id),
    ['mtn_bj', 'celtiis_bj', 'moov_tg', 'togocel_tg'],
  )
})

test('GET providers : cinq opérateurs, tous en direct (jamais checkout), en Sandbox comme en live', async () => {
  for (const env of ['sandbox', 'live'] as const) {
    setEnv(env)
    const res = providersRoute.GET()
    assert.equal(res.status, 200)
    const body = await res.json()
    assert.equal(body.environment, env)
    assert.deepEqual(
      body.providers.map((p: { id: string }) => p.id),
      Object.keys(LIVE_MODES),
    )
    assert.ok(body.providers.every((p: { mode: string }) => p.mode === 'direct'))
    // Aucun mode FedaPay interne, aucun secret.
    const text = JSON.stringify(body)
    for (const secret of ['sk_', 'mtn_open', 'sbin', 'momo_test']) assert.ok(!text.includes(secret))
  }
})

test('GET providers : FEDAPAY_DISABLED_PROVIDERS masque ; tous masqués ou env invalide → 503 sans liste', async () => {
  setEnv('live', 'celtiis_bj,togocel_tg')
  const body = await providersRoute.GET().json()
  assert.deepEqual(
    body.providers.map((p: { id: string }) => p.id),
    ['mtn_bj', 'moov_bj', 'moov_tg'],
  )

  setEnv('live', Object.keys(LIVE_MODES).join(','))
  const none = providersRoute.GET()
  assert.equal(none.status, 503)
  assert.deepEqual(await none.json(), {
    error: 'Le paiement Mobile Money est momentanément indisponible. Réessayez plus tard.',
    providers: [],
  })

  setEnv('live')
  process.env.FEDAPAY_SECRET_KEY = 'sk_sandbox_test' // clé de test avec FEDAPAY_ENV=live
  assert.equal(providersRoute.GET().status, 503)
})

test('GET providers : clé FedaPay absente (paiements coupés) → 503 sans liste, jamais en cache', async () => {
  for (const key of [undefined, '', '   ']) {
    setEnv('live')
    if (key === undefined) Reflect.deleteProperty(process.env, 'FEDAPAY_SECRET_KEY')
    else process.env.FEDAPAY_SECRET_KEY = key
    const res = providersRoute.GET()
    assert.equal(res.status, 503)
    assert.equal(res.headers.get('cache-control'), 'no-store')
    const body = await res.json()
    assert.deepEqual(body.providers, [])
    assert.match(body.error, /pas disponible/)
  }
  // La fenêtre : réponse « non configuré » → écran indisponible (pas de formulaire),
  // même si un ancien serveur joint une liste.
  assert.equal(
    providersFromReply(200, {
      environment: 'live',
      configured: false,
      providers: [{ id: 'moov_tg', label: 'Moov', country: 'tg', mode: 'direct' }],
    }).kind,
    'unavailable',
  )
})

test('FEDAPAY_DISABLED_PROVIDERS inconnu : signalé en erreur, une fois par valeur', () => {
  const errors: string[] = []
  const saved = console.error
  console.error = (...a: unknown[]) => errors.push(a.join(' '))
  try {
    setEnv('live', 'togocell')
    providersRoute.GET()
    providersRoute.GET()
    assert.equal(errors.length, 1)
    assert.match(errors[0] ?? '', /non reconnues.*togocell.*togocel_tg ou togocel/)
    setEnv('live', 'celtiis')
    providersRoute.GET()
    assert.equal(errors.length, 2)
  } finally {
    console.error = saved
  }
})

test('readTx : montant débité, frais, motif, mode et custom_metadata (schéma officiel), sinon null', () => {
  const tx = readTx({
    'v1/transaction': {
      id: 501,
      status: 'declined',
      amount: 1000,
      currency: { iso: 'XOF' },
      amount_debited: 1042,
      fees: 42,
      last_error_code: 'INSUFFICIENT_FUNDS',
      mode: 'mtn_open',
      custom_metadata: { purchase_id: 'p-1', fiche_id: 'f-1' },
    },
  })
  assert.deepEqual(tx, {
    id: 501,
    status: 'declined',
    amount: 1000,
    currencyIso: 'XOF',
    amountDebited: 1042,
    fees: 42,
    lastErrorCode: 'INSUFFICIENT_FUNDS',
    mode: 'mtn_open',
    customMetadata: { purchase_id: 'p-1', fiche_id: 'f-1' },
  })
  // Transaction encore sans opérateur (exemples des SDK) : rien d'inventé.
  const bare = readTx({
    'v1/transaction': {
      id: 7,
      status: 'pending',
      amount: 1000,
      amount_debited: null,
      fees: 'abc',
      last_error_code: '',
      mode: null,
      custom_metadata: '{"fiche_id":"f-2"}',
    },
  })
  assert.equal(bare.amountDebited, null)
  assert.equal(bare.fees, null)
  assert.equal(bare.lastErrorCode, null)
  assert.equal(bare.mode, null)
  assert.equal(bare.currencyIso, null)
  // custom_metadata renvoyé en chaîne JSON : relu quand même.
  assert.deepEqual(bare.customMetadata, { fiche_id: 'f-2' })
  assert.equal(readTx({ custom_metadata: '[1]' }).customMetadata, null)
  assert.equal(readTx({ amount_debited: -5 }).amountDebited, null)
})

test('certification (page hébergée) : téléphone envoyé à FedaPay, Bénin à 10 chiffres, Togo à 8', async () => {
  setEnv('sandbox')
  const created: Array<{ customer: Record<string, unknown> }> = []
  installFetch(stubs.store, [
    (url, init) => {
      if (!url.includes('fedapay.com')) return null
      if (url.endsWith('/v1/transactions') && init.method === 'POST') {
        created.push(JSON.parse(String(init.body)))
        return json({ 'v1/transaction': { id: 900 + created.length, status: 'pending' } })
      }
      if (/\/v1\/transactions\/\d+\/token$/.test(url))
        return json({ token: 'tok_x', url: 'https://sandbox-checkout.fedapay.com/x' })
      return null
    },
  ])
  const checkout = (phone: string, country?: 'tg' | 'bj') =>
    createCheckout({
      amount: 15000,
      description: 'Certification Opérateur FaîtiereHub',
      callbackUrl: 'https://app.test/api/payments/fedapay/return?certification=x',
      customer: { name: 'Ama Koffi', phone, ...(country ? { country } : {}) },
    })
  await checkout('+229 64 00 00 01')
  await checkout('64000001', 'bj')
  await checkout('+228 90 12 34 56')
  await checkout('12')
  assert.deepEqual(
    created.map((c) => c.customer.phone_number ?? null),
    [
      { number: '0164000001', country: 'bj' },
      { number: '0164000001', country: 'bj' },
      { number: '90123456', country: 'tg' },
      null,
    ],
  )
})
