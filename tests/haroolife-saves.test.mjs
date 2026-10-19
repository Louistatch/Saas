// HarooLife : la partie sauvegardée en ligne. Exécute les vraies migrations dans PGlite :
// première sauvegarde, versions (deux appareils), plafond de gain, argent reçu et envoyé,
// envoi refusé au-delà du solde connu, vie privée.
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
const game = (wallet, extra = {}) => ({
  v: 1,
  life: { wallet, events: [] },
  locality: 'lome',
  ...extra,
})
const put = (save, version) => one('SELECT haroolife_save_put($1,$2)', [save, version])
const get = () => one('SELECT haroolife_save_get()')
// Rewind the last save of a player by `minutes`, as if that much time had passed since.
const age = async (n, minutes) => {
  await sql('RESET ROLE')
  await sql(
    `UPDATE haroolife_saves SET updated_at = updated_at - interval '${minutes} minutes' WHERE user_id = '${id(n)}'`,
  )
}

test('partie en ligne : versions, plafond de gain, argent contrôlé', async (t) => {
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
    INSERT INTO profiles VALUES ('${id(1)}','member',NULL,NULL), ('${id(2)}','member',NULL,NULL), ('${id(3)}','member',NULL,NULL);
    INSERT INTO haroolife_residents VALUES
      ('${id(1)}','${id(21)}','Ama',3,true), ('${id(2)}','${id(21)}','Yawa',7,true), ('${id(3)}','${id(21)}','Kofi',5,true);
  `)
  for (const f of [
    '20261013_120000_haroolife_realtime_chat',
    '20261015_130000_haroolife_chat_dm',
    '20261015_150000_haroolife_money',
    '20261016_120000_haroolife_saves',
  ])
    await sql(readFileSync(`supabase/migrations/${f}.sql`, 'utf8'))

  // Pas de partie en ligne au départ ; la première est enregistrée telle quelle (≤ 100 000).
  await as(1)
  assert.equal(await get(), null)
  let r = await put(game(8000, { at: { x: 3, y: 4 } }), 0)
  assert.deepEqual([r.ok, r.version, r.wallet, r.clamped], [true, 1, 8000, false])
  const back = await get()
  assert.equal(back.version, 1)
  assert.deepEqual(back.save.at, { x: 3, y: 4 })

  // Deux appareils : celui qui s'appuie sur une vieille version ne l'écrase pas.
  r = await put(game(8200), 1)
  assert.equal(r.version, 2)
  const stale = await put(game(99), 1)
  assert.equal(stale.conflict, true)
  assert.equal(stale.version, 2)
  assert.equal(stale.save.life.wallet, 8200)

  // Plafond de gain : sans temps écoulé, au plus la marge (20 000) en plus.
  r = await put(game(500000), 2)
  assert.deepEqual([r.version, r.wallet, r.clamped], [3, 28200, true])
  assert.equal((await get()).save.life.wallet, 28200)
  // Après 10 minutes de jeu, 6 000 par minute en plus de la marge.
  await age(1, 10)
  await as(1)
  r = await put(game(1000000), 3)
  assert.equal(r.wallet, 28200 + 20000 + 60000)
  // Dépenser est toujours accepté.
  r = await put(game(1000), 4)
  assert.deepEqual([r.wallet, r.clamped], [1000, false])

  // Une première sauvegarde ne dépasse pas 100 000 FCFA.
  await as(2)
  r = await put(game(5000000), 0)
  assert.deepEqual([r.wallet, r.clamped], [100000, true])

  // Envoyer : seulement dans la limite du solde connu du serveur.
  await as(1)
  await assert.rejects(
    () => one('SELECT haroolife_money_send($1,$2,$3,$4)', [keyOf(2), 1500, null, id(500)]),
    /Solde insuffisant/,
  )
  await one('SELECT haroolife_money_send($1,$2,$3,$4)', [keyOf(2), 600, null, id(501)])
  // 1 000 - 600 = 400 connus : un second envoi de 500 est refusé.
  await assert.rejects(
    () => one('SELECT haroolife_money_send($1,$2,$3,$4)', [keyOf(2), 500, null, id(502)]),
    /Solde insuffisant/,
  )
  // Sans partie en ligne, pas d'envoi.
  await as(3)
  await assert.rejects(
    () => one('SELECT haroolife_money_send($1,$2,$3,$4)', [keyOf(2), 10, null, id(503)]),
    /sauvegardée en ligne/,
  )

  // L'argent reçu entre dans le plafond : Yawa encaisse 600, sa partie peut monter d'autant.
  await as(2)
  await one('SELECT haroolife_money_claim()')
  r = await put(game(100000 + 20000 + 600), 1)
  assert.deepEqual([r.wallet, r.clamped], [120600, false])
  // L'argent envoyé en sort : Ama ne peut pas sauvegarder comme si elle n'avait rien envoyé
  // au-delà de la marge (1 000 - 600 + 20 000).
  await as(1)
  r = await put(game(100000), 5)
  assert.equal(r.wallet, 1000 - 600 + 20000)

  // Vie privée : la table est fermée, une partie invalide est refusée, anon est refusé.
  await assert.rejects(() => db.query('SELECT * FROM haroolife_saves'), /permission denied/)
  await assert.rejects(() => put({ v: 2, life: { wallet: 1 } }, 6), /Partie invalide/)
  await assert.rejects(() => put({ v: 1 }, 6), /Partie invalide/)
  await sql('RESET ROLE; SET ROLE anon')
  await assert.rejects(() => get(), /permission denied/)
})
