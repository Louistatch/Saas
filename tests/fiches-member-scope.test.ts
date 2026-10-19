/**
 * Gratuité membres (lib/fiches/member-scope.ts) : la règle seule, la marche
 * bornée dans l'arbre des coopératives, le prix vu par une carte dans
 * GET /api/verify/[card_number]/fiches (« Gratuit pour vous » décidé ici), et
 * les libellés de l'interface (lib/fiches/member-label.ts).
 */
import assert from 'node:assert/strict'
import { beforeEach, test } from 'node:test'
import {
  MEMBER_FREE_CHECKBOX_LABEL,
  dashboardPriceLabel,
  ficheAction,
  memberFreeBadge,
  memberFreeDialogHint,
  memberFreeLabel,
} from '../lib/fiches/member-label'
import type * as ScopeLib from '../lib/fiches/member-scope'
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
const scopeLib = require('../lib/fiches/member-scope') as typeof ScopeLib
const { NextRequest } = require('next/server') as typeof import('next/server')
const verifyRoute = require('../app/api/verify/[card_number]/fiches/route') as {
  GET: (
    req: InstanceType<typeof NextRequest>,
    ctx: { params: Promise<{ card_number: string }> },
  ) => Promise<Response>
}

const { memberFreeVerdict, cooperativeChain, loadMemberScope, MAX_COOPERATIVE_DEPTH } = scopeLib
type Scope = ScopeLib.MemberScope

beforeEach(() => {
  resetStore(state)
  seedTree(state)
})

const memberCard = (ids: string[]): Scope => ({
  card: { ok: true, cardType: 'FAITIERE', cooperativeId: ids[0] ?? null },
  chain: { ok: true, ids },
})

test('règle : fiche de faîtière → seulement une carte de coopérative de son arbre', () => {
  const fiche = { is_free_for_members: true, cooperative_id: TREE.FAITIERE_A }
  const alpha = memberCard([TREE.COOP_A1, TREE.UNION_A, TREE.FAITIERE_A])
  const beta = memberCard([TREE.COOP_B1, TREE.FAITIERE_B])
  assert.deepEqual(memberFreeVerdict(fiche, alpha), { free: true })
  assert.deepEqual(memberFreeVerdict(fiche, beta), { free: false, reason: 'other_tree' })
  // Chaîne non lue : refus ; rompue : refus qui le dit.
  assert.deepEqual(memberFreeVerdict(fiche, { ...alpha, chain: null }), {
    free: false,
    reason: 'other_tree',
  })
  assert.deepEqual(memberFreeVerdict(fiche, { ...alpha, chain: { ok: false, reason: 'broken' } }), {
    free: false,
    reason: 'broken_chain',
  })
  assert.deepEqual(
    memberFreeVerdict(fiche, { ...alpha, chain: { ok: false, reason: 'lookup_failed' } }),
    { free: false, reason: 'lookup_failed' },
  )
  // Carte Haroo, même avec une chaîne qui contient la faîtière.
  assert.deepEqual(
    memberFreeVerdict(fiche, {
      card: { ok: true, cardType: 'OUVRIER', cooperativeId: TREE.FAITIERE_A },
      chain: { ok: true, ids: [TREE.FAITIERE_A] },
    }),
    { free: false, reason: 'pro_card' },
  )
})

test('règle : fiche de la plateforme → toute carte active ; jamais une carte inactive', () => {
  const fiche = { is_free_for_members: true, cooperative_id: null }
  assert.deepEqual(memberFreeVerdict(fiche, memberCard([TREE.COOP_B1])), { free: true })
  assert.deepEqual(
    memberFreeVerdict(fiche, {
      card: { ok: true, cardType: 'ACHETEUR', cooperativeId: null },
      chain: null,
    }),
    { free: true },
  )
  assert.deepEqual(
    memberFreeVerdict(fiche, { card: { ok: false, reason: 'card_inactive' }, chain: null }),
    { free: false, reason: 'card_inactive' },
  )
  assert.deepEqual(
    memberFreeVerdict({ ...fiche, is_free_for_members: false }, memberCard([TREE.COOP_B1])),
    { free: false, reason: 'not_member_free' },
  )
})

test('chaîne : remonte jusqu’à la racine, bornée, refus si boucle ou panne', async () => {
  assert.deepEqual(await cooperativeChain(state.admin as never, TREE.COOP_A1), {
    ok: true,
    ids: [TREE.COOP_A1, TREE.UNION_A, TREE.FAITIERE_A],
  })
  assert.deepEqual(await cooperativeChain(state.admin as never, 'absente'), {
    ok: false,
    reason: 'broken',
  })
  const cooperatives = state.store.rows('cooperatives')
  const fa = cooperatives.find((c) => c.id === TREE.FAITIERE_A)
  if (fa) fa.parent_id = TREE.COOP_A2 // boucle faîtière ↔ coopérative
  assert.deepEqual(await cooperativeChain(state.admin as never, TREE.COOP_A2), {
    ok: false,
    reason: 'broken',
  })
  if (fa) fa.parent_id = null
  // Exactement MAX niveaux : accepté ; un de plus : refusé.
  let parent: string | null = null
  for (let i = 0; i <= MAX_COOPERATIVE_DEPTH; i++) {
    const id = `deep-${i}`
    cooperatives.push({ id, name: id, level: 'union', parent_id: parent, deleted_at: null })
    parent = id
  }
  assert.equal(
    (await cooperativeChain(state.admin as never, `deep-${MAX_COOPERATIVE_DEPTH - 1}`)).ok,
    true,
  )
  assert.deepEqual(await cooperativeChain(state.admin as never, `deep-${MAX_COOPERATIVE_DEPTH}`), {
    ok: false,
    reason: 'broken',
  })
  const restore = failAdminReads(state, 'cooperatives')
  try {
    assert.deepEqual(await cooperativeChain(state.admin as never, TREE.COOP_A1), {
      ok: false,
      reason: 'lookup_failed',
    })
  } finally {
    restore()
  }
})

test('portée : la chaîne n’est lue que pour une carte de coopérative et sur demande', async () => {
  const card = giveCard(state, { cooperativeId: TREE.COOP_A1 })
  const opts = { memberId: 'member-1', caller: { via: 'card' as const } }
  const without = await loadMemberScope(card, { ...opts, withChain: false })
  assert.equal(without.chain, null)
  assert.ok(!state.store.ops.some((o) => o.table === 'cooperatives'))
  const withChain = await loadMemberScope(card, { ...opts, withChain: true })
  assert.deepEqual(withChain.chain, {
    ok: true,
    ids: [TREE.COOP_A1, TREE.UNION_A, TREE.FAITIERE_A],
  })
  // Toutes les lectures passent par le client de service.
  assert.ok(state.store.ops.every((o) => o.client === 'admin'))
})

// ── GET /api/verify/[card_number]/fiches : « Gratuit pour vous » décidé ici ──

const FICHES = {
  member: '0e000000-0000-4000-8000-000000000001',
  paid: '0e000000-0000-4000-8000-000000000002',
  free: '0e000000-0000-4000-8000-000000000003',
}

function seedFiches(owner: string) {
  const fiche = (id: string, over: Record<string, unknown>) => ({
    id,
    title: id,
    status: 'published',
    cooperative_id: owner,
    price_non_member: 1500,
    is_free_for_members: false,
    files: [],
    created_at: '2026-10-01T00:00:00Z',
    ...over,
  })
  state.store
    .rows('fiches_techniques')
    .push(
      fiche(FICHES.member, { is_free_for_members: true }),
      fiche(FICHES.paid, {}),
      fiche(FICHES.free, { price_non_member: 0 }),
    )
}

async function pricesFor(card: string) {
  const req = new NextRequest(`https://app.test/api/verify/${card}/fiches`)
  const res = await verifyRoute.GET(req, { params: Promise.resolve({ card_number: card }) })
  assert.equal(res.status, 200)
  const body = (await res.json()) as {
    fiches: { id: string; free_for_you: boolean; not_free_reason: string | null }[]
  }
  return Object.fromEntries(body.fiches.map((f) => [f.id, f.free_for_you]))
}

async function reasonsFor(card: string) {
  const req = new NextRequest(`https://app.test/api/verify/${card}/fiches`)
  const res = await verifyRoute.GET(req, { params: Promise.resolve({ card_number: card }) })
  const body = (await res.json()) as { fiches: { id: string; not_free_reason: string | null }[] }
  return Object.fromEntries(body.fiches.map((f) => [f.id, f.not_free_reason]))
}

test('carte de la faîtière (via une union) → « gratuit pour vous » sur la fiche membres', async () => {
  seedFiches(TREE.FAITIERE_A)
  const prices = await pricesFor(giveCard(state, { cooperativeId: TREE.COOP_A1 }))
  assert.deepEqual(prices, { [FICHES.member]: true, [FICHES.paid]: false, [FICHES.free]: true })
})

test('titulaire suspendu → le prix, pas « gratuit pour vous »', async () => {
  seedFiches(TREE.FAITIERE_A)
  const card = giveCard(state, { cooperativeId: TREE.COOP_A1, memberStatus: 'suspended' })
  const prices = await pricesFor(card)
  assert.deepEqual(prices, { [FICHES.member]: false, [FICHES.paid]: false, [FICHES.free]: true })
})

test('carte Haroo rattachée à la faîtière → le prix', async () => {
  seedFiches(TREE.FAITIERE_A)
  const card = giveCard(state, { cardType: 'AGRONOME', cooperativeId: TREE.FAITIERE_A })
  const prices = await pricesFor(card)
  assert.equal(prices[FICHES.member], false)
})

test('panne de lecture de la hiérarchie → le prix (refus par défaut)', async () => {
  seedFiches(TREE.FAITIERE_A)
  const card = giveCard(state, { cooperativeId: TREE.COOP_A1 })
  // La liste passe par le client de la carte ; seule la décision (service) tombe.
  const restore = failAdminReads(state, 'cooperatives')
  try {
    const prices = await pricesFor(card)
    assert.equal(prices[FICHES.member], false)
    assert.equal(prices[FICHES.free], true)
    // … mais en disant que c'est une panne : la page propose « réessayer ».
    assert.deepEqual(await reasonsFor(card), {
      [FICHES.member]: 'lookup_failed',
      [FICHES.paid]: 'not_member_free',
      [FICHES.free]: null,
    })
  } finally {
    restore()
  }
})

test('compte administrateur qui ouvre la carte d’un membre → le prix, raison not_holder', async () => {
  seedFiches(TREE.FAITIERE_A)
  giveProfile(state, 'admin-1', { role: 'cooperative_admin', cooperative_id: TREE.FAITIERE_A })
  const card = giveCard(state, {
    cooperativeId: TREE.COOP_A1,
    caller: accountCaller('admin-1', 'admin@faitiere.tg'),
  })
  assert.equal((await pricesFor(card))[FICHES.member], false)
  assert.equal((await reasonsFor(card))[FICHES.member], 'not_holder')
})

// ── Libellés (lib/fiches/member-label.ts) ───────────────────────────────────

test('libellé public : plateforme, faîtière nommée, faîtière sans nom', () => {
  assert.equal(memberFreeLabel({ cooperative_id: null }), 'Gratuit pour toute carte active')
  assert.equal(
    memberFreeLabel({
      cooperative_id: TREE.FAITIERE_A,
      cooperatives: { name: ' Faîtière Alpha ' },
    }),
    'Gratuit pour les membres de Faîtière Alpha (carte active)',
  )
  assert.equal(
    memberFreeLabel({ cooperative_id: TREE.FAITIERE_A, cooperatives: { name: null } }),
    'Gratuit pour les membres de la faîtière (carte active)',
  )
  assert.deepEqual(MEMBER_FREE_CHECKBOX_LABEL, {
    faitiere: 'Gratuit pour les membres de ma faîtière (carte active)',
    platform: 'Gratuit pour toute carte active',
  })
})

test('fenêtre d’achat : invitation à saisir sa carte selon qui vend', () => {
  assert.deepEqual(
    memberFreeDialogHint({
      cooperative_id: TREE.FAITIERE_A,
      cooperatives: { name: 'Faîtière Alpha' },
    }),
    {
      lead: 'Membre de Faîtière Alpha ?',
      rest: 'Votre carte active donne accès gratuitement à ce compte.',
    },
  )
  assert.deepEqual(memberFreeDialogHint({ cooperative_id: null }), {
    lead: 'Titulaire d’une carte active ?',
    rest: 'Elle donne accès gratuitement à ce compte.',
  })
})

test('tableau de bord : badge membres seulement sur une fiche payante, prix toujours affiché', () => {
  assert.equal(memberFreeBadge({ is_free_for_members: true, price_non_member: 0 }), null)
  assert.equal(memberFreeBadge({ is_free_for_members: false, price_non_member: 1500 }), null)
  assert.equal(
    memberFreeBadge({ is_free_for_members: true, price_non_member: 1500 }),
    'Gratuit pour vos membres (carte active)',
  )
  assert.equal(dashboardPriceLabel(0), 'Gratuit pour tous')
  assert.match(dashboardPriceLabel(1500), /^1\s?500 FCFA$/u)
})

test('page de scan : télécharger, acheter (lien vers la fiche) ou réessayer', () => {
  const fiche = {
    id: '0f0f0f0f-0000-4000-8000-0000000000a1',
    title: 'Compte Maïs, 1 hectare (Kara) & soja',
    price_non_member: 1500,
  }
  assert.deepEqual(ficheAction({ ...fiche, price_non_member: 0 }), {
    kind: 'download',
    badge: 'Gratuit',
  })
  assert.deepEqual(ficheAction({ ...fiche, free_for_you: true }), {
    kind: 'download',
    badge: 'Gratuit pour vous',
  })
  const buy = ficheAction({ ...fiche, free_for_you: false, not_free_reason: 'other_tree' })
  assert.equal(buy.kind, 'buy')
  // Lien vers LA fiche (id), jamais une recherche par titre : virgules et
  // parenthèses du titre ne cassent plus rien.
  assert.equal(buy.kind === 'buy' && buy.href, `/marketplace?fiche=${fiche.id}`)
  assert.match(buy.badge, /^1\s?500 FCFA$/u)
  // Champ absent (ancienne réponse) : jamais gratuit par défaut.
  assert.equal(ficheAction(fiche).kind, 'buy')
  const retry = ficheAction({ ...fiche, free_for_you: false, not_free_reason: 'lookup_failed' })
  assert.equal(retry.kind, 'retry')
  assert.equal(
    retry.kind === 'retry' && retry.message,
    'Vérification impossible pour le moment, réessayez.',
  )
})
