/**
 * Local and end-to-end repository: the REAL chat migration executed in PGlite, each call run as
 * the token's subject (auth.uid()). Refused in production. The token's identity is still checked
 * by the RealtimeAuth adapter (Supabase Auth or its local mock) before any call reaches here.
 */
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
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
export const LOCAL_CANTONS = {
  be: 'cccccccc-0000-4000-8000-0000000000be',
  kara: 'cccccccc-0000-4000-8000-0000000000ca',
} as const
export const LOCAL_COOPS = {
  c1: 'dddddddd-0000-4000-8000-0000000000c1',
  c2: 'dddddddd-0000-4000-8000-0000000000c2',
} as const

const subOf = (token: string): string | null => {
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1] ?? '', 'base64url').toString('utf8'))
    // Like PostgREST: an expired token is refused.
    if (typeof payload.exp === 'number' && payload.exp * 1000 < Date.now()) return null
    return typeof payload.sub === 'string' && /^[0-9a-f-]{36}$/.test(payload.sub)
      ? payload.sub
      : null
  } catch {
    return null
  }
}

export async function pgliteChat(migrationPaths: string | string[]): Promise<ChatRepository> {
  if (process.env.NODE_ENV === 'production' && process.env.HAROOLIFE_REALTIME_ALLOW_PGLITE !== '1')
    throw new Error('PGlite repository is for local development and tests only.')
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
      display_name text, pagne smallint DEFAULT 1, visible boolean DEFAULT true);
    INSERT INTO cantons VALUES ('${LOCAL_CANTONS.be}','Bè'),('${LOCAL_CANTONS.kara}','Lama-Kara');
    INSERT INTO profiles VALUES ${accounts
      .map((a) => `('${a.id}','member',${a.coop ? `'${LOCAL_COOPS[a.coop]}'` : 'NULL'},NULL)`)
      .join(',')};
    INSERT INTO haroolife_residents VALUES ${accounts
      .map((a) => `('${a.id}','${LOCAL_CANTONS[a.canton]}','${a.name}',${a.pagne},true)`)
      .join(',')};
  `)
  for (const path of [migrationPaths].flat()) await db.exec(readFileSync(path, 'utf8'))
  await db.exec('SET ROLE authenticated')
  // One connection: run each call alone (set the subject, then the function).
  let queue: Promise<unknown> = Promise.resolve()
  const run = <T>(token: string, sql: string, args: unknown[]): Promise<T> => {
    const job = queue.then(async () => {
      const sub = subOf(token)
      if (!sub) throw new RepoError('auth_expired', 'Session expirée : reconnexion…')
      await db.query(`SELECT set_config('request.jwt.claim.sub', $1, false)`, [sub])
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
