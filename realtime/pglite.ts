/**
 * Local and end-to-end repository: the REAL chat migration executed in PGlite, each call run as
 * the token's subject (auth.uid()). Refused in production. The token's identity is still checked
 * by the RealtimeAuth adapter (Supabase Auth or its local mock) before any call reaches here.
 */
import { readFileSync } from 'node:fs'
import type { ChatMessage, Me } from '../lib/haroolife/realtime/protocol'
import { type ChatRepository, RepoError } from './core'

/** Fixture accounts for local play and tests (fictional people, no real member). */
export const LOCAL_ACCOUNTS = {
  ama: {
    id: 'a1a1a1a1-0000-4000-8000-000000000001',
    name: 'Ama (test)',
    canton: 'be',
    coop: 'c1',
    pagne: 3,
  },
  kofi: {
    id: 'b2b2b2b2-0000-4000-8000-000000000002',
    name: 'Kofi (test)',
    canton: 'kara',
    coop: 'c2',
    pagne: 5,
  },
  yawa: {
    id: 'c3c3c3c3-0000-4000-8000-000000000003',
    name: 'Yawa (test)',
    canton: 'be',
    coop: null,
    pagne: 7,
  },
} as const
/** The local team account: same id as the mock Supabase's signed-in super_admin. */
export const LOCAL_MODERATOR = '11111111-1111-4111-8111-111111111111'
/** A visitor (anonymous account, `is_anonymous` in the token): has a home, reads, cannot write. */
export const LOCAL_VISITOR = 'd4d4d4d4-0000-4000-8000-000000000004'
export const LOCAL_CANTONS = {
  be: 'cccccccc-0000-4000-8000-0000000000be',
  kara: 'cccccccc-0000-4000-8000-0000000000ca',
} as const
export const LOCAL_COOPS = {
  c1: 'dddddddd-0000-4000-8000-0000000000c1',
  c2: 'dddddddd-0000-4000-8000-0000000000c2',
} as const

const claimsOf = (token: string): { sub: string; json: string } | null => {
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1] ?? '', 'base64url').toString('utf8'))
    // Like PostgREST: an expired token is refused.
    if (typeof payload.exp === 'number' && payload.exp * 1000 < Date.now()) return null
    return typeof payload.sub === 'string' && /^[0-9a-f-]{36}$/.test(payload.sub)
      ? { sub: payload.sub, json: JSON.stringify(payload) }
      : null
  } catch {
    return null
  }
}

/**
 * The functions the dashboard calls through Supabase's REST API (/rest/v1/rpc/<name>), with
 * their named arguments in order. Local and tests only: the mock Supabase forwards them here so
 * the dashboard and the relay share one database.
 */
const LOCAL_RPC: Record<string, string[]> = {
  haroolife_dm_inbox: [],
  haroolife_dm_read: ['p_room'],
  haroolife_chat_history: ['p_room', 'p_after', 'p_before', 'p_limit'],
  haroolife_chat_send: ['p_room', 'p_body', 'p_client_id'],
  haroolife_money_send: ['p_key', 'p_amount', 'p_note', 'p_client_id'],
  haroolife_money_claim: [],
  haroolife_save_get: [],
  haroolife_save_put: ['p_save', 'p_version'],
  haroolife_chat_report: ['p_id', 'p_reason'],
  haroolife_mod_queue: [],
  haroolife_mod_act: ['p_kind', 'p_target', 'p_action', 'p_reason', 'p_days'],
  haroolife_invite_code: [],
  haroolife_invite_accept: ['p_code'],
  haroolife_invite_claim: [],
  haroolife_username_available: ['p_username'],
  haroolife_claim_username: ['p_username', 'p_quartier', 'p_pagne'],
  haroolife_my_username: [],
}

export type LocalChat = ChatRepository & {
  /** A dashboard RPC run as the token's subject; null for a function that is not offered. */
  rpc: (token: string, fn: string, args: Record<string, unknown>) => Promise<unknown> | null
}

export async function pgliteChat(migrationPaths: string | string[]): Promise<LocalChat> {
  if (process.env.NODE_ENV === 'production' && process.env.HAROOLIFE_REALTIME_ALLOW_PGLITE !== '1')
    throw new Error('PGlite repository is for local development and tests only.')
  // Loaded here, not at the top: the production bundle never needs the package.
  const { PGlite } = await import('@electric-sql/pglite')
  const db = new PGlite()
  const accounts = Object.values(LOCAL_ACCOUNTS)
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth; CREATE SCHEMA private;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    GRANT USAGE ON SCHEMA auth, private TO authenticated;
    CREATE TABLE cantons(id uuid PRIMARY KEY, name text);
    CREATE TABLE profiles(id uuid PRIMARY KEY, role text, cooperative_id uuid, deleted_at timestamptz);
    CREATE TABLE haroolife_residents(user_id uuid PRIMARY KEY REFERENCES profiles(id), canton_id uuid REFERENCES cantons(id),
      display_name text, pagne smallint DEFAULT 1, visible boolean DEFAULT true,
      updated_at timestamptz DEFAULT now());
    INSERT INTO cantons VALUES ('${LOCAL_CANTONS.be}','Bè'),('${LOCAL_CANTONS.kara}','Lama-Kara');
    INSERT INTO profiles VALUES ${accounts
      .map((a) => `('${a.id}','member',${a.coop ? `'${LOCAL_COOPS[a.coop]}'` : 'NULL'},NULL)`)
      .join(',')};
    INSERT INTO haroolife_residents VALUES ${accounts
      .map((a) => `('${a.id}','${LOCAL_CANTONS[a.canton]}','${a.name}',${a.pagne},true)`)
      .join(',')};
    -- The local team account (the mock Supabase's signed-in admin): moderates, does not play.
    INSERT INTO profiles VALUES ('${LOCAL_MODERATOR}','super_admin',NULL,NULL);
    INSERT INTO profiles VALUES ('${LOCAL_VISITOR}','none',NULL,NULL);
    -- Account ages (invitations count for new players only): every local account is new.
    CREATE TABLE auth.users(id uuid PRIMARY KEY, created_at timestamptz DEFAULT now());
    INSERT INTO auth.users(id) SELECT id FROM profiles;
    INSERT INTO haroolife_residents VALUES ('${LOCAL_VISITOR}','${LOCAL_CANTONS.be}','Visiteur (test)',2,true);
  `)
  for (const path of [migrationPaths].flat()) await db.exec(readFileSync(path, 'utf8'))
  await db.exec('SET ROLE authenticated')
  // One connection: run each call alone (set the subject, then the function).
  let queue: Promise<unknown> = Promise.resolve()
  const run = <T>(token: string, sql: string, args: unknown[], anonymous = false): Promise<T> => {
    const job = queue.then(async () => {
      // A public function (checking a username before having an account) runs without subject.
      const claims = claimsOf(token) ?? (anonymous ? { sub: '', json: '{}' } : null)
      if (!claims) throw new RepoError('auth_expired', 'Session expirée : reconnexion…')
      // Like PostgREST: the subject, and the whole token for rules reading other claims.
      await db.query(
        `SELECT set_config('request.jwt.claim.sub', $1, false), set_config('request.jwt.claims', $2, false)`,
        [claims.sub, claims.json],
      )
      try {
        const res = await db.query(sql, args)
        return Object.values((res.rows[0] ?? {}) as Record<string, unknown>)[0] as T
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        const code = (e as { code?: string }).code
        if (
          code === '42501' ||
          /non autorisé|Connexion requise|introuvable|Compte inconnu/.test(msg)
        )
          throw new RepoError('forbidden', msg)
        if (/Trop de (nouvelles conversations|messages)/.test(msg))
          throw new RepoError('rate_limited', msg)
        if (code === '22023' || code === '23514') throw new RepoError('invalid', msg)
        throw new RepoError('unavailable', 'Base locale indisponible.')
      }
    })
    queue = job.catch(() => {})
    return job
  }
  return {
    rpc: (t, fn, args) => {
      const names = LOCAL_RPC[fn]
      if (!names) return null
      const params = names.map((_, i) => `$${i + 1}`).join(',')
      return run(
        t,
        `SELECT ${fn}(${params})`,
        names.map((n) => args[n] ?? null),
        fn === 'haroolife_username_available',
      )
    },
    me: (t) => run<Me>(t, 'SELECT haroolife_chat_me()', []),
    send: (t, room, body, clientId) =>
      run(t, 'SELECT haroolife_chat_send($1,$2,$3)', [room, body, clientId]),
    history: (t, room, after, before, limit) =>
      run<ChatMessage[]>(t, 'SELECT haroolife_chat_history($1,$2,$3,$4)', [
        room,
        after,
        before,
        limit,
      ]),
    edit: (t, id, body) => run<ChatMessage>(t, 'SELECT haroolife_chat_edit($1,$2)', [id, body]),
    remove: (t, id) => run<ChatMessage>(t, 'SELECT haroolife_chat_delete($1)', [id]),
    report: async (t, id, reason) => {
      await run(t, 'SELECT haroolife_chat_report($1,$2)', [id, reason])
    },
    block: (t, id) => run<string>(t, 'SELECT haroolife_chat_block($1)', [id]),
    dmOpen: (t, key) => run(t, 'SELECT haroolife_dm_open($1)', [key]),
    dmPeers: (t) => run(t, 'SELECT haroolife_dm_peers()', []),
    blockKey: (t, key) => run<string>(t, 'SELECT haroolife_chat_block_key($1)', [key]),
    reportUser: async (t, key, reason) => {
      await run(t, 'SELECT haroolife_chat_report_user($1,$2)', [key, reason])
    },
  }
}

/**
 * Local and tests only: answers POST /rpc/<name> (Authorization: Bearer <token>, JSON named
 * arguments) on the loopback interface, for the mock Supabase to forward dashboard RPCs to.
 */
export async function serveLocalRpc(chat: LocalChat, port: number): Promise<void> {
  const { createServer } = await import('node:http')
  const server = createServer((req, res) => {
    const send = (status: number, data: unknown) => {
      res.writeHead(status, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(data))
    }
    const fn = /^\/rpc\/([a-z_]+)$/.exec(req.url ?? '')?.[1]
    if (req.method !== 'POST' || !fn) return send(404, { message: 'not found' })
    let raw = ''
    req.on('data', (c) => {
      raw += c
    })
    req.on('end', () => {
      let args: Record<string, unknown> = {}
      try {
        args = raw ? JSON.parse(raw) : {}
      } catch {
        return send(400, { message: 'invalid json' })
      }
      const token = (req.headers.authorization ?? '').replace(/^Bearer /, '')
      const job = chat.rpc(token, fn, args)
      if (!job) return send(404, { message: `function ${fn} not offered` })
      job.then(
        (data) => send(200, data ?? null),
        (e) =>
          send(e instanceof RepoError && e.code === 'forbidden' ? 403 : 400, {
            message: e instanceof Error ? e.message : String(e),
          }),
      )
    })
  })
  await new Promise<void>((done) => server.listen(port, '127.0.0.1', done))
}
