/**
 * POST /api/fiches/[id]/access avec le VRAI requirePrivateCard
 * (lib/security/card-access.ts) : cookies de next/headers et getUser du client
 * de session simulés, base en mémoire (tests/fiches-fake-db.ts).
 *
 * Fiche gratuite pour les membres de la faîtière Alpha, 1 000 FCFA ; carte de
 * Coop Alpha 1. Ce que l'on vérifie ici, et que la doublure de
 * tests/fiches-access.test.ts ne peut pas montrer :
 *   - carte expirée, suspendue ou révoquée → 402 « achetez-le », jamais 401 ;
 *   - carte active sans preuve qu'on la tient → 401 (connexion par carte) ;
 *   - un compte qui peut LIRE la carte n'en est pas pour autant le titulaire.
 */
import assert from 'node:assert/strict'
import { beforeEach, test } from 'node:test'
import type * as CardSession from '../lib/security/card-session'
import { installStubs, resetStore } from './fiches-fake-db'
import {
  type CardSpec,
  MEMBER_EMAIL,
  TREE,
  giveCard,
  giveProfile,
  seedTree,
  useRealCardAccess,
} from './fiches-fake-tree'

for (const level of ['log', 'info', 'warn', 'error', 'debug'] as const) console[level] = () => {}

const state = installStubs()
const jar = new Map<string, string>()
useRealCardAccess(jar)
const { signCardSession, cardSessionCookieName } =
  require('../lib/security/card-session') as typeof CardSession
const { NextRequest } = require('next/server') as typeof import('next/server')
const route = require('../app/api/fiches/[id]/access/route') as {
  POST: (
    req: InstanceType<typeof NextRequest>,
    ctx: { params: Promise<{ id: string }> },
  ) => Promise<Response>
}

const FICHE = '0f0f0f0f-0000-4000-8000-0000000000cc'
let ipSeq = 0

beforeEach(() => {
  resetStore(state)
  jar.clear()
  seedTree(state)
  state.store.rows('fiches_techniques').push({
    id: FICHE,
    title: 'Maïs pluvial',
    culture: 'Maïs',
    status: 'published',
    price_non_member: 1000,
    is_free_for_members: true,
    cooperative_id: TREE.FAITIERE_A,
    download_count: 0,
    files: [],
  })
})

async function access(cardNumber: string) {
  const req = new NextRequest(`https://app.test/api/fiches/${FICHE}/access`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': `10.2.0.${++ipSeq}` },
    body: JSON.stringify({ card_number: cardNumber }),
  })
  const res = await route.POST(req, { params: Promise.resolve({ id: FICHE }) })
  return { status: res.status, body: (await res.json()) as Record<string, unknown> }
}

/** Carte posée en base ; session de carte (code SMS) déjà ouverte pour son titulaire. */
function cardWithSession(spec: Partial<CardSpec> = {}) {
  const number = giveCard(state, { cooperativeId: TREE.COOP_A1, ...spec })
  jar.set(
    cardSessionCookieName(number),
    signCardSession({ cardNumber: number, memberId: 'member-1' }).token,
  )
  return number
}

/** Compte connecté (vu par getUser du client de session). */
function logIn(id: string, email = MEMBER_EMAIL, confirmed = true) {
  state.session.authUser = {
    id,
    email,
    email_confirmed_at: confirmed ? '2026-01-01T00:00:00Z' : null,
  }
}

test('session de carte du titulaire, carte active → 200 « member »', async () => {
  const { status, body } = await access(cardWithSession())
  assert.equal(status, 200)
  assert.equal(body.reason, 'member')
})

test('carte active, ni compte ni session → 401 (se connecter avec la carte)', async () => {
  const { status } = await access(giveCard(state, { cooperativeId: TREE.COOP_A1 }))
  assert.equal(status, 401)
})

for (const [label, spec] of [
  ['expirée', { expiry: '2020-01-01' }],
  ['suspendue', { status: 'suspended', suspendedAt: '2026-10-01T00:00:00Z' }],
  ['révoquée', { status: 'revoked', revokedAt: '2026-10-01T00:00:00Z' }],
] as const) {
  test(`carte ${label} avec session de carte → 402 card_inactive, pas 401`, async () => {
    const { status, body } = await access(cardWithSession(spec))
    assert.equal(status, 402)
    assert.equal(body.reason, 'card_inactive')
    assert.equal(body.price, 1000)
    assert.match(String(body.message), /n’est pas active/)
  })

  test(`carte ${label}, compte connecté → 402 card_inactive, pas 401`, async () => {
    logIn('user-awa')
    giveProfile(state, 'user-awa', { cooperative_id: TREE.COOP_A1 })
    const { status, body } = await access(giveCard(state, { cooperativeId: TREE.COOP_A1, ...spec }))
    assert.equal(status, 402)
    assert.equal(body.reason, 'card_inactive')
  })
}

test('compte du titulaire (profil membre, e-mail confirmé) → 200', async () => {
  logIn('user-awa')
  giveProfile(state, 'user-awa', { cooperative_id: TREE.COOP_A1 })
  const { status, body } = await access(giveCard(state, { cooperativeId: TREE.COOP_A1 }))
  assert.equal(status, 200)
  assert.equal(body.reason, 'member')
})

test('compte administrateur qui lit la carte d’un membre → 402 not_holder, aucun journal', async () => {
  logIn('admin-1', 'admin@faitiere.tg')
  giveProfile(state, 'admin-1', { role: 'super_admin' })
  const { status, body } = await access(giveCard(state, { cooperativeId: TREE.COOP_A1 }))
  assert.equal(status, 402)
  assert.equal(body.reason, 'not_holder')
  assert.equal(state.store.rows('member_access_logs').length, 0)
})

test('membre changé de coopérative (carte Alpha, membre chez Bêta) → 402 card_outdated', async () => {
  const { status, body } = await access(cardWithSession({ memberCooperativeId: TREE.COOP_B1 }))
  assert.equal(status, 402)
  assert.equal(body.reason, 'card_outdated')
})

test('carte professionnelle : pas de session de carte possible → 401', async () => {
  const number = giveCard(state, { cardType: 'AGRONOME', cooperativeId: null })
  jar.set(
    cardSessionCookieName(number),
    signCardSession({ cardNumber: number, memberId: 'x' }).token,
  )
  assert.equal((await access(number)).status, 401)
})
