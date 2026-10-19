/**
 * Tests du rapprochement et de l'inscription Kobo (part B) : hiérarchie de l'organisation,
 * champ clé (carte / téléphone), pas de doublon, verrou par soumission, soumission modifiée,
 * carte non émise (quota), coopérative exacte, inscription de coopérative bornée à l'arbre,
 * chemin des médias.
 *
 * Les VRAIS modules (identity, linkage, ingest, enrollment, processors, media) sont chargés ;
 * seules leurs frontières (client Supabase, 'server-only', recadrage de photo) sont remplacées
 * par un faux Supabase en mémoire (tests/kobo-fake-db.ts).
 */
import assert from 'node:assert/strict'
import { afterEach, beforeEach, test } from 'node:test'
import type * as EnrollmentModule from '../lib/kobo/enrollment'
import type * as IdentityModule from '../lib/kobo/identity'
import type * as IngestModule from '../lib/kobo/ingest'
import type * as MappingTargetsModule from '../lib/kobo/mapping-targets'
import type * as MediaModule from '../lib/kobo/media'
import type * as PayloadModule from '../lib/kobo/payload'
import type * as ProcessorsModule from '../lib/kobo/processors'
import type * as ValidatorsModule from '../lib/validators/kobo'
import { FakeDb, type Row } from './kobo-fake-db'

// ── Journaux capturés (aucun token ne doit y figurer) ───────────────────────
const TOKEN = 'a1b2c3d4e5f6a7b8c9d0a1b2c3d4e5f6a7b8c9d0'
const logged: string[] = []
for (const level of ['log', 'info', 'warn', 'error', 'debug'] as const) {
  console[level] = (...args: unknown[]) => {
    logged.push(args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' '))
  }
}

// ── Doublures de modules ─────────────────────────────────────────────────────
const state = { db: new FakeDb() }

const Module = require('node:module') as {
  _load: (request: string, parent: unknown, isMain: boolean) => unknown
}
const namedStubs: Record<string, unknown> = {
  'server-only': {},
  '@/lib/supabase/admin': { createClient: () => state.db },
  '@/lib/photos/process-photo': { processPhotoFaceCrop: async () => null },
}
const origLoad = Module._load
Module._load = function (this: unknown, request: string, parent: unknown, isMain: boolean) {
  if (request in namedStubs) return namedStubs[request]
  return origLoad.call(this, request, parent, isMain)
}

const identity = require('../lib/kobo/identity') as typeof IdentityModule
const payloadLib = require('../lib/kobo/payload') as typeof PayloadModule
const mappingTargets = require('../lib/kobo/mapping-targets') as typeof MappingTargetsModule
const validators = require('../lib/validators/kobo') as typeof ValidatorsModule
const ingest = require('../lib/kobo/ingest') as typeof IngestModule
const enrollment = require('../lib/kobo/enrollment') as typeof EnrollmentModule
const processors = require('../lib/kobo/processors') as typeof ProcessorsModule
const media = require('../lib/kobo/media') as typeof MediaModule

// ═══════════════════════════════════════════════════════════════════════════
// Jeu de données : deux organisations indépendantes
//   R (faîtière) ── U (union « Union Kara ») ── K1 (« SCOOPS Kara »), K2 (« SCOOPS Sokodé »)
//   R2 (autre faîtière) ── X (« SCOOPS Kara », même nom que K1 !)
// ═══════════════════════════════════════════════════════════════════════════
const R = '10000000-0000-4000-8000-000000000001'
const U = '10000000-0000-4000-8000-000000000002'
const K1 = '10000000-0000-4000-8000-000000000003'
const K2 = '10000000-0000-4000-8000-000000000004'
const R2 = '20000000-0000-4000-8000-000000000001'
const X = '20000000-0000-4000-8000-000000000002'
const FORM = 'aBcDeFgHiJkLmNoPqRsTuV'

function seedOrganisations() {
  const coop = (id: string, name: string, level: string, parent_id: string | null): Row => ({
    id,
    name,
    level,
    parent_id,
    faitiere_name: 'FENAFAT',
  })
  state.db.tables.cooperatives = [
    coop(R, 'FENAFAT', 'faitiere', null),
    coop(U, 'Union Kara', 'union', R),
    coop(K1, 'SCOOPS Kara', 'cooperative', U),
    coop(K2, 'SCOOPS Sokodé', 'cooperative', U),
    coop(R2, 'AUTRE FAITIERE', 'faitiere', null),
    coop(X, 'SCOOPS Kara', 'cooperative', R2),
  ]
  // get_cooperative_descendants : racine + descendants (récursif sur parent_id).
  state.db.rpcHandlers.get_cooperative_descendants = (args) => {
    const root = (args as { p_root_id: string }).p_root_id
    const all = state.db.rows('cooperatives')
    const out = new Set<string>([root])
    let grew = true
    while (grew) {
      grew = false
      for (const c of all) {
        if (out.has(String(c.parent_id)) && !out.has(String(c.id))) {
          out.add(String(c.id))
          grew = true
        }
      }
    }
    return { data: [...out].map((id) => ({ id })), error: null }
  }
  state.db.tables.notification_templates = [
    {
      key: 'enrollment_welcome',
      channel: 'sms',
      body_fr: 'Bienvenue {prenom}, votre carte {card_number}',
    },
  ]
}

const realFetch = globalThis.fetch
beforeEach(() => {
  state.db = new FakeDb()
  logged.length = 0
  seedOrganisations()
})
afterEach(() => {
  globalThis.fetch = realFetch
})

let counter = 100
/** Payload Kobo d'inscription ; `_id`/`_uuid`/`meta/rootUuid` uniques par appel. */
function payload(over: Record<string, unknown> = {}): Record<string, unknown> {
  const id = counter++
  return {
    _id: id,
    _uuid: `uuid-${id}`,
    'meta/rootUuid': `uuid:uuid-${id}`,
    _xform_id_string: FORM,
    _submission_time: '2026-10-08T10:00:00',
    _submitted_by: null,
    'S1/prenom': 'Ama',
    'S1/nom': 'Koffi',
    'S1/telephone': '92548838',
    ...over,
  }
}

function mapping(
  kobo_field: string,
  target_column: string,
  is_key_field: boolean,
  target_table = 'members',
): Row {
  return {
    id: `m-${kobo_field}`,
    cooperative_id: R,
    form_id: FORM,
    kobo_field,
    target_table,
    target_column,
    transform_fn: null,
    is_key_field,
  }
}

type Reg = Awaited<ReturnType<typeof ingest.registerSubmission>>
async function register(p: Record<string, unknown>, coop = R): Promise<Reg> {
  const key = identity.extractMemberKey(p, state.db.rows('kobo_field_mappings') as never)
  return ingest.registerSubmission(state.db as never, {
    cooperativeId: coop,
    formId: FORM,
    payload: p,
    submittedAt: String(p._submission_time ?? '2026-10-08T10:00:00'),
    memberCardNumber: key.card,
  })
}
function idOf(r: Reg): string {
  assert.ok(
    r.kind === 'created' || r.kind === 'edited' || r.kind === 'duplicate' || r.kind === 'busy',
  )
  return r.id
}

const run = (submissionId: string, extra: Partial<ProcessorsModule.DispatchInput> = {}) =>
  processors.dispatchSubmission({
    submissionId,
    cooperativeId: R,
    payload: {},
    formType: 'member_enrollment',
    apiToken: TOKEN,
    ...extra,
  })

/** Enregistre puis traite une soumission. */
async function submit(
  p: Record<string, unknown>,
  extra: Partial<ProcessorsModule.DispatchInput> = {},
) {
  const id = idOf(await register(p))
  const outcome = await run(id, extra)
  return { id, outcome }
}

const rowOf = (id: string) => state.db.rows('kobo_submissions').find((r) => r.id === id) as Row
const members = () => state.db.rows('members')
const cards = () => state.db.rows('member_cards')

function seedMember(over: Row = {}): Row {
  const m: Row = {
    id: `mem-${state.db.rows('members').length + 1}`,
    cooperative_id: K1,
    first_name: 'Ama',
    last_name: 'Koffi',
    phone: '+22892548838',
    status: 'active',
    ...over,
  }
  state.db.rows('members').push(m)
  return m
}
function seedCard(memberId: string, cooperativeId: string, card_number: string, over: Row = {}) {
  state.db.rows('member_cards').push({
    member_id: memberId,
    cooperative_id: cooperativeId,
    card_number,
    card_type: 'FAITIERE',
    status: 'active',
    ...over,
  })
}

// ═══════════════════════════════════════════════════════════════════════════
// Fonctions pures : clé de rapprochement, identité de la soumission, correspondances
// ═══════════════════════════════════════════════════════════════════════════

test('clé : champ clé « téléphone » → E.164 identique quel que soit le format saisi', () => {
  const m = [mapping('S1/telephone', 'phone', true)] as never
  for (const raw of ['92548838', '+228 92 54 88 38', '+22892548838', '00228 92-54-88-38']) {
    assert.equal(identity.extractMemberKey({ 'S1/telephone': raw }, m).phone, '+22892548838', raw)
  }
  // Valeur présente mais invalide : signalée, jamais convertie en « pas d'identifiant ».
  const bad = identity.extractMemberKey({ 'S1/telephone': '12' }, m)
  assert.equal(bad.phone, null)
  assert.deepEqual(bad.invalid, { kind: 'phone', raw: '12' })
})

test('clé : champ clé « carte » → normalisée ; « non » dans le champ clé = invalide, dans un champ usuel = pas de carte', () => {
  const key = [mapping('S1/carte_membre', 'card_number', true)] as never
  assert.equal(
    identity.extractMemberKey({ 'S1/carte_membre': ' fen-123456 ' }, key).card,
    'FEN-123456',
  )
  const invalid = identity.extractMemberKey({ 'S1/carte_membre': 'NON' }, key)
  assert.equal(invalid.card, null)
  assert.equal(invalid.invalid?.kind, 'card')

  // Sans correspondance : « non » à « numéro de carte ? » signifie simplement « pas de carte ».
  const fallback = identity.extractMemberKey({ numero_carte: 'non', 'S1/telephone': '92548838' })
  assert.equal(fallback.card, null)
  assert.equal(fallback.invalid, null)
  assert.equal(fallback.phone, '+22892548838')
})

test('clé : chemins plats, groupés et répétés ; le champ clé de la config prime sur les noms usuels', () => {
  const key = [mapping('G1/membre/carte', 'card_number', true)] as never
  assert.equal(
    identity.extractMemberKey({ 'G1/membre/carte': 'FEN-111111' }, key).card,
    'FEN-111111',
  )
  assert.equal(
    identity.extractMemberKey({ G1: { membre: { carte: 'FEN-222222' } } }, key).card,
    'FEN-222222',
  )
  assert.equal(
    identity.extractMemberKey({ G1: [{ 'G1/membre/carte': 'FEN-333333' }] }, key).card,
    'FEN-333333',
  )
  // Le champ clé configuré gagne sur un champ usuel contradictoire.
  assert.equal(
    identity.extractMemberKey({ 'G1/membre/carte': 'FEN-111111', numero_carte: 'FEN-999999' }, key)
      .card,
    'FEN-111111',
  )
  // Une clé de colonne inconnue n'invente pas de sens : seule une valeur au format carte est retenue.
  const odd = [mapping('S1/x', 'id', true)] as never
  assert.equal(identity.extractMemberKey({ 'S1/x': 'hello' }, odd).invalid, null)
  assert.equal(identity.extractMemberKey({ 'S1/x': 'fen-123456' }, odd).card, 'FEN-123456')
})

test('identité : meta/rootUuid stable d’une modification à l’autre, repli _uuid puis _id', () => {
  const v1 = payloadLib.koboSubmissionIdentity({
    _id: 7,
    _uuid: 'aaa',
    'meta/rootUuid': 'uuid:aaa',
  })
  const v2 = payloadLib.koboSubmissionIdentity({
    _id: 7,
    _uuid: 'bbb',
    'meta/rootUuid': 'uuid:aaa',
    'meta/deprecatedID': 'uuid:aaa',
  })
  assert.equal(v1.key, 'aaa')
  assert.equal(v2.key, 'aaa', 'la modification garde la clé de la soumission d’origine')
  assert.deepEqual(v2.candidates, ['aaa', 'bbb'])
  assert.equal(payloadLib.koboSubmissionIdentity({ _id: 7, _uuid: 'ccc' }).key, 'ccc')
  assert.equal(payloadLib.koboSubmissionIdentity({ _id: 7 }).key, '7')
})

test('profil : correspondances appliquées (liste blanche), téléphone normalisé, date invalide ignorée', () => {
  const p = identity.buildMemberProfile(
    {
      'S1/prenom': 'Ama',
      'S1/nom': 'Koffi',
      tel_perso: '92 54 88 38',
      naissance: '35',
      ville: 'Kara',
    },
    [
      mapping('tel_perso', 'phone', false),
      mapping('ville', 'village', false),
      mapping('naissance', 'date_of_birth', false),
      mapping('x', 'role', false), // hors liste blanche : ignorée
    ] as never,
  )
  assert.equal(p.phone, '+22892548838')
  assert.equal(p.village, 'Kara')
  assert.equal(p.date_of_birth, null, 'un âge n’est pas une date')
  assert.equal(
    identity.buildMemberProfile({ 'S1/prenom': 'Ama', 'S1/date_naissance': '1990-05-12T00:00:00' })
      .date_of_birth,
    '1990-05-12',
  )
})

test('correspondances : liste blanche — membres seulement, cotisations / parcelles / colonnes inconnues refusées', () => {
  assert.equal(mappingTargetErrorOf('members', 'phone', true), null)
  assert.equal(mappingTargetErrorOf('members', 'card_number', true), null)
  assert.equal(mappingTargetErrorOf('members', 'first_name', false), null)
  assert.match(String(mappingTargetErrorOf('members', 'card_number', false)), /non prise en charge/)
  assert.match(String(mappingTargetErrorOf('members', 'role', true)), /card_number|phone/)
  assert.match(String(mappingTargetErrorOf('cotisations', 'amount', false)), /cotisations/)
  assert.match(String(mappingTargetErrorOf('productions', 'culture', false)), /productions/)

  const base = { cooperativeId: R, formId: FORM }
  const ok = validators.koboConfigSchema.safeParse({
    ...base,
    fieldMappings: [
      { koboField: 'S1/tel', targetTable: 'members', targetColumn: 'phone', isKeyField: true },
    ],
  })
  assert.equal(ok.success, true)
  const refused = validators.koboConfigSchema.safeParse({
    ...base,
    fieldMappings: [
      { koboField: 'S4/nb', targetTable: 'cotisations', targetColumn: 'amount', isKeyField: false },
    ],
  })
  assert.equal(refused.success, false)
})
function mappingTargetErrorOf(table: string, column: string, isKey: boolean) {
  return mappingTargets.mappingTargetError(table, column, isKey)
}

test('membre créé par une soumission : identifiant déterministe ; mêmes noms = même personne', () => {
  const a = identity.deriveMemberId('sub-1')
  assert.equal(a, identity.deriveMemberId('sub-1'))
  assert.notEqual(a, identity.deriveMemberId('sub-2'))
  assert.match(a, /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  assert.equal(
    identity.namesCompatible(
      { firstName: 'Ama', lastName: 'Koffi' },
      { first_name: 'AMA', last_name: 'Mensah' },
    ),
    true,
  )
  assert.equal(
    identity.namesCompatible(
      { firstName: 'Ama', lastName: 'Koffi' },
      { first_name: 'Yao', last_name: 'Agbeko' },
    ),
    false,
  )
  assert.equal(
    identity.namesCompatible({ firstName: '', lastName: '' }, { first_name: 'Yao' }),
    true,
  )
})

// ═══════════════════════════════════════════════════════════════════════════
// kobo-09 : la carte se cherche dans TOUT l'arbre de l'organisation
// ═══════════════════════════════════════════════════════════════════════════

test('hiérarchie : formulaire de récolte lié à la faîtière → carte d’un membre d’une coopérative fille retrouvée', async () => {
  const m = seedMember({ id: 'mem-k1' })
  seedCard('mem-k1', K1, 'FEN-111111')
  const { id, outcome } = await submit(
    payload({
      'S1/carte_membre': 'fen-111111',
      'S2/recoltes': [{ culture: 'Maïs', quantite_kg: 50 }],
    }),
    { formType: 'harvest' },
  )
  assert.equal(outcome.status, 'matched')
  assert.equal(rowOf(id).status, 'matched')
  assert.equal(rowOf(id).member_id, m.id)
  const prod = state.db.rows('productions')
  assert.equal(prod.length, 1)
  assert.equal(
    prod[0]?.cooperative_id,
    K1,
    'la production va dans la coopérative DU MEMBRE, pas dans la faîtière',
  )
})

test('hiérarchie : inscription avec une carte connue → rattachée au membre existant, aucun nouveau membre ni carte', async () => {
  seedMember({ id: 'mem-k1' })
  seedCard('mem-k1', K1, 'FEN-111111')
  const { id, outcome } = await submit(
    payload({
      'S1/carte_membre': 'FEN-111111',
      'S1/telephone': undefined,
      S5: [{ 'S5/culture_principale': 'Soja', 'S5/superficie_ha': '1,5' }],
    }),
  )
  assert.equal(outcome.status, 'matched')
  assert.equal(members().length, 1)
  assert.equal(cards().length, 1)
  assert.equal(rowOf(id).member_id, 'mem-k1')
  const parcelles = state.db.rows('parcelles')
  assert.equal(parcelles.length, 1)
  assert.equal(parcelles[0]?.cooperative_id, K1)
  assert.equal(parcelles[0]?.superficie_ha, 1.5, 'virgule décimale lue correctement')
})

test('carte : inactive ou renseignée mais inconnue → « unmatched » + motif, jamais d’inscription', async () => {
  seedMember({ id: 'mem-k1' })
  seedCard('mem-k1', K1, 'FEN-111111', { status: 'suspended' })
  const inactive = await submit(payload({ 'S1/carte_membre': 'FEN-111111' }))
  assert.equal(inactive.outcome.status, 'unmatched')
  assert.match(String(rowOf(inactive.id).error_message), /n'est pas active/)

  const unknown = await submit(payload({ 'S1/carte_membre': 'FEN-555555' }))
  assert.equal(unknown.outcome.status, 'unmatched')
  assert.match(String(rowOf(unknown.id).error_message), /Carte membre introuvable/)
  assert.equal(members().length, 1, 'aucun membre créé pour une carte inconnue')
})

test('champ clé configuré invalide → « unmatched » + motif au lieu d’une inscription en double', async () => {
  state.db.tables.kobo_field_mappings = [mapping('S1/carte_membre', 'card_number', true)]
  const { id, outcome } = await submit(payload({ 'S1/carte_membre': 'FEN-12' }))
  assert.equal(outcome.status, 'unmatched')
  assert.match(String(rowOf(id).error_message), /Numéro de carte invalide/)
  assert.equal(members().length, 0)
})

// ═══════════════════════════════════════════════════════════════════════════
// kobo-10 : champ clé « téléphone », normalisation, pas de doublon
// ═══════════════════════════════════════════════════════════════════════════

test('clé téléphone : membre existant retrouvé malgré un autre format, rattaché sans nouveau membre', async () => {
  state.db.tables.kobo_field_mappings = [mapping('S1/telephone', 'phone', true)]
  seedMember({ id: 'mem-k1', phone: '+228 92 54 88 38' })
  const { id, outcome } = await submit(payload({ 'S1/telephone': '92548838' }))
  assert.equal(outcome.status, 'matched')
  assert.equal(members().length, 1, 'aucun doublon')
  assert.equal(cards().length, 0, 'aucune carte émise pour un membre qui existait déjà')
  assert.equal(rowOf(id).member_id, 'mem-k1')
  assert.equal((rowOf(id).processed_payload as Row).mode, 'member_update')
})

test('téléphone partagé par une personne de NOM différent → signalé, pas fusionné', async () => {
  state.db.tables.kobo_field_mappings = [mapping('S1/telephone', 'phone', true)]
  seedMember({ id: 'mem-k1', first_name: 'Yao', last_name: 'Agbeko', phone: '+22892548838' })
  const { id, outcome } = await submit(payload({ 'S1/telephone': '92548838' }))
  assert.equal(outcome.status, 'unmatched')
  assert.match(String(rowOf(id).error_message), /autre nom/)
  assert.equal(members().length, 1)
})

test('même personne soumise deux fois (deux soumissions) → un seul membre, une seule carte', async () => {
  const first = await submit(payload({ 'S2/nom_cooperative': 'SCOOPS Kara' }))
  assert.equal(first.outcome.status, 'matched')
  const second = await submit(payload({ 'S2/nom_cooperative': 'SCOOPS Kara' }))
  assert.equal(second.outcome.status, 'matched')
  assert.equal(members().length, 1)
  assert.equal(cards().length, 1)
  assert.equal(rowOf(second.id).member_id, rowOf(first.id).member_id)
  assert.equal(members()[0]?.phone, '+22892548838', 'téléphone stocké en E.164')
  assert.equal(members()[0]?.cooperative_id, K1)
})

// ═══════════════════════════════════════════════════════════════════════════
// kobo-26 / kobo-09 : isolation entre organisations
// ═══════════════════════════════════════════════════════════════════════════

test('isolation : carte et téléphone d’un membre d’une AUTRE organisation ne sont jamais rapprochés', async () => {
  seedMember({ id: 'mem-x', cooperative_id: X, phone: '+22892548838' })
  seedCard('mem-x', X, 'FEN-999999')

  const byCard = await submit(payload({ 'S1/carte_membre': 'FEN-999999' }))
  assert.equal(byCard.outcome.status, 'unmatched')
  assert.match(String(rowOf(byCard.id).error_message), /Carte membre introuvable/)

  const harvest = await submit(
    payload({
      'S1/carte_membre': 'FEN-999999',
      'S2/recoltes': [{ culture: 'Maïs', quantite_kg: 5 }],
    }),
    { formType: 'harvest' },
  )
  assert.equal(harvest.outcome.status, 'unmatched')
  assert.equal(state.db.rows('productions').length, 0)

  // Même téléphone, même nom : hors de l'arbre → personne inconnue → inscription DANS l'arbre de R.
  const byPhone = await submit(payload({ 'S2/nom_cooperative': 'SCOOPS Kara' }))
  assert.equal(byPhone.outcome.status, 'matched')
  assert.equal(members().length, 2)
  const created = members().find((m) => m.id !== 'mem-x') as Row
  assert.equal(
    created.cooperative_id,
    K1,
    'la coopérative K1 de l’arbre, pas X (même nom dans l’autre arbre)',
  )
})

test('déduplication bornée à la coopérative : le même identifiant dans une autre coopérative n’est pas un doublon', async () => {
  const p = payload()
  assert.equal((await register(p, R)).kind, 'created')
  assert.equal((await register(p, R2)).kind, 'created')
  assert.equal((await register(p, R)).kind, 'duplicate')
  assert.equal(state.db.rows('kobo_submissions').length, 2)
})

test('coopérative du membre : correspondance EXACTE dans l’arbre, jamais de création ni de recherche floue', async () => {
  const coopsBefore = state.db.rows('cooperatives').length
  const phones = ['92000001', '92000002', '92000003', '92000004', '92000005']
  const ask = (name: string, i: number) =>
    submit(payload({ 'S1/telephone': phones[i], 'S2/nom_cooperative': name }))

  // Exact, malgré casse / accents / ponctuation.
  const exact = await ask('scoops  kara', 0)
  assert.equal(exact.outcome.status, 'matched')
  assert.equal(members()[0]?.cooperative_id, K1)
  const accents = await ask('SCOOPS Sokodé', 1)
  assert.equal(accents.outcome.status, 'matched')
  assert.equal(members()[1]?.cooperative_id, K2)

  // Nom partiel : « Kara » ne désigne PAS « SCOOPS Kara ».
  const partial = await ask('Kara', 2)
  assert.equal(partial.outcome.status, 'unmatched')
  assert.match(String(rowOf(partial.id).error_message), /introuvable.*nom exact/)

  // Nom d'une UNION ou de la faîtière : autre niveau, jamais retenu.
  const union = await ask('Union Kara', 3)
  assert.equal(union.outcome.status, 'unmatched')

  // Inconnue : aucune coopérative créée à partir du texte libre, aucun membre inscrit au mauvais endroit.
  const unknown = await ask('Coopérative Fantôme', 4)
  assert.equal(unknown.outcome.status, 'unmatched')
  assert.equal(state.db.rows('cooperatives').length, coopsBefore)
  assert.equal(members().length, 2)

  // Deux coopératives de même nom dans l'arbre : ambigu, signalé.
  state.db.rows('cooperatives').push({
    id: '10000000-0000-4000-8000-000000000009',
    name: 'SCOOPS Kara',
    level: 'cooperative',
    parent_id: R,
  })
  const ambiguous = await submit(
    payload({ 'S1/telephone': '92000006', 'S2/nom_cooperative': 'SCOOPS Kara' }),
  )
  assert.equal(ambiguous.outcome.status, 'unmatched')
  assert.match(String(rowOf(ambiguous.id).error_message), /Plusieurs coopératives/)
})

// ═══════════════════════════════════════════════════════════════════════════
// kobo-12 : carte non émise (quota)
// ═══════════════════════════════════════════════════════════════════════════

test('quota de cartes : ligne en erreur RELANÇABLE, sans numéro fantôme ni SMS ; la relance émet la carte', async () => {
  state.db.failInsert.member_cards = () => ({
    code: 'P0010',
    message:
      "Quota de cartes atteint. L'offre gratuite comprend 10 cartes numériques par coopérative.",
  })
  const id = idOf(await register(payload({ 'S2/nom_cooperative': 'SCOOPS Kara' })))
  await assert.rejects(() => run(id), /Carte non émise : quota de cartes atteint/)

  const row = rowOf(id)
  assert.equal(row.status, 'error', 'ni « matched » ni « processing » : explicite et relançable')
  assert.match(String(row.error_message), /Carte non émise/)
  assert.ok(!row.member_card_number, 'aucun numéro de carte fantôme sur la ligne')
  assert.equal(row.member_id, members()[0]?.id, 'le membre créé reste lié à la ligne')
  assert.equal(cards().length, 0)
  assert.equal(
    state.db.rows('notification_queue').length,
    0,
    'aucun SMS annonçant une carte inexistante',
  )

  // Quota relevé → « Retenter » : même membre, une carte, un SMS avec le VRAI numéro.
  state.db.failInsert = {}
  const retry = await run(id)
  assert.equal(retry.status, 'matched')
  assert.equal(members().length, 1)
  assert.equal(cards().length, 1)
  const cardNumber = String(cards()[0]?.card_number)
  assert.equal(rowOf(id).member_card_number, cardNumber)
  assert.equal(rowOf(id).status, 'matched')
  const sms = state.db.rows('notification_queue')
  assert.equal(sms.length, 1)
  assert.match(String(sms[0]?.body_rendered), new RegExp(cardNumber))
})

test('carte non émise : toute autre erreur d’insertion est lue et levée aussi', async () => {
  state.db.failInsert.member_cards = () => ({ code: '42501', message: 'permission denied' })
  const id = idOf(await register(payload()))
  await assert.rejects(() => run(id), /Carte non émise : permission denied/)
  assert.equal(rowOf(id).status, 'error')
})

// ═══════════════════════════════════════════════════════════════════════════
// kobo-13 : inscription rejouable après interruption
// ═══════════════════════════════════════════════════════════════════════════

test('rejouable : interruption entre la création du membre et la liaison de la ligne → la relance reprend SON membre', async () => {
  // Sans téléphone : le rapprochement ne peut pas « sauver » la reprise, seul l'identifiant déterministe le peut.
  const id = idOf(await register(payload({ 'S1/telephone': undefined })))
  state.db.failUpdate.kobo_submissions = (patch) =>
    'member_id' in patch ? { code: '08006', message: 'connection lost' } : null
  await assert.rejects(() => run(id), /Liaison de la soumission au membre impossible/)
  assert.equal(members().length, 1, 'le membre a été créé avant la coupure')
  assert.equal(rowOf(id).member_id ?? null, null, 'la ligne n’est pas liée')
  assert.equal(rowOf(id).status, 'error')

  state.db.failUpdate = {}
  const retry = await run(id)
  assert.equal(retry.status, 'matched')
  assert.equal(members().length, 1, 'pas de second membre pour la même soumission')
  assert.equal(cards().length, 1)
  assert.equal(rowOf(id).member_id, identity.deriveMemberId(id))
})

test('rejouable : parcelles et productions ne sont pas dupliquées par une seconde exécution', async () => {
  const p = payload({
    S5: [
      { 'S5/culture_principale': 'Maïs', 'S5/superficie_ha': '2' },
      { 'S5/culture_principale': 'Maïs', 'S5/superficie_ha': '1' },
    ],
    S6: [{ 'S6/culture_produite': 'Maïs', 'S6/rendement_kg': '500', 'S6/campagne_annee': '2025' }],
  })
  const { id } = await submit(p)
  assert.equal(state.db.rows('parcelles').length, 2)
  assert.equal(state.db.rows('productions').length, 1)

  // Rejeu complet de la même ligne (ex. interruption juste avant le statut final).
  Object.assign(rowOf(id), { status: 'error' })
  await run(id)
  assert.equal(state.db.rows('parcelles').length, 2)
  assert.equal(state.db.rows('productions').length, 1)
  assert.equal(members().length, 1)
})

// ═══════════════════════════════════════════════════════════════════════════
// kobo-14 : verrou par soumission
// ═══════════════════════════════════════════════════════════════════════════

test('verrou : webhook, synchronisation et « Retenter » simultanés → UN seul traitement, les autres « skipped »', async () => {
  const id = idOf(await register(payload()))
  const [a, b, c] = await Promise.all([run(id), run(id), run(id)])
  const statuses = [a, b, c].map((o) => o.status).sort()
  assert.deepEqual(statuses, ['matched', 'skipped', 'skipped'])
  assert.equal(members().length, 1)
  assert.equal(cards().length, 1)
  assert.equal(state.db.rows('notification_queue').length, 1)
  assert.equal(rowOf(id).status, 'matched')
})

test('verrou : une ligne « processing » récente n’est pas reprise, une ligne périmée l’est ; une ligne traitée non plus', async () => {
  const id = idOf(await register(payload()))
  Object.assign(rowOf(id), { status: 'processing', updated_at: new Date().toISOString() })
  const busy = await run(id)
  assert.equal(busy.status, 'skipped')
  assert.match(String(busy.detail), /en cours/)
  assert.equal(members().length, 0)

  Object.assign(rowOf(id), { updated_at: new Date(Date.now() - 6 * 60_000).toISOString() })
  assert.equal((await run(id)).status, 'matched', 'verrou périmé (exécution interrompue) : repris')

  const done = await run(id)
  assert.equal(done.status, 'skipped', 'déjà traitée')
  assert.equal(members().length, 1)
})

test('verrou : un échec de traitement libère la ligne (« error », relançable), il ne la laisse pas « processing »', async () => {
  state.db.failInsert.members = () => ({ code: '08006', message: 'connection lost' })
  const id = idOf(await register(payload()))
  await assert.rejects(() => run(id), /Failed to create member/)
  assert.equal(rowOf(id).status, 'error')
  state.db.failInsert = {}
  assert.equal((await run(id)).status, 'matched')
})

// ═══════════════════════════════════════════════════════════════════════════
// kobo-19 : soumission modifiée
// ═══════════════════════════════════════════════════════════════════════════

test('modification : même rootUuid → la ligne et le membre sont MIS À JOUR, pas réinscrits', async () => {
  const v1 = payload({
    'S1/telephone': undefined,
    S5: [{ 'S5/culture_principale': 'Maïs', 'S5/superficie_ha': '2' }],
  })
  const { id } = await submit(v1)
  assert.equal(members().length, 1)
  const memberId = String(rowOf(id).member_id)

  // Enketo : nouvel _uuid, même _id et même meta/rootUuid, deprecatedID = version précédente.
  const v2 = {
    ...v1,
    _uuid: 'edited-uuid',
    'meta/deprecatedID': v1['meta/rootUuid'],
    'S1/prenom': 'Amélie',
    S5: [{ 'S5/culture_principale': 'Maïs', 'S5/superficie_ha': '3' }],
  }
  const edited = await register(v2)
  assert.equal(edited.kind, 'edited')
  assert.equal(idOf(edited), id, 'même ligne')
  assert.equal(rowOf(id).status, 'pending', 'remise en file')

  const outcome = await run(id)
  assert.equal(outcome.status, 'matched')
  assert.equal(state.db.rows('kobo_submissions').length, 1)
  assert.equal(members().length, 1, 'aucun second membre')
  assert.equal(cards().length, 1, 'aucune seconde carte (le quota n’est pas consommé)')
  assert.equal(members()[0]?.id, memberId)
  assert.equal(members()[0]?.first_name, 'Amélie')
  const parcelles = state.db.rows('parcelles')
  assert.equal(parcelles.length, 1)
  assert.equal(parcelles[0]?.superficie_ha, 3, 'la parcelle est mise à jour, pas dupliquée')
  assert.equal((rowOf(id).raw_payload as Row)._uuid, 'edited-uuid')

  // Même version reçue une seconde fois : simple doublon.
  assert.equal((await register(v2)).kind, 'duplicate')
})

test('modification : reçue PENDANT le traitement → « busy », contenu de la ligne inchangé ; lignes héritées (clé = _uuid) retrouvées', async () => {
  const v1 = payload()
  const id = idOf(await register(v1))
  Object.assign(rowOf(id), { status: 'processing' })
  const during = await register({
    ...v1,
    _uuid: 'edited-2',
    'meta/deprecatedID': v1['meta/rootUuid'],
  })
  assert.equal(during.kind, 'busy')
  assert.equal((rowOf(id).raw_payload as Row)._uuid, v1._uuid)

  // Ligne héritée de l'ancien code : clé = _uuid, sans raw_payload exploitable → jamais réimportée.
  state.db.rows('kobo_submissions').push({
    id: 'legacy',
    cooperative_id: R,
    kobo_instance_id: 'legacy-root',
    status: 'matched',
  })
  const again = await register(
    payload({
      _uuid: 'legacy-edit',
      'meta/rootUuid': 'uuid:legacy-root',
      'meta/deprecatedID': 'uuid:legacy-root',
    }),
  )
  assert.equal(again.kind, 'duplicate')
  assert.equal(state.db.rows('kobo_submissions').length, 2)
})

// ═══════════════════════════════════════════════════════════════════════════
// kobo-27 : inscription d'une coopérative bornée à l'arbre
// ═══════════════════════════════════════════════════════════════════════════

async function registration(over: Record<string, unknown>) {
  const p = payload({ 'C1/nom_cooperative': 'Coop Nouvelle', ...over })
  const id = idOf(await register(p))
  await enrollment.processCooperativeRegistration(id, R, p)
  return id
}
const coopNamed = (name: string, parent?: string) =>
  state.db
    .rows('cooperatives')
    .filter((c) => c.name === name && (parent === undefined || c.parent_id === parent))

test('inscription de coopérative : nouvelle coopérative sous l’union désignée (nom exact), ligne « matched »', async () => {
  const id = await registration({
    'C1/niveau': 'cooperative',
    'C1/nom_union_parente': 'union kara',
  })
  const created = coopNamed('Coop Nouvelle')
  assert.equal(created.length, 1)
  assert.equal(created[0]?.parent_id, U)
  assert.equal(created[0]?.level, 'cooperative')
  assert.equal(rowOf(id).status, 'matched')
})

test('inscription de coopérative : une coopérative de MÊME NOM dans une autre organisation n’est ni lue ni modifiée', async () => {
  state.db.rows('cooperatives').push({
    id: '20000000-0000-4000-8000-000000000003',
    name: 'Coop Partagée',
    level: 'cooperative',
    parent_id: R2,
    faitiere_name: 'FENAFAT', // même libellé de faîtière : ne doit rien changer
  })
  await registration({
    'C1/nom_cooperative': 'Coop Partagée',
    'C1/nom_union_parente': 'Union Kara',
  })
  const other = state.db
    .rows('cooperatives')
    .find((c) => c.id === '20000000-0000-4000-8000-000000000003') as Row
  assert.equal(other.parent_id, R2, 'parent_id de l’autre organisation intact')
  assert.equal(
    coopNamed('Coop Partagée').length,
    2,
    'une nouvelle coopérative est créée dans NOTRE arbre',
  )
  assert.equal(coopNamed('Coop Partagée', U).length, 1)
})

test('inscription de coopérative : niveau racine, union parente inconnue, racine et changement de niveau refusés', async () => {
  const before = state.db.rows('cooperatives').length
  await assert.rejects(() => registration({ 'C1/niveau': 'faitiere' }), /Niveau « faitiere »/)
  await assert.rejects(
    () => registration({ 'C1/nom_union_parente': 'Union Inconnue' }),
    /Union parente « Union Inconnue » introuvable/,
  )
  await assert.rejects(
    () => registration({ 'C1/nom_cooperative': 'FENAFAT', 'C1/niveau': 'union' }),
    /racine/,
  )
  await assert.rejects(
    () => registration({ 'C1/nom_cooperative': 'SCOOPS Kara', 'C1/niveau': 'union' }),
    /niveau n'est pas modifié/,
  )
  assert.equal(state.db.rows('cooperatives').length, before)

  // Une coopérative existante de l'arbre est mise à jour (description), sans changer de niveau.
  await registration({ 'C1/nom_cooperative': 'SCOOPS Sokodé', 'C1/description': 'Maïs bio' })
  assert.equal((coopNamed('SCOOPS Sokodé')[0] as Row).description, 'Maïs bio')
  assert.equal(coopNamed('SCOOPS Kara', R2)[0]?.description, undefined)
})

// ═══════════════════════════════════════════════════════════════════════════
// kobo-28 : médias sous le dossier de la coopérative du membre
// ═══════════════════════════════════════════════════════════════════════════

const attachmentPayload = () =>
  payload({
    'S1/telephone': undefined,
    'S1/photo_membre': 'photo-1.jpg',
    'S7/signature_membre': 'sig-1.png',
    _attachments: [
      {
        download_url: 'https://kf.kobotoolbox.org/api/v2/assets/a/data/1/attachments/10/',
        filename: 'u/attachments/f/i/photo-1.jpg',
        mimetype: 'image/jpeg',
        question_xpath: 'S1/photo_membre',
        uid: 'att10',
        id: 10,
      },
      {
        download_url: 'https://kf.kobotoolbox.org/api/v2/assets/a/data/1/attachments/11/',
        filename: 'u/attachments/f/i/sig-1.png',
        mimetype: 'image/png',
        question_xpath: 'S7/signature_membre',
        uid: 'att11',
        id: 11,
      },
    ],
  })

function stubKoboFiles(status = 200) {
  const urls: string[] = []
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    urls.push(String(input))
    assert.equal((init?.headers as Record<string, string>).Authorization, `Token ${TOKEN}`)
    return status === 200 ? new Response(Buffer.from('binary')) : new Response('refusé', { status })
  }) as typeof fetch
  return urls
}

test('média : photo et signature rangées sous <coopérative du membre>/kobo/<membre>/ (inscription ET rattrapage)', async () => {
  stubKoboFiles()
  const { id } = await submit(attachmentPayload(), { formType: 'member_enrollment' })
  // Inscription : membre dans la faîtière R (aucun nom de coopérative) → dossier R.
  const memberId = String(rowOf(id).member_id)
  const uploads = state.db.uploads
  assert.equal(uploads.length, 2)
  assert.ok(
    uploads.every((u) => u.path.startsWith(`${R}/kobo/${memberId}/`)),
    JSON.stringify(uploads),
  )
  assert.deepEqual(uploads.map((u) => u.bucket).sort(), ['member-photos', 'member-signatures'])
  assert.match(String(members()[0]?.photo_url), /member-photos/)
  assert.match(String(members()[0]?.signature_url), /member-signatures/)

  // Rattrapage (relance d'un admin) pour un membre EXISTANT d'une coopérative fille sans signature.
  state.db.uploads.length = 0
  const old = seedMember({
    id: 'mem-k1',
    phone: '+22892547777',
    signature_url: null,
    photo_url: 'https://x/p.jpg',
  })
  seedCard('mem-k1', K1, 'FEN-222222')
  await submit({ ...attachmentPayload(), 'S1/carte_membre': 'FEN-222222' })
  assert.equal(state.db.uploads.length, 1, 'seule la signature manquante est rapatriée')
  assert.ok(
    state.db.uploads[0]?.path.startsWith(`${K1}/kobo/${old.id}/signature-`),
    JSON.stringify(state.db.uploads),
  )
  assert.match(String(members().find((m) => m.id === 'mem-k1')?.signature_url), /member-signatures/)
})

test('média : un échec est CONSIGNÉ (processed_payload.media_errors + avertissement), la ligne reste « matched », jamais de token', async () => {
  stubKoboFiles(403)
  const { id, outcome } = await submit(attachmentPayload())
  assert.equal(outcome.status, 'matched')
  const row = rowOf(id)
  assert.equal(row.status, 'matched')
  const errors = (
    row.processed_payload as { media_errors?: Array<{ field: string; reason: string }> }
  ).media_errors
  assert.deepEqual(errors?.map((e) => e.field).sort(), ['photo', 'signature'])
  assert.match(String(row.error_message), /Média non stocké \(photo, signature\)/)
  assert.ok(!JSON.stringify(row).includes(TOKEN))
  assert.ok(!logged.join('\n').includes(TOKEN))

  // Sans token exploitable : explicite aussi.
  const stored = await media.storeKoboMedia(state.db as never, {
    payload: attachmentPayload(),
    apiToken: null,
    cooperativeId: K1,
    memberId: 'm',
    want: { photo: true, signature: false },
  })
  assert.match(stored.errors[0]?.reason ?? '', /jeton API Kobo indisponible/)

  // Hôte hors du serveur configuré : refusé.
  const foreign = attachmentPayload()
  const firstAttachment = (foreign._attachments as Array<Record<string, string>>)[0]
  if (firstAttachment) firstAttachment.download_url = 'https://evil.example/x'
  const refused = await media.storeKoboMedia(state.db as never, {
    payload: foreign,
    apiToken: TOKEN,
    cooperativeId: K1,
    memberId: 'm',
    want: { photo: true, signature: false },
  })
  assert.match(refused.errors[0]?.reason ?? '', /refusée/)
})

test('média : échec du stockage lu et consigné (policy de stockage), sans interrompre l’inscription', async () => {
  stubKoboFiles()
  state.db.failUpload = () => ({ message: 'new row violates row-level security policy' })
  const { id, outcome } = await submit(attachmentPayload())
  assert.equal(outcome.status, 'matched')
  const errors = (rowOf(id).processed_payload as { media_errors?: Array<{ reason: string }> })
    .media_errors
  assert.match(errors?.[0]?.reason ?? '', /stockage impossible/)
})
