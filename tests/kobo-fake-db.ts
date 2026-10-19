/**
 * Faux Supabase en mémoire pour les tests Kobo qui exercent les VRAIS modules d'ingestion
 * (lib/kobo/ingest, linkage, enrollment, processors).
 *
 * Reproduit ce dont ces modules ont besoin : requêtes chaînées (eq/in/is/not/lt/neq/filter/ilike/
 * order/limit/single/maybeSingle), insert/update/upsert/delete avec `.select()`, contraintes
 * d'unicité (avec condition éventuelle, ex. l'index partiel sur le téléphone), rpc simulés et
 * stockage. `ilike` traduit les motifs SQL (%, _) pour de vrai.
 */
import { randomUUID } from 'node:crypto'

export type Row = Record<string, unknown>
export type DbError = { code?: string; message: string }
export type Result = { data: unknown; error: DbError | null }

function readCol(row: Row, col: string): unknown {
  if (col.includes('->>')) {
    const [a, b] = col.split('->>') as [string, string]
    return (row[a] as Row | undefined)?.[b]
  }
  return row[col]
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

export interface UniqueRule {
  keys: string[]
  /** Index partiel : la règle ne s'applique qu'aux lignes pour lesquelles cette condition est vraie. */
  when?: (row: Row) => boolean
}

export class FakeDb {
  tables: Record<string, Row[]> = {}
  ops: Array<{ table: string; op: string; payload?: unknown }> = []
  rpcCalls: Array<{ name: string; args: unknown }> = []
  rpcHandlers: Record<string, (args: unknown) => Result> = {}
  uniques: Record<string, UniqueRule[]> = {
    kobo_submissions: [{ keys: ['kobo_instance_id', 'cooperative_id'] }],
    integrations: [{ keys: ['cooperative_id', 'type'] }],
    members: [
      { keys: ['id'] },
      {
        keys: ['cooperative_id', 'phone'],
        when: (r) => typeof r.phone === 'string' && r.phone !== '',
      },
    ],
    member_cards: [{ keys: ['card_number'] }],
  }
  failInsert: Record<string, (row: Row) => DbError | null> = {}
  failUpdate: Record<string, (patch: Row) => DbError | null> = {}
  uploads: Array<{ bucket: string; path: string; bytes: number; contentType?: string }> = []
  failUpload: ((bucket: string, path: string) => DbError | null) | null = null

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
    from: (bucket: string) => ({
      upload: async (
        path: string,
        body: Buffer,
        opts?: { contentType?: string },
      ): Promise<{ error: DbError | null }> => {
        const failure = this.failUpload?.(bucket, path) ?? null
        if (failure) return { error: failure }
        this.uploads.push({ bucket, path, bytes: body.byteLength, contentType: opts?.contentType })
        return { error: null }
      },
      getPublicUrl: (path: string) => ({
        data: { publicUrl: `https://storage.test/${bucket}/${path}` },
      }),
    }),
  }
}

class Query implements PromiseLike<Result> {
  private op: 'select' | 'insert' | 'update' | 'delete' | 'upsert' = 'select'
  private filters: Array<(r: Row) => boolean> = []
  private payload: Row | Row[] = {}
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
    const re = likeToRegExp(pattern)
    this.filters.push((r) => re.test(String(readCol(r, col) ?? '')))
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

  private violates(row: Row): string | null {
    for (const rule of this.db.uniques[this.table] ?? []) {
      if (rule.when && !rule.when(row)) continue
      const clash = this.db
        .rows(this.table)
        .some((r) => (!rule.when || rule.when(r)) && rule.keys.every((k) => r[k] === row[k]))
      if (clash) return rule.keys.join(',')
    }
    return null
  }

  private insertOne(row: Row): { error: DbError } | Row {
    const hook = this.db.failInsert[this.table]?.(row)
    if (hook) return { error: hook }
    const clash = this.violates(row)
    if (clash) {
      return {
        error: {
          code: '23505',
          message: `duplicate key value violates unique constraint (${clash})`,
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
        if ('error' in r && Object.keys(r).length === 1)
          return { data: null, error: r.error as DbError }
        inserted.push(r as Row)
      }
      return this.returning ? this.shape(inserted) : { data: null, error: null }
    }

    if (this.op === 'update') {
      const hook = this.db.failUpdate[this.table]?.(this.payload as Row)
      if (hook) return { data: null, error: hook }
      for (const r of matching) {
        const next = { ...r, ...structuredClone(this.payload as Row) }
        const others = all.filter((x) => x !== r)
        const saved = this.db.tables[this.table]
        this.db.tables[this.table] = others
        const clash = this.violates(next)
        this.db.tables[this.table] = saved ?? all
        if (clash) {
          return {
            data: null,
            error: {
              code: '23505',
              message: `duplicate key value violates unique constraint (${clash})`,
            },
          }
        }
        Object.assign(r, structuredClone(this.payload as Row))
      }
      return this.returning ? this.shape(matching) : { data: null, error: null }
    }

    // delete
    this.db.tables[this.table] = all.filter((r) => !matching.includes(r))
    return { data: null, error: null }
  }
}
