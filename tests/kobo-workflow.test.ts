import assert from 'node:assert/strict'
import { beforeEach, test } from 'node:test'
import type * as Configuration from '../app/api/integrations/kobo/route'
import type * as SyncRoute from '../app/api/integrations/kobo/sync/route'
import type * as Webhook from '../app/api/webhooks/kobo/route'
import type * as Enrollment from '../lib/kobo/enrollment'
import { normalizeKoboPayload } from '../lib/kobo/normalize'
import type * as Processing from '../lib/kobo/processing'
import type * as Synchronization from '../lib/kobo/sync-service'
import { installStubs, resetStore } from './fiches-fake-db'

const state = installStubs()
const pending: Promise<unknown>[] = []
const Module = require('node:module') as { _load: (r: string, p: unknown, m: boolean) => unknown }
let pullSuccess = true
let retryFailures = 0
const configClient = {
  from(table: string) {
    const query = state.session.from(table)
    return Object.assign(query, {
      upsert: async (row: Record<string, unknown>) => {
        const current = state.store
          .rows(table)
          .find((r) => r.cooperative_id === row.cooperative_id && r.type === row.type)
        if (current) Object.assign(current, row)
        else state.store.rows(table).push(row)
        return { error: null }
      },
    })
  },
}
const originalLoad = Module._load
Module._load = function (r, p, m) {
  if (r === '@/lib/utils/crypto')
    return {
      encryptSecret: () => 'v1.test-encrypted',
      decryptSecret: () => 'test-token',
      isEncrypted: () => true,
    }
  if (r === '@/lib/security/assert-access') {
    const guard = async () => ({
      ok: true,
      ctx: { userId: ROOT, role: 'super_admin', supabase: configClient },
    })
    return {
      assertAuthenticated: guard,
      assertFaitiereAccess: guard,
      assertTenantAccess: guard,
      assertRole: guard,
    }
  }
  if (r === '@/lib/kobo/sync-service')
    return {
      KoboSyncService: class {
        async testConnection() {
          return { valid: true, formTitle: 'Test' }
        }
        async pullSubmissions() {
          return {
            success: pullSuccess,
            syncLogId: 'sync',
            received: 0,
            processed: 0,
            matched: 0,
            unmatched: 0,
            errors: pullSuccess ? 0 : 1,
            duration: 1,
          }
        }
        async retryFailedSubmissions() {
          return { succeeded: 0, failed: retryFailures }
        }
      },
    }
  if (r === '@vercel/functions') return { waitUntil: (job: Promise<unknown>) => pending.push(job) }
  if (r === '@/lib/utils/rate-limit-persistent') return { applyRateLimit: async () => null }
  if (r === '@/lib/photos/process-photo') return { processPhotoFaceCrop: async () => null }
  return originalLoad.call(this, r, p, m)
}
const { enrollNewMemberFromSubmission } = require('../lib/kobo/enrollment') as typeof Enrollment
const { processCardSubmission, finishMemberEnrollment } =
  require('../lib/kobo/processing') as typeof Processing
const { KoboSyncService } = require('../lib/kobo/sync-service') as typeof Synchronization
const webhook = require('../app/api/webhooks/kobo/route') as typeof Webhook
const { NextRequest } = require('next/server') as typeof import('next/server')
const ROOT = '11111111-1111-4111-8111-111111111111'
const CHILD = '22222222-2222-4222-8222-222222222222'
const payload = () => ({
  _uuid: 'field-submission-1',
  _id: 123,
  _xform_id_string: 'asset123',
  _submission_time: '2026-10-24T09:00:00',
  'S1/nom_complet': 'Kossi Agbo',
  'S1/telephone': '90112233',
  'S1/consentement_donnees': 'oui',
  S5: [],
  S6: [],
})

beforeEach(() => {
  resetStore(state)
  pending.length = 0
  pullSuccess = true
  retryFailures = 0
  process.env.KOBO_WEBHOOK_SECRET = 'a-kobo-test-secret-with-at-least-32-characters'
  state.store
    .rows('cooperatives')
    .push(
      { id: ROOT, name: 'Faîtière', deleted_at: null },
      { id: CHILD, name: 'Coopérative', parent_id: ROOT, deleted_at: null },
    )
  state.store.rows('kobo_submissions').push({
    id: 'submission',
    cooperative_id: ROOT,
    kobo_instance_id: 'field-submission-1',
    kobo_form_id: 'asset123',
    status: 'pending',
    raw_payload: payload(),
  })
  state.admin.rpcHandlers.get_cooperative_descendants = () => ({
    data: [{ id: ROOT }, { id: CHILD }],
    error: null,
  })
  state.admin.rpcHandlers.process_kobo_submission = (args) => {
    const id = (args as { p_submission_id: string }).p_submission_id
    const row = state.store.rows('kobo_submissions').find((s) => s.id === id)
    if (row) Object.assign(row, { processed_at: new Date().toISOString(), status: 'matched' })
    return { data: { success: true }, error: null }
  }
  state.session.rpcHandlers = state.admin.rpcHandlers
})

test('enrôlement : membre, vraie carte, lien et traitement agricole', async () => {
  await enrollNewMemberFromSubmission('submission', ROOT)
  assert.equal(state.store.rows('members').length, 1)
  assert.equal(state.store.rows('member_cards').length, 1)
  const submission = state.store.rows('kobo_submissions')[0]
  assert.equal(submission?.status, 'matched')
  assert.equal(submission?.member_card_number, state.store.rows('member_cards')[0]?.card_number)
  assert.ok(submission?.processed_at)
  assert.ok(state.store.rpcCalls.some((r) => r.name === 'process_kobo_submission'))
})

test('quota atteint : le membre reste lié, aucune carte fictive ni SMS ; reprise sans doublon', async () => {
  state.store.failInsert.member_cards = { code: 'P0010', message: 'Quota gratuit atteint' }
  await assert.rejects(enrollNewMemberFromSubmission('submission', ROOT), /carte non émise/)
  const submission = state.store.rows('kobo_submissions')[0]
  assert.ok(submission?.member_id)
  assert.equal(submission?.member_card_number, undefined)
  assert.notEqual(submission?.status, 'matched')
  assert.equal(state.store.rows('member_cards').length, 0)
  assert.equal(state.store.rows('notification_queue').length, 0)
  // The operator has corrected the issuance condition; Retenter resumes the saved member.
  state.store.failInsert.member_cards = null
  const result = await new KoboSyncService().retrySingleSubmission(ROOT, 'submission')
  assert.equal(result.succeeded, 1)
  assert.equal(state.store.rows('members').length, 1)
  assert.equal(state.store.rows('member_cards').length, 1)
  assert.equal(state.store.rows('kobo_submissions')[0]?.status, 'matched')
})

test('un RPC agricole en échec interdit de déclarer un succès', async () => {
  state.admin.rpcHandlers.process_kobo_submission = () => ({
    data: null,
    error: { message: 'SQL failure' },
  })
  await assert.rejects(enrollNewMemberFromSubmission('submission', ROOT), /SQL failure/)
  assert.notEqual(state.store.rows('kobo_submissions')[0]?.status, 'matched')
})

test('refus de consentement : aucun membre ni carte', async () => {
  const refused = { ...payload(), 'S1/consentement_donnees': 'non' }
  Object.assign(state.store.rows('kobo_submissions')[0] ?? {}, { raw_payload: refused })
  await assert.rejects(enrollNewMemberFromSubmission('submission', ROOT), /Consentement/)
  assert.equal(state.store.rows('members').length, 0)
})

test('une carte déjà active est conservée et aucun crédit PAYG n’est consommé', async () => {
  state.store.rows('members').push({ id: 'member', cooperative_id: CHILD })
  state.store.rows('member_cards').push({
    member_id: 'member',
    cooperative_id: CHILD,
    card_number: 'FEN-123456',
    status: 'active',
  })
  const number = await finishMemberEnrollment(state.admin as never, 'submission', ROOT, 'member')
  assert.equal(number, 'FEN-123456')
  assert.equal(state.store.rows('member_cards').length, 1)
  assert.ok(!state.store.rpcCalls.some((r) => r.name.startsWith('payg_')))
})

test('membre d’une autre faîtière : émission refusée', async () => {
  state.store.rows('members').push({ id: 'outsider', cooperative_id: 'other-root' })
  await assert.rejects(
    finishMemberEnrollment(state.admin as never, 'submission', ROOT, 'outsider'),
    /n’appartient pas/,
  )
  assert.equal(state.store.rows('member_cards').length, 0)
})

test('carte existante : rapprochement puis import ; erreur métier du RPC propagée', async () => {
  state.admin.rpcHandlers.match_kobo_submission_to_member = () => {
    Object.assign(state.store.rows('kobo_submissions')[0] ?? {}, {
      member_id: 'member',
      status: 'matched',
    })
    return { data: null, error: null }
  }
  await processCardSubmission(state.admin as never, 'submission')
  assert.deepEqual(
    state.store.rpcCalls.map((r) => r.name),
    ['match_kobo_submission_to_member', 'process_kobo_submission'],
  )
  state.admin.rpcHandlers.process_kobo_submission = () => ({
    data: { success: false, error: 'No matched member' },
    error: null,
  })
  await assert.rejects(
    processCardSubmission(state.admin as never, 'submission'),
    /No matched member/,
  )
})

function request(body: unknown, authenticated = true) {
  return new NextRequest('https://local.test/api/webhooks/kobo', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: {
      'content-type': 'application/json',
      ...(authenticated ? { 'x-kobo-secret': process.env.KOBO_WEBHOOK_SECRET ?? '' } : {}),
    },
  })
}
function connect() {
  state.store.tables.kobo_submissions = []
  state.store.rows('integrations').push({
    id: 'integration',
    type: 'kobo',
    status: 'connected',
    cooperative_id: ROOT,
    config: { form_id: 'asset123' },
    'config->>form_id': 'asset123',
  })
}

test('webhook : sans secret 403 et aucune écriture', async () => {
  const result = await webhook.POST(request(payload(), false))
  assert.equal(result.status, 403)
  assert.ok(!state.store.ops.some((op) => op.op === 'insert'))
})

test('webhook : panne de stockage → 503 pour permettre les retries Kobo', async () => {
  connect()
  state.store.failInsert.kobo_submissions = { message: 'Database unavailable' }
  const result = await webhook.POST(request(payload()))
  assert.equal(result.status, 503)
  assert.equal(pending.length, 0)
})

test('webhook complet : deux livraisons de la même collecte → un membre et une carte', async () => {
  connect()
  const first = await webhook.POST(request(payload()))
  assert.equal(first.status, 200)
  await Promise.all(pending)
  assert.equal(state.store.rows('members').length, 1)
  assert.equal(state.store.rows('member_cards').length, 1)
  assert.equal(state.store.rows('kobo_submissions')[0]?.status, 'matched')
  const second = await webhook.POST(request(payload()))
  assert.equal((await second.json()).status, 'duplicate')
  assert.equal(state.store.rows('members').length, 1)
})

const mapping = (kobo_field: string, target_table: string, target_column: string) => ({
  kobo_field,
  target_table,
  target_column,
  transform_fn: null,
})

test('formulaire modifié : noms techniques renommés via les correspondances, aucune recompilation', async () => {
  const raw = {
    ...payload(),
    'S1/nom_complet': undefined,
    identite: { prenom: 'Ama', nom: 'Kpogo' },
    nouveau_champ: 4,
  }
  state.store
    .rows('kobo_field_mappings')
    .push(
      ...[
        mapping('identite/prenom', 'members', 'first_name'),
        mapping('identite/nom', 'members', 'last_name'),
      ].map((m) => ({ ...m, cooperative_id: ROOT, form_id: 'asset123' })),
    )
  Object.assign(state.store.rows('kobo_submissions')[0] ?? {}, { raw_payload: raw })
  await enrollNewMemberFromSubmission('submission', ROOT)
  assert.equal(state.store.rows('members')[0]?.first_name, 'Ama')
  assert.equal(state.store.rows('members')[0]?.last_name, 'Kpogo')
  assert.equal(
    (state.store.rows('kobo_submissions')[0]?.raw_payload as Record<string, unknown>).nouveau_champ,
    4,
  )
  assert.equal(raw.identite.prenom, 'Ama')
})

test('groupes répétés renommés : superficies et cultures traduites, champs bruts conservés', () => {
  const raw = {
    terrain: {
      parcelles: [{ 'terrain/parcelles/culture': 'maïs', surface: '2,5', autre: 'note' }],
    },
  }
  const normalized = normalizeKoboPayload(raw, [
    mapping('terrain/parcelles/culture', 'parcelles', 'culture_principale'),
    {
      ...mapping('terrain/parcelles/surface', 'parcelles', 'superficie_ha'),
      transform_fn: 'to_number',
    },
  ])
  assert.deepEqual(normalized.S5, [{ 'S5/culture_principale': 'maïs', 'S5/superficie_ha': '2.5' }])
  assert.equal(raw.terrain.parcelles[0]?.autre, 'note')
})

test('une nouvelle question ou une cible de privilège ne crée aucune colonne ni droit', () => {
  const raw = { question_libre: 'oui', role: 'super_admin' }
  const normalized = normalizeKoboPayload(raw, [mapping('role', 'members', 'role')])
  assert.deepEqual(normalized, raw)
  assert.ok(!('S1/prenom' in normalized))
})

test('nom complet du formulaire historique : le mapping existant conserve prénom et nom', () => {
  const normalized = normalizeKoboPayload(payload(), [
    mapping('S1/nom_complet', 'members', 'first_name'),
  ])
  assert.equal(normalized['S1/nom_complet'], 'Kossi Agbo')
  assert.ok(!('S1/prenom' in normalized))
})

const configurationRoute = require('../app/api/integrations/kobo/route') as typeof Configuration
const synchronizationRoute = require('../app/api/integrations/kobo/sync/route') as typeof SyncRoute
const configRequest = (formId = 'asset123') =>
  request({ cooperativeId: ROOT, formId, apiToken: 't'.repeat(40), webhookEnabled: true })

test('modifier les correspondances ne perd ni le type de formulaire ni la date du dernier import', async () => {
  state.store.rows('integrations').push({
    cooperative_id: ROOT,
    type: 'kobo',
    status: 'connected',
    last_sync_at: '2026-10-01T00:00:00Z',
    config: { form_id: 'asset123', form_type: 'cooperative_registration' },
  })
  assert.equal((await configurationRoute.POST(configRequest())).status, 200)
  assert.equal(state.store.rows('integrations')[0]?.last_sync_at, '2026-10-01T00:00:00Z')
  assert.equal(
    (state.store.rows('integrations')[0]?.config as Record<string, unknown>).form_type,
    'cooperative_registration',
  )
  assert.equal((await configurationRoute.POST(configRequest('otherAsset'))).status, 200)
  assert.equal(state.store.rows('integrations')[0]?.last_sync_at, null)
})

test('première connexion : aucun curseur ne saute les collectes antérieures', async () => {
  assert.equal((await configurationRoute.POST(configRequest())).status, 200)
  assert.equal(state.store.rows('integrations')[0]?.last_sync_at, null)
})

test('une synchronisation ou une reprise en échec ne fait pas avancer le curseur', async () => {
  state.store.rows('integrations').push({
    cooperative_id: ROOT,
    type: 'kobo',
    status: 'connected',
    last_sync_at: '2026-10-01T00:00:00Z',
    config: { form_id: 'asset123', api_key: 'v1.encrypted' },
  })
  const sync = () => synchronizationRoute.POST(request({ cooperativeId: ROOT, mode: 'full' }))
  pullSuccess = false
  assert.equal((await (await sync()).json()).success, false)
  assert.equal(state.store.rows('integrations')[0]?.last_sync_at, '2026-10-01T00:00:00Z')
  pullSuccess = true
  retryFailures = 1
  assert.equal((await (await sync()).json()).success, false)
  assert.equal(state.store.rows('integrations')[0]?.last_sync_at, '2026-10-01T00:00:00Z')
})

test('pull réel du service : le téléphone marqué clé n’empêche pas de reconnaître une carte', async () => {
  state.store
    .rows('integrations')
    .push({ cooperative_id: ROOT, type: 'kobo', status: 'connected', config: {} })
  state.store
    .rows('members')
    .push({ id: 'member', cooperative_id: ROOT, first_name: 'Kossi', last_name: 'Agbo' })
  state.store
    .rows('member_cards')
    .push({
      member_id: 'member',
      cooperative_id: ROOT,
      card_number: 'FEN-123456',
      status: 'active',
    })
  state.store
    .rows('kobo_field_mappings')
    .push({
      ...mapping('S1/telephone', 'members', 'phone'),
      cooperative_id: ROOT,
      form_id: 'asset123',
      is_key_field: true,
    })
  state.session.rpcHandlers.match_kobo_submission_to_member = (args) => {
    const id = (args as { p_submission_id: string }).p_submission_id
    const row = state.store.rows('kobo_submissions').find((s) => s.id === id)
    if (row) Object.assign(row, { status: 'matched', member_id: 'member' })
    return { data: null, error: null }
  }
  const oldFetch = globalThis.fetch
  globalThis.fetch = async () =>
    Response.json({
      count: 1,
      next: null,
      results: [{ ...payload(), _uuid: 'second-collection', member_card_number: 'FEN-123456' }],
    })
  try {
    const result = await new KoboSyncService().pullSubmissions({
      cooperativeId: ROOT,
      formId: 'asset123',
      apiToken: 'test-only',
    })
    assert.equal(result.success, true)
    assert.ok(state.store.rpcCalls.some((r) => r.name === 'match_kobo_submission_to_member'))
    assert.equal(state.store.rows('members').length, 1)
    assert.equal(state.store.rows('member_cards').length, 1)
  } finally {
    globalThis.fetch = oldFetch
  }
})
