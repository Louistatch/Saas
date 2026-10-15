// HarooLife : envoyer de l'argent du jeu à un autre joueur. Exécute les vraies migrations dans
// PGlite : envoi par clé, idempotence, plafonds, blocage, encaissement unique, vie privée.
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
const db = new PGlite()
const sql = (s) => db.exec(s)
const as = (n) =>
  sql(
    `RESET ROLE; SET ROLE authenticated; SELECT set_config('request.jwt.claim.sub','${n ? id(n) : ''}',false)`,
  )
const one = async (s, args) => Object.values((await db.query(s, args)).rows[0])[0]
const send = (key, amount, client, note = null) =>
  one('SELECT haroolife_money_send($1,$2,$3,$4)', [key, amount, note, id(client)])
const claim = () => one('SELECT haroolife_money_claim()')

test('argent du jeu : envoi, idempotence, plafonds, blocage, encaissement unique', async (t) => {
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
    INSERT INTO profiles VALUES ('${id(1)}','member',NULL,NULL), ('${id(2)}','member',NULL,NULL),
      ('${id(3)}','member',NULL,NULL), ('${id(4)}','none',NULL,NULL);
    INSERT INTO haroolife_residents VALUES
      ('${id(1)}','${id(21)}','Ama',3,true), ('${id(2)}','${id(21)}','Yawa',7,true), ('${id(3)}','${id(21)}','Kofi',5,true);
  `)
  for (const f of [
    '20261013_120000_haroolife_realtime_chat',
    '20261015_130000_haroolife_chat_dm',
    '20261015_150000_haroolife_money',
  ])
    await sql(readFileSync(`supabase/migrations/${f}.sql`, 'utf8'))

  // Ama envoie 1 500 FCFA à Yawa ; le même envoi rejoué ne compte qu'une fois.
  await as(1)
  const sentOnce = await send(keyOf(2), 1500, 100, '  pour le   zém  ')
  assert.equal(sentOnce.amount, 1500)
  assert.deepEqual(sentOnce.to, { key: keyOf(2), name: 'Yawa', pagne: 7 })
  assert.equal(sentOnce.duplicate, false)
  const again = await send(keyOf(2), 1500, 100)
  assert.equal(again.duplicate, true)
  assert.equal(again.id, sentOnce.id)
  // Ama n'a rien à encaisser ; Yawa encaisse une fois, avec le mot nettoyé.
  assert.deepEqual(await claim(), [])
  await as(2)
  const got = await claim()
  assert.equal(got.length, 1)
  assert.equal(got[0].amount, 1500)
  assert.equal(got[0].note, 'pour le zém')
  assert.deepEqual(got[0].from, { key: keyOf(1), name: 'Ama', pagne: 3 })
  assert.deepEqual(await claim(), [])

  // Montants, soi-même, inconnu, sans maison : refusés.
  await as(1)
  await assert.rejects(() => send(keyOf(2), 0, 101), /Montant/)
  await assert.rejects(() => send(keyOf(2), 50001, 102), /Montant/)
  await assert.rejects(() => send(keyOf(1), 100, 103), /introuvable/)
  await assert.rejects(() => send('0123456789abcdef', 100, 104), /introuvable/)
  await as(4)
  await assert.rejects(() => send(keyOf(1), 100, 105), /maison/)

  // Plafond de 100 000 FCFA envoyés par 24 h (1 500 déjà envoyés).
  await as(1)
  await send(keyOf(3), 50000, 106)
  await send(keyOf(3), 48500, 107)
  await assert.rejects(() => send(keyOf(3), 1, 108), /Plafond/)

  // Un blocage empêche l'envoi dans les deux sens.
  await as(3)
  await one('SELECT haroolife_chat_block_key($1)', [keyOf(2)])
  await assert.rejects(() => send(keyOf(2), 100, 109), /non autorisé/)
  await as(2)
  await assert.rejects(() => send(keyOf(3), 100, 110), /non autorisé/)

  // Kofi encaisse ses deux envois ; la table reste fermée en direct ; anon refusé.
  await as(3)
  const kofi = await claim()
  assert.deepEqual(
    kofi.map((x) => x.amount),
    [50000, 48500],
  )
  await assert.rejects(
    () => db.query('SELECT * FROM haroolife_money_transfers'),
    /permission denied/,
  )
  await sql('RESET ROLE; SET ROLE anon')
  await assert.rejects(() => claim(), /permission denied/)
})
