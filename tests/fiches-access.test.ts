/**
 * POST /api/fiches/[id]/access — B5 : un achat réglé reste téléchargeable après
 * le retrait de la fiche ; liens signés avec le nom d'origine ; compteur par
 * le client de service.
 */
import assert from 'node:assert/strict'
import { beforeEach, test } from 'node:test'
import { installStubs, resetStore } from './fiches-fake-db'
import {
  TREE,
  accountCaller,
  failAdminReads,
  giveCard,
  giveProfile,
  installCardAccessStub,
  seedTree,
} from './fiches-fake-tree'

for (const level of ['log', 'info', 'warn', 'error', 'debug'] as const) console[level] = () => {}

const state = installStubs()
installCardAccessStub(state)
const { NextRequest } = require('next/server') as typeof import('next/server')
const route = require('../app/api/fiches/[id]/access/route') as {
  POST: (
    req: InstanceType<typeof NextRequest>,
    ctx: { params: Promise<{ id: string }> },
  ) => Promise<Response>
}

const FICHE = '0f0f0f0f-0000-4000-8000-0000000000bb'
const COOP = '0c0c0c0c-0000-4000-8000-0000000000cc'
const PURCHASE = '0a0a0a0a-0000-4000-8000-0000000000dd'
let ipSeq = 0

function addFiche(over: Record<string, unknown> = {}) {
  state.store.rows('fiches_techniques').push({
    id: FICHE,
    title: 'Riz irrigué',
    culture: 'Riz',
    status: 'published',
    price_non_member: 1000,
    is_free_for_members: false,
    cooperative_id: null,
    download_count: 3,
    files: [{ name: 'Compte riz / v2.xlsx', url: 'plateforme/1790-abc.xlsx', type: 'xlsx' }],
    ...over,
  })
}

function access(body: Record<string, unknown>) {
  const req = new NextRequest(`https://app.test/api/fiches/${FICHE}/access`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': `10.1.0.${++ipSeq}` },
    body: JSON.stringify(body),
  })
  return route.POST(req, { params: Promise.resolve({ id: FICHE }) })
}

beforeEach(() => {
  resetStore(state)
  state.store.put('fiches-techniques', 'plateforme/1790-abc.xlsx', [0x50, 0x4b, 3, 4])
})

const paid = () =>
  state.store.rows('purchases').push({
    id: PURCHASE,
    fiche_id: FICHE,
    payment_status: 'completed',
    access_granted: true,
  })

test('fiche archivée + achat réglé → 200, lien signé avec le nom d’origine nettoyé', async () => {
  addFiche({ status: 'archived' })
  paid()
  const res = await access({ purchase_id: PURCHASE })
  assert.equal(res.status, 200)
  const body = await res.json()
  assert.equal(body.reason, 'purchase')
  assert.equal(body.files.length, 1)
  assert.ok(body.files[0].url.startsWith('https://storage.test/'))
  const sign = state.store.storageCalls.find((c) => c.op === 'createSignedUrl')
  assert.equal(sign?.client, 'admin')
  assert.deepEqual(sign?.args, [
    'plateforme/1790-abc.xlsx',
    3600,
    { download: 'Compte riz v2.xlsx' },
  ])
  // Le compteur est aussi tenu pour un achat, et par le client de service.
  assert.deepEqual(state.store.rpcCalls, [
    { client: 'admin', name: 'increment_download_count', args: { target_fiche_id: FICHE } },
  ])
})

test('fiche archivée + gratuite → 404', async () => {
  addFiche({ status: 'archived', price_non_member: 0 })
  const res = await access({})
  assert.equal(res.status, 404)
  assert.equal(state.store.rpcCalls.length, 0)
})

test('fiche supprimée + achat réglé → 404', async () => {
  paid()
  const res = await access({ purchase_id: PURCHASE })
  assert.equal(res.status, 404)
})

test('achat en attente → 403, sans lien', async () => {
  addFiche()
  state.store.rows('purchases').push({
    id: PURCHASE,
    fiche_id: FICHE,
    payment_status: 'pending',
    access_granted: false,
  })
  const res = await access({ purchase_id: PURCHASE })
  assert.equal(res.status, 403)
  assert.equal(state.store.storageCalls.length, 0)
})

test('achat remboursé → 403, sans lien ni compteur', async () => {
  addFiche()
  state.store.rows('purchases').push({
    id: PURCHASE,
    fiche_id: FICHE,
    payment_status: 'refunded',
    access_granted: false,
  })
  const res = await access({ purchase_id: PURCHASE })
  assert.equal(res.status, 403)
  assert.equal(state.store.storageCalls.length, 0)
  assert.equal(state.store.rpcCalls.length, 0)
})

test('achat réglé d’une AUTRE fiche → 403 (l’id d’achat ne vaut que pour sa fiche)', async () => {
  addFiche()
  state.store.rows('purchases').push({
    id: PURCHASE,
    fiche_id: '0f0f0f0f-0000-4000-8000-0000000000ff',
    payment_status: 'completed',
    access_granted: true,
  })
  const res = await access({ purchase_id: PURCHASE })
  assert.equal(res.status, 403)
  assert.equal(state.store.storageCalls.length, 0)
})

test('fiche repassée en brouillon après la vente → l’acheteur garde l’accès', async () => {
  addFiche({ status: 'draft' })
  paid()
  const res = await access({ purchase_id: PURCHASE })
  assert.equal(res.status, 200)
  assert.equal((await res.json()).reason, 'purchase')
})

test('fiche publiée gratuite → compteur par le client de service, sans repli .update()', async () => {
  addFiche({ price_non_member: 0 })
  state.admin.rpcHandlers.increment_download_count = () => ({
    data: null,
    error: { message: 'permission denied' },
  })
  const res = await access({})
  assert.equal(res.status, 200)
  assert.equal(state.store.rpcCalls[0]?.client, 'admin')
  assert.ok(!state.store.ops.some((o) => o.table === 'fiches_techniques' && o.op === 'update'))
})

test('fiche devenue payante, boutique en cache à 0 FCFA → 400 not_free, sans lien', async () => {
  // L'acheteur clique « Télécharger gratuitement » (corps vide) ; le serveur
  // lit le prix à jour. La fenêtre traduit not_free en « rechargez la page ».
  addFiche({ price_non_member: 1500 })
  const res = await access({})
  assert.equal(res.status, 400)
  const body = await res.json()
  assert.equal(body.reason, 'not_free')
  assert.equal(body.files, undefined)
  assert.equal(state.store.storageCalls.length, 0)
})

test('objet absent du stockage → url null et « Fichier indisponible »', async () => {
  addFiche({
    price_non_member: 0,
    files: [
      { name: 'ok.xlsx', url: 'plateforme/1790-abc.xlsx', type: 'xlsx' },
      { name: 'perdu.pdf', url: 'plateforme/absent.pdf', type: 'pdf' },
    ],
  })
  const res = await access({})
  const body = await res.json()
  assert.equal(body.files.length, 2)
  assert.ok(body.files[0].url)
  assert.equal(body.files[1].url, null)
  assert.equal(body.files[1].error, 'Fichier indisponible')
})

test('chemin hors du dossier du propriétaire → ignoré (jamais signé)', async () => {
  state.store.put('fiches-techniques', `${COOP}/autre.pdf`, [0x25, 0x50, 0x44, 0x46])
  addFiche({
    price_non_member: 0,
    files: [
      { name: 'vendu.xlsx', url: 'plateforme/1790-abc.xlsx', type: 'xlsx' },
      { name: 'étranger.pdf', url: `${COOP}/autre.pdf`, type: 'pdf' },
      { name: 'évasion.webp', url: '../fiches-covers/x.webp', type: 'webp' },
    ],
  })
  const res = await access({})
  const body = await res.json()
  assert.deepEqual(
    body.files.map((f: { name: string }) => f.name),
    ['vendu.xlsx'],
  )
  assert.equal(state.store.storageCalls.filter((c) => c.op === 'createSignedUrl').length, 1)
})

test('carte membre sur une fiche non gratuite pour les membres → 402 avec le nouveau message', async () => {
  addFiche({ is_free_for_members: false })
  state.privateCard = { ok: true, card: { member_id: 'm1', cooperative_id: COOP } }
  const res = await access({ card_number: 'FTG-12345' })
  assert.equal(res.status, 402)
  assert.equal(
    (await res.json()).message,
    'Cette fiche n’est pas gratuite pour les membres : achetez-la ci-dessus.',
  )
})

// ── Gratuité membres : fiche d'une faîtière → membres de SON arbre ; fiche de
//    la plateforme → toute carte active (lib/fiches/member-scope.ts). ────────

const ALPHA_ONLY =
  'Ce compte est gratuit pour les membres de Faîtière Alpha uniquement. Achetez-le pour le télécharger.'
const INACTIVE =
  'Votre carte ou votre adhésion n’est pas active : ce compte n’est pas gratuit pour vous. Achetez-le pour le télécharger.'
const NOT_HOLDER =
  'Ce compte est gratuit pour le titulaire de la carte uniquement. Achetez-le pour le télécharger.'
const OUTDATED =
  'Votre carte ne correspond plus à votre coopérative : demandez une nouvelle carte, ou achetez ce compte.'
const BROKEN_ALPHA =
  'Rattachement de votre coopérative incomplet : impossible de vérifier que vous êtes membre de Faîtière Alpha. Contactez votre coopérative, ou achetez ce compte.'

/** Fiche gratuite pour les membres, vendue par la faîtière Alpha (ou la plateforme). */
function memberFiche(owner: string | null = TREE.FAITIERE_A) {
  seedTree(state)
  addFiche({ is_free_for_members: true, cooperative_id: owner, files: [] })
}

async function expectGranted(card_number: string) {
  const res = await access({ card_number })
  assert.equal(res.status, 200)
  assert.equal((await res.json()).reason, 'member')
  assert.equal(state.store.rpcCalls[0]?.client, 'admin')
  assert.equal(state.store.rows('member_access_logs').length, 1)
}

async function expectDenied(card_number: string, message: string, reason: string) {
  const res = await access({ card_number })
  assert.equal(res.status, 402)
  const body = await res.json()
  assert.equal(body.access, 'denied')
  assert.equal(body.reason, reason)
  assert.equal(body.price, 1000)
  assert.equal(body.message, message)
  assert.equal(body.files, undefined)
  // Ni journal d'accès, ni compteur, ni lien signé pour une carte refusée.
  assert.equal(state.store.rows('member_access_logs').length, 0)
  assert.equal(state.store.rpcCalls.length, 0)
  assert.equal(state.store.storageCalls.length, 0)
}

test('membre d’une coopérative de la faîtière → gratuit, journal d’accès écrit', async () => {
  memberFiche()
  const card = giveCard(state, { cooperativeId: TREE.COOP_A2 })
  await expectGranted(card)
  assert.deepEqual(
    {
      ...state.store.rows('member_access_logs')[0],
      id: undefined,
      created_at: undefined,
      updated_at: undefined,
    },
    {
      card_number: card,
      member_id: 'member-1',
      cooperative_id: TREE.COOP_A2,
      fiche_id: FICHE,
      action: 'download',
      id: undefined,
      created_at: undefined,
      updated_at: undefined,
    },
  )
})

test('membre rattaché par une union → gratuit', async () => {
  memberFiche()
  await expectGranted(giveCard(state, { cooperativeId: TREE.COOP_A1 }))
})

test('carte de la faîtière elle-même → gratuit', async () => {
  memberFiche()
  await expectGranted(giveCard(state, { cooperativeId: TREE.FAITIERE_A }))
})

test('membre d’une AUTRE faîtière → 402 « gratuit pour les membres de … uniquement »', async () => {
  memberFiche()
  await expectDenied(giveCard(state, { cooperativeId: TREE.COOP_B1 }), ALPHA_ONLY, 'other_tree')
})

test('fiche de la plateforme + carte active de n’importe quelle faîtière → gratuit', async () => {
  memberFiche(null)
  await expectGranted(giveCard(state, { cooperativeId: TREE.COOP_B1 }))
})

test('fiche de la plateforme + carte professionnelle → gratuit pour le compte titulaire', async () => {
  memberFiche(null)
  const card = giveCard(state, {
    cardType: 'AGRONOME',
    cooperativeId: null,
    caller: accountCaller('user-pro'),
  })
  state.store
    .rows('haroo_agronome_profiles')
    .push({ user_id: 'user-pro', member_card_id: `card-${card}`, card_number: card })
  await expectGranted(card)
})

test('fiche de la plateforme + carte professionnelle lue par un autre compte → 402', async () => {
  memberFiche(null)
  const card = giveCard(state, {
    cardType: 'AGRONOME',
    cooperativeId: null,
    caller: accountCaller('super-admin'),
  })
  state.store
    .rows('haroo_agronome_profiles')
    .push({ user_id: 'user-pro', member_card_id: `card-${card}`, card_number: card })
  await expectDenied(card, NOT_HOLDER, 'not_holder')
})

test('carte Haroo sur une fiche de faîtière → 402, même rattachée à cette faîtière', async () => {
  memberFiche()
  // Son titulaire lui-même (compte lié au profil professionnel) n'y a pas droit.
  const card = giveCard(state, {
    cardType: 'AGRONOME',
    cooperativeId: TREE.FAITIERE_A,
    caller: accountCaller('user-pro'),
  })
  state.store
    .rows('haroo_agronome_profiles')
    .push({ user_id: 'user-pro', member_card_id: `card-${card}`, card_number: card })
  await expectDenied(card, ALPHA_ONLY, 'pro_card')
})

for (const [label, spec] of [
  ['titulaire suspendu', { memberStatus: 'suspended' }],
  ['titulaire inactif', { memberStatus: 'inactive' }],
  ['titulaire supprimé', { memberDeletedAt: '2026-01-01T00:00:00Z' }],
  ['carte suspendue', { status: 'suspended', suspendedAt: '2026-10-01T00:00:00Z' }],
  ['carte révoquée', { status: 'revoked', revokedAt: '2026-10-01T00:00:00Z' }],
  ['carte révoquée (date seule)', { revokedAt: '2026-10-01T00:00:00Z' }],
  ['carte expirée', { expiry: '2020-01-01' }],
  ['carte passée à un autre titulaire', { memberId: 'member-2' }],
] as const) {
  test(`${label} → pas gratuit (402), même sur une fiche de sa faîtière`, async () => {
    memberFiche()
    const card = giveCard(state, { cooperativeId: TREE.COOP_A1, ...spec })
    // Défense en profondeur : même si requirePrivateCard (doublé) laissait passer
    // la carte du titulaire « member-1 », la relecture par le client de service
    // refuse. Le vrai module, lui, s'arrête avant : tests/fiches-access-card.test.ts.
    state.privateCard = {
      ok: true,
      card: { member_id: 'member-1', cooperative_id: TREE.COOP_A1 },
    }
    await expectDenied(card, INACTIVE, 'card_inactive')
  })
}

test('titulaire suspendu → pas gratuit non plus sur une fiche de la plateforme', async () => {
  memberFiche(null)
  const card = giveCard(state, { cooperativeId: TREE.COOP_B1, memberStatus: 'suspended' })
  await expectDenied(card, INACTIVE, 'card_inactive')
})

test('panne de lecture de la hiérarchie → refus (402), jamais gratuit par défaut', async () => {
  memberFiche()
  const card = giveCard(state, { cooperativeId: TREE.COOP_A1 })
  const restore = failAdminReads(state, 'cooperatives')
  try {
    await expectDenied(
      card,
      'Vérification de votre carte impossible pour le moment. Réessayez dans un instant, ou achetez ce compte.',
      'lookup_failed',
    )
  } finally {
    restore()
  }
})

test('panne de lecture de la carte → refus (402)', async () => {
  memberFiche()
  const card = giveCard(state, { cooperativeId: TREE.COOP_A1 })
  const restore = failAdminReads(state, 'member_cards')
  try {
    const res = await access({ card_number: card })
    assert.equal(res.status, 402)
    assert.equal((await res.json()).reason, 'lookup_failed')
    assert.equal(state.store.rows('member_access_logs').length, 0)
  } finally {
    restore()
  }
})

test('chaîne qui boucle → refus « rattachement incomplet »', async () => {
  memberFiche()
  const X = '0fc00000-0000-4000-8000-0000000000c1'
  const Y = '0fc00000-0000-4000-8000-0000000000c2'
  state.store
    .rows('cooperatives')
    .push(
      { id: X, name: 'X', level: 'cooperative', parent_id: Y, deleted_at: null },
      { id: Y, name: 'Y', level: 'union', parent_id: X, deleted_at: null },
    )
  await expectDenied(giveCard(state, { cooperativeId: X }), BROKEN_ALPHA, 'broken_chain')
})

test('chaîne trop longue (au-delà de 6 niveaux) → refus, même sous la bonne faîtière', async () => {
  memberFiche()
  let parent: string = TREE.FAITIERE_A
  for (let i = 1; i <= 6; i++) {
    const id = `0fd00000-0000-4000-8000-00000000000${i}`
    state.store
      .rows('cooperatives')
      .push({ id, name: `N${i}`, level: 'union', parent_id: parent, deleted_at: null })
    parent = id
  }
  await expectDenied(giveCard(state, { cooperativeId: parent }), BROKEN_ALPHA, 'broken_chain')
})

test('union supprimée (soft delete) entre la coopérative et la faîtière → refus, coopérative journalisée', async () => {
  memberFiche()
  const union = state.store.rows('cooperatives').find((c) => c.id === TREE.UNION_A)
  if (union) union.deleted_at = '2026-09-01T00:00:00Z'
  const logged: unknown[][] = []
  const quiet = console.error
  console.error = (...args: unknown[]) => logged.push(args)
  try {
    await expectDenied(
      giveCard(state, { cooperativeId: TREE.COOP_A1 }),
      BROKEN_ALPHA,
      'broken_chain',
    )
  } finally {
    console.error = quiet
  }
  // L'administrateur sait quelle coopérative rattacher.
  assert.ok(logged.some((args) => JSON.stringify(args).includes(TREE.COOP_A1)))
})

test('fiche non gratuite pour les membres → 402 sans relire la carte ni l’arbre', async () => {
  seedTree(state)
  addFiche({ is_free_for_members: false, cooperative_id: TREE.FAITIERE_A })
  const card = giveCard(state, { cooperativeId: TREE.COOP_A1 })
  const res = await access({ card_number: card })
  assert.equal(res.status, 402)
  assert.equal((await res.json()).reason, 'not_member_free')
  assert.ok(!state.store.ops.some((o) => o.table === 'member_cards' || o.table === 'cooperatives'))
})

// ── Titulaire seulement : lire une carte (admin, partenaire) ne suffit pas ────

test('compte administrateur qui peut lire la carte d’un membre → 402 « titulaire uniquement »', async () => {
  memberFiche()
  giveProfile(state, 'admin-1', { role: 'cooperative_admin', cooperative_id: TREE.FAITIERE_A })
  const card = giveCard(state, {
    cooperativeId: TREE.COOP_A1,
    caller: accountCaller('admin-1', 'admin@faitiere.tg'),
  })
  await expectDenied(card, NOT_HOLDER, 'not_holder')
})

test('partenaire qui lit la carte (même e-mail que le membre, sans profil membre) → 402', async () => {
  memberFiche(null)
  giveProfile(state, 'partner-1', { role: 'none', cooperative_id: null })
  const card = giveCard(state, {
    cooperativeId: TREE.COOP_A1,
    caller: accountCaller('partner-1'),
  })
  await expectDenied(card, NOT_HOLDER, 'not_holder')
})

test('compte du titulaire (profil membre, e-mail confirmé, même coopérative) → gratuit', async () => {
  memberFiche()
  giveProfile(state, 'user-awa', { cooperative_id: TREE.COOP_A1 })
  await expectGranted(
    giveCard(state, { cooperativeId: TREE.COOP_A1, caller: accountCaller('user-awa') }),
  )
})

for (const [label, profile, caller] of [
  ['e-mail non confirmé', {}, accountCaller('user-awa', 'awa@coop.tg', false)],
  ['autre e-mail', {}, accountCaller('user-awa', 'autre@coop.tg')],
  ['profil d’une autre coopérative', { cooperative_id: TREE.COOP_A2 }, accountCaller('user-awa')],
  ['profil supprimé', { deleted_at: '2026-01-01T00:00:00Z' }, accountCaller('user-awa')],
  ['profil administrateur', { role: 'cooperative_admin' }, accountCaller('user-awa')],
] as const) {
  test(`compte qui n’est pas le titulaire (${label}) → 402`, async () => {
    memberFiche()
    giveProfile(state, 'user-awa', { cooperative_id: TREE.COOP_A1, ...profile })
    await expectDenied(
      giveCard(state, { cooperativeId: TREE.COOP_A1, caller }),
      NOT_HOLDER,
      'not_holder',
    )
  })
}

test('panne de lecture du profil → refus « réessayez » (402)', async () => {
  memberFiche()
  giveProfile(state, 'user-awa', { cooperative_id: TREE.COOP_A1 })
  const card = giveCard(state, { cooperativeId: TREE.COOP_A1, caller: accountCaller('user-awa') })
  const restore = failAdminReads(state, 'profiles')
  try {
    const res = await access({ card_number: card })
    assert.equal(res.status, 402)
    assert.equal((await res.json()).reason, 'lookup_failed')
  } finally {
    restore()
  }
})

// ── Membre changé de coopérative, carte non réémise ────────────────────────

test('membre passé chez Bêta avec sa carte Alpha → 402 sur les fiches d’Alpha ET de Bêta', async () => {
  memberFiche()
  const spec = { cooperativeId: TREE.COOP_A1, memberCooperativeId: TREE.COOP_B1 }
  await expectDenied(giveCard(state, spec), OUTDATED, 'card_outdated')
  resetStore(state)
  memberFiche(TREE.FAITIERE_B)
  await expectDenied(giveCard(state, spec), OUTDATED, 'card_outdated')
})

// ── Carte connue mais plus active : le vrai requirePrivateCard la refuse ────
//    (doublé ici par ok: false) → 402 « achetez-le », pas 401.

for (const [label, spec] of [
  ['expirée', { expiry: '2020-01-01' }],
  ['suspendue', { status: 'suspended', suspendedAt: '2026-10-01T00:00:00Z' }],
  ['révoquée', { status: 'revoked', revokedAt: '2026-10-01T00:00:00Z' }],
  ['en attente', { status: 'pending' }],
] as const) {
  test(`carte ${label} refusée par requirePrivateCard → 402 card_inactive, pas de connexion`, async () => {
    memberFiche()
    const card = giveCard(state, { cooperativeId: TREE.COOP_A1, ...spec })
    state.privateCard = { ok: false }
    await expectDenied(card, INACTIVE, 'card_inactive')
  })
}

test('carte active sans preuve de possession → 401 (connexion par carte)', async () => {
  memberFiche()
  const card = giveCard(state, { cooperativeId: TREE.COOP_A1 })
  state.privateCard = { ok: false }
  const res = await access({ card_number: card })
  assert.equal(res.status, 401)
})

test('carte inconnue ou supprimée → 401, rien n’est révélé', async () => {
  memberFiche()
  const card = giveCard(state, { cooperativeId: TREE.COOP_A1, status: 'revoked' })
  const row = state.store.rows('member_cards')[0]
  if (row) row.deleted_at = '2026-10-01T00:00:00Z'
  state.privateCard = { ok: false }
  assert.equal((await access({ card_number: card })).status, 401)
  assert.equal((await access({ card_number: 'FTG-99999' })).status, 401)
})

test('carte expirée sur une fiche non gratuite pour les membres → 402 « achetez-la »', async () => {
  seedTree(state)
  addFiche({ is_free_for_members: false, cooperative_id: TREE.FAITIERE_A, files: [] })
  const card = giveCard(state, { cooperativeId: TREE.COOP_A1, expiry: '2020-01-01' })
  state.privateCard = { ok: false }
  const res = await access({ card_number: card })
  assert.equal(res.status, 402)
  assert.equal((await res.json()).reason, 'not_member_free')
})

test('carte expirée + achat en attente → 403 (l’achat refusé prime)', async () => {
  memberFiche()
  const card = giveCard(state, { cooperativeId: TREE.COOP_A1, expiry: '2020-01-01' })
  state.privateCard = { ok: false }
  state.store.rows('purchases').push({
    id: PURCHASE,
    fiche_id: FICHE,
    payment_status: 'pending',
    access_granted: false,
  })
  const res = await access({ card_number: card, purchase_id: PURCHASE })
  assert.equal(res.status, 403)
})
