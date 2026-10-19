import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  KoboApiClient,
  KoboApiError,
  mapKoboHttpError,
  parseRetryAfterMs,
  scrubSecrets,
} from '../lib/kobo/api-client'
import { isAllowedKoboAttachmentUrl } from '../lib/kobo/attachment-url'
import {
  buildWebhookUrl,
  incrementalSince,
  mergeKoboConfig,
  readKoboConfig,
  stripKoboConnectionKeys,
} from '../lib/kobo/config'
import { parseKoboFormInput } from '../lib/kobo/form-id'
import { createKoboHostGuard } from '../lib/kobo/host-guard'
import {
  isPrivateIp,
  koboApiBase,
  koboAttachmentHosts,
  parseKoboServerUrl,
} from '../lib/kobo/server-url'
import { decideSyncOutcome } from '../lib/kobo/sync-policy'
import type { SyncResult } from '../lib/kobo/types'
import {
  createFailureThrottle,
  extractPresentedSecret,
  generateWebhookSecret,
  hashWebhookSecret,
  verifyWebhookSecret,
} from '../lib/kobo/webhook-auth'
import {
  koboApiTokenSchema,
  koboConfigSchema,
  koboTestConnectionRequestSchema,
  koboWebhookPayloadSchema,
} from '../lib/validators/kobo'

const TOKEN = 'a1b2c3d4e5f6a7b8c9d0a1b2c3d4e5f6a7b8c9d0'
const UID = 'aBcDeFgHiJkLmNoPqRsTuV'
const COOP = '11111111-1111-4111-8111-111111111111'

// ── Faux fetch ───────────────────────────────────────────────────────────────

interface Call {
  url: URL
  headers: Record<string, string>
  redirect?: string
}

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  })
}

/** Renvoie un fetch qui répond à la file donnée (ou appelle une fonction) et enregistre les appels. */
function fakeFetch(handler: (call: Call, index: number) => Response | Promise<Response> | Error) {
  const calls: Call[] = []
  const impl = (async (input: string | URL | Request, init?: RequestInit) => {
    const call: Call = {
      url: new URL(String(input)),
      headers: { ...(init?.headers as Record<string, string>) },
      redirect: init?.redirect,
    }
    calls.push(call)
    const out = await handler(call, calls.length - 1)
    if (out instanceof Error) throw out
    return out
  }) as typeof fetch
  return { impl, calls }
}

function makeClient(
  fetchImpl: typeof fetch,
  extra: Partial<ConstructorParameters<typeof KoboApiClient>[0]> = {},
  sleeps: number[] = [],
) {
  return new KoboApiClient({
    serverUrl: 'https://kf.kobotoolbox.org',
    apiToken: TOKEN,
    fetchImpl,
    sleep: async (ms) => {
      sleeps.push(ms)
    },
    ...extra,
  })
}

// ═══════════════════════════════════════════════════════════════════════════
// kobo-05 · serveur configurable, validé contre le SSRF
// ═══════════════════════════════════════════════════════════════════════════

test('serveur : Global, UE et auto-hébergé https acceptés, normalisés en origine', () => {
  for (const [input, origin] of [
    ['https://kf.kobotoolbox.org', 'https://kf.kobotoolbox.org'],
    ['https://eu.kobotoolbox.org/', 'https://eu.kobotoolbox.org'],
    ['eu.kobotoolbox.org', 'https://eu.kobotoolbox.org'],
    ['  HTTPS://Kobo.Mon-Organisation.ORG/kpi/#/forms/x ', 'https://kobo.mon-organisation.org'],
  ] as const) {
    const r = parseKoboServerUrl(input)
    assert.ok(r.ok, `${input} devrait être accepté`)
    assert.equal(r.ok && r.origin, origin)
  }
})

test('serveur : http, identifiants, port, IP, localhost et réseaux internes sont refusés', () => {
  for (const bad of [
    'http://kf.kobotoolbox.org',
    'ftp://kobo.example.org',
    'https://user:pw@kobo.example.org',
    'https://kobo.example.org:8443',
    'https://127.0.0.1',
    'https://10.0.0.5',
    'https://169.254.169.254',
    'https://192.168.1.10',
    'https://[::1]',
    'https://2130706433', // 127.0.0.1 en décimal
    'https://0x7f.1',
    'https://localhost',
    'https://api.localhost',
    'https://kobo.internal',
    'https://kobo.local',
    'https://intranet',
    'https://kobo.lan',
    'https://exa mple.org',
    '',
    'https://',
  ]) {
    assert.equal(parseKoboServerUrl(bad).ok, false, `${bad} devrait être refusé`)
  }
  assert.equal(parseKoboServerUrl(undefined).ok, false)
})

test('IP privées / réservées détectées (résultat DNS)', () => {
  for (const ip of [
    '127.0.0.1',
    '10.1.2.3',
    '172.16.0.1',
    '172.31.255.255',
    '192.168.0.1',
    '169.254.169.254',
    '100.64.0.1',
    '0.0.0.0',
    '224.0.0.1',
    '::1',
    '::',
    'fe80::1',
    'fc00::1',
    'fd12:3456::1',
    '::ffff:127.0.0.1',
    '::ffff:7f00:1',
    'not-an-ip',
  ]) {
    assert.equal(isPrivateIp(ip), true, `${ip} devrait être privée`)
  }
  for (const ip of [
    '8.8.8.8',
    '41.207.1.1',
    '172.32.0.1',
    '2606:4700:4700::1111',
    '::ffff:8.8.8.8',
  ]) {
    assert.equal(isPrivateIp(ip), false, `${ip} devrait être publique`)
  }
})

test('garde DNS : nom public pointant vers une IP interne refusé ; serveurs publics dispensés', async () => {
  assert.equal(createKoboHostGuard('https://kf.kobotoolbox.org'), undefined)
  assert.equal(createKoboHostGuard('https://eu.kobotoolbox.org'), undefined)

  const evil = createKoboHostGuard('https://kobo.evil-ong.org', async () => [
    { address: '169.254.169.254' },
  ])
  await assert.rejects(
    () => evil?.('kobo.evil-ong.org') as Promise<void>,
    (e: unknown) => e instanceof KoboApiError && e.code === 'unsafe_host',
  )
  const mixed = createKoboHostGuard('https://kobo.evil-ong.org', async () => [
    { address: '8.8.8.8' },
    { address: '10.0.0.1' },
  ])
  await assert.rejects(() => mixed?.('kobo.evil-ong.org') as Promise<void>)

  const ok = createKoboHostGuard('https://kobo.ong-togo.org', async () => [
    { address: '41.207.1.1' },
  ])
  await assert.doesNotReject(() => ok?.('kobo.ong-togo.org') as Promise<void>)

  const missing = createKoboHostGuard('https://nope-ong.org', async () => {
    throw new Error('ENOTFOUND')
  })
  await assert.rejects(
    () => missing?.('nope-ong.org') as Promise<void>,
    (e: unknown) => e instanceof KoboApiError && e.code === 'network',
  )
})

test('hôtes de pièces jointes : restreints au serveur configuré', () => {
  assert.deepEqual(koboAttachmentHosts('https://kf.kobotoolbox.org').sort(), [
    'kc.kobotoolbox.org',
    'kf.kobotoolbox.org',
  ])
  assert.deepEqual(koboAttachmentHosts('https://eu.kobotoolbox.org').sort(), [
    'eu.kobotoolbox.org',
    'kc-eu.kobotoolbox.org',
  ])
  assert.deepEqual(koboAttachmentHosts('https://kobo.ong-togo.org'), ['kobo.ong-togo.org'])

  const eu = koboAttachmentHosts('https://eu.kobotoolbox.org')
  assert.equal(
    isAllowedKoboAttachmentUrl(
      'https://eu.kobotoolbox.org/api/v2/assets/a/data/1/attachments/2/',
      eu,
    ),
    true,
  )
  // Un payload EU ne peut pas envoyer le token UE vers le serveur Global.
  assert.equal(isAllowedKoboAttachmentUrl('https://kf.kobotoolbox.org/x', eu), false)
  assert.equal(isAllowedKoboAttachmentUrl('http://eu.kobotoolbox.org/x', eu), false)
  assert.equal(isAllowedKoboAttachmentUrl('https://eu.kobotoolbox.org:8443/x', eu), false)
  assert.equal(isAllowedKoboAttachmentUrl('https://169.254.169.254/x', eu), false)
  // Sans liste explicite : repli sur le serveur Global.
  assert.equal(isAllowedKoboAttachmentUrl('https://kc.kobotoolbox.org/x'), true)
})

// ═══════════════════════════════════════════════════════════════════════════
// kobo-33 · Form ID : URL → uid
// ═══════════════════════════════════════════════════════════════════════════

test('form_id : trim, extraction de l’uid depuis l’URL du projet, serveur déduit', () => {
  assert.deepEqual(parseKoboFormInput(`  ${UID}  `), { ok: true, formId: UID })
  assert.deepEqual(parseKoboFormInput(`https://kf.kobotoolbox.org/#/forms/${UID}/summary`), {
    ok: true,
    formId: UID,
    serverUrl: 'https://kf.kobotoolbox.org',
  })
  assert.deepEqual(parseKoboFormInput(`https://eu.kobotoolbox.org/#/forms/${UID}`), {
    ok: true,
    formId: UID,
    serverUrl: 'https://eu.kobotoolbox.org',
  })
  assert.deepEqual(parseKoboFormInput(`https://kobo.ong-togo.org/api/v2/assets/${UID}/`), {
    ok: true,
    formId: UID,
    serverUrl: 'https://kobo.ong-togo.org',
  })
})

test('form_id : lien Enketo, espace interne et valeur invalide expliqués', () => {
  const enketo = parseKoboFormInput('https://ee.kobotoolbox.org/x/AbCdEf12')
  assert.equal(enketo.ok, false)
  assert.match(!enketo.ok ? enketo.error : '', /Enketo/)
  assert.equal(parseKoboFormInput('a b c').ok, false)
  assert.equal(parseKoboFormInput('court').ok, false)
  assert.equal(parseKoboFormInput('').ok, false)
  assert.equal(parseKoboFormInput('https://kf.kobotoolbox.org/#/library').ok, false)
  // URL d’un hôte interne : refusée même si l’uid est valide.
  assert.equal(parseKoboFormInput(`https://127.0.0.1/#/forms/${UID}`).ok, false)
})

test('schéma config : token normalisé, Form ID extrait, serveur de l’URL repris', () => {
  const ok = koboConfigSchema.safeParse({
    cooperativeId: COOP,
    apiToken: `  Token ${TOKEN.toUpperCase()}\n`,
    formId: `https://eu.kobotoolbox.org/#/forms/${UID}/summary`,
  })
  assert.ok(ok.success)
  assert.equal(ok.success && ok.data.apiToken, TOKEN.toUpperCase())
  assert.equal(ok.success && ok.data.formId, UID)
  assert.equal(ok.success && ok.data.serverUrl, 'https://eu.kobotoolbox.org')
  // Omis = conserver l'existant (jamais forcé à true / à un type par défaut)
  assert.equal(ok.success && ok.data.webhookEnabled, undefined)
  assert.equal(ok.success && ok.data.formType, undefined)

  // Serveur choisi dans la liste + uid simple
  const preset = koboConfigSchema.safeParse({ cooperativeId: COOP, formId: UID, serverUrl: 'eu' })
  assert.ok(preset.success)
  assert.equal(preset.success && preset.data.serverUrl, 'https://eu.kobotoolbox.org')

  // Conflit entre serveur choisi et serveur de l'URL collée
  const conflict = koboConfigSchema.safeParse({
    cooperativeId: COOP,
    formId: `https://eu.kobotoolbox.org/#/forms/${UID}`,
    serverUrl: 'global',
  })
  assert.equal(conflict.success, false)

  // Serveur interne refusé
  assert.equal(
    koboConfigSchema.safeParse({ cooperativeId: COOP, formId: UID, serverUrl: 'https://localhost' })
      .success,
    false,
  )
})

test('schéma : un token avec retour à la ligne interne ou mal formé est refusé AVANT tout appel réseau', () => {
  for (const bad of [
    `${TOKEN.slice(0, 20)}\n${TOKEN.slice(20)}`,
    'trop-court',
    `${TOKEN}zz`,
    'g'.repeat(40),
    '',
  ]) {
    assert.equal(koboApiTokenSchema.safeParse(bad).success, false, JSON.stringify(bad))
  }
  assert.equal(koboApiTokenSchema.safeParse(` ${TOKEN}\r\n`).success, true)
  const r = koboTestConnectionRequestSchema.safeParse({
    cooperativeId: COOP,
    apiToken: 'x\ny',
    formId: UID,
  })
  assert.equal(r.success, false)
  assert.ok(!r.success && r.error.flatten().fieldErrors.apiToken)
})

// ═══════════════════════════════════════════════════════════════════════════
// kobo-03 · payload du webhook : `_submitted_by: null` accepté
// ═══════════════════════════════════════════════════════════════════════════

test('webhook : `_submitted_by: null` (envoi anonyme) est accepté, les pièces jointes gardent leurs champs', () => {
  const payload = {
    _uuid: 'aaaaaaaa-0000-4000-8000-000000000001',
    _id: 42,
    _xform_id_string: UID,
    _submission_time: '2026-10-08T10:00:00',
    _submitted_by: null,
    _version_: null,
    formhub: { uuid: 'abc' },
    _attachments: [
      {
        download_url: 'https://kf.kobotoolbox.org/api/v2/assets/x/data/42/attachments/1/',
        filename: 'photo.jpg',
        mimetype: 'image/jpeg',
        question_xpath: 'S1/photo_membre',
        uid: 'att1',
        is_deleted: false,
      },
      { download_url: '', filename: null, is_deleted: true },
    ],
    'S1/prenom': 'Ama',
  }
  const r = koboWebhookPayloadSchema.safeParse(payload)
  assert.ok(r.success, r.success ? '' : JSON.stringify(r.error.issues))
  assert.equal(r.success && r.data._submitted_by, null)
  // .passthrough() : question_xpath doit survivre, sinon la photo n'est jamais retrouvée.
  const att = (r.success && r.data._attachments?.[0]) as Record<string, unknown>
  assert.equal(att.question_xpath, 'S1/photo_membre')
  assert.equal(att.uid, 'att1')
  assert.equal((r.success && r.data['S1/prenom']) as string, 'Ama')

  // Les seuls champs vraiment exigés
  for (const key of ['_uuid', '_id', '_xform_id_string', '_submission_time'] as const) {
    const { [key]: _removed, ...rest } = payload
    assert.equal(koboWebhookPayloadSchema.safeParse(rest).success, false, `${key} est obligatoire`)
  }
  assert.equal(
    koboWebhookPayloadSchema.safeParse({ ...payload, _submitted_by: 'agent1' }).success,
    true,
  )
})

// ═══════════════════════════════════════════════════════════════════════════
// kobo-01 · secret de webhook par intégration
// ═══════════════════════════════════════════════════════════════════════════

test('secret de webhook : aléatoire, haché, vérifié en temps constant', () => {
  const a = generateWebhookSecret()
  const b = generateWebhookSecret()
  assert.match(a, /^kwh_[A-Za-z0-9_-]{43}$/)
  assert.notEqual(a, b)
  const hash = hashWebhookSecret(a)
  assert.match(hash, /^[0-9a-f]{64}$/)
  assert.ok(!hash.includes(a))
  assert.equal(verifyWebhookSecret(a, hash), true)
  assert.equal(verifyWebhookSecret(b, hash), false)
  assert.equal(verifyWebhookSecret('', hash), false)
  assert.equal(verifyWebhookSecret(null, hash), false)
  // Une intégration sans secret n'authentifie personne (même une chaîne vide).
  assert.equal(verifyWebhookSecret(a, null), false)
  assert.equal(verifyWebhookSecret('', undefined), false)
})

test('secret de webhook : présenté en en-tête personnalisé, Basic Auth ou Bearer', () => {
  const h = (init: Record<string, string>) => new Headers(init)
  assert.deepEqual(extractPresentedSecret(h({ 'x-kobo-secret': ' s3cret ' })), {
    secret: 's3cret',
    via: 'x-kobo-secret',
  })
  const basic = Buffer.from('kobo:le-secret').toString('base64')
  assert.deepEqual(extractPresentedSecret(h({ authorization: `Basic ${basic}` })), {
    secret: 'le-secret',
    via: 'basic',
  })
  // Mot de passe contenant des deux-points
  const basic2 = Buffer.from('u:a:b').toString('base64')
  assert.equal(extractPresentedSecret(h({ authorization: `Basic ${basic2}` }))?.secret, 'a:b')
  assert.deepEqual(extractPresentedSecret(h({ authorization: 'Bearer tok' })), {
    secret: 'tok',
    via: 'bearer',
  })
  assert.equal(extractPresentedSecret(h({})), null)
  assert.equal(
    extractPresentedSecret(
      h({ authorization: `Basic ${Buffer.from('seulement-id').toString('base64')}` }),
    ),
    null,
  )
  // KoboToolbox ne signe jamais : un en-tête HMAC n'authentifie plus rien.
  assert.equal(extractPresentedSecret(h({ 'x-kobotoolbox-signature': 'abc' })), null)
})

test('limitation des ÉCHECS d’authentification par IP (horloge injectée)', () => {
  let now = 1_000
  const t = createFailureThrottle({ max: 3, windowMs: 10_000, now: () => now })
  assert.equal(t.isBlocked('1.1.1.1'), false)
  t.recordFailure('1.1.1.1')
  t.recordFailure('1.1.1.1')
  assert.equal(t.isBlocked('1.1.1.1'), false)
  t.recordFailure('1.1.1.1')
  assert.equal(t.isBlocked('1.1.1.1'), true)
  assert.equal(t.isBlocked('2.2.2.2'), false)
  now += 10_001
  assert.equal(t.isBlocked('1.1.1.1'), false)
})

// ═══════════════════════════════════════════════════════════════════════════
// kobo-16 · aucun token dans un message
// ═══════════════════════════════════════════════════════════════════════════

test('scrubSecrets : le token et le motif « Token <hex> » sont masqués', () => {
  const msg = `Headers.append: "Token ${TOKEN}" is an invalid header value`
  const out = scrubSecrets(msg, [TOKEN])
  assert.ok(!out.includes(TOKEN))
  assert.ok(!/[0-9a-f]{40}/i.test(out))
  assert.ok(!scrubSecrets(`Token ${TOKEN}`).includes(TOKEN))
})

// ═══════════════════════════════════════════════════════════════════════════
// Client API : en-tête d'authentification, serveur, correspondance des erreurs
// ═══════════════════════════════════════════════════════════════════════════

test('client : en-tête « Token », serveur configuré (UE), pas de suivi des redirections', async () => {
  const { impl, calls } = fakeFetch(() =>
    jsonResponse({ uid: UID, name: 'Form', asset_type: 'survey', deployment_status: 'deployed' }),
  )
  const eu = makeClient(impl, { serverUrl: 'https://eu.kobotoolbox.org' })
  await eu.getJson(`/assets/${UID}/`, { format: 'json' }, 'asset')
  assert.equal(calls.length, 1)
  assert.equal(calls[0]?.url.origin, 'https://eu.kobotoolbox.org')
  assert.equal(calls[0]?.url.pathname, `/api/v2/assets/${UID}/`)
  assert.equal(calls[0]?.headers.Authorization, `Token ${TOKEN}`)
  assert.equal(calls[0]?.headers.Accept, 'application/json')
  assert.equal(calls[0]?.redirect, 'manual')
  assert.equal(koboApiBase('https://eu.kobotoolbox.org/'), 'https://eu.kobotoolbox.org/api/v2')
})

test('erreurs 401 / 403 / 404 / 400 : messages français actionnables selon la portée', () => {
  const server = 'https://eu.kobotoolbox.org'
  const e401 = mapKoboHttpError(401, { scope: 'asset', serverUrl: server })
  assert.equal(e401.code, 'unauthorized')
  assert.match(e401.message, /Token refusé par KoboToolbox UE/)
  assert.match(e401.message, /vérifiez le token et le serveur/)

  const e403data = mapKoboHttpError(403, { scope: 'data', serverUrl: server })
  assert.equal(e403data.code, 'forbidden')
  assert.match(e403data.message, /Voir les soumissions/)

  const e404asset = mapKoboHttpError(404, { scope: 'asset', serverUrl: server })
  assert.equal(e404asset.code, 'not_found')
  assert.match(e404asset.message, /introuvable|non partagé/)
  assert.match(e404asset.message, /eu\.kobotoolbox\.org/)

  const e404data = mapKoboHttpError(404, { scope: 'data', serverUrl: server })
  assert.match(e404data.message, /Voir les soumissions/)

  const e400 = mapKoboHttpError(400, { scope: 'data', serverUrl: server, bodyHint: '' })
  assert.equal(e400.code, 'not_deployed')
  assert.match(e400.message, /non déployé/)
  const e400q = mapKoboHttpError(400, {
    scope: 'data',
    serverUrl: server,
    bodyHint: '{"query":["Value must be valid JSON."]}',
  })
  assert.equal(e400q.code, 'bad_request')

  assert.equal(mapKoboHttpError(429, { serverUrl: server }).code, 'rate_limited')
  assert.equal(mapKoboHttpError(503, { serverUrl: server }).code, 'server_error')
})

test('testConnection : asset lisible mais /data/ en 403 → INVALIDE (permission « Voir les soumissions »)', async () => {
  const { impl, calls } = fakeFetch((c) =>
    c.url.pathname.endsWith('/data/')
      ? jsonResponse({ detail: 'Vous n’avez pas la permission' }, 403)
      : jsonResponse({
          uid: UID,
          name: 'Recensement',
          asset_type: 'survey',
          has_deployment: true,
          deployment_status: 'deployed',
          deployment__submission_count: 120,
        }),
  )
  const r = await makeClient(impl).testConnection(UID)
  assert.equal(r.valid, false)
  assert.equal(r.code, 'forbidden')
  assert.match(r.error ?? '', /Voir les soumissions/)
  assert.equal(calls.length, 2, 'asset puis sonde /data/')
  assert.equal(calls[1]?.url.searchParams.get('limit'), '1')
})

test('testConnection : brouillon, mauvais type, archivé, 401, 404, réponse non JSON', async () => {
  const asset = (over: Record<string, unknown>) => ({
    uid: UID,
    name: 'F',
    asset_type: 'survey',
    ...over,
  })

  const draft = fakeFetch(() =>
    jsonResponse(asset({ has_deployment: false, deployment_status: 'draft' })),
  )
  const r1 = await makeClient(draft.impl).testConnection(UID)
  assert.equal(r1.valid, false)
  assert.equal(r1.code, 'not_deployed')
  assert.match(r1.error ?? '', /non déployé/)
  assert.equal(draft.calls.length, 1, 'inutile de sonder /data/ pour un brouillon')

  const wrongType = fakeFetch(() => jsonResponse(asset({ asset_type: 'block' })))
  assert.equal((await makeClient(wrongType.impl).testConnection(UID)).valid, false)

  const archived = fakeFetch((c) =>
    c.url.pathname.endsWith('/data/')
      ? jsonResponse({ count: 7, next: null, results: [] })
      : jsonResponse(asset({ deployment_status: 'archived', deployment__active: false })),
  )
  const r3 = await makeClient(archived.impl).testConnection(UID)
  assert.equal(r3.valid, true)
  assert.equal(r3.submissionCount, 7)
  assert.match(r3.warning ?? '', /archivé/)

  const unauthorized = fakeFetch(() => jsonResponse({ detail: 'Invalid token.' }, 401))
  const r4 = await makeClient(unauthorized.impl).testConnection(UID)
  assert.equal(r4.code, 'unauthorized')
  assert.match(r4.error ?? '', /Token refusé/)

  const notFound = fakeFetch(() => jsonResponse({ detail: 'Not found.' }, 404))
  const r5 = await makeClient(notFound.impl).testConnection(UID)
  assert.equal(r5.code, 'not_found')

  const html = fakeFetch(
    () =>
      new Response('<html>Bienvenue</html>', {
        status: 200,
        headers: { 'content-type': 'text/html' },
      }),
  )
  const r6 = await makeClient(html.impl).testConnection(UID)
  assert.equal(r6.valid, false)
  assert.equal(r6.code, 'invalid_response')
  assert.match(r6.error ?? '', /pas une API KoboToolbox v2/)

  const ok = fakeFetch((c) =>
    c.url.pathname.endsWith('/data/')
      ? jsonResponse({ count: 120, next: 'x', results: [{}] })
      : jsonResponse(
          asset({ name: 'Recensement', deployment_status: 'deployed', has_deployment: true }),
        ),
  )
  const r7 = await makeClient(ok.impl).testConnection(UID)
  assert.deepEqual(
    {
      valid: r7.valid,
      formTitle: r7.formTitle,
      submissionCount: r7.submissionCount,
      canViewSubmissions: r7.canViewSubmissions,
    },
    { valid: true, formTitle: 'Recensement', submissionCount: 120, canViewSubmissions: true },
  )
})

test('client : un token mal formé n’atteint jamais fetch et n’apparaît dans aucune erreur', async () => {
  const { impl, calls } = fakeFetch(() => jsonResponse({}))
  const sleeps: number[] = []
  const badToken = `${TOKEN.slice(0, 20)}\n${TOKEN.slice(20)}`
  const r = await makeClient(impl, { apiToken: badToken }, sleeps).testConnection(UID)
  assert.equal(r.valid, false)
  assert.equal(r.code, 'invalid_token')
  assert.equal(calls.length, 0)
  assert.equal(sleeps.length, 0, 'aucune nouvelle tentative pour une erreur non transitoire')
  assert.ok(!JSON.stringify(r).includes(TOKEN.slice(0, 20)))

  // Erreur de runtime qui recopie l'en-tête : jamais réessayée, jamais recopiée.
  const leaky = fakeFetch(
    () => new TypeError(`Headers.append: "Token ${TOKEN}" is an invalid header value`),
  )
  const sleeps2: number[] = []
  const r2 = await makeClient(leaky.impl, {}, sleeps2).testConnection(UID)
  assert.equal(r2.code, 'invalid_token')
  assert.equal(leaky.calls.length, 1)
  assert.equal(sleeps2.length, 0)
  assert.ok(!JSON.stringify(r2).includes(TOKEN))
})

test('client : expiration réseau réessayée 3 fois puis erreur « timeout » (sans token)', async () => {
  const timeout = new DOMException('The operation was aborted due to timeout', 'TimeoutError')
  const { impl, calls } = fakeFetch(() => timeout)
  const sleeps: number[] = []
  await assert.rejects(
    () => makeClient(impl, {}, sleeps).getJson('/assets/x/', undefined, 'asset'),
    (e: unknown) => e instanceof KoboApiError && e.code === 'timeout' && !e.message.includes(TOKEN),
  )
  assert.equal(calls.length, 4, '1 essai + 3 relances')
  assert.deepEqual(sleeps, [1000, 2000, 4000])

  const net = fakeFetch(() => new TypeError('fetch failed'))
  await assert.rejects(
    () => makeClient(net.impl).getJson('/assets/x/', undefined, 'asset'),
    (e: unknown) => e instanceof KoboApiError && e.code === 'network',
  )
})

test('client : le délai global (deadline) interrompt tentatives et attentes', async () => {
  let now = 0
  const { impl, calls } = fakeFetch(() => new TypeError('fetch failed'))
  const sleeps: number[] = []
  const client = makeClient(impl, {
    deadlineAt: 2500,
    now: () => now,
    sleep: async (ms) => {
      sleeps.push(ms)
      now += ms
    },
  })
  await assert.rejects(() => client.getJson('/assets/x/', undefined, 'asset'), KoboApiError)
  assert.ok(calls.length < 4, 'on ne relance pas au-delà du budget')
  assert.ok(now <= 3500)

  // Déjà échu : aucun appel réseau.
  const expired = fakeFetch(() => jsonResponse({}))
  await assert.rejects(
    () =>
      makeClient(expired.impl, { deadlineAt: 10, now: () => 100 }).getJson(
        '/assets/x/',
        undefined,
        'asset',
      ),
    (e: unknown) => e instanceof KoboApiError && e.code === 'timeout',
  )
  assert.equal(expired.calls.length, 0)
})

test('client : 429 avec Retry-After honoré, puis succès ; Retry-After trop long → arrêt propre', async () => {
  const sleeps: number[] = []
  const flaky = fakeFetch((_c, i) =>
    i === 0 ? jsonResponse({}, 429, { 'retry-after': '2' }) : jsonResponse({ ok: true }),
  )
  const body = await makeClient(flaky.impl, {}, sleeps).getJson<{ ok: boolean }>(
    '/assets/x/',
    undefined,
    'asset',
  )
  assert.equal(body.ok, true)
  assert.deepEqual(sleeps, [2000], 'Retry-After respecté à la lettre')

  const longWait: number[] = []
  const blocked = fakeFetch(() => jsonResponse({}, 429, { 'retry-after': '120' }))
  await assert.rejects(
    () => makeClient(blocked.impl, {}, longWait).getJson('/assets/x/', undefined, 'asset'),
    (e: unknown) =>
      e instanceof KoboApiError && e.code === 'rate_limited' && e.retryAfterSec === 120,
  )
  assert.equal(blocked.calls.length, 1, 'pas de martelage quand Kobo demande d’attendre 2 minutes')
  assert.deepEqual(longWait, [])

  // 429 sans Retry-After : backoff exponentiel
  const noHeader = fakeFetch((_c, i) => (i < 2 ? jsonResponse({}, 429) : jsonResponse({ ok: 1 })))
  const s3: number[] = []
  await makeClient(noHeader.impl, {}, s3).getJson('/assets/x/', undefined, 'asset')
  assert.deepEqual(s3, [1000, 2000])

  assert.equal(parseRetryAfterMs('5', 0), 5000)
  assert.equal(parseRetryAfterMs(null, 0), null)
  assert.equal(
    parseRetryAfterMs('Wed, 21 Oct 2026 07:28:00 GMT', Date.parse('Wed, 21 Oct 2026 07:27:30 GMT')),
    30_000,
  )
})

test('client : seuls 429/502/503/504 sont réessayés ; 500 et 3xx non', async () => {
  const f500 = fakeFetch(() => jsonResponse({}, 500))
  await assert.rejects(
    () => makeClient(f500.impl).getJson('/assets/x/', undefined, 'asset'),
    (e: unknown) => e instanceof KoboApiError && e.code === 'server_error',
  )
  assert.equal(f500.calls.length, 1)

  const f503 = fakeFetch((_c, i) => (i === 0 ? jsonResponse({}, 503) : jsonResponse({ ok: 1 })))
  await makeClient(f503.impl).getJson('/assets/x/', undefined, 'asset')
  assert.equal(f503.calls.length, 2)

  const redirect = fakeFetch(
    () => new Response(null, { status: 302, headers: { location: 'http://169.254.169.254/' } }),
  )
  await assert.rejects(
    () => makeClient(redirect.impl).getJson('/assets/x/', undefined, 'asset'),
    (e: unknown) => e instanceof KoboApiError && e.code === 'redirect',
  )
  assert.equal(redirect.calls.length, 1)
})

test('client : page de soumissions triée par _id avec curseur et filtre de date', async () => {
  const { impl, calls } = fakeFetch(() =>
    jsonResponse({
      count: 250,
      next: 'https://kf.kobotoolbox.org/next',
      previous: null,
      results: [{ _id: 11 }, { _id: 12 }],
    }),
  )
  const page = await makeClient(impl).fetchSubmissionsPage({
    formId: UID,
    afterId: 10,
    since: new Date('2026-10-08T10:00:00.123Z'),
  })
  assert.equal(page.results.length, 2)
  assert.equal(page.count, 250)
  assert.equal(page.hasMore, true)
  const q = calls[0]?.url.searchParams
  assert.equal(q?.get('format'), 'json')
  assert.equal(q?.get('limit'), '100')
  assert.equal(q?.get('start'), '0')
  assert.deepEqual(JSON.parse(q?.get('sort') ?? 'null'), { _id: 1 })
  assert.deepEqual(JSON.parse(q?.get('query') ?? 'null'), {
    _id: { $gt: 10 },
    _submission_time: { $gte: '2026-10-08T10:00:00' },
  })

  // Sans curseur ni date : pas de filtre.
  const none = fakeFetch(() => jsonResponse([{ _id: 1 }]))
  const flat = await makeClient(none.impl).fetchSubmissionsPage({ formId: UID })
  assert.equal(none.calls[0]?.url.searchParams.has('query'), false)
  assert.equal(flat.results.length, 1)
  assert.equal(flat.hasMore, false)
})

// ═══════════════════════════════════════════════════════════════════════════
// kobo-07 · fusion de config ; kobo-17 · borne incrémentale
// ═══════════════════════════════════════════════════════════════════════════

test('config : la fusion conserve form_type et les clés inconnues, ignore undefined', () => {
  const existing = {
    api_key: 'v1.old',
    form_id: UID,
    form_type: 'harvest',
    webhook_secret_hash: 'h',
    custom_flag: { x: 1 },
  }
  const merged = mergeKoboConfig(existing, {
    api_key: 'v1.new',
    form_id: 'autre',
    form_type: undefined,
    webhook_secret_hash: undefined,
    sync_watermark: null,
  })
  assert.equal(merged.form_type, 'harvest')
  assert.equal(merged.webhook_secret_hash, 'h')
  assert.deepEqual(merged.custom_flag, { x: 1 })
  assert.equal(merged.api_key, 'v1.new')
  assert.equal(merged.sync_watermark, null)
  // L'objet d'origine n'est pas muté.
  assert.equal(existing.api_key, 'v1.old')

  const view = readKoboConfig({
    ...existing,
    webhook_enabled: false,
    server_url: 'https://eu.kobotoolbox.org',
  })
  assert.equal(view.formType, 'harvest')
  assert.equal(view.webhookEnabled, false)
  assert.equal(view.serverUrl, 'https://eu.kobotoolbox.org')
  assert.equal(readKoboConfig(null).serverUrl, 'https://kf.kobotoolbox.org')
  assert.equal(readKoboConfig({}).webhookEnabled, true)
  assert.equal(readKoboConfig({ form_type: 'inconnu' }).formType, null)

  const stripped = stripKoboConnectionKeys(merged)
  for (const k of ['api_key', 'form_id', 'webhook_secret_hash', 'sync_watermark'])
    assert.equal(k in stripped, false)
  assert.equal(stripped.form_type, 'harvest')
})

test('config : borne incrémentale = watermark − marge (jamais l’horloge du serveur)', () => {
  assert.equal(incrementalSince(null), undefined, 'sans watermark : tout relire')
  assert.equal(incrementalSince('pas une date'), undefined)
  const since = incrementalSince('2026-10-08T10:30:00.000Z')
  assert.equal(since?.toISOString(), '2026-10-08T10:20:00.000Z')
  assert.equal(
    buildWebhookUrl('https://www.faitierehub.com/', 'abc-123'),
    'https://www.faitierehub.com/api/webhooks/kobo?integration=abc-123',
  )
})

// ═══════════════════════════════════════════════════════════════════════════
// kobo-02 · politique de réponse de la sync
// ═══════════════════════════════════════════════════════════════════════════

function baseResult(over: Partial<SyncResult> = {}): SyncResult {
  return {
    success: true,
    syncLogId: 'log-1',
    received: 0,
    processed: 0,
    matched: 0,
    unmatched: 0,
    errors: 0,
    duration: 10,
    errorDetails: [],
    ...over,
  }
}

const NOW = new Date('2026-10-10T12:00:00.000Z')
const PREV = '2026-10-01T00:00:00.000Z'

test('sync : un échec global n’est JAMAIS un succès (422/502), last_sync_at et watermark intacts', () => {
  const unauthorized = decideSyncOutcome({
    result: baseResult({
      success: false,
      cursor: 5,
      fatal: { code: 'unauthorized', status: 401, message: 'Token refusé par KoboToolbox Global' },
    }),
    mode: 'incremental',
    now: NOW,
    previousWatermark: PREV,
    retries: { succeeded: 0, failed: 0 },
  })
  assert.equal(unauthorized.httpStatus, 422)
  assert.equal(unauthorized.body.success, false)
  assert.equal(unauthorized.body.code, 'unauthorized')
  assert.deepEqual(unauthorized.integrationUpdate, { status: 'error' })
  assert.equal('last_sync_at' in unauthorized.integrationUpdate, false)
  assert.deepEqual(unauthorized.configPatch, {})

  for (const code of [
    'forbidden',
    'not_found',
    'not_deployed',
    'invalid_token',
    'unsafe_host',
  ] as const) {
    const d = decideSyncOutcome({
      result: baseResult({ success: false, fatal: { code, message: 'm' } }),
      mode: 'full',
      now: NOW,
      previousWatermark: PREV,
      retries: { succeeded: 0, failed: 0 },
    })
    assert.equal(d.httpStatus, 422, code)
    assert.equal(d.integrationUpdate.status, 'error', code)
    assert.equal(d.integrationUpdate.last_sync_at, undefined, code)
  }

  // Panne passagère : 502, l'intégration n'est pas dégradée.
  const network = decideSyncOutcome({
    result: baseResult({
      success: false,
      fatal: { code: 'network', message: 'Impossible de joindre' },
    }),
    mode: 'full',
    now: NOW,
    previousWatermark: PREV,
    retries: { succeeded: 0, failed: 0 },
  })
  assert.equal(network.httpStatus, 502)
  assert.deepEqual(network.integrationUpdate, {})

  const limited = decideSyncOutcome({
    result: baseResult({
      success: false,
      fatal: { code: 'rate_limited', message: 'limite', retryAfterSec: 120 },
    }),
    mode: 'full',
    now: NOW,
    previousWatermark: PREV,
    retries: { succeeded: 0, failed: 0 },
  })
  assert.equal(limited.httpStatus, 503)
  assert.equal(limited.headers?.['Retry-After'], '120')
})

test('sync : pull partiel → curseur de reprise, pas de last_sync_at ; pull complet → last_sync_at et watermark', () => {
  const partial = decideSyncOutcome({
    result: baseResult({
      received: 40,
      processed: 40,
      matched: 40,
      partial: true,
      cursor: 140,
      remaining: 960,
      watermark: '2026-10-09T08:00:00.000Z',
    }),
    mode: 'full',
    now: NOW,
    previousWatermark: PREV,
    retries: { succeeded: 0, failed: 0 },
  })
  assert.equal(partial.httpStatus, 200)
  assert.equal(partial.body.partial, true)
  assert.equal(partial.body.cursor, 140)
  assert.equal(partial.body.remaining, 960)
  assert.equal(partial.integrationUpdate.last_sync_at, undefined)
  assert.deepEqual(partial.configPatch, { sync_watermark: '2026-10-09T08:00:00.000Z' })

  const done = decideSyncOutcome({
    result: baseResult({
      received: 3,
      processed: 3,
      matched: 3,
      watermark: '2026-10-09T09:00:00.000Z',
    }),
    mode: 'incremental',
    now: NOW,
    previousWatermark: PREV,
    retries: { succeeded: 1, failed: 0 },
  })
  assert.equal(done.body.partial, false)
  assert.deepEqual(done.integrationUpdate, { status: 'connected', last_sync_at: NOW.toISOString() })
  assert.deepEqual(done.configPatch, { sync_watermark: '2026-10-09T09:00:00.000Z' })

  // Aucune soumission reçue : last_sync_at avance (sync réussie) mais le watermark ne recule jamais.
  const empty = decideSyncOutcome({
    result: baseResult(),
    mode: 'incremental',
    now: NOW,
    previousWatermark: PREV,
    retries: { succeeded: 0, failed: 0 },
  })
  assert.deepEqual(empty.configPatch, {})
  assert.equal(empty.integrationUpdate.last_sync_at, NOW.toISOString())

  // Erreurs de traitement : pas présenté comme un succès franc.
  const withErrors = decideSyncOutcome({
    result: baseResult({
      success: false,
      received: 2,
      processed: 1,
      errors: 1,
      errorDetails: [{ instanceId: 'u1', error: 'Prénom manquant' }],
    }),
    mode: 'full',
    now: NOW,
    previousWatermark: null,
    retries: { succeeded: 0, failed: 0 },
  })
  assert.equal(withErrors.body.success, false)
  assert.match(String(withErrors.body.message), /1 erreur/)
  assert.deepEqual((withErrors.body.sync as { errorDetails: unknown[] }).errorDetails, [
    { instanceId: 'u1', error: 'Prénom manquant' },
  ])
})
