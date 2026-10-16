// HarooLife : modération du chat par l'équipe. Exécute les vraies migrations dans PGlite :
// file des signalements, masquer, classer, suspendre (lecture oui, écriture non, y compris en
// privé), lever, journal ; réservé aux super_admin.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { PGlite } from '@electric-sql/pglite'

const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const keyOf = (n) =>
  createHash('md5').update(`haroolife-author:${id(n)}`).digest('hex').slice(0, 16)
const dm = (a, b) => `dm:${[keyOf(a), keyOf(b)].sort().join(':')}`
const db = new PGlite()
const sql = (s) => db.exec(s)
const as = (n) =>
  sql(
    `RESET ROLE; SET ROLE authenticated; SELECT set_config('request.jwt.claim.sub','${n ? id(n) : ''}',false)`,
  )
const one = async (s, args) => Object.values((await db.query(s, args)).rows[0])[0]
let c = 1000
const send = (room, body) =>
  one('SELECT haroolife_chat_send($1,$2,$3)', [room, body, id(c++)])
const queue = () => one('SELECT haroolife_mod_queue()')
const act = (kind, target, action, reason = null, days = 7) =>
  one('SELECT haroolife_mod_act($1,$2,$3,$4,$5)', [kind, target, action, reason, days])

test('modération : file, masquer, classer, suspendre, lever, journal', async (t) => {
  t.after(() => db.close())
  await sql(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth; CREATE SCHEMA private;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    GRANT USAGE ON SCHEMA auth, private TO authenticated;
    CREATE TABLE cantons(id uuid PRIMARY KEY, name text);
    CREATE TABLE profiles(id uuid PRIMARY KEY, role text, cooperative_id uuid, deleted_at timestamptz, email text);
    CREATE TABLE haroolife_residents(user_id uuid PRIMARY KEY REFERENCES profiles(id), canton_id uuid REFERENCES cantons(id),
      display_name text, pagne smallint DEFAULT 1, visible boolean DEFAULT true);
    INSERT INTO cantons VALUES ('${id(21)}','Bè');
    INSERT INTO profiles VALUES ('${id(1)}','member',NULL,NULL,'ama@x.tg'), ('${id(2)}','member',NULL,NULL,'yawa@x.tg'),
      ('${id(3)}','member',NULL,NULL,'kofi@x.tg'), ('${id(9)}','super_admin',NULL,NULL,'equipe@x.tg');
    INSERT INTO haroolife_residents VALUES
      ('${id(1)}','${id(21)}','Ama',3,true), ('${id(2)}','${id(21)}','Yawa',7,true), ('${id(3)}','${id(21)}','Kofi',5,true);
  `)
  for (const f of [
    '20261013_120000_haroolife_realtime_chat',
    '20261015_130000_haroolife_chat_dm',
    '20261016_130000_haroolife_moderation',
  ])
    await sql(readFileSync(`supabase/migrations/${f}.sql`, 'utf8'))

  // Kofi écrit un message insultant sur la place de Lomé ; Ama et Yawa le signalent.
  await as(3)
  const bad = await send('locality:lome', 'message insultant')
  await send('locality:lome', 'bonjour tout le monde')
  for (const n of [1, 2]) {
    await as(n)
    await one('SELECT haroolife_chat_report($1,$2)', [bad.id, n === 1 ? 'Insulte' : 'Harcèlement'])
  }
  // Yawa signale aussi Kofi depuis sa fiche.
  await one('SELECT haroolife_chat_report_user($1,$2)', [keyOf(3), 'Insistant'])

  // Seule l'équipe voit la file.
  await assert.rejects(() => queue(), /Réservé/)
  await assert.rejects(() => act('message', bad.id, 'hide'), /Réservé/)
  await as(9)
  let q = await queue()
  assert.equal(q.messages.length, 1)
  assert.equal(q.messages[0].body, 'message insultant')
  assert.equal(q.messages[0].count, 2)
  assert.deepEqual(q.messages[0].reasons.sort(), ['Harcèlement', 'Insulte'])
  assert.equal(q.messages[0].author.name, 'Kofi')
  assert.equal(q.messages[0].author.email, 'kofi@x.tg')
  assert.equal(q.players.length, 1)
  assert.equal(q.players[0].player.name, 'Kofi')

  // Masquer le message : il disparaît pour tous, ses signalements sont traités.
  await act('message', bad.id, 'hide', 'Insulte')
  q = await queue()
  assert.equal(q.messages.length, 0)
  await as(1)
  const lome = await one('SELECT haroolife_chat_history($1,NULL,NULL,50)', ['locality:lome'])
  const shown = lome.find((m) => m.id === bad.id)
  assert.equal(shown.deleted, true)
  assert.equal(shown.body, '')

  // Suspendre Kofi 3 jours : il lit encore, il n'écrit plus, même en privé.
  await as(1)
  await one('SELECT haroolife_dm_open($1)', [keyOf(3)])
  await send(dm(1, 3), 'Kofi, calme-toi')
  await as(9)
  const r = await act('player', id(3), 'suspend', 'Insultes répétées', 3)
  assert.ok(r.person.suspended_until)
  q = await queue()
  assert.equal(q.players.length, 0)
  assert.equal(q.suspended.length, 1)
  assert.equal(q.suspended[0].reason, 'Insultes répétées')
  await as(3)
  await assert.rejects(() => send('locality:lome', 'encore'), /non autorisé/)
  await assert.rejects(() => send(dm(1, 3), 'réponse'), /non autorisé/)
  assert.ok((await one('SELECT haroolife_chat_history($1,NULL,NULL,50)', ['locality:lome'])).length > 0)
  // Les autres écrivent normalement.
  await as(2)
  await send('locality:lome', 'la vie continue')

  // Lever la suspension : Kofi écrit de nouveau.
  await as(9)
  await act('player', id(3), 'unsuspend', 'Excuses présentées')
  await as(3)
  await send('locality:lome', 'pardon à tous')

  // Classer sans suite ; actions et types inconnus refusés ; journal dans l'ordre.
  await as(2)
  const ok = await send('locality:lome', 'message correct')
  await as(1)
  await one('SELECT haroolife_chat_report($1,$2)', [ok.id, 'Erreur'])
  await as(9)
  await act('message', ok.id, 'dismiss')
  assert.equal((await queue()).messages.length, 0)
  await as(2)
  assert.equal(
    (await one('SELECT haroolife_chat_history($1,NULL,NULL,50)', ['locality:lome'])).find(
      (m) => m.id === ok.id,
    ).deleted,
    false,
  )
  await as(9)
  await assert.rejects(() => act('message', ok.id, 'delete'), /Action inconnue/)
  await assert.rejects(() => act('canton', ok.id, 'hide'), /Type inconnu/)
  await assert.rejects(() => act('player', id(9), 'suspend'), /soi-même/)
  q = await queue()
  assert.deepEqual(
    q.log.map((l) => l.action),
    ['dismiss', 'unsuspend', 'suspend', 'hide'],
  )
  // Tables fermées en direct.
  await as(1)
  await assert.rejects(() => db.query('SELECT * FROM haroolife_chat_bans'), /permission denied/)
  await assert.rejects(() => db.query('SELECT * FROM haroolife_mod_log'), /permission denied/)
})
