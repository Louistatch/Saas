/**
 * Tests d'intégration Kobo : routes API, service de synchronisation, webhook et
 * répartiteur par type de formulaire — avec Supabase et fetch SIMULÉS.
 *
 * Les modules « server-only » sont chargés tels quels ; seuls leurs frontières
 * (client Supabase, garde d'accès, limiteur, waitUntil, enrôlement) sont remplacées
 * par des doublures en interceptant Module._load (le fichier est exécuté en CJS par tsx).
 */
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import path from 'node:path'
import { afterEach, beforeEach, test } from 'node:test'
import { NextRequest, NextResponse } from 'next/server'
import type * as SyncServiceModule from '../lib/kobo/sync-service'
import type * as WebhookAuthModule from '../lib/kobo/webhook-auth'
import type * as CryptoModule from '../lib/utils/crypto'

// ── Environnement ────────────────────────────────────────────────────────────
process.env.INTEGRATION_SECRET_KEY = Buffer.alloc(32, 9).toString('base64')
process.env.NEXT_PUBLIC_APP_URL = 'https://app.test'

const TOKEN = 'a1b2c3d4e5f6a7b8c9d0a1b2c3d4e5f6a7b8c9d0'
const TOKEN2 = '0f9e8d7c6b5a49382716f5e4d3c2b1a099887766'
const UID = 'aBcDeFgHiJkLmNoPqRsTuV'
const UID_B = 'aZyXwVuTsRqPoNmLkJiHgF'
const UID_NEW = 'aNewFormNewFormNewForm1'
const COOP_A = '11111111-1111-4111-8111-111111111111'
const COOP_B = '22222222-2222-4222-8222-222222222222'
const COOP_C = '33333333-3333-4333-8333-333333333333'
const INT_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const INT_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const INT_C = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const INT_D = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
const SECRET_A = 'kwh_secret-of-cooperative-A-0000000000000000000'
const SECRET_B = 'kwh_secret-of-cooperative-B-1111111111111111111'
const GLOBAL_SECRET = 'global-platform-secret-0123456789-abcdefghij'

// ── Journaux capturés (aucun secret ne doit y figurer) ───────────────────────
const logged: string[] = []
for (const level of ['log', 'info', 'warn', 'error', 'debug'] as const) {
  console[level] = (...args: unknown[]) => {
    logged.push(args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' '))
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Faux Supabase en mémoire
// ═══════════════════════════════════════════════════════════════════════════

type Row = Record<string, unknown>
type Result = { data: unknown; error: { code?: string; message: string } | null }

function readCol(row: Row, col: string): unknown {
  if (col.includes('->>')) {
    const [a, b] = col.split('->>') as [string, string]
    return (row[a] as Row | undefined)?.[b]
  }
  return row[col]
}

class FakeDb {
  tables: Record<string, Row[]> = {}
  /** Opérations observées, dans l'ordre. */
  ops: Array<{ table: string; op: string; payload?: unknown }> = []
  rpcCalls: Array<{ name: string; args: unknown }> = []
  rpcHandlers: Record<string, (args: unknown) => Result> = {}
  unique: Record<string, string[]> = {
    kobo_submissions: ['kobo_instance_id', 'cooperative_id'],
    integrations: ['cooperative_id', 'type'],
  }
  /** Permet de simuler un échec d'insertion (renvoie l'erreur ou null). */
  failInsert: Record<string, (row: Row) => { code?: string; message: string } | null> = {}

  rows(table: string): Row[] {
    this.tables[table] ??= []
    return this.tables[table] as Row[]
  }
  from(table: string) {
    return new Query(this, table)
  }
  rpc(name: string, args: unknown) {
    this.rpcCalls.push({ name, args })
    return Promise.resolve(this.rpcHandlers[name]?.(args) ?? { data: null, error: null })
  }
  storage = {
    from: () => ({
      upload: async () => ({ error: null }),
      getPublicUrl: () => ({ data: { publicUrl: 'x' } }),
    }),
  }
}

class Query implements PromiseLike<Result> {
  private op: 'select' | 'insert' | 'update' | 'delete' | 'upsert' = 'select'
  private filters: Array<(r: Row) => boolean> = []
  private payload: Row | Row[] = {}
  private onConflict: string[] = []
  private limitN: number | null = null
  private orderSpec: { col: string; asc: boolean } | null = null
  private mode: 'many' | 'single' | 'maybe' = 'many'
  private returning = false

  constructor(
    private db: FakeDb,
    private table: string,
  ) {}

  select(_cols?: string) {
    this.returning = true
    return this
  }
  insert(p: Row | Row[]) {
    this.op = 'insert'
    this.payload = p
    return this
  }
  update(p: Row) {
    this.op = 'update'
    this.payload = p
    return this
  }
  upsert(p: Row, opts?: { onConflict?: string }) {
    this.op = 'upsert'
    this.payload = p
    this.onConflict = opts?.onConflict?.split(',') ?? []
    return this
  }
  delete() {
    this.op = 'delete'
    return this
  }
  eq(col: string, v: unknown) {
    this.filters.push((r) => readCol(r, col) === v)
    return this
  }
  neq(col: string, v: unknown) {
    this.filters.push((r) => readCol(r, col) !== v)
    return this
  }
  in(col: string, arr: unknown[]) {
    this.filters.push((r) => arr.includes(readCol(r, col)))
    return this
  }
  is(col: string, v: unknown) {
    this.filters.push((r) => (readCol(r, col) ?? null) === v)
    return this
  }
  not(col: string, _op: string, v: unknown) {
    this.filters.push((r) => (readCol(r, col) ?? null) !== v)
    return this
  }
  lt(col: string, v: string) {
    this.filters.push((r) => String(readCol(r, col) ?? '') < v)
    return this
  }
  filter(col: string, _op: string, v: unknown) {
    this.filters.push((r) => readCol(r, col) === v)
    return this
  }
  ilike(col: string, pattern: string) {
    const needle = pattern.replace(/%/g, '').replace(/\\/g, '').toLowerCase()
    this.filters.push((r) =>
      String(readCol(r, col) ?? '')
        .toLowerCase()
        .includes(needle),
    )
    return this
  }
  order(col: string, opts?: { ascending?: boolean }) {
    this.orderSpec = { col, asc: opts?.ascending !== false }
    return this
  }
  limit(n: number) {
    this.limitN = n
    return this
  }
  single() {
    this.mode = 'single'
    return this
  }
  maybeSingle() {
    this.mode = 'maybe'
    return this
  }
  // biome-ignore lint/suspicious/noThenProperty: faux client Supabase « thenable » (await sur le constructeur de requête)
  then<T1 = Result, T2 = never>(
    onF?: ((v: Result) => T1 | PromiseLike<T1>) | null,
    onR?: ((e: unknown) => T2 | PromiseLike<T2>) | null,
  ) {
    return Promise.resolve(this.exec()).then(onF, onR)
  }

  private shape(rows: Row[]): Result {
    let out = rows.map((r) => structuredClone(r))
    if (this.orderSpec) {
      const { col, asc } = this.orderSpec
      out = out.sort(
        (a, b) => String(a[col] ?? '').localeCompare(String(b[col] ?? '')) * (asc ? 1 : -1),
      )
    }
    if (this.limitN !== null) out = out.slice(0, this.limitN)
    if (this.mode === 'single') {
      return out.length === 1
        ? { data: out[0], error: null }
        : { data: null, error: { code: 'PGRST116', message: 'not exactly one row' } }
    }
    if (this.mode === 'maybe') return { data: out[0] ?? null, error: null }
    return { data: out, error: null }
  }

  private insertOne(row: Row): Result | Row {
    const hook = this.db.failInsert[this.table]?.(row)
    if (hook) return { data: null, error: hook }
    const keys = this.db.unique[this.table]
    if (keys && this.db.rows(this.table).some((r) => keys.every((k) => r[k] === row[k]))) {
      return {
        data: null,
        error: {
          code: '23505',
          message: `duplicate key value violates unique constraint (${keys.join(',')})`,
        },
      }
    }
    const now = new Date().toISOString()
    const stored: Row = {
      id: randomUUID(),
      created_at: now,
      updated_at: now,
      ...structuredClone(row),
    }
    this.db.rows(this.table).push(stored)
    return stored
  }

  private exec(): Result {
    const all = this.db.rows(this.table)
    this.db.ops.push({ table: this.table, op: this.op, payload: this.payload })
    const matching = all.filter((r) => this.filters.every((f) => f(r)))

    if (this.op === 'select') return this.shape(matching)

    if (this.op === 'insert') {
      const inserted: Row[] = []
      for (const row of Array.isArray(this.payload) ? this.payload : [this.payload]) {
        const r = this.insertOne(row)
        if ('error' in r && 'data' in r) return r as Result
        inserted.push(r as Row)
      }
      return this.returning ? this.shape(inserted) : { data: null, error: null }
    }

    if (this.op === 'upsert') {
      const row = this.payload as Row
      const existing = all.find((r) => this.onConflict.every((k) => r[k] === row[k]))
      if (existing) {
        Object.assign(existing, structuredClone(row), { updated_at: new Date().toISOString() })
        return this.returning ? this.shape([existing]) : { data: null, error: null }
      }
      const r = this.insertOne(row)
      if ('error' in r && 'data' in r) return r as Result
      return this.returning ? this.shape([r as Row]) : { data: null, error: null }
    }

    if (this.op === 'update') {
      for (const r of matching) Object.assign(r, structuredClone(this.payload as Row))
      return this.returning ? this.shape(matching) : { data: null, error: null }
    }

    // delete
    this.db.tables[this.table] = all.filter((r) => !matching.includes(r))
    return { data: null, error: null }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Doublures de modules
// ═══════════════════════════════════════════════════════════════════════════

const ROOT = path.resolve(__dirname, '..')
const PROCESSORS_PATH = path.join(ROOT, 'lib/kobo/processors.ts')
const ENROLLMENT_PATH = path.join(ROOT, 'lib/kobo/enrollment.ts')

interface DispatchCall {
  submissionId: string
  cooperativeId: string
  formType?: string | null
  apiToken?: string | null
  serverUrl?: string
  memberCardNumber?: string | null
  payload: Record<string, unknown>
  clearError?: boolean
}

const state = {
  db: new FakeDb(),
  deniedCoops: new Set<string>(),
  rateOk: true,
  waitUntilQueue: [] as Promise<unknown>[],
  dispatchCalls: [] as DispatchCall[],
  dispatch: (async (_input: DispatchCall) => ({
    status: 'matched' as 'matched' | 'unmatched' | 'skipped',
    detail: undefined as string | undefined,
  })) as (
    input: DispatchCall,
  ) => Promise<{ status: 'matched' | 'unmatched' | 'skipped'; detail?: string }>,
  enrollCalls: [] as unknown[][],
  attachCalls: [] as unknown[][],
}

const Module = require('node:module') as {
  _load: (request: string, parent: unknown, isMain: boolean) => unknown
  _resolveFilename: (request: string, parent: unknown, isMain?: boolean) => string
}

const ctx = () => ({
  userId: 'user-1',
  role: 'super_admin',
  cooperativeId: null,
  cooperativeLevel: 'faitiere',
  supabase: state.db,
})
const denied = () => ({
  ok: false as const,
  response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
})

const namedStubs: Record<string, unknown> = {
  'server-only': {},
  '@/lib/supabase/admin': { createClient: () => state.db },
  '@/lib/supabase/server': { createClient: async () => state.db },
  '@/lib/security/assert-access': {
    assertAuthenticated: async () => ({ ok: true as const, ctx: ctx() }),
    assertRole: async () => ({ ok: true as const, ctx: ctx() }),
    assertFaitiereAccess: async () => ({ ok: true as const, ctx: ctx() }),
    assertTenantAccess: async (coopId: string) =>
      state.deniedCoops.has(coopId) ? denied() : { ok: true as const, ctx: ctx() },
  },
  '@/lib/kobo/rate-limit': {
    checkKoboRateLimit: async () =>
      state.rateOk ? { ok: true, retryAfterSec: 1 } : { ok: false, retryAfterSec: 12 },
  },
  '@vercel/functions': {
    waitUntil: (p: Promise<unknown>) => {
      state.waitUntilQueue.push(p)
    },
  },
}
const processorsStub = {
  dispatchSubmission: (input: DispatchCall) => {
    state.dispatchCalls.push(input)
    return state.dispatch(input)
  },
}
const enrollmentStub = {
  enrollNewMemberFromSubmission: async (...args: unknown[]) => {
    state.enrollCalls.push(args)
  },
  attachSubmissionToExistingMember: async (...args: unknown[]) => {
    state.attachCalls.push(args)
  },
  processCooperativeRegistration: async () => undefined,
}

const origLoad = Module._load
Module._load = function (this: unknown, request: string, parent: unknown, isMain: boolean) {
  if (request in namedStubs) return namedStubs[request]
  if (request.startsWith('.') || request.startsWith('@/')) {
    let resolved = ''
    try {
      resolved = Module._resolveFilename(request, parent, isMain)
    } catch {
      /* module introuvable : laissé au chargeur d'origine */
    }
    if (resolved === PROCESSORS_PATH) return processorsStub
    if (resolved === ENROLLMENT_PATH) return enrollmentStub
  }
  return origLoad.call(this, request, parent, isMain)
}

interface RouteModule {
  GET?: (req: NextRequest) => Promise<Response>
  POST?: (req: NextRequest) => Promise<Response>
  DELETE?: (req: NextRequest) => Promise<Response>
}
const syncRoute = require('../app/api/integrations/kobo/sync/route') as RouteModule
const configRoute = require('../app/api/integrations/kobo/route') as RouteModule
const testRoute = require('../app/api/integrations/kobo/test-connection/route') as RouteModule
const retryRoute = require('../app/api/integrations/kobo/retry/route') as RouteModule
const secretRoute = require('../app/api/integrations/kobo/webhook-secret/route') as RouteModule
const webhookRoute = require('../app/api/webhooks/kobo/route') as RouteModule
const { KoboSyncService } = require('../lib/kobo/sync-service') as typeof SyncServiceModule
const { encryptSecret, decryptSecret } = require('../lib/utils/crypto') as typeof CryptoModule
const { hashWebhookSecret, verifyWebhookSecret } =
  require('../lib/kobo/webhook-auth') as typeof WebhookAuthModule
/** Vrai répartiteur (market_price / harvest / membre…), chargé avec le faux Supabase. */
const realProcessors = origLoad.call(Module, PROCESSORS_PATH, module, false) as {
  dispatchSubmission: (
    input: DispatchCall,
  ) => Promise<{ status: 'matched' | 'unmatched'; detail?: string }>
}

// ═══════════════════════════════════════════════════════════════════════════
// Faux serveur KoboToolbox
// ═══════════════════════════════════════════════════════════════════════════

type KoboSub = Record<string, unknown> & { _id: number; _submission_time: string }

function sub(id: number, over: Record<string, unknown> = {}): KoboSub {
  const t = new Date(Date.UTC(2026, 9, 8, 10, 0, id)).toISOString().slice(0, 19)
  return {
    _id: id,
    _uuid: `uuid-${id}`,
    _xform_id_string: UID,
    _submission_time: t,
    _submitted_by: null,
    'S1/prenom': 'Ama',
    ...over,
  }
}

interface KoboCall {
  url: URL
  authorization: string | undefined
}

let koboCalls: KoboCall[] = []
const realFetch = globalThis.fetch

function installKobo(
  opts: {
    data?: KoboSub[]
    status?: number
    dataStatus?: number
    assetOverrides?: Record<string, unknown>
  } = {},
) {
  koboCalls = []
  const data = opts.data ?? []
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input))
    koboCalls.push({
      url,
      authorization: (init?.headers as Record<string, string> | undefined)?.Authorization,
    })
    const json = (b: unknown, s = 200) =>
      new Response(JSON.stringify(b), {
        status: s,
        headers: { 'content-type': 'application/json' },
      })
    if (opts.status && opts.status !== 200) return json({ detail: 'refusé' }, opts.status)
    if (/\/data\/$/.test(url.pathname)) {
      if (opts.dataStatus && opts.dataStatus !== 200)
        return json({ detail: 'refusé' }, opts.dataStatus)
      const query = JSON.parse(url.searchParams.get('query') ?? '{}') as {
        _id?: { $gt?: number }
        _submission_time?: { $gte?: string }
      }
      const limit = Number(url.searchParams.get('limit') ?? '100')
      const matching = data
        .filter((s) => (query._id?.$gt === undefined ? true : s._id > query._id.$gt))
        .filter((s) =>
          query._submission_time?.$gte === undefined
            ? true
            : s._submission_time >= query._submission_time.$gte,
        )
        .sort((a, b) => a._id - b._id)
      return json({
        count: matching.length,
        next: matching.length > limit ? 'https://next' : null,
        previous: null,
        results: matching.slice(0, limit),
      })
    }
    if (/\/assets\/[^/]+\/$/.test(url.pathname)) {
      return json({
        uid: UID,
        name: 'Recensement',
        asset_type: 'survey',
        has_deployment: true,
        deployment_status: 'deployed',
        deployment__submission_count: data.length,
        ...opts.assetOverrides,
      })
    }
    return json({}, 404)
  }) as typeof fetch
}

// ═══════════════════════════════════════════════════════════════════════════
// Jeux de données
// ═══════════════════════════════════════════════════════════════════════════

const T0 = '2026-10-01T00:00:00.000Z'

function seedIntegrations(configOverrides: Record<string, unknown> = {}, rowOverrides: Row = {}) {
  state.db.tables.integrations = [
    {
      id: INT_A,
      cooperative_id: COOP_A,
      type: 'kobo',
      status: 'connected',
      last_sync_at: T0,
      config: {
        api_key: encryptSecret(TOKEN),
        form_id: UID,
        server_url: 'https://kf.kobotoolbox.org',
        form_type: 'member_enrollment',
        webhook_enabled: true,
        webhook_secret_hash: hashWebhookSecret(SECRET_A),
        sync_watermark: T0,
        submission_count: 0,
        ...configOverrides,
      },
      ...rowOverrides,
    },
  ]
}

function post(url: string, body: unknown, headers: Record<string, string> = {}) {
  const text = typeof body === 'string' ? body : JSON.stringify(body)
  return new NextRequest(`http://localhost${url}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'content-length': String(Buffer.byteLength(text)),
      ...headers,
    },
    body: text,
  })
}

async function readJson(res: Response): Promise<Record<string, unknown>> {
  return (await res.json()) as Record<string, unknown>
}

const integrationRow = () => state.db.rows('integrations').find((r) => r.id === INT_A) as Row
const configOf = (r: Row) => r.config as Record<string, unknown>
const never = (s: string, ...needles: string[]) => {
  for (const n of needles) assert.ok(!s.includes(n), `fuite : "${n.slice(0, 12)}…" présent`)
}

beforeEach(() => {
  state.db = new FakeDb()
  state.deniedCoops = new Set()
  state.rateOk = true
  state.waitUntilQueue = []
  state.dispatchCalls = []
  state.enrollCalls = []
  state.attachCalls = []
  state.dispatch = async () => ({ status: 'matched' })
  Reflect.deleteProperty(process.env, 'KOBO_WEBHOOK_SECRET')
})

afterEach(() => {
  globalThis.fetch = realFetch
})

// ═══════════════════════════════════════════════════════════════════════════
// KoboSyncService.pullSubmissions
// ═══════════════════════════════════════════════════════════════════════════

function service(extra: Partial<ConstructorParameters<typeof KoboSyncService>[0]> = {}) {
  return new KoboSyncService({
    supabase: state.db as never,
    dispatch: (input) => {
      state.dispatchCalls.push(input as unknown as DispatchCall)
      return state.dispatch(input as unknown as DispatchCall)
    },
    sleep: async () => undefined,
    ...extra,
  })
}

const pullOptions = (over: Record<string, unknown> = {}) => ({
  cooperativeId: COOP_A,
  formId: UID,
  apiToken: TOKEN,
  integrationId: INT_A,
  triggeredBy: 'user-1',
  ...over,
})

test('pull : 401 de Kobo → échec GLOBAL (fatal), jamais « 0 reçue », journal « failed »', async () => {
  installKobo({ status: 401 })
  const r = await service().pullSubmissions(pullOptions())
  assert.equal(r.success, false)
  assert.equal(r.fatal?.code, 'unauthorized')
  assert.equal(r.fatal?.status, 401)
  assert.match(r.fatal?.message ?? '', /Token refusé par KoboToolbox Global/)
  assert.equal(r.received, 0)
  const log = state.db.rows('kobo_sync_logs')[0] as Row
  assert.equal(log.status, 'failed')
  assert.equal(log.integration_id, INT_A)
  assert.equal(log.triggered_by, 'user-1')
  assert.ok(!JSON.stringify(r).includes(TOKEN))
  assert.equal(state.db.rows('kobo_submissions').length, 0)
})

test('pull : 403 / 404 / 400 sur /data/ → codes et messages distincts', async () => {
  for (const [dataStatus, code, re] of [
    [403, 'forbidden', /Voir les soumissions/],
    [404, 'not_found', /Voir les soumissions/],
    [400, 'not_deployed', /non déployé/],
  ] as const) {
    installKobo({ dataStatus, data: [sub(1)] })
    const r = await service().pullSubmissions(pullOptions())
    assert.equal(r.fatal?.code, code, String(dataStatus))
    assert.match(r.fatal?.message ?? '', re)
  }
})

test('pull : 150 soumissions en 2 pages, `_submitted_by: null`, curseur par _id, watermark = max(_submission_time)', async () => {
  const data = Array.from({ length: 150 }, (_, i) => sub(i + 1))
  installKobo({ data })
  const r = await service().pullSubmissions(pullOptions())
  assert.equal(r.fatal, undefined)
  assert.equal(r.success, true)
  assert.equal(r.partial, false)
  assert.equal(r.cursor, null)
  assert.equal(r.received, 150)
  assert.equal(r.processed, 150)
  assert.equal(r.matched, 150)
  assert.equal(r.watermark, '2026-10-08T10:02:30.000Z')
  assert.equal(state.db.rows('kobo_submissions').length, 150)
  assert.equal((state.db.rows('kobo_sync_logs')[0] as Row).status, 'success')

  const dataCalls = koboCalls.filter((c) => /\/data\/$/.test(c.url.pathname))
  assert.equal(dataCalls.length, 2)
  assert.equal(dataCalls[0]?.authorization, `Token ${TOKEN}`)
  assert.equal(dataCalls[0]?.url.searchParams.has('query'), false)
  assert.deepEqual(JSON.parse(dataCalls[1]?.url.searchParams.get('query') ?? 'null'), {
    _id: { $gt: 100 },
  })
  assert.deepEqual(JSON.parse(dataCalls[1]?.url.searchParams.get('sort') ?? 'null'), { _id: 1 })
})

test('pull : serveur UE configuré → appels vers eu.kobotoolbox.org uniquement', async () => {
  installKobo({ data: [sub(1)] })
  await service().pullSubmissions(pullOptions({ serverUrl: 'https://eu.kobotoolbox.org' }))
  assert.ok(koboCalls.length > 0)
  assert.ok(koboCalls.every((c) => c.url.origin === 'https://eu.kobotoolbox.org'))
})

test('pull : budget temps → arrêt propre avec curseur, la reprise ne relit rien deux fois', async () => {
  const data = Array.from({ length: 5 }, (_, i) => sub(i + 1))
  installKobo({ data })
  let clock = 0
  state.dispatch = async () => {
    clock += 400 // chaque soumission « coûte » 400 ms
    return { status: 'matched' }
  }
  const svc = () => service({ now: () => clock })

  const first = await svc().pullSubmissions(pullOptions({ budgetMs: 1000 }))
  assert.equal(first.partial, true)
  assert.equal(first.received, 3, 'la 4e soumission dépasse le budget')
  assert.equal(first.cursor, 3)
  assert.equal(first.remaining, 2)
  assert.equal(first.success, true)
  assert.equal((state.db.rows('kobo_sync_logs')[0] as Row).status, 'partial')

  const second = await svc().pullSubmissions(
    pullOptions({ budgetMs: 100_000, cursor: first.cursor }),
  )
  assert.equal(second.partial, false)
  assert.equal(second.received, 2)
  assert.equal(second.cursor, null)
  assert.equal(state.db.rows('kobo_submissions').length, 5)
  assert.deepEqual(
    state.dispatchCalls.map((c) => c.payload._id),
    [1, 2, 3, 4, 5],
  )

  // Toujours au moins une soumission par appel : la reprise progresse même avec un budget minuscule.
  const tiny = await service({ now: () => clock }).pullSubmissions(
    pullOptions({ budgetMs: 0, cursor: 0 }),
  )
  assert.ok(tiny.received >= 1)
})

test('pull : des soumissions sans _id numérique ne font pas boucler la pagination', async () => {
  const data = Array.from(
    { length: 101 },
    (_, i) => ({ ...sub(i + 1), _id: undefined }) as unknown as KoboSub,
  )
  installKobo({ data })
  const r = await service().pullSubmissions(pullOptions())
  assert.equal(r.fatal, undefined)
  assert.equal(r.received, 100, 'une seule page lue, puis arrêt')
  assert.equal(koboCalls.filter((c) => /\/data\/$/.test(c.url.pathname)).length, 1)
})

test('pull : échec de traitement consigné sur la ligne (statut « error » + message), sans token', async () => {
  installKobo({ data: [sub(1), sub(2), sub(3)] })
  state.dispatch = async (input) => {
    if (input.payload._id === 2) throw new Error(`Failed to create member for Token ${TOKEN}`)
    return { status: 'matched' }
  }
  const r = await service().pullSubmissions(pullOptions())
  assert.equal(r.success, false)
  assert.equal(r.errors, 1)
  assert.equal(r.processed, 2)
  assert.equal(r.unpersisted, 0)
  const bad = state.db.rows('kobo_submissions').find((s) => s.kobo_instance_id === 'uuid-2') as Row
  assert.equal(bad.status, 'error')
  assert.match(String(bad.error_message), /Failed to create member/)
  assert.ok(!String(bad.error_message).includes(TOKEN))
  assert.ok(!JSON.stringify(r).includes(TOKEN))
  // La ligne est persistée : le watermark peut avancer jusqu'à la dernière soumission.
  assert.equal(r.watermark, '2026-10-08T10:00:03.000Z')
  assert.equal((state.db.rows('kobo_sync_logs')[0] as Row).status, 'partial')
})

test('pull : une soumission NON stockée bloque le watermark (elle sera reprise au prochain run)', async () => {
  installKobo({ data: [sub(1), sub(2), sub(3)] })
  state.db.failInsert.kobo_submissions = (row) =>
    row.kobo_instance_id === 'uuid-2' ? { code: '08006', message: 'connection lost' } : null
  const r = await service().pullSubmissions(pullOptions())
  assert.equal(r.unpersisted, 1)
  assert.equal(r.errors, 1)
  assert.equal(
    r.watermark,
    '2026-10-08T10:00:01.000Z',
    'ne dépasse pas la dernière soumission du préfixe contigu',
  )
  assert.equal(state.db.rows('kobo_submissions').length, 2)
})

test('pull : lignes déjà connues et livraisons concurrentes (23505) comptées « déjà connues », pas « traitées »', async () => {
  installKobo({ data: [sub(1), sub(2), sub(3)] })
  state.db
    .rows('kobo_submissions')
    .push({ id: 's1', cooperative_id: COOP_A, kobo_instance_id: 'uuid-1', status: 'error' })
  state.db.failInsert.kobo_submissions = (row) =>
    row.kobo_instance_id === 'uuid-2' ? { code: '23505', message: 'duplicate' } : null
  const r = await service().pullSubmissions(pullOptions())
  assert.equal(r.skipped, 2)
  assert.equal(r.processed, 1)
  assert.equal(r.matched, 1)
  assert.equal(r.errors, 0)
  assert.equal(r.success, true)
})

test('pull incrémental : la borne `since` est envoyée au filtre _submission_time', async () => {
  installKobo({ data: [sub(1), sub(2), sub(3)] })
  const r = await service().pullSubmissions(
    pullOptions({ since: new Date('2026-10-08T10:00:02.500Z') }),
  )
  const q = JSON.parse(
    koboCalls.find((c) => /\/data\/$/.test(c.url.pathname))?.url.searchParams.get('query') ??
      'null',
  )
  assert.deepEqual(q, { _submission_time: { $gte: '2026-10-08T10:00:02' } })
  assert.equal(r.received, 2)
})

test('pull : les journaux « started » de plus de 5 minutes sont marqués « failed »', async () => {
  installKobo({ data: [] })
  state.db.rows('kobo_sync_logs').push(
    {
      id: 'old',
      cooperative_id: COOP_A,
      status: 'started',
      started_at: new Date(Date.now() - 10 * 60_000).toISOString(),
    },
    {
      id: 'recent',
      cooperative_id: COOP_A,
      status: 'started',
      started_at: new Date().toISOString(),
    },
  )
  await service().pullSubmissions(pullOptions())
  const byId = (id: string) => state.db.rows('kobo_sync_logs').find((l) => l.id === id) as Row
  assert.equal(byId('old').status, 'failed')
  assert.equal(byId('recent').status, 'started')
})

test('relance : file triée par dernière tentative, pending récents ignorés, échec replacé en fin', async () => {
  const iso = (minAgo: number) => new Date(Date.now() - minAgo * 60_000).toISOString()
  const row = (id: string, status: string, minAgo: number): Row => ({
    id,
    cooperative_id: COOP_A,
    kobo_instance_id: `inst-${id}`,
    status,
    member_id: null,
    member_card_number: null,
    raw_payload: { _id: id },
    updated_at: iso(minAgo),
  })
  state.db.tables.kobo_submissions = [
    row('err-new', 'error', 5),
    row('err-old', 'error', 60),
    row('unm', 'unmatched', 30),
    row('pend-recent', 'pending', 1),
    row('pend-old', 'pending', 120),
  ]
  state.dispatch = async (input) => {
    if (input.submissionId === 'err-old') throw new Error('échec permanent')
    return { status: 'matched' }
  }
  const r = await service().retryFailedSubmissions(COOP_A, TOKEN, {
    formType: 'harvest',
    serverUrl: 'https://eu.kobotoolbox.org',
  })
  assert.deepEqual(
    state.dispatchCalls.map((c) => c.submissionId),
    ['pend-old', 'err-old', 'unm', 'err-new'],
    'ordre = dernière tentative la plus ancienne ; pending récent ignoré',
  )
  assert.equal(r.succeeded, 3)
  assert.equal(r.failed, 1)
  assert.equal(state.dispatchCalls[0]?.formType, 'harvest')
  assert.equal(state.dispatchCalls[0]?.serverUrl, 'https://eu.kobotoolbox.org')
  assert.equal(state.dispatchCalls[0]?.clearError, true)
  const failed = state.db.rows('kobo_submissions').find((s) => s.id === 'err-old') as Row
  assert.equal(failed.status, 'error')
  assert.equal(failed.error_message, 'échec permanent')
  assert.ok(
    new Date(String(failed.updated_at)).getTime() > Date.now() - 5_000,
    'replacé en fin de file',
  )
})

// ═══════════════════════════════════════════════════════════════════════════
// Route de synchronisation
// ═══════════════════════════════════════════════════════════════════════════

const syncRequest = (extra: Record<string, unknown> = {}) =>
  post('/api/integrations/kobo/sync', { cooperativeId: COOP_A, mode: 'incremental', ...extra })

test('route sync : token révoqué (401) → 422, intégration en erreur, last_sync_at et watermark INTACTS', async () => {
  seedIntegrations()
  installKobo({ status: 401 })
  const res = await (syncRoute.POST as NonNullable<RouteModule['POST']>)(syncRequest())
  const body = await readJson(res)
  assert.equal(res.status, 422)
  assert.equal(body.success, false)
  assert.equal(body.code, 'unauthorized')
  assert.match(String(body.error), /Token refusé/)
  const row = integrationRow()
  assert.equal(row.status, 'error')
  assert.equal(row.last_sync_at, T0, 'last_sync_at n’avance pas sur un échec')
  assert.equal(configOf(row).sync_watermark, T0)
  never(JSON.stringify(body), TOKEN, String(configOf(row).api_key))
})

test('route sync : permission « Voir les soumissions » refusée (403 sur /data/) → 422 explicite', async () => {
  seedIntegrations()
  installKobo({ dataStatus: 403 })
  const forbidden = await (syncRoute.POST as NonNullable<RouteModule['POST']>)(syncRequest())
  assert.equal(forbidden.status, 422)
  assert.match(String((await readJson(forbidden)).error), /Voir les soumissions/)
  assert.equal(integrationRow().status, 'error')
  assert.equal(integrationRow().last_sync_at, T0)
})

test('route sync : succès → last_sync_at = maintenant, watermark = max(_submission_time), journal rattaché à l’intégration', async () => {
  seedIntegrations({}, { status: 'error' })
  installKobo({ data: [sub(1), sub(2), sub(3)] })
  const before = Date.now()
  const res = await (syncRoute.POST as NonNullable<RouteModule['POST']>)(
    syncRequest({ mode: 'full' }),
  )
  const body = await readJson(res)
  assert.equal(res.status, 200)
  assert.equal(body.success, true)
  assert.equal(body.partial, false)
  assert.equal((body.sync as Row).received, 3)
  const row = integrationRow()
  assert.equal(row.status, 'connected', 'une sync réussie sort l’intégration de l’état « error »')
  assert.ok(new Date(String(row.last_sync_at)).getTime() >= before)
  assert.equal(configOf(row).sync_watermark, '2026-10-08T10:00:03.000Z')
  // Le reste de la config n'a pas bougé (relecture avant écriture, fusion de la seule borne).
  assert.equal(configOf(row).api_key, (state.db.rows('integrations')[0]?.config as Row).api_key)
  assert.equal(configOf(row).form_type, 'member_enrollment')
  const log = state.db.rows('kobo_sync_logs')[0] as Row
  assert.equal(log.integration_id, INT_A)
  assert.equal(log.triggered_by, 'user-1')
  never(JSON.stringify(body), TOKEN)
})

test('route sync incrémentale : la borne est le watermark moins 10 min (et non last_sync_at)', async () => {
  seedIntegrations(
    { sync_watermark: '2026-10-08T10:30:00.000Z' },
    { last_sync_at: '2026-10-09T23:00:00.000Z' },
  )
  installKobo({ data: [] })
  await (syncRoute.POST as NonNullable<RouteModule['POST']>)(syncRequest())
  const q = JSON.parse(
    koboCalls.find((c) => /\/data\/$/.test(c.url.pathname))?.url.searchParams.get('query') ??
      'null',
  )
  assert.deepEqual(q, { _submission_time: { $gte: '2026-10-08T10:20:00' } })

  // Sans watermark (intégration héritée) : tout est relu.
  seedIntegrations({ sync_watermark: null })
  installKobo({ data: [] })
  await (syncRoute.POST as NonNullable<RouteModule['POST']>)(syncRequest())
  assert.equal(
    koboCalls.find((c) => /\/data\/$/.test(c.url.pathname))?.url.searchParams.has('query'),
    false,
  )
})

test('route sync : erreurs de traitement → 200 mais success=false, message d’erreur, détail', async () => {
  seedIntegrations()
  installKobo({ data: [sub(1), sub(2)] })
  state.dispatch = async (input) => {
    if (input.payload._id === 1) throw new Error('Prénom manquant dans la soumission Kobo')
    return { status: 'matched' }
  }
  const res = await (syncRoute.POST as NonNullable<RouteModule['POST']>)(syncRequest())
  const body = await readJson(res)
  assert.equal(res.status, 200)
  assert.equal(body.success, false)
  assert.match(String(body.message), /1 erreur/)
  assert.deepEqual((body.sync as { errorDetails: Row[] }).errorDetails[0], {
    instanceId: 'uuid-1',
    error: 'Prénom manquant dans la soumission Kobo',
  })
})

test('route sync : cursor renvoyé → la reprise passe le curseur au filtre _id', async () => {
  seedIntegrations()
  installKobo({ data: [sub(1), sub(2), sub(3)] })
  const res = await (syncRoute.POST as NonNullable<RouteModule['POST']>)(
    syncRequest({ mode: 'full', cursor: 2 }),
  )
  const body = await readJson(res)
  assert.equal((body.sync as Row).received, 1)
  const q = JSON.parse(
    koboCalls.find((c) => /\/data\/$/.test(c.url.pathname))?.url.searchParams.get('query') ??
      'null',
  )
  assert.deepEqual(q, { _id: { $gt: 2 } })
  // Entrées invalides
  assert.equal(
    (await (syncRoute.POST as NonNullable<RouteModule['POST']>)(syncRequest({ cursor: -1 })))
      .status,
    400,
  )
  assert.equal(
    (await (syncRoute.POST as NonNullable<RouteModule['POST']>)(syncRequest({ cursor: 1.5 })))
      .status,
    400,
  )
})

test('route sync : limite par utilisateur (429 + Retry-After) et contrôle d’accès AVANT toute lecture de config', async () => {
  seedIntegrations()
  state.rateOk = false
  const limited = await (syncRoute.POST as NonNullable<RouteModule['POST']>)(syncRequest())
  assert.equal(limited.status, 429)
  assert.equal(limited.headers.get('retry-after'), '12')

  state.rateOk = true
  state.deniedCoops.add(COOP_A)
  state.db.ops = []
  const forbidden = await (syncRoute.POST as NonNullable<RouteModule['POST']>)(syncRequest())
  assert.equal(forbidden.status, 403)
  assert.equal(
    state.db.ops.filter((o) => o.table === 'integrations').length,
    0,
    'config jamais lue sans autorisation',
  )
})

// ═══════════════════════════════════════════════════════════════════════════
// Route de configuration : fusion, token, secret de webhook
// ═══════════════════════════════════════════════════════════════════════════

const configPost = (body: Record<string, unknown>) =>
  post('/api/integrations/kobo', { cooperativeId: COOP_A, formId: UID, ...body })

test('config POST : réenregistrer le token CONSERVE form_type, secret de webhook, watermark et last_sync_at', async () => {
  seedIntegrations({ form_type: 'harvest', custom_flag: true })
  installKobo({ data: [sub(1)] })
  const res = await (configRoute.POST as NonNullable<RouteModule['POST']>)(
    configPost({ apiToken: ` Token ${TOKEN2}\n` }),
  )
  const body = await readJson(res)
  assert.equal(res.status, 200, JSON.stringify(body))
  const row = integrationRow()
  const cfg = configOf(row)
  assert.equal(cfg.form_type, 'harvest', 'form_type ne doit jamais être effacé')
  assert.equal(cfg.custom_flag, true)
  assert.equal(cfg.webhook_secret_hash, hashWebhookSecret(SECRET_A))
  assert.equal(cfg.sync_watermark, T0)
  assert.equal(row.last_sync_at, T0, 'POST ne touche pas last_sync_at (aucune soumission lue)')
  assert.equal(decryptSecret(String(cfg.api_key)), TOKEN2)
  assert.equal(body.webhookSecret, null, 'le secret existant n’est jamais ré-affiché')
  assert.equal(body.webhookUrl, `https://app.test/api/webhooks/kobo?integration=${INT_A}`)
  never(JSON.stringify(body), TOKEN2, String(cfg.api_key), hashWebhookSecret(SECRET_A))
})

test('config POST : sans nouveau token, le token enregistré est réutilisé pour le test', async () => {
  seedIntegrations()
  installKobo({ data: [sub(1)] })
  const res = await (configRoute.POST as NonNullable<RouteModule['POST']>)(
    configPost({ formType: 'plot_survey', webhookEnabled: false }),
  )
  assert.equal(res.status, 200)
  assert.equal(koboCalls[0]?.authorization, `Token ${TOKEN}`)
  assert.equal(configOf(integrationRow()).form_type, 'plot_survey')
  assert.equal(configOf(integrationRow()).webhook_enabled, false)
})

test('config POST : première configuration → secret généré UNE fois (seul le hash est stocké), last_sync_at vide', async () => {
  state.db.tables.integrations = []
  installKobo({ data: [sub(1)] })
  const res = await (configRoute.POST as NonNullable<RouteModule['POST']>)(
    configPost({ apiToken: TOKEN, formType: 'harvest' }),
  )
  const body = await readJson(res)
  assert.equal(res.status, 200)
  const secret = String(body.webhookSecret)
  assert.match(secret, /^kwh_/)
  const row = state.db.rows('integrations')[0] as Row
  assert.equal(row.last_sync_at ?? null, null)
  assert.equal(row.status, 'connected')
  assert.equal(verifyWebhookSecret(secret, String(configOf(row).webhook_secret_hash)), true)
  assert.ok(!JSON.stringify(row).includes(secret), 'le secret en clair n’est stocké nulle part')
  assert.equal(configOf(row).form_type, 'harvest')
  assert.match(String(body.webhookUrl), new RegExp(`integration=${row.id}`))
})

test('config POST : changer de formulaire ou de serveur remet last_sync_at et la borne incrémentale à zéro', async () => {
  seedIntegrations()
  installKobo({ data: [] })
  await (configRoute.POST as NonNullable<RouteModule['POST']>)(configPost({ formId: UID_NEW }))
  assert.equal(integrationRow().last_sync_at, null)
  assert.equal(configOf(integrationRow()).sync_watermark, null)
  assert.equal(configOf(integrationRow()).form_id, UID_NEW)
})

test('config POST : URL du projet UE collée → uid et serveur extraits, appels vers eu.kobotoolbox.org', async () => {
  seedIntegrations()
  installKobo({ data: [] })
  const res = await (configRoute.POST as NonNullable<RouteModule['POST']>)(
    configPost({ formId: `https://eu.kobotoolbox.org/#/forms/${UID}/summary` }),
  )
  assert.equal(res.status, 200)
  assert.equal(configOf(integrationRow()).server_url, 'https://eu.kobotoolbox.org')
  assert.equal(configOf(integrationRow()).form_id, UID)
  assert.ok(koboCalls.every((c) => c.url.origin === 'https://eu.kobotoolbox.org'))
})

test('config POST : token avec retour à la ligne → 400 sans AUCUN appel réseau ; serveur interne → 400', async () => {
  seedIntegrations()
  installKobo({ data: [] })
  const bad = await (configRoute.POST as NonNullable<RouteModule['POST']>)(
    configPost({ apiToken: `${TOKEN.slice(0, 20)}\n${TOKEN.slice(20)}` }),
  )
  assert.equal(bad.status, 400)
  const body = await readJson(bad)
  never(JSON.stringify(body), TOKEN.slice(0, 20))
  assert.equal(koboCalls.length, 0)

  const ssrf = await (configRoute.POST as NonNullable<RouteModule['POST']>)(
    configPost({ apiToken: TOKEN, serverUrl: 'https://169.254.169.254' }),
  )
  assert.equal(ssrf.status, 400)
  assert.equal(koboCalls.length, 0)
})

test('config POST : asset lisible mais /data/ en 403 → 422, RIEN n’est enregistré', async () => {
  state.db.tables.integrations = []
  installKobo({ dataStatus: 403 })
  const res = await (configRoute.POST as NonNullable<RouteModule['POST']>)(
    configPost({ apiToken: TOKEN }),
  )
  const body = await readJson(res)
  assert.equal(res.status, 422)
  assert.match(String(body.details), /Voir les soumissions/)
  assert.equal(state.db.rows('integrations').length, 0)
  never(JSON.stringify(body), TOKEN)
})

test('config POST : correspondances — [] les supprime, absent les conserve, échec d’insertion signalé', async () => {
  seedIntegrations()
  installKobo({ data: [] })
  const mapping = {
    koboField: 'S1/carte',
    targetTable: 'members',
    targetColumn: 'card_number',
    isKeyField: true,
  }
  state.db.rows('kobo_field_mappings').push({
    id: 'm1',
    cooperative_id: COOP_A,
    form_id: UID,
    kobo_field: 'old',
    target_table: 'members',
    target_column: 'card_number',
    is_key_field: true,
  })

  await (configRoute.POST as NonNullable<RouteModule['POST']>)(configPost({}))
  assert.equal(state.db.rows('kobo_field_mappings').length, 1, 'omis = inchangé')

  await (configRoute.POST as NonNullable<RouteModule['POST']>)(configPost({ fieldMappings: [] }))
  assert.equal(state.db.rows('kobo_field_mappings').length, 0, '[] supprime tout')

  await (configRoute.POST as NonNullable<RouteModule['POST']>)(
    configPost({ fieldMappings: [mapping] }),
  )
  assert.equal(state.db.rows('kobo_field_mappings').length, 1)

  state.db.failInsert.kobo_field_mappings = () => ({ message: 'boom' })
  const res = await (configRoute.POST as NonNullable<RouteModule['POST']>)(
    configPost({ fieldMappings: [{ ...mapping, koboField: 'S1/autre' }] }),
  )
  const body = await readJson(res)
  assert.equal(res.status, 200)
  assert.equal((body.warnings as string[]).length, 1, 'l’échec n’est plus silencieux')

  // Colonne cible invalide refusée
  const invalid = await (configRoute.POST as NonNullable<RouteModule['POST']>)(
    configPost({ fieldMappings: [{ ...mapping, targetColumn: 'x; DROP TABLE members' }] }),
  )
  assert.equal(invalid.status, 400)
})

test('config GET : AUCUN token (clair ou chiffré), hash ni clé interne dans la réponse', async () => {
  seedIntegrations({ form_type: 'harvest', server_url: 'https://eu.kobotoolbox.org' })
  const enc = String(configOf(integrationRow()).api_key)
  const res = await (configRoute.GET as NonNullable<RouteModule['GET']>)(
    new NextRequest(`http://localhost/api/integrations/kobo?cooperativeId=${COOP_A}`),
  )
  const text = JSON.stringify(await res.json())
  never(text, TOKEN, enc, hashWebhookSecret(SECRET_A), 'api_key', 'webhook_secret_hash', 'v1.')
  const body = JSON.parse(text) as Row
  assert.equal(body.formType, 'harvest')
  assert.equal(body.serverUrl, 'https://eu.kobotoolbox.org')
  assert.equal(body.webhookSecretConfigured, true)
  assert.equal(body.apiTokenMasked, '••••••••••••••••')
  assert.equal(body.webhookUrl, `https://app.test/api/webhooks/kobo?integration=${INT_A}`)

  // Intégration non configurée
  state.db.tables.integrations = []
  const none = await (configRoute.GET as NonNullable<RouteModule['GET']>)(
    new NextRequest(`http://localhost/api/integrations/kobo?cooperativeId=${COOP_A}`),
  )
  assert.deepEqual(await none.json(), { configured: false })
})

test('config GET ?stats : « dernière synchronisation » = fin du dernier journal, pas la date de la dernière soumission', async () => {
  state.db.rpcHandlers.get_kobo_stats = () => ({
    data: {
      total: 6,
      pending: 1,
      processing: 0,
      matched: 4,
      unmatched: 0,
      errors: 1,
      duplicates: 0,
      last_sync: '2026-06-04T20:36:00Z',
    },
    error: null,
  })
  state.db.tables.kobo_sync_logs = [
    { id: 'l1', cooperative_id: COOP_A, completed_at: '2026-10-09T08:00:00.000Z' },
    { id: 'l2', cooperative_id: COOP_A, completed_at: '2026-10-09T09:00:00.000Z' },
    { id: 'l3', cooperative_id: COOP_A, completed_at: null },
  ]
  const res = await (configRoute.GET as NonNullable<RouteModule['GET']>)(
    new NextRequest(`http://localhost/api/integrations/kobo?cooperativeId=${COOP_A}&stats`),
  )
  const body = await readJson(res)
  assert.equal(body.lastSync, '2026-10-09T09:00:00.000Z')
  assert.equal(body.total, 6)
  assert.equal(body.errors, 1)
})

test('config DELETE : efface token, secret de webhook et correspondances ; garde form_type', async () => {
  seedIntegrations({ form_type: 'harvest' })
  state.db.rows('kobo_field_mappings').push({ id: 'm1', cooperative_id: COOP_A, form_id: UID })
  const res = await (configRoute.DELETE as NonNullable<RouteModule['DELETE']>)(
    new NextRequest(`http://localhost/api/integrations/kobo?cooperativeId=${COOP_A}`, {
      method: 'DELETE',
    }),
  )
  assert.equal(res.status, 200)
  const row = integrationRow()
  const cfg = configOf(row)
  assert.equal(row.status, 'disconnected')
  for (const k of ['api_key', 'form_id', 'webhook_secret_hash', 'sync_watermark'])
    assert.equal(k in cfg, false, k)
  assert.equal(cfg.form_type, 'harvest')
  assert.equal(cfg.webhook_enabled, false)
  assert.equal(state.db.rows('kobo_field_mappings').length, 0)
})

test('rotation du secret de webhook : affiché une fois, l’ancien cesse de fonctionner', async () => {
  seedIntegrations()
  const res = await (secretRoute.POST as NonNullable<RouteModule['POST']>)(
    post('/api/integrations/kobo/webhook-secret', { cooperativeId: COOP_A }),
  )
  const body = await readJson(res)
  assert.equal(res.status, 200)
  const secret = String(body.webhookSecret)
  const hash = String(configOf(integrationRow()).webhook_secret_hash)
  assert.equal(verifyWebhookSecret(secret, hash), true)
  assert.equal(verifyWebhookSecret(SECRET_A, hash), false)
  assert.ok(!JSON.stringify(integrationRow()).includes(secret))
  // Les autres clés de config sont conservées
  assert.equal(configOf(integrationRow()).form_id, UID)
  assert.equal(configOf(integrationRow()).form_type, 'member_enrollment')
})

test('test-connection : /data/ en 403 → 422 explicite ; succès → pas de token dans la réponse', async () => {
  seedIntegrations()
  installKobo({ dataStatus: 403 })
  const bad = await (testRoute.POST as NonNullable<RouteModule['POST']>)(
    post('/api/integrations/kobo/test-connection', { cooperativeId: COOP_A, formId: UID }),
  )
  const badBody = await readJson(bad)
  assert.equal(bad.status, 422)
  assert.equal(badBody.code, 'forbidden')
  assert.match(String(badBody.details), /Voir les soumissions/)

  installKobo({ data: [sub(1), sub(2)] })
  const ok = await (testRoute.POST as NonNullable<RouteModule['POST']>)(
    post('/api/integrations/kobo/test-connection', {
      cooperativeId: COOP_A,
      formId: UID,
      apiToken: TOKEN2,
      serverUrl: 'eu',
    }),
  )
  const okBody = await readJson(ok)
  assert.equal(ok.status, 200)
  assert.equal(okBody.valid, true)
  assert.equal(okBody.submissionCount, 2)
  assert.equal(koboCalls[0]?.url.origin, 'https://eu.kobotoolbox.org')
  assert.equal(koboCalls[0]?.authorization, `Token ${TOKEN2}`)
  never(JSON.stringify(okBody), TOKEN, TOKEN2)
})

test('retry : limite par utilisateur ; en lot ou ciblé, avec le serveur et le type de formulaire de l’intégration', async () => {
  seedIntegrations({ form_type: 'market_price', server_url: 'https://eu.kobotoolbox.org' })
  state.db.tables.kobo_submissions = [
    {
      id: 's1',
      cooperative_id: COOP_A,
      kobo_instance_id: 'i1',
      status: 'error',
      member_id: null,
      member_card_number: null,
      raw_payload: {},
      updated_at: T0,
    },
  ]
  state.rateOk = false
  const limited = await (retryRoute.POST as NonNullable<RouteModule['POST']>)(
    post('/api/integrations/kobo/retry', { cooperativeId: COOP_A }),
  )
  assert.equal(limited.status, 429)

  state.rateOk = true
  const bulk = await (retryRoute.POST as NonNullable<RouteModule['POST']>)(
    post('/api/integrations/kobo/retry', { cooperativeId: COOP_A }),
  )
  const bulkBody = await readJson(bulk)
  assert.equal(bulk.status, 200)
  assert.equal(bulkBody.ok, true)
  assert.equal(bulkBody.succeeded, 1)
  assert.equal(state.dispatchCalls[0]?.formType, 'market_price')
  assert.equal(state.dispatchCalls[0]?.serverUrl, 'https://eu.kobotoolbox.org')
  assert.equal(state.dispatchCalls[0]?.apiToken, TOKEN)

  state.dispatch = async () => {
    throw new Error('encore en échec')
  }
  const single = await (retryRoute.POST as NonNullable<RouteModule['POST']>)(
    post('/api/integrations/kobo/retry', {
      cooperativeId: COOP_A,
      submissionId: '44444444-4444-4444-8444-444444444444',
    }),
  )
  assert.equal(single.status, 422, 'ligne introuvable')
})

// ═══════════════════════════════════════════════════════════════════════════
// Webhook : secret par intégration, tenant dérivé du secret
// ═══════════════════════════════════════════════════════════════════════════

function seedTwoCooperatives() {
  state.db.tables.integrations = [
    {
      id: INT_A,
      cooperative_id: COOP_A,
      type: 'kobo',
      status: 'connected',
      config: {
        api_key: encryptSecret(TOKEN),
        form_id: UID,
        webhook_enabled: true,
        webhook_secret_hash: hashWebhookSecret(SECRET_A),
      },
    },
    {
      id: INT_B,
      cooperative_id: COOP_B,
      type: 'kobo',
      status: 'connected',
      config: {
        api_key: encryptSecret(TOKEN2),
        form_id: UID_B,
        webhook_enabled: true,
        webhook_secret_hash: hashWebhookSecret(SECRET_B),
      },
    },
  ]
}

function webhookPayload(over: Record<string, unknown> = {}) {
  return {
    _uuid: 'wh-uuid-1',
    _id: 501,
    _xform_id_string: UID,
    _submission_time: '2026-10-08T10:00:00',
    _submitted_by: null,
    'S1/prenom': 'Ama',
    ...over,
  }
}

let ipCounter = 0
function webhookPost(opts: {
  integration?: string
  headers?: Record<string, string>
  body?: unknown
  ip?: string
}) {
  const url = `/api/webhooks/kobo${opts.integration ? `?integration=${opts.integration}` : ''}`
  return post(url, opts.body ?? webhookPayload(), {
    'x-forwarded-for': opts.ip ?? `198.51.100.${(ipCounter++ % 200) + 1}`,
    ...opts.headers,
  })
}
const callWebhook = (req: NextRequest) =>
  (webhookRoute.POST as NonNullable<RouteModule['POST']>)(req)
const drain = async () => {
  await Promise.allSettled(state.waitUntilQueue.splice(0))
}

test('webhook : secret de l’intégration + `_submitted_by: null` → 200, soumission stockée dans SA coopérative, traitée avec le bon contexte', async () => {
  seedTwoCooperatives()
  const res = await callWebhook(
    webhookPost({ integration: INT_A, headers: { 'x-kobo-secret': SECRET_A } }),
  )
  const body = await readJson(res)
  assert.equal(res.status, 200, JSON.stringify(body))
  assert.equal(body.status, 'pending')
  const stored = state.db.rows('kobo_submissions')
  assert.equal(stored.length, 1)
  assert.equal(stored[0]?.cooperative_id, COOP_A)
  assert.equal(stored[0]?.kobo_form_id, UID)
  assert.equal((stored[0]?.raw_payload as Row)._submitted_by, null)

  await drain()
  assert.equal(state.dispatchCalls.length, 1)
  assert.equal(state.dispatchCalls[0]?.cooperativeId, COOP_A)
  assert.equal(
    state.dispatchCalls[0]?.apiToken,
    TOKEN,
    'le token déchiffré sert au téléchargement des pièces jointes',
  )
  const log = state.db.rows('kobo_sync_logs')[0] as Row
  assert.equal(log.integration_id, INT_A)
  assert.equal(log.sync_type, 'webhook')
  assert.equal(log.status, 'success')
  assert.equal(log.submissions_matched, 1)
  never(JSON.stringify(body), TOKEN, SECRET_A)
})

test('webhook : Basic Auth (mot de passe = secret) et Bearer acceptés', async () => {
  seedTwoCooperatives()
  const basic = Buffer.from(`kobo:${SECRET_A}`).toString('base64')
  const r1 = await callWebhook(
    webhookPost({
      integration: INT_A,
      headers: { authorization: `Basic ${basic}` },
      body: webhookPayload({ _uuid: 'b1' }),
    }),
  )
  assert.equal(r1.status, 200)
  const r2 = await callWebhook(
    webhookPost({
      integration: INT_A,
      headers: { authorization: `Bearer ${SECRET_A}` },
      body: webhookPayload({ _uuid: 'b2' }),
    }),
  )
  assert.equal(r2.status, 200)
  await drain()
  assert.equal(state.db.rows('kobo_submissions').length, 2)
})

test('webhook : SECRET DE LA COOP A + FORMULAIRE DE LA COOP B → 403, rien n’est inséré', async () => {
  seedTwoCooperatives()
  // L'URL de A authentifie A ; le formulaire de B n'est pas celui de A.
  const wrongForm = await callWebhook(
    webhookPost({
      integration: INT_A,
      headers: { 'x-kobo-secret': SECRET_A },
      body: webhookPayload({ _xform_id_string: UID_B }),
    }),
  )
  assert.equal(wrongForm.status, 403)
  // Le secret de A sur l'URL de B n'authentifie pas.
  const wrongUrl = await callWebhook(
    webhookPost({
      integration: INT_B,
      headers: { 'x-kobo-secret': SECRET_A },
      body: webhookPayload({ _xform_id_string: UID_B }),
    }),
  )
  assert.equal(wrongUrl.status, 403)
  assert.equal(state.db.rows('kobo_submissions').length, 0)
  assert.equal(state.dispatchCalls.length, 0)
})

test('webhook : le tenant vient du secret, pas du payload — même form_id sur deux intégrations', async () => {
  seedTwoCooperatives()
  // B revendique le MÊME formulaire que A (cf. kobo-29) : le secret de A ne peut écrire que chez A.
  ;(state.db.rows('integrations')[1] as Row).config = {
    ...(state.db.rows('integrations')[1]?.config as Row),
    form_id: UID,
  }
  const res = await callWebhook(
    webhookPost({ integration: INT_A, headers: { 'x-kobo-secret': SECRET_A } }),
  )
  assert.equal(res.status, 200)
  assert.equal(state.db.rows('kobo_submissions')[0]?.cooperative_id, COOP_A)
  await drain()
})

test('webhook : sans secret, mauvais secret, intégration inconnue ou id invalide → 403 uniforme', async () => {
  seedTwoCooperatives()
  const cases: Array<[string, NextRequest]> = [
    ['aucun en-tête', webhookPost({ integration: INT_A })],
    ['mauvais secret', webhookPost({ integration: INT_A, headers: { 'x-kobo-secret': 'nope' } })],
    [
      'intégration inconnue',
      webhookPost({
        integration: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
        headers: { 'x-kobo-secret': SECRET_A },
      }),
    ],
    [
      'identifiant invalide',
      webhookPost({ integration: 'pas-un-uuid', headers: { 'x-kobo-secret': SECRET_A } }),
    ],
    [
      'en-tête HMAC (jamais envoyé par Kobo)',
      webhookPost({ integration: INT_A, headers: { 'x-kobotoolbox-signature': 'abc' } }),
    ],
  ]
  for (const [label, req] of cases) {
    const res = await callWebhook(req)
    assert.equal(res.status, 403, label)
    assert.deepEqual(await res.json(), { error: 'Unauthorized' }, label)
  }
  assert.equal(state.db.rows('kobo_submissions').length, 0)
})

test('webhook : le secret GLOBAL n’est jamais accepté sur l’URL dédiée d’une intégration', async () => {
  seedTwoCooperatives()
  process.env.KOBO_WEBHOOK_SECRET = GLOBAL_SECRET
  const res = await callWebhook(
    webhookPost({ integration: INT_A, headers: { 'x-kobo-secret': GLOBAL_SECRET } }),
  )
  assert.equal(res.status, 403)
  // Intégration sans secret propre : elle n'authentifie personne, même avec une chaîne vide ou le secret global.
  ;(state.db.rows('integrations')[0] as Row).config = { form_id: UID, webhook_enabled: true }
  const res2 = await callWebhook(
    webhookPost({ integration: INT_A, headers: { 'x-kobo-secret': GLOBAL_SECRET } }),
  )
  assert.equal(res2.status, 403)
  assert.equal(state.db.rows('kobo_submissions').length, 0)
})

test('webhook : repli transitoire (ancienne URL + secret global) réservé aux intégrations SANS secret propre et au formulaire unique', async () => {
  process.env.KOBO_WEBHOOK_SECRET = GLOBAL_SECRET
  const cfg = (form: string, extra: Row = {}) => ({
    api_key: encryptSecret(TOKEN),
    form_id: form,
    webhook_enabled: true,
    ...extra,
  })
  state.db.tables.integrations = [
    {
      id: INT_A,
      cooperative_id: COOP_A,
      type: 'kobo',
      status: 'connected',
      config: cfg(UID, { webhook_secret_hash: hashWebhookSecret(SECRET_A) }),
    },
    { id: INT_C, cooperative_id: COOP_C, type: 'kobo', status: 'connected', config: cfg(UID_B) },
  ]
  // A a déjà son secret propre : le secret global ne permet plus d'écrire chez A.
  const refused = await callWebhook(webhookPost({ headers: { 'x-kobo-secret': GLOBAL_SECRET } }))
  assert.equal(refused.status, 403)
  assert.equal(state.db.rows('kobo_submissions').length, 0)

  // C n'a pas encore migré : repli accepté, tenant = C (formulaire unique).
  const accepted = await callWebhook(
    webhookPost({
      headers: { 'x-kobo-secret': GLOBAL_SECRET },
      body: webhookPayload({ _xform_id_string: UID_B, _uuid: 'legacy-1' }),
    }),
  )
  assert.equal(accepted.status, 200)
  assert.equal(state.db.rows('kobo_submissions')[0]?.cooperative_id, COOP_C)
  await drain()

  // Formulaire rattaché à deux intégrations : refus (409), jamais « la première trouvée ».
  state.db.rows('integrations').push({
    id: INT_D,
    cooperative_id: COOP_B,
    type: 'kobo',
    status: 'connected',
    config: cfg(UID_B),
  })
  const ambiguous = await callWebhook(
    webhookPost({
      headers: { 'x-kobo-secret': GLOBAL_SECRET },
      body: webhookPayload({ _xform_id_string: UID_B, _uuid: 'legacy-2' }),
    }),
  )
  assert.equal(ambiguous.status, 409)
  assert.equal(state.db.rows('kobo_submissions').length, 1)

  // Mauvais secret global
  const bad = await callWebhook(webhookPost({ headers: { 'x-kobo-secret': 'x'.repeat(40) } }))
  assert.equal(bad.status, 403)
  // Secret global absent de l'environnement : l'ancienne URL n'authentifie plus personne.
  Reflect.deleteProperty(process.env, 'KOBO_WEBHOOK_SECRET')
  const none = await callWebhook(webhookPost({ headers: { 'x-kobo-secret': GLOBAL_SECRET } }))
  assert.equal(none.status, 403)
})

test('webhook : interrupteur « webhook actif » respecté (200 « disabled », rien n’est stocké)', async () => {
  seedTwoCooperatives()
  ;(state.db.rows('integrations')[0] as Row).config = {
    ...(state.db.rows('integrations')[0]?.config as Row),
    webhook_enabled: false,
  }
  const res = await callWebhook(
    webhookPost({ integration: INT_A, headers: { 'x-kobo-secret': SECRET_A } }),
  )
  const body = await readJson(res)
  assert.equal(res.status, 200)
  assert.equal(body.status, 'disabled')
  assert.equal(body.received, false)
  assert.equal(state.db.rows('kobo_submissions').length, 0)
})

test('webhook : payload invalide APRÈS authentification → 422 visible (journal « failed »), pas un 200 silencieux', async () => {
  seedTwoCooperatives()
  const { _uuid: _omitted, ...noUuid } = webhookPayload()
  const res = await callWebhook(
    webhookPost({ integration: INT_A, headers: { 'x-kobo-secret': SECRET_A }, body: noUuid }),
  )
  assert.equal(res.status, 422)
  const log = state.db.rows('kobo_sync_logs')[0] as Row
  assert.equal(log.status, 'failed')
  assert.equal(log.integration_id, INT_A)
  assert.equal(state.db.rows('kobo_submissions').length, 0)

  const notJson = await callWebhook(
    webhookPost({
      integration: INT_A,
      headers: { 'x-kobo-secret': SECRET_A },
      body: '{pas du json',
    }),
  )
  assert.equal(notJson.status, 400)
})

test('webhook : erreur de stockage → 503 + Retry-After (Kobo réessaiera) ; doublon et livraison concurrente → « duplicate »', async () => {
  seedTwoCooperatives()
  state.db.failInsert.kobo_submissions = () => ({ code: '08006', message: 'connection lost' })
  const storage = await callWebhook(
    webhookPost({ integration: INT_A, headers: { 'x-kobo-secret': SECRET_A } }),
  )
  assert.equal(storage.status, 503)
  assert.ok(storage.headers.get('retry-after'))
  assert.equal(state.db.rows('kobo_submissions').length, 0)

  // Livraison concurrente : l'autre requête gagne l'insertion entre le contrôle et l'écriture.
  state.db.failInsert.kobo_submissions = (row) => {
    state.db.rows('kobo_submissions').push({
      id: 'winner',
      cooperative_id: row.cooperative_id,
      kobo_instance_id: row.kobo_instance_id,
      status: 'pending',
    })
    state.db.failInsert = {}
    return { code: '23505', message: 'duplicate key' }
  }
  const race = await callWebhook(
    webhookPost({
      integration: INT_A,
      headers: { 'x-kobo-secret': SECRET_A },
      body: webhookPayload({ _uuid: 'race-1' }),
    }),
  )
  const raceBody = await readJson(race)
  assert.equal(race.status, 200)
  assert.equal(raceBody.status, 'duplicate')
  assert.equal(raceBody.submission_id, 'winner')

  // Même soumission livrée deux fois
  const first = await callWebhook(
    webhookPost({
      integration: INT_A,
      headers: { 'x-kobo-secret': SECRET_A },
      body: webhookPayload({ _uuid: 'twice' }),
    }),
  )
  const again = await callWebhook(
    webhookPost({
      integration: INT_A,
      headers: { 'x-kobo-secret': SECRET_A },
      body: webhookPayload({ _uuid: 'twice' }),
    }),
  )
  assert.equal(first.status, 200)
  assert.equal((await readJson(again)).status, 'duplicate')
  await drain()
})

test('webhook : limite de débit par intégration APRÈS authentification → 503 + Retry-After (pas de 429 par IP)', async () => {
  seedTwoCooperatives()
  state.rateOk = false
  const res = await callWebhook(
    webhookPost({ integration: INT_A, headers: { 'x-kobo-secret': SECRET_A } }),
  )
  assert.equal(res.status, 503)
  assert.equal(res.headers.get('retry-after'), '12')
  assert.equal(state.db.rows('kobo_submissions').length, 0)
})

test('webhook : type de contenu, taille ; échecs d’authentification limités par IP (30/min), pas les envois réussis', async () => {
  seedTwoCooperatives()
  const notJson = new NextRequest('http://localhost/api/webhooks/kobo', {
    method: 'POST',
    headers: { 'content-type': 'text/plain' },
    body: 'x',
  })
  assert.equal((await callWebhook(notJson)).status, 415)
  const huge = new NextRequest('http://localhost/api/webhooks/kobo', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'content-length': String(3_000_000) },
    body: '{}',
  })
  assert.equal((await callWebhook(huge)).status, 413)

  const ip = '203.0.113.77'
  for (let i = 0; i < 30; i++) {
    const r = await callWebhook(
      webhookPost({ integration: INT_A, headers: { 'x-kobo-secret': 'nope' }, ip }),
    )
    assert.equal(r.status, 403)
  }
  // 31e requête de la même IP, même avec le bon secret : bloquée avant toute lecture en base.
  state.db.ops = []
  const blocked = await callWebhook(
    webhookPost({ integration: INT_A, headers: { 'x-kobo-secret': SECRET_A }, ip }),
  )
  assert.equal(blocked.status, 429)
  assert.equal(state.db.ops.length, 0)

  // Une autre IP (ex. l'IP partagée de Kobo) n'est pas affectée, et 40 envois réussis ne déclenchent aucun blocage.
  for (let i = 0; i < 40; i++) {
    const r = await callWebhook(
      webhookPost({
        integration: INT_A,
        headers: { 'x-kobo-secret': SECRET_A },
        ip: '192.0.2.1',
        body: webhookPayload({ _uuid: `ok-${i}` }),
      }),
    )
    assert.equal(r.status, 200, `envoi ${i}`)
  }
  await drain()
})

test('webhook : échec de traitement → ligne « error » + journal « failed » identifié par sa clé primaire', async () => {
  seedTwoCooperatives()
  state.dispatch = async () => {
    throw new Error(`Failed to create member: duplicate phone (Token ${TOKEN})`)
  }
  const res = await callWebhook(
    webhookPost({ integration: INT_A, headers: { 'x-kobo-secret': SECRET_A } }),
  )
  assert.equal(res.status, 200)
  await drain()
  const row = state.db.rows('kobo_submissions')[0] as Row
  assert.equal(row.status, 'error')
  assert.ok(!String(row.error_message).includes(TOKEN))
  const log = state.db.rows('kobo_sync_logs')[0] as Row
  assert.equal(log.status, 'failed')
  assert.equal(log.submissions_errors, 1)
})

test('webhook : deux livraisons concurrentes → chaque journal reste rattaché à SA soumission', async () => {
  seedTwoCooperatives()
  let release: () => void = () => undefined
  const gate = new Promise<void>((r) => {
    release = r
  })
  state.dispatch = async (input) => {
    if (input.payload._id === 1) {
      await gate // la première reste en cours pendant que la seconde échoue
      return { status: 'matched' }
    }
    throw new Error('boom')
  }
  await callWebhook(
    webhookPost({
      integration: INT_A,
      headers: { 'x-kobo-secret': SECRET_A },
      body: webhookPayload({ _uuid: 'c1', _id: 1 }),
    }),
  )
  await callWebhook(
    webhookPost({
      integration: INT_A,
      headers: { 'x-kobo-secret': SECRET_A },
      body: webhookPayload({ _uuid: 'c2', _id: 2 }),
    }),
  )
  await new Promise((r) => setTimeout(r, 10))
  release()
  await drain()
  const logs = state.db.rows('kobo_sync_logs')
  assert.equal(logs.length, 2)
  assert.deepEqual(logs.map((l) => l.status).sort(), ['failed', 'success'])
  const subs = state.db.rows('kobo_submissions')
  assert.equal((subs.find((s) => s.kobo_instance_id === 'c1') as Row).status, 'pending')
  assert.equal((subs.find((s) => s.kobo_instance_id === 'c2') as Row).status, 'error')
})

// ═══════════════════════════════════════════════════════════════════════════
// Répartiteur par type de formulaire (vrai processors.ts)
// ═══════════════════════════════════════════════════════════════════════════

async function dispatchReal(
  formType: string,
  payload: Record<string, unknown>,
  extra: Partial<DispatchCall> = {},
) {
  const submission = {
    id: 'sub-1',
    cooperative_id: COOP_A,
    kobo_instance_id: 'i1',
    status: 'pending',
    raw_payload: payload,
  }
  state.db.tables.kobo_submissions = [submission]
  return realProcessors.dispatchSubmission({
    submissionId: 'sub-1',
    cooperativeId: COOP_A,
    payload,
    formType,
    ...extra,
  })
}
const submissionRow = () => state.db.rows('kobo_submissions')[0] as Row

test('répartiteur : récolte avec carte inconnue → « unmatched » + motif (plus de « pending » à vie)', async () => {
  const out = await dispatchReal('harvest', {
    'S1/carte_membre': 'FEN-99999',
    'S2/recoltes': [{ culture: 'Maïs', quantite_kg: 50 }],
  })
  assert.equal(out.status, 'unmatched')
  assert.equal(submissionRow().status, 'unmatched')
  assert.match(String(submissionRow().error_message), /Carte membre introuvable/)
  assert.equal(state.db.rows('productions').length, 0)
  assert.equal(state.enrollCalls.length, 0, 'jamais d’enrôlement pour un formulaire de récolte')
})

test('répartiteur : récolte reconnue → productions insérées en UN lot, statut « matched » (et non « processed »)', async () => {
  state.db.rows('member_cards').push({
    card_number: 'FEN-12345',
    cooperative_id: COOP_A,
    member_id: 'mem-1',
    card_type: 'FAITIERE',
    status: 'active',
  })
  const out = await dispatchReal('harvest', {
    'S1/carte_membre': 'fen-12345',
    'S1/campagne': '2026A',
    'S2/recoltes': [
      { culture: 'Maïs', quantite_kg: 50 },
      { culture: 'Soja', quantite_kg: 0 },
      { 'S2/recoltes/culture': 'Riz', 'S2/recoltes/quantite_kg': '12' },
    ],
  })
  assert.equal(out.status, 'matched')
  assert.equal(submissionRow().status, 'matched')
  assert.equal(submissionRow().member_id, 'mem-1')
  assert.deepEqual((submissionRow().processed_payload as Row).inserted, 2)
  assert.equal(state.db.rows('productions').length, 2)
  assert.equal(state.db.ops.filter((o) => o.table === 'productions' && o.op === 'insert').length, 1)
  assert.equal(state.enrollCalls.length, 0)
})

test('répartiteur : erreur d’insertion Supabase LUE et propagée (jamais « processed » sur un échec)', async () => {
  state.db.rows('member_cards').push({
    card_number: 'FEN-12345',
    cooperative_id: COOP_A,
    member_id: 'mem-1',
    card_type: 'FAITIERE',
    status: 'active',
  })
  state.db.failInsert.productions = () => ({
    code: '23502',
    message: 'null value in column "parcelle_id"',
  })
  await assert.rejects(
    () =>
      dispatchReal('harvest', {
        'S1/carte_membre': 'FEN-12345',
        'S2/recoltes': [{ culture: 'Maïs', quantite_kg: 50 }],
      }),
    /Insertion des productions impossible/,
  )
  assert.notEqual(submissionRow().status, 'matched')
})

test('répartiteur : prix de marché — region_id résolu, prix arrondi, erreurs explicites', async () => {
  state.db.rows('regions').push({ id: 'reg-kara', name: 'Kara' })
  state.db.rows('cultures').push({ id: 'cul-mais', name: 'Maïs' })
  const payload = {
    'S1/marche': 'Kara',
    'S1/region': 'Kara',
    'S1/date_releve': '2026-10-07',
    'S2/produits': [
      { nom_produit: 'maïs', prix_kg: '312.6' },
      { nom_produit: 'inconnu', prix_kg: 100 },
    ],
  }
  const out = await dispatchReal('market_price', payload)
  assert.equal(out.status, 'matched')
  const prices = state.db.rows('market_prices')
  assert.equal(prices.length, 1)
  assert.equal(prices[0]?.region_id, 'reg-kara')
  assert.equal(prices[0]?.price, 313, 'price est un entier en base')
  assert.equal(submissionRow().status, 'matched')
  assert.equal((submissionRow().processed_payload as Row).skipped, 1)

  await assert.rejects(
    () => dispatchReal('market_price', { ...payload, 'S1/region': undefined }),
    /Région manquante/,
  )
  await assert.rejects(
    () => dispatchReal('market_price', { ...payload, 'S1/region': 'Atlantide' }),
    /introuvable/,
  )

  state.db.failInsert.market_prices = () => ({
    code: '23502',
    message: 'null value in column "region_id"',
  })
  await assert.rejects(() => dispatchReal('market_price', payload), /Insertion des prix impossible/)
  assert.notEqual(submissionRow().status, 'matched')
})

test('répartiteur : membre avec carte → rattaché par le rapprochement hiérarchique (plus de RPC), carte inconnue → « unmatched »', async () => {
  state.db.rows('member_cards').push({
    card_number: 'FEN-12345',
    cooperative_id: COOP_A,
    member_id: 'mem-1',
    card_type: 'FAITIERE',
    status: 'active',
  })
  const ok = await dispatchReal('member_enrollment', {}, { memberCardNumber: 'FEN-12345' })
  assert.equal(ok.status, 'matched')
  assert.equal(state.attachCalls.length, 1, 'le membre existant reçoit la soumission')
  assert.equal(state.attachCalls[0]?.[1], 'mem-1')
  assert.equal(state.enrollCalls.length, 0, 'jamais de nouveau membre pour une carte connue')
  assert.equal(
    state.db.rpcCalls.filter((c) => c.name !== 'get_cooperative_descendants').length,
    0,
    'ni match_kobo_submission_to_member ni process_kobo_submission : le rapprochement est fait côté serveur, dans l’arbre',
  )

  // Carte introuvable : motif enregistré, aucun membre créé ni rattaché.
  state.attachCalls = []
  const unmatched = await dispatchReal('member_enrollment', {}, { memberCardNumber: 'FEN-00000' })
  assert.equal(unmatched.status, 'unmatched')
  assert.match(String(submissionRow().error_message), /Carte membre introuvable/)
  assert.equal(state.attachCalls.length + state.enrollCalls.length, 0)

  // Échec de lecture de l'arbre de l'organisation : levé (la ligne passe en « error »), jamais ignoré.
  state.db.rpcHandlers.get_cooperative_descendants = () => ({
    data: null,
    error: { code: '42501', message: 'forbidden' },
  })
  await assert.rejects(
    () => dispatchReal('member_enrollment', {}, { memberCardNumber: 'FEN-12345' }),
    /arborescence de l'organisation impossible/,
  )
  assert.equal(submissionRow().status, 'error')
})

test('répartiteur : sans carte → inscription du membre, avec le serveur de l’intégration', async () => {
  const out = await dispatchReal(
    'member_enrollment',
    { 'S1/prenom': 'Ama' },
    { apiToken: TOKEN, serverUrl: 'https://eu.kobotoolbox.org' },
  )
  assert.equal(out.status, 'matched')
  assert.equal(state.enrollCalls.length, 1)
  assert.deepEqual(state.enrollCalls[0]?.[4], { serverUrl: 'https://eu.kobotoolbox.org' })
})

// ═══════════════════════════════════════════════════════════════════════════
// Token en clair hérité : refusé partout, rechiffré à la reconfiguration
// ═══════════════════════════════════════════════════════════════════════════

test('token en clair hérité : jamais utilisé par la sync ni par le webhook', async () => {
  seedIntegrations({ api_key: TOKEN })
  installKobo({ data: [sub(1)] })
  const res = await (syncRoute.POST as NonNullable<RouteModule['POST']>)(syncRequest())
  assert.equal(res.status, 500)
  assert.match(String((await readJson(res)).error), /Reconfigurez/)
  assert.equal(koboCalls.length, 0, 'aucun appel Kobo avec un token non chiffré')

  seedTwoCooperatives()
  ;(state.db.rows('integrations')[0] as Row).config = {
    api_key: TOKEN,
    form_id: UID,
    webhook_enabled: true,
    webhook_secret_hash: hashWebhookSecret(SECRET_A),
  }
  const hook = await callWebhook(
    webhookPost({ integration: INT_A, headers: { 'x-kobo-secret': SECRET_A } }),
  )
  assert.equal(hook.status, 200)
  await drain()
  assert.equal(state.dispatchCalls.length, 1)
  assert.equal(state.dispatchCalls[0]?.apiToken ?? null, null)
})

test('config POST : un token en clair hérité est rechiffré lors du réenregistrement', async () => {
  seedIntegrations({ api_key: TOKEN })
  installKobo({ data: [sub(1)] })
  const res = await (configRoute.POST as NonNullable<RouteModule['POST']>)(configPost({}))
  assert.equal(res.status, 200)
  const stored = String(configOf(integrationRow()).api_key)
  assert.match(stored, /^v1\./)
  assert.equal(decryptSecret(stored), TOKEN)
  never(JSON.stringify(await readJson(res)), TOKEN, stored)
})

// ═══════════════════════════════════════════════════════════════════════════
// Aucun secret dans les journaux
// ═══════════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════════
// Part B : champ clé commun, identité stable des soumissions, un formulaire = une organisation
// ═══════════════════════════════════════════════════════════════════════════

const keyMapping = (kobo_field: string, target_column: string, is_key_field = true) => ({
  id: `map-${kobo_field}`,
  cooperative_id: COOP_A,
  form_id: UID,
  kobo_field,
  target_table: 'members',
  target_column,
  transform_fn: null,
  is_key_field,
})

test('webhook : le champ clé de kobo_field_mappings est lu comme par le pull — carte normalisée, « NON » ignoré', async () => {
  seedTwoCooperatives()
  state.db.tables.kobo_field_mappings = [keyMapping('S1/carte_membre', 'card_number')]
  const headers = { 'x-kobo-secret': SECRET_A }
  await callWebhook(
    webhookPost({
      integration: INT_A,
      headers,
      body: webhookPayload({ _uuid: 'k1', 'S1/carte_membre': ' fen-12345 ' }),
    }),
  )
  await callWebhook(
    webhookPost({
      integration: INT_A,
      headers,
      body: webhookPayload({ _uuid: 'k2', _id: 502, 'S1/carte_membre': 'NON' }),
    }),
  )
  await drain()
  const subs = state.db.rows('kobo_submissions')
  assert.equal(
    (subs.find((r) => r.kobo_instance_id === 'k1') as Row).member_card_number,
    'FEN-12345',
  )
  assert.equal((subs.find((r) => r.kobo_instance_id === 'k2') as Row).member_card_number, null)
  assert.equal(
    state.dispatchCalls.find((c) => c.payload._uuid === 'k1')?.memberCardNumber,
    'FEN-12345',
  )
})

test('webhook : version modifiée (même meta/rootUuid, nouvel _uuid) → ligne mise à jour et retraitée, jamais de doublon', async () => {
  seedTwoCooperatives()
  const send = (over: Record<string, unknown>) =>
    callWebhook(
      webhookPost({
        integration: INT_A,
        headers: { 'x-kobo-secret': SECRET_A },
        body: webhookPayload({ 'meta/rootUuid': 'uuid:root-1', ...over }),
      }),
    )
  await send({ _uuid: 'root-1' })
  await drain()
  const edited = await send({
    _uuid: 'edit-2',
    'meta/deprecatedID': 'uuid:root-1',
    'S1/prenom': 'Amélie',
  })
  const body = await readJson(edited)
  assert.equal(edited.status, 200)
  assert.equal(body.status, 'pending')
  assert.match(String(body.message), /Modified/)
  await drain()

  const subs = state.db.rows('kobo_submissions')
  assert.equal(subs.length, 1)
  const row = subs[0] as Row
  assert.equal(row.kobo_instance_id, 'root-1', 'clé stable = meta/rootUuid')
  assert.equal((row.raw_payload as Row)._uuid, 'edit-2')
  assert.equal((row.raw_payload as Row)['S1/prenom'], 'Amélie')
  assert.equal(state.dispatchCalls.length, 2, 'la version modifiée est retraitée')

  const again = await send({ _uuid: 'edit-2', 'meta/deprecatedID': 'uuid:root-1' })
  assert.equal((await readJson(again)).status, 'duplicate')
})

test('pull : une soumission MODIFIÉE met sa ligne à jour et la retraite ; modifiée pendant son traitement → ignorée', async () => {
  const v1 = (id: number) => sub(id, { 'meta/rootUuid': `uuid:uuid-${id}` })
  state.db.tables.kobo_submissions = [
    {
      id: 's1',
      cooperative_id: COOP_A,
      kobo_instance_id: 'uuid-1',
      status: 'matched',
      raw_payload: v1(1),
    },
    {
      id: 's2',
      cooperative_id: COOP_A,
      kobo_instance_id: 'uuid-2',
      status: 'processing',
      raw_payload: v1(2),
    },
  ]
  const edited = (id: number) => ({
    ...v1(id),
    _uuid: `uuid-${id}-edit`,
    'meta/deprecatedID': `uuid:uuid-${id}`,
    'S1/prenom': 'Amélie',
  })
  installKobo({ data: [edited(1), edited(2), v1(3)] })
  const r = await service().pullSubmissions(pullOptions())
  assert.equal(r.processed, 2, 'la modification de 1 et la nouvelle 3')
  assert.equal(r.skipped, 1, '2 est en cours de traitement : reprise à la prochaine synchro')
  const rows = state.db.rows('kobo_submissions')
  assert.equal(rows.length, 3, 'aucun doublon pour 1 et 2')
  assert.equal(((rows.find((x) => x.id === 's1') as Row).raw_payload as Row)['S1/prenom'], 'Amélie')
  assert.equal(((rows.find((x) => x.id === 's2') as Row).raw_payload as Row)['S1/prenom'], 'Ama')
  assert.deepEqual(
    state.dispatchCalls.map((c) => c.submissionId).filter((id) => id === 's1' || id === 's2'),
    ['s1'],
  )
})

test('pull / relance : « skipped » (pris en charge ailleurs) n’est ni traité ni un échec ; les « processing » périmés sont repris', async () => {
  installKobo({ data: [sub(1)] })
  state.dispatch = async () => ({
    status: 'skipped',
    detail: 'Soumission déjà en cours de traitement',
  })
  const r = await service().pullSubmissions(pullOptions())
  assert.equal(r.processed, 0)
  assert.equal(r.skipped, 1)
  assert.equal(r.errors, 0)

  const ago = (min: number) => new Date(Date.now() - min * 60_000).toISOString()
  const row = (id: string, status: string, min: number): Row => ({
    id,
    cooperative_id: COOP_A,
    kobo_instance_id: `inst-${id}`,
    status,
    member_id: null,
    member_card_number: null,
    raw_payload: {},
    updated_at: ago(min),
  })
  state.db.tables.kobo_submissions = [
    row('proc-old', 'processing', 20),
    row('proc-recent', 'processing', 1),
    row('pend-old', 'pending', 30),
  ]
  state.dispatchCalls = []
  const retry = await service().retryFailedSubmissions(COOP_A, TOKEN, {})
  assert.deepEqual(state.dispatchCalls.map((c) => c.submissionId).sort(), ['pend-old', 'proc-old'])
  assert.equal(retry.skipped, 2)
  assert.equal(retry.failed, 0)
  assert.equal(retry.errors.length, 0)
})

test('retry : ligne prise en charge ailleurs → 409 (ni succès ni échec) ; en lot, comptée à part', async () => {
  seedIntegrations()
  const rowId = '55555555-5555-4555-8555-555555555555'
  state.db.tables.kobo_submissions = [
    {
      id: rowId,
      cooperative_id: COOP_A,
      kobo_instance_id: 'i1',
      status: 'error',
      member_id: null,
      member_card_number: null,
      raw_payload: {},
      updated_at: T0,
    },
  ]
  state.dispatch = async () => ({
    status: 'skipped',
    detail: 'Soumission déjà en cours de traitement',
  })
  const single = await (retryRoute.POST as NonNullable<RouteModule['POST']>)(
    post('/api/integrations/kobo/retry', { cooperativeId: COOP_A, submissionId: rowId }),
  )
  assert.equal(single.status, 409)
  assert.match(String((await readJson(single)).error), /en cours/)

  const bulk = await readJson(
    await (retryRoute.POST as NonNullable<RouteModule['POST']>)(
      post('/api/integrations/kobo/retry', { cooperativeId: COOP_A }),
    ),
  )
  assert.equal(bulk.skipped, 1)
  assert.equal(bulk.failed, 0)
})

test('config POST : un formulaire déjà lié à une AUTRE organisation est refusé (409) ; le nom n’est révélé qu’aux ayants droit', async () => {
  seedTwoCooperatives() // INT_A : COOP_A / UID ; INT_B : COOP_B / UID_B
  state.db.rows('cooperatives').push({ id: COOP_A, name: 'FENAFAT Nord' })
  installKobo({ data: [] })
  const linkAs = () =>
    (configRoute.POST as NonNullable<RouteModule['POST']>)(
      configPost({ cooperativeId: COOP_B, formId: UID, apiToken: TOKEN2 }),
    )

  const visible = await linkAs()
  const visibleBody = await readJson(visible)
  assert.equal(visible.status, 409)
  assert.equal(visibleBody.code, 'form_already_linked')
  assert.match(String(visibleBody.details), /« FENAFAT Nord »/)
  assert.equal(koboCalls.length, 0, 'refusé AVANT tout appel à Kobo')
  assert.equal(
    (state.db.rows('integrations').find((r) => r.id === INT_B) as Row).config &&
      configOf(state.db.rows('integrations').find((r) => r.id === INT_B) as Row).form_id,
    UID_B,
    'configuration de COOP_B inchangée',
  )

  state.deniedCoops.add(COOP_A)
  const hidden = await readJson(await linkAs())
  assert.doesNotMatch(String(hidden.details), /FENAFAT/)
  assert.match(String(hidden.details), /une autre organisation/)

  // Déconnecté (form_id effacé) → le formulaire est de nouveau libre ; et COOP_A peut réenregistrer le sien.
  state.deniedCoops.clear()
  Object.assign(state.db.rows('integrations').find((r) => r.id === INT_A) as Row, {
    status: 'disconnected',
  })
  assert.equal((await linkAs()).status, 200)
})

test('config POST : une correspondance non prise en charge est refusée AVANT tout appel réseau, avec un motif lisible', async () => {
  seedIntegrations()
  installKobo({ data: [] })
  const res = await (configRoute.POST as NonNullable<RouteModule['POST']>)(
    configPost({
      fieldMappings: [
        {
          koboField: 'S4/nb_cotisations_12mois',
          targetTable: 'cotisations',
          targetColumn: 'amount',
          isKeyField: false,
        },
      ],
    }),
  )
  const body = await readJson(res)
  assert.equal(res.status, 400)
  assert.match(String(body.details), /cotisations/)
  assert.equal(koboCalls.length, 0)
})

test('journaux : ni token Kobo, ni secret de webhook, ni valeur chiffrée dans tout ce qui a été journalisé', () => {
  assert.ok(logged.length > 0, 'des journaux ont bien été produits')
  const all = logged.join('\n')
  never(all, TOKEN, TOKEN2, SECRET_A, SECRET_B, GLOBAL_SECRET, hashWebhookSecret(SECRET_A), 'v1.')
})
