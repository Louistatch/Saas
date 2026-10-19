/**
 * Doublures partagées des tests « comptes d'exploitation » (tests/fiches-*.test.ts).
 *
 * - Faux Supabase en mémoire : DEUX clients (service et session) sur la même
 *   base, chaque opération étant journalisée avec le client qui l'a faite —
 *   c'est ce qui permet de vérifier qu'une suppression passe bien par le
 *   client de service.
 * - Faux stockage (list / createSignedUrl / remove / upload) avec octets réels.
 * - fetch simulé (FedaPay, URL signées du faux stockage).
 * - Interception de Module._load (fichiers exécutés en CJS par tsx) pour
 *   remplacer les frontières : clients Supabase, garde d'accès, e-mails,
 *   `after` de next/server, session de carte.
 */
import { randomUUID } from 'node:crypto'

export type Row = Record<string, unknown>
type DbError = { code?: string; message: string }
type Result = { data: unknown; error: DbError | null; count?: number | null }

export interface OpLog {
  client: 'admin' | 'session'
  table: string
  op: string
  payload?: unknown
  /** Colonnes demandées par select(). */
  columns?: string
}

/**
 * Index unique (partiel) : deux lignes qui vérifient `where` et ont les mêmes
 * valeurs non nulles dans `columns` → erreur 23505, comme Postgres.
 */
export interface UniqueIndex {
  name: string
  columns: string[]
  where: (r: Row) => boolean
}

export interface StoredObject {
  bytes: Uint8Array
  mimetype: string
}

export class Store {
  tables: Record<string, Row[]> = {}
  ops: OpLog[] = []
  rpcCalls: Array<{ client: string; name: string; args: unknown }> = []
  storage: Record<string, Map<string, StoredObject>> = {}
  storageCalls: Array<{ client: string; bucket: string; op: string; args: unknown[] }> = []
  /** Réponse d'insertion forcée (ex. erreur), par table. */
  failInsert: Record<string, DbError | null> = {}
  failDelete: Record<string, DbError | null> = {}
  /** Mise à jour refusée, par table, quand le prédicat accepte le contenu écrit. */
  failUpdate: Record<string, ((payload: Row) => DbError | null) | null> = {}
  /** Index uniques appliqués à l'insertion et à la mise à jour, par table. */
  unique: Record<string, UniqueIndex[]> = {}
  /**
   * Point d'arrêt appelé avant chaque opération (déjà journalisée) : une
   * promesse retient l'opération, ce qui permet d'entrelacer deux requêtes
   * « simultanées » dans un ordre choisi.
   */
  gate: ((op: OpLog) => Promise<void> | void) | null = null

  /** Violation d'unicité si `candidate` rejoignait `rows` (hors `self`). */
  uniqueViolation(table: string, rows: Row[], candidate: Row, self?: Row): DbError | null {
    for (const idx of this.unique[table] ?? []) {
      if (!idx.where(candidate) || idx.columns.some((c) => candidate[c] == null)) continue
      const clash = rows.some(
        (r) => r !== self && idx.where(r) && idx.columns.every((c) => r[c] === candidate[c]),
      )
      if (clash)
        return {
          code: '23505',
          message: `duplicate key value violates unique constraint "${idx.name}"`,
        }
    }
    return null
  }

  rows(table: string): Row[] {
    this.tables[table] ??= []
    return this.tables[table] as Row[]
  }
  bucket(name: string): Map<string, StoredObject> {
    this.storage[name] ??= new Map()
    return this.storage[name] as Map<string, StoredObject>
  }
  put(
    bucket: string,
    path: string,
    bytes: number[] | Uint8Array,
    mimetype = 'application/octet-stream',
  ) {
    this.bucket(bucket).set(path, { bytes: Uint8Array.from(bytes), mimetype })
  }
}

function likeToRegExp(pattern: string): RegExp {
  let out = ''
  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i] as string
    if (ch === '\\') {
      out += (pattern[i + 1] ?? '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      i++
    } else if (ch === '%') out += '.*'
    else if (ch === '_') out += '.'
    else out += ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  }
  return new RegExp(`^${out}$`, 'is')
}

class Query implements PromiseLike<Result> {
  private op: 'select' | 'insert' | 'update' | 'delete' = 'select'
  private filters: Array<(r: Row) => boolean> = []
  private payload: Row | Row[] = {}
  private limitN: number | null = null
  private rangeSpec: [number, number] | null = null
  private orderSpec: { col: string; asc: boolean } | null = null
  private mode: 'many' | 'single' | 'maybe' = 'many'
  private returning = false
  private countMode = false
  private head = false
  private columns: string | undefined

  constructor(
    private client: FakeClient,
    private table: string,
  ) {}

  select(cols?: string, opts?: { count?: string; head?: boolean }) {
    this.returning = true
    this.columns = cols
    if (opts?.count) this.countMode = true
    if (opts?.head) this.head = true
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
  delete() {
    this.op = 'delete'
    return this
  }
  eq(col: string, v: unknown) {
    this.filters.push((r) => r[col] === v)
    return this
  }
  neq(col: string, v: unknown) {
    this.filters.push((r) => r[col] !== v)
    return this
  }
  in(col: string, arr: unknown[]) {
    this.filters.push((r) => arr.includes(r[col]))
    return this
  }
  is(col: string, v: unknown) {
    this.filters.push((r) => (r[col] ?? null) === v)
    return this
  }
  not(col: string, _op: string, v: unknown) {
    this.filters.push((r) => (r[col] ?? null) !== v)
    return this
  }
  gt(col: string, v: string) {
    this.filters.push((r) => String(r[col] ?? '') > v)
    return this
  }
  gte(col: string, v: string) {
    this.filters.push((r) => String(r[col] ?? '') >= v)
    return this
  }
  lt(col: string, v: string) {
    this.filters.push((r) => String(r[col] ?? '') < v)
    return this
  }
  ilike(col: string, pattern: string) {
    const re = likeToRegExp(pattern)
    this.filters.push((r) => re.test(String(r[col] ?? '')))
    return this
  }
  filter(col: string, op: string, v: string) {
    if (op === 'imatch') {
      const re = new RegExp(v, 'iu')
      this.filters.push((r) => re.test(String(r[col] ?? '')))
    } else this.filters.push((r) => r[col] === v)
    return this
  }
  or() {
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
  range(from: number, to: number) {
    this.rangeSpec = [from, to]
    return this
  }
  single<T = unknown>() {
    this.mode = 'single'
    return this as unknown as PromiseLike<{ data: T; error: DbError | null }> & Query
  }
  maybeSingle<T = unknown>() {
    this.mode = 'maybe'
    return this as unknown as PromiseLike<{ data: T | null; error: DbError | null }> & Query
  }
  // biome-ignore lint/suspicious/noThenProperty: faux client Supabase « thenable »
  then<T1 = Result, T2 = never>(
    onF?: ((v: Result) => T1 | PromiseLike<T1>) | null,
    onR?: ((e: unknown) => T2 | PromiseLike<T2>) | null,
  ) {
    const store = this.client.store
    const entry: OpLog = {
      client: this.client.label,
      table: this.table,
      op: this.op,
      payload: this.payload,
      columns: this.columns,
    }
    store.ops.push(entry)
    const held = store.gate?.(entry)
    if (!held) return Promise.resolve(this.exec()).then(onF, onR)
    return held.then(() => this.exec()).then(onF, onR)
  }

  private shape(rows: Row[]): Result {
    let out = rows.map((r) => structuredClone(r))
    if (this.orderSpec) {
      const { col, asc } = this.orderSpec
      out = out.sort(
        (a, b) => String(a[col] ?? '').localeCompare(String(b[col] ?? '')) * (asc ? 1 : -1),
      )
    }
    const total = out.length
    if (this.rangeSpec) out = out.slice(this.rangeSpec[0], this.rangeSpec[1] + 1)
    if (this.limitN !== null) out = out.slice(0, this.limitN)
    if (this.head) return { data: null, error: null, count: total }
    if (this.mode === 'single')
      return out.length === 1
        ? { data: out[0], error: null }
        : { data: null, error: { code: 'PGRST116', message: 'not exactly one row' } }
    if (this.mode === 'maybe') return { data: out[0] ?? null, error: null }
    return { data: out, error: null, count: this.countMode ? total : null }
  }

  private exec(): Result {
    const store = this.client.store
    const all = store.rows(this.table)
    const matching = all.filter((r) => this.filters.every((f) => f(r)))
    if (this.op === 'select') return this.shape(matching)
    if (this.op === 'insert') {
      const fail = store.failInsert[this.table]
      if (fail) return { data: null, error: fail }
      const inserted: Row[] = []
      for (const row of Array.isArray(this.payload) ? this.payload : [this.payload]) {
        const now = new Date().toISOString()
        const stored: Row = {
          id: randomUUID(),
          created_at: now,
          updated_at: now,
          ...structuredClone(row),
        }
        const clash = store.uniqueViolation(this.table, [...all, ...inserted], stored)
        if (clash) return { data: null, error: clash } // instruction annulée en bloc
        inserted.push(stored)
      }
      all.push(...inserted)
      return this.returning ? this.shape(inserted) : { data: null, error: null }
    }
    if (this.op === 'update') {
      const refused = store.failUpdate[this.table]?.(this.payload as Row)
      if (refused) return { data: null, error: refused }
      for (const r of matching) {
        const clash = store.uniqueViolation(this.table, all, { ...r, ...(this.payload as Row) }, r)
        if (clash) return { data: null, error: clash }
      }
      for (const r of matching) Object.assign(r, structuredClone(this.payload as Row))
      return this.returning ? this.shape(matching) : { data: null, error: null }
    }
    const fail = store.failDelete[this.table]
    if (fail) return { data: null, error: fail }
    store.tables[this.table] = all.filter((r) => !matching.includes(r))
    return { data: null, error: null }
  }
}

export class FakeClient {
  authUser: Row | null = null
  rpcHandlers: Record<string, (args: unknown) => Result> = {}
  constructor(
    public store: Store,
    public label: 'admin' | 'session',
  ) {}
  from(table: string) {
    return new Query(this, table)
  }
  rpc(name: string, args: unknown) {
    this.store.rpcCalls.push({ client: this.label, name, args })
    return Promise.resolve(this.rpcHandlers[name]?.(args) ?? { data: null, error: null })
  }
  auth = {
    getUser: async () => ({ data: { user: this.authUser }, error: null }),
  }
  storage = {
    from: (bucket: string) => {
      const store = this.store
      const objects = store.bucket(bucket)
      const log = (op: string, args: unknown[]) =>
        store.storageCalls.push({ client: this.label, bucket, op, args })
      return {
        list: async (folder: string, opts?: { search?: string; limit?: number }) => {
          log('list', [folder, opts])
          const prefix = folder ? `${folder}/` : ''
          const data = [...objects.entries()]
            .filter(([p]) => p.startsWith(prefix) && !p.slice(prefix.length).includes('/'))
            .map(([p, o]) => ({
              name: p.slice(prefix.length),
              metadata: { size: o.bytes.length, mimetype: o.mimetype },
            }))
            .filter((e) => !opts?.search || e.name.includes(opts.search))
          return { data, error: null }
        },
        createSignedUrl: async (
          path: string,
          expiresIn: number,
          opts?: { download?: string | boolean },
        ) => {
          log('createSignedUrl', [path, expiresIn, opts])
          if (!objects.has(path)) return { data: null, error: { message: 'Object not found' } }
          const dl = opts?.download ? `&download=${encodeURIComponent(String(opts.download))}` : ''
          return {
            data: { signedUrl: `https://storage.test/${bucket}/${path}?token=t${dl}` },
            error: null,
          }
        },
        remove: async (paths: string[]) => {
          log('remove', [paths])
          const removed = paths.filter((p) => objects.delete(p)).map((name) => ({ name }))
          return { data: removed, error: null }
        },
        upload: async (path: string) => {
          log('upload', [path])
          return { data: { path }, error: null }
        },
      }
    },
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// fetch simulé
// ═══════════════════════════════════════════════════════════════════════════

export type FetchHandler = (url: string, init: RequestInit) => Response | Promise<Response> | null

export function installFetch(store: Store, handlers: FetchHandler[]) {
  const calls: Array<{ url: string; method: string; body: unknown; headers: unknown }> = []
  globalThis.fetch = (async (input: string | URL | Request, init: RequestInit = {}) => {
    const url = String(input instanceof Request ? input.url : input)
    calls.push({
      url,
      method: init.method ?? 'GET',
      body: init.body ? JSON.parse(String(init.body)) : null,
      headers: init.headers,
    })
    // URL signées du faux stockage : sert les octets, avec Range.
    const m = url.match(/^https:\/\/storage\.test\/([^/]+)\/([^?]+)/)
    if (m) {
      const obj = store.bucket(m[1] as string).get(decodeURIComponent(m[2] as string))
      if (!obj) return new Response('not found', { status: 404 })
      return new Response(obj.bytes.slice(0, 8), { status: 206 })
    }
    for (const h of handlers) {
      const r = await h(url, init)
      if (r) return r
    }
    return new Response('unexpected', { status: 599 })
  }) as typeof fetch
  return calls
}

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

// ═══════════════════════════════════════════════════════════════════════════
// Doublures de modules
// ═══════════════════════════════════════════════════════════════════════════

export interface StubState {
  store: Store
  admin: FakeClient
  session: FakeClient
  /** Rôle renvoyé par la garde (null = non connecté). */
  ctx: {
    userId: string
    role: string
    cooperativeId: string | null
    cooperativeLevel: string | null
  } | null
  afterQueue: Promise<unknown>[]
  emails: Array<{ to: string | null; subject: string | null; text: string }>
  superAdminAlerts: Array<{ subject: string; lines: string[] }>
  privateCard: { ok: boolean; card?: Row }
}

export function installStubs(): StubState {
  const store = new Store()
  const state: StubState = {
    store,
    admin: new FakeClient(store, 'admin'),
    session: new FakeClient(store, 'session'),
    ctx: null,
    afterQueue: [],
    emails: [],
    superAdminAlerts: [],
    privateCard: { ok: false },
  }
  const Module = require('node:module') as {
    _load: (request: string, parent: unknown, isMain: boolean) => unknown
  }
  const realNextServer = require('next/server') as Record<string, unknown> & {
    NextResponse: { json: (b: unknown, i?: ResponseInit) => Response }
  }
  const { NextResponse } = realNextServer
  const forbidden = (status: number) => ({
    ok: false as const,
    response: NextResponse.json(
      { error: status === 401 ? 'Unauthorized' : 'Forbidden' },
      { status },
    ),
  })
  const guardFor = (required: 'super_admin' | 'cooperative_admin') => {
    const c = state.ctx
    if (!c) return forbidden(401)
    if (required === 'super_admin' && c.role !== 'super_admin') return forbidden(403)
    if (required === 'cooperative_admin' && !['super_admin', 'cooperative_admin'].includes(c.role))
      return forbidden(403)
    return { ok: true as const, ctx: { ...c, harooType: null, supabase: state.session } }
  }
  const stubs: Record<string, unknown> = {
    'server-only': {},
    '@/lib/supabase/admin': { createClient: () => state.admin },
    '@/lib/supabase/server': { createClient: async () => state.session },
    '@/lib/security/assert-access': {
      assertRole: async (r: 'super_admin' | 'cooperative_admin') => guardFor(r),
      assertAuthenticated: async () => (state.ctx ? guardFor('cooperative_admin') : forbidden(401)),
    },
    '@/lib/security/card-access': {
      requirePrivateCard: async () =>
        state.privateCard.ok
          ? { ok: true, card: state.privateCard.card, supabase: state.session }
          : { ok: false },
    },
    '@/lib/email/resend': {
      renderEmail: (b: { title: string; lines: string[] }) => ({
        html: '',
        text: [b.title, ...b.lines].join('\n'),
      }),
      deliverEmail: async (
        to: string | null,
        subject: string | null,
        content: { text: string } | null,
      ) => {
        state.emails.push({ to, subject, text: content?.text ?? '' })
        return { ok: true }
      },
      emailAddress: async () => undefined,
      emailSuperAdmins: async (subject: string, body: { lines: string[] }) => {
        state.superAdminAlerts.push({ subject, lines: body.lines })
      },
    },
    'next/server': {
      ...realNextServer,
      after: (fn: () => unknown) => {
        state.afterQueue.push(Promise.resolve().then(fn))
      },
    },
  }
  const origLoad = Module._load
  Module._load = function (this: unknown, request: string, parent: unknown, isMain: boolean) {
    if (request in stubs) return stubs[request]
    return origLoad.call(this, request, parent, isMain)
  }
  return state
}

export function resetStore(state: StubState) {
  const store = new Store()
  state.store = store
  state.admin.store = store
  state.session.store = store
  state.admin.rpcHandlers = {}
  state.session.authUser = null
  state.ctx = null
  state.afterQueue = []
  state.emails = []
  state.superAdminAlerts = []
  state.privateCard = { ok: false }
}

export async function flushAfter(state: StubState) {
  while (state.afterQueue.length) await state.afterQueue.shift()
}
