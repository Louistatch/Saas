/**
 * Jouer à HarooLife depuis sa carte (lib/haroolife/card-entry.ts et
 * GET /api/verify/[card_number]/haroolife), avec le VRAI requirePrivateCard : cookies de
 * next/headers et getUser du client de session simulés, base en mémoire (tests/fiches-fake-db.ts).
 *
 * Ce que l'on vérifie :
 *   - seul le titulaire qui a ouvert la session de carte (PIN ou code SMS) reçoit son prénom et son
 *     village, et rien d'autre de sa fiche ;
 *   - sans session de carte → 401 (entrer le PIN) ; un compte qui lit la carte n'en est pas le
 *     titulaire → 403 ;
 *   - un visiteur HarooLife (compte anonyme) est déconnecté pour la carte : 401, pas 404, et sa
 *     session de carte suffit.
 */
import assert from 'node:assert/strict'
import { beforeEach, test } from 'node:test'
import type * as CardEntry from '../lib/haroolife/card-entry'
import type * as CardSession from '../lib/security/card-session'
import type * as RateLimit from '../lib/utils/rate-limit'
import { installStubs, resetStore } from './fiches-fake-db'
import { TREE, giveCard, giveProfile, seedTree, useRealCardAccess } from './fiches-fake-tree'

for (const level of ['log', 'info', 'warn', 'error', 'debug'] as const) console[level] = () => {}

const state = installStubs()
const jar = new Map<string, string>()
useRealCardAccess(jar)
const { signCardSession, cardSessionCookieName } =
  require('../lib/security/card-session') as typeof CardSession
const { cardEntryHref, cardFromSearch, displayName, suggestedUsername } =
  require('../lib/haroolife/card-entry') as typeof CardEntry
const { NextRequest } = require('next/server') as typeof import('next/server')
const route = require('../app/api/verify/[card_number]/haroolife/route') as {
  GET: (
    req: InstanceType<typeof NextRequest>,
    ctx: { params: Promise<{ card_number: string }> },
  ) => Promise<Response>
}

let ipSeq = 0

beforeEach(() => {
  process.env.HAROOLIFE_ENABLED = 'true'
  resetStore(state)
  jar.clear()
  seedTree(state)
})

async function identity(cardNumber: string) {
  const req = new NextRequest(`https://app.test/api/verify/${cardNumber}/haroolife`, {
    headers: { 'x-forwarded-for': `10.7.0.${++ipSeq}` },
  })
  const res = await route.GET(req, { params: Promise.resolve({ card_number: cardNumber }) })
  return { status: res.status, body: (await res.json()) as Record<string, unknown> }
}

/** La carte du membre Kodjo (Agou), avec sa fiche complète en base. */
function kodjoCard(over: { memberDeletedAt?: string | null } = {}) {
  const number = giveCard(state, { cooperativeId: TREE.COOP_A1, ...over })
  const member = state.store.rows('members').find((m) => m.id === 'member-1')
  Object.assign(member ?? {}, {
    first_name: '  KODJO ',
    last_name: 'AGBEKO',
    village: 'agou',
    phone: '+22890000000',
    date_of_birth: '1980-01-01',
  })
  return number
}

/** Session de carte (PIN ou code SMS) ouverte pour ce membre. */
function openCardSession(number: string, memberId = 'member-1') {
  jar.set(cardSessionCookieName(number), signCardSession({ cardNumber: number, memberId }).token)
}

test('session de carte du titulaire → 200 : prénom et village, rien d’autre', async () => {
  const number = kodjoCard()
  openCardSession(number)
  const { status, body } = await identity(number)
  assert.equal(status, 200)
  assert.deepEqual(body, { first_name: 'Kodjo', village: 'Agou' })
})

test('ni compte ni session de carte → 401 (entrer le PIN)', async () => {
  const { status } = await identity(kodjoCard())
  assert.equal(status, 401)
})

test('session de carte d’un autre membre → 401', async () => {
  const number = kodjoCard()
  openCardSession(number, 'member-2')
  const { status } = await identity(number)
  assert.equal(status, 401)
})

test('compte FaîtiereHub qui lit la carte (administrateur) → 403, pas son nom', async () => {
  const number = kodjoCard()
  state.session.authUser = {
    id: 'admin-1',
    email: 'admin@faitiere.tg',
    email_confirmed_at: '2026-01-01T00:00:00Z',
  }
  giveProfile(state, 'admin-1', { role: 'super_admin' })
  const { status, body } = await identity(number)
  assert.equal(status, 403)
  assert.equal(body.first_name, undefined)
})

test('visiteur HarooLife (compte anonyme) sans session de carte → 401, pas 404', async () => {
  const number = kodjoCard()
  state.session.authUser = { id: 'visitor-1', is_anonymous: true, email: null }
  const { status } = await identity(number)
  assert.equal(status, 401)
})

test('visiteur HarooLife avec la session de carte du titulaire → 200', async () => {
  const number = kodjoCard()
  state.session.authUser = { id: 'visitor-1', is_anonymous: true, email: null }
  openCardSession(number)
  const { status, body } = await identity(number)
  assert.equal(status, 200)
  assert.equal(body.first_name, 'Kodjo')
})

test('membre supprimé → 404', async () => {
  const number = kodjoCard({ memberDeletedAt: '2026-10-01T00:00:00Z' })
  openCardSession(number)
  const { status } = await identity(number)
  assert.equal(status, 404)
})

test('quota de la page carte épuisé : le jeu reçoit quand même le nom (compteur séparé)', async () => {
  const number = kodjoCard()
  openCardSession(number)
  const { rateLimit } = require('../lib/utils/rate-limit') as typeof RateLimit
  const ip = '10.9.9.9'
  // La page de la carte a déjà fait ses appels privés (compteur `verify:`, 10 par minute).
  for (let i = 0; i < 12; i++) rateLimit(`verify:${ip}`, 10, 60_000)
  const req = new NextRequest(`https://app.test/api/verify/${number}/haroolife`, {
    headers: { 'x-forwarded-for': ip },
  })
  const res = await route.GET(req, { params: Promise.resolve({ card_number: number }) })
  assert.equal(res.status, 200)
})

test('HarooLife fermé → 503, avant toute lecture', async () => {
  process.env.HAROOLIFE_ENABLED = 'false'
  const number = kodjoCard()
  openCardSession(number)
  const { status } = await identity(number)
  assert.equal(status, 503)
})

test('adresse du jeu : numéro de carte validé, jamais une valeur libre', () => {
  assert.equal(cardEntryHref('FTG-12345'), '/haroolife?carte=FTG-12345')
  assert.equal(cardFromSearch('?carte=ftg-12345'), 'FTG-12345')
  assert.equal(cardFromSearch('?carte=../../admin'), null)
  assert.equal(cardFromSearch('?invite=ABC'), null)
})

test('nom affiché et nom d’utilisateur proposé', () => {
  assert.equal(displayName('  KODJO   ama '), 'Kodjo Ama')
  assert.equal(displayName("N'DJA-KOFFI"), "N'Dja-Koffi")
  assert.equal(displayName('   '), null)
  assert.equal(suggestedUsername('Kodjo', 'Agou'), 'kodjo_agou')
  assert.equal(suggestedUsername('Éyram Ama', 'Kpélé-Akata'), 'eyram_kpeleakata')
  assert.equal(suggestedUsername('Kodjo', null), 'kodjo')
  // Toujours au format des noms d'utilisateur (3 à 20 caractères, lettre en tête).
  for (const [first, village] of [
    ['Abdoul-Razak', 'Tchitchao Kpangalam'],
    ['Al', null],
    ['12', 'Kara'],
    ['Kossiwavi Adjoa Akpene', 'Agbodrafo'],
  ] as const) {
    const u = suggestedUsername(first, village)
    assert.ok(u === '' || /^[a-z][a-z0-9_]{2,19}$/.test(u), `${first} → ${u}`)
    assert.ok(!u.endsWith('_'), u)
  }
})
