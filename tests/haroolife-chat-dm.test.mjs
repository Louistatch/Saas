// HarooLife : messages privés entre joueurs (salons dm:). Exécute les deux vraies migrations dans
// PGlite : ouverture par la clé d'un joueur croisé, consentement (blocage dans les deux sens),
// vie privée (un tiers ne lit ni n'écrit), plafond de nouvelles conversations, signalement.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { PGlite } from '@electric-sql/pglite'

const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const keyOf = (n) =>
  createHash('md5')
    .update(`haroolife-author:${id(n)}`)
    .digest('hex')
    .slice(0, 16)
const dmRoom = (a, b) => {
  const [x, y] = [keyOf(a), keyOf(b)].sort()
  return `dm:${x}:${y}`
}
const db = new PGlite()
const sql = (s) => db.exec(s)
const rows = async (s, args = []) => (await db.query(s, args)).rows
const as = async (n) =>
  sql(
    `RESET ROLE; SET ROLE authenticated; SELECT set_config('request.jwt.claim.sub','${n ? id(n) : ''}',false)`,
  )
const one = async (s, args) => Object.values((await rows(s, args))[0])[0]
const fails = async (fn, re) => assert.rejects(fn, re)
let client = 1000
const send = (room, body) => one('SELECT haroolife_chat_send($1,$2,$3)', [room, body, id(client++)])
const history = (room) => one('SELECT haroolife_chat_history($1,NULL,NULL,50)', [room])

test('messages privés : ouverture, consentement, vie privée, plafond, signalement', async (t) => {
  t.after(() => db.close())
  await sql(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth; CREATE SCHEMA private;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    GRANT USAGE ON SCHEMA auth, private TO authenticated;
    CREATE TABLE cantons(id uuid PRIMARY KEY, name text);
    CREATE TABLE profiles(id uuid PRIMARY KEY, role text, cooperative_id uuid, deleted_at timestamptz);
    CREATE TABLE haroolife_residents(user_id uuid PRIMARY KEY REFERENCES profiles(id), canton_id uuid REFERENCES cantons(id),
      display_name text, pagne smallint DEFAULT 1, visible boolean DEFAULT true);
    INSERT INTO cantons VALUES ('${id(21)}','Bè');
    INSERT INTO profiles VALUES
      ('${id(1)}','member',NULL,NULL), ('${id(2)}','member',NULL,NULL), ('${id(3)}','member',NULL,NULL),
      ('${id(4)}','super_admin',NULL,NULL), ('${id(5)}','none',NULL,NULL);
    INSERT INTO haroolife_residents VALUES
      ('${id(1)}','${id(21)}','Ama',3,true), ('${id(2)}','${id(21)}','Yawa',7,true),
      ('${id(3)}','${id(21)}','Kofi',5,true), ('${id(4)}','${id(21)}','Admin',1,true);
  `)
  await sql(readFileSync('supabase/migrations/20261013_120000_haroolife_realtime_chat.sql', 'utf8'))
  // Un message de salon existant avant la migration reste valide après l'élargissement du format.
  await as(1)
  await send('locality:lome', 'avant')
  await sql('RESET ROLE')
  await sql(readFileSync('supabase/migrations/20261015_120000_haroolife_chat_dm.sql', 'utf8'))

  // Ama ouvre une conversation avec Yawa, croisée dans la rue (sa clé vient de la présence).
  await as(1)
  const opened = await one('SELECT haroolife_dm_open($1)', [keyOf(2)])
  assert.equal(opened.room, dmRoom(1, 2))
  assert.deepEqual(opened.peer, { key: keyOf(2), name: 'Yawa', pagne: 7 })
  // Même salon quel que soit celui qui ouvre.
  await as(2)
  assert.equal((await one('SELECT haroolife_dm_open($1)', [keyOf(1)])).room, dmRoom(1, 2))

  // Avant tout message, la conversation n'est pas encore dans les salons de connexion.
  await as(1)
  assert.ok(!(await one('SELECT haroolife_chat_me()')).rooms.includes(dmRoom(1, 2)))
  const first = await send(dmRoom(1, 2), 'Salut Yawa !')
  assert.equal(first.room, dmRoom(1, 2))
  assert.ok((await one('SELECT haroolife_chat_me()')).rooms.includes(dmRoom(1, 2)))
  await as(2)
  assert.ok((await one('SELECT haroolife_chat_me()')).rooms.includes(dmRoom(1, 2)))
  await send(dmRoom(1, 2), 'Bonjour Ama')
  assert.deepEqual(
    (await history(dmRoom(1, 2))).map((m) => m.body),
    ['Salut Yawa !', 'Bonjour Ama'],
  )
  assert.deepEqual(await one('SELECT haroolife_dm_peers()'), {
    [dmRoom(1, 2)]: { key: keyOf(1), name: 'Ama', pagne: 3 },
  })

  // Vie privée : Kofi, ni même un super_admin, ne lit ni n'écrit la conversation d'Ama et Yawa.
  for (const n of [3, 4]) {
    await as(n)
    await fails(() => history(dmRoom(1, 2)), /non autorisé/)
    await fails(() => send(dmRoom(1, 2), 'je m’invite'), /non autorisé/)
    assert.ok(!(await one('SELECT haroolife_chat_me()')).rooms.includes(dmRoom(1, 2)))
  }
  // Salon mal formé ou non trié, soi-même, inconnu, sans maison : refusé.
  await as(1)
  const [x, y] = [keyOf(1), keyOf(2)].sort()
  await fails(() => send(`dm:${y}:${x}`, 'à l’envers'), /non autorisé|check/)
  await fails(() => one('SELECT haroolife_dm_open($1)', [keyOf(1)]), /introuvable/)
  await fails(() => one('SELECT haroolife_dm_open($1)', ['0123456789abcdef']), /introuvable/)
  await fails(() => one('SELECT haroolife_dm_open($1)', ["x' OR 1=1 --"]), /introuvable/)
  await as(5)
  await fails(() => one('SELECT haroolife_dm_open($1)', [keyOf(1)]), /maison/)

  // Consentement : Yawa bloque Ama depuis sa fiche ; la conversation se ferme dans les deux sens.
  await as(2)
  assert.equal(await one('SELECT haroolife_chat_block_key($1)', [keyOf(1)]), keyOf(1))
  await fails(() => send(dmRoom(1, 2), 'encore ?'), /non autorisé/)
  await as(1)
  await fails(() => send(dmRoom(1, 2), 'tu es là ?'), /non autorisé/)
  await fails(() => history(dmRoom(1, 2)), /non autorisé/)
  await fails(() => one('SELECT haroolife_dm_open($1)', [keyOf(2)]), /non autorisée/)
  assert.ok(!(await one('SELECT haroolife_chat_me()')).rooms.includes(dmRoom(1, 2)))

  // Signaler un joueur depuis sa fiche (sans message), une fois par personne.
  await as(3)
  await one('SELECT haroolife_chat_report_user($1,$2)', [keyOf(1), 'Insistant'])
  await one('SELECT haroolife_chat_report_user($1,$2)', [keyOf(1), 'Encore'])
  await fails(
    () => one('SELECT haroolife_chat_report_user($1,$2)', [keyOf(3), 'moi']),
    /introuvable/,
  )
  await sql('RESET ROLE')
  assert.equal(
    Number(
      await one('SELECT count(*) FROM haroolife_chat_user_reports WHERE reporter_id = $1', [id(3)]),
    ),
    1,
  )
  // Tables fermées en direct.
  await as(3)
  await fails(() => rows('SELECT * FROM haroolife_chat_user_reports'), /permission denied/)

  // Plafond : au plus 20 nouvelles conversations commencées en 24 h.
  await sql('RESET ROLE')
  const extra = Array.from({ length: 20 }, (_, i) => 100 + i)
  await sql(`
    INSERT INTO profiles VALUES ${extra.map((n) => `('${id(n)}','member',NULL,NULL)`).join(',')};
    INSERT INTO haroolife_residents VALUES ${extra.map((n) => `('${id(n)}','${id(21)}','P${n}',1,true)`).join(',')};
  `)
  await as(3)
  for (const n of extra.slice(0, 19)) {
    const r = await one('SELECT haroolife_dm_open($1)', [keyOf(n)])
    await sql('RESET ROLE')
    // Hors limite de débit des messages (20/min) : messages insérés directement.
    await sql(
      `INSERT INTO haroolife_chat_messages(room,user_id,body,client_id) VALUES ('${r.room}','${id(3)}','bonjour','${id(5000 + n)}')`,
    )
    await as(3)
  }
  // Kofi a commencé 19 conversations (en plus de celle avec personne) : la 20e passe…
  const twentieth = await one('SELECT haroolife_dm_open($1)', [keyOf(119)])
  await sql('RESET ROLE')
  await sql(
    `INSERT INTO haroolife_chat_messages(room,user_id,body,client_id) VALUES ('${twentieth.room}','${id(3)}','bonjour','${id(6000)}')`,
  )
  // … la 21e est refusée, mais répondre ou rouvrir une conversation existante reste possible.
  await as(3)
  await fails(
    () => one('SELECT haroolife_dm_open($1)', [keyOf(1)]),
    /Trop de nouvelles conversations/,
  )
  assert.equal((await one('SELECT haroolife_dm_open($1)', [keyOf(100)])).room, dmRoom(3, 100))

  // Les salons existants gardent leurs règles.
  await as(1)
  assert.equal((await history('locality:lome')).at(-1).body, 'avant')
})
