// HarooLife : messages privés hors du jeu. Exécute les trois vraies migrations dans PGlite :
// boîte de réception (correspondant, dernier message, non-lus), lecture, file d'alertes (une par
// conversation et par 10 minutes), vie privée (un tiers ne voit ni ne marque rien).
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
const dmRoom = (a, b) => `dm:${[keyOf(a), keyOf(b)].sort().join(':')}`
const db = new PGlite()
const sql = (s) => db.exec(s)
const rows = async (s, args = []) => (await db.query(s, args)).rows
const as = (n) =>
  sql(
    `RESET ROLE; SET ROLE authenticated; SELECT set_config('request.jwt.claim.sub','${n ? id(n) : ''}',false)`,
  )
const one = async (s, args) => Object.values((await rows(s, args))[0])[0]
let client = 1000
const send = (room, body) => one('SELECT haroolife_chat_send($1,$2,$3)', [room, body, id(client++)])
const inbox = () => one('SELECT haroolife_dm_inbox()')
const pushes = async () => {
  await sql('RESET ROLE')
  return rows('SELECT recipient_id, room, title, body FROM haroolife_dm_push ORDER BY id')
}

test('messages privés hors du jeu : boîte, non-lus, lecture, alertes, vie privée', async (t) => {
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
    INSERT INTO profiles VALUES ('${id(1)}','member',NULL,NULL), ('${id(2)}','none',NULL,NULL), ('${id(3)}','member',NULL,NULL);
    INSERT INTO haroolife_residents VALUES
      ('${id(1)}','${id(21)}','Ama',3,true), ('${id(2)}','${id(21)}','Yawa',7,true), ('${id(3)}','${id(21)}','Kofi',5,true);
  `)
  for (const f of [
    '20261013_120000_haroolife_realtime_chat',
    '20261015_130000_haroolife_chat_dm',
    '20261015_140000_haroolife_dm_inbox',
  ])
    await sql(readFileSync(`supabase/migrations/${f}.sql`, 'utf8'))
  const room = dmRoom(1, 2)

  // Rien avant le premier message ; un message de salon public ne crée ni conversation ni alerte.
  await as(1)
  assert.deepEqual(await inbox(), [])
  await send('locality:lome', 'bonjour Lomé')
  await one('SELECT haroolife_dm_open($1)', [keyOf(2)])
  await send(room, 'Salut Yawa, tu viens au marché ?')
  await send(room, 'Je t’attends')
  // Ama a écrit : elle a lu sa conversation, rien de non lu pour elle.
  assert.deepEqual(await inbox(), [
    {
      room,
      peer: { key: keyOf(2), name: 'Yawa', pagne: 7 },
      last: { body: 'Je t’attends', mine: true, at: (await inbox())[0].last.at },
      unread: 0,
    },
  ])

  // Yawa, hors du jeu, voit la conversation et 2 non-lus dans son tableau de bord.
  await as(2)
  let box = await inbox()
  assert.equal(box.length, 1)
  assert.equal(box[0].unread, 2)
  assert.deepEqual(box[0].peer, { key: keyOf(1), name: 'Ama', pagne: 3 })
  assert.equal(box[0].last.mine, false)
  // Une seule alerte pour les deux messages rapprochés, adressée à Yawa, avec le nom d'Ama.
  let queued = await pushes()
  assert.equal(queued.length, 1)
  assert.equal(queued[0].recipient_id, id(2))
  assert.equal(queued[0].room, room)
  assert.equal(queued[0].title, 'Ama t’a écrit')
  assert.equal(queued[0].body, 'Salut Yawa, tu viens au marché ?')

  // Elle répond depuis le tableau de bord : sa réponse marque la lecture, Ama est prévenue.
  await as(2)
  await send(room, 'Oui, j’arrive !')
  box = await inbox()
  assert.equal(box[0].unread, 0)
  assert.equal(box[0].last.body, 'Oui, j’arrive !')
  queued = await pushes()
  assert.equal(queued.length, 2)
  assert.equal(queued[1].recipient_id, id(1))
  assert.equal(queued[1].title, 'Yawa t’a écrit')
  await as(1)
  assert.equal((await inbox())[0].unread, 1)
  // Ama ouvre la conversation (jeu ou tableau de bord) : lue.
  assert.equal(await one('SELECT haroolife_dm_read($1)', [room]), true)
  assert.equal((await inbox())[0].unread, 0)

  // Un long message est abrégé dans l'alerte (l'alerte n'est pas le message).
  await sql('RESET ROLE')
  await sql(`UPDATE haroolife_dm_push SET created_at = now() - interval '11 minutes'`)
  await as(1)
  await send(room, 'x'.repeat(300))
  queued = await pushes()
  assert.equal(queued.length, 3)
  assert.equal(queued[2].body.length, 140)
  assert.ok(queued[2].body.endsWith('…'))

  // Vie privée : Kofi ne voit pas la conversation et ne peut pas la marquer lue.
  await as(3)
  assert.deepEqual(await inbox(), [])
  await assert.rejects(() => one('SELECT haroolife_dm_read($1)', [room]), /non autorisé/)
  await assert.rejects(() => one('SELECT haroolife_dm_read($1)', ['locality:lome']), /non autorisé/)
  // Tables fermées en direct, fonctions refusées sans connexion.
  await assert.rejects(() => rows('SELECT * FROM haroolife_dm_push'), /permission denied/)
  await assert.rejects(() => rows('SELECT * FROM haroolife_dm_reads'), /permission denied/)
  await sql('RESET ROLE; SET ROLE anon')
  await assert.rejects(() => inbox(), /permission denied/)

  // Un blocage ferme aussi la conversation dans la boîte.
  await as(2)
  await one('SELECT haroolife_chat_block_key($1)', [keyOf(1)])
  assert.deepEqual(await inbox(), [])
  await as(1)
  assert.deepEqual(await inbox(), [])
})
