// HarooLife : qui est dans le jeu. Exécute les vraies migrations dans PGlite : battement, nombre
// de personnes en ligne dans tout le jeu (visiteurs compris), liste des habitants visibles (en
// ligne d'abord, jamais l'identifiant du compte ni l'heure exacte), recherche, blocage, et une
// conversation privée ouverte avec un joueur qui n'est pas connecté.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { PGlite } from '@electric-sql/pglite'

const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const key = (n) =>
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
const admin = () => sql('RESET ROLE')
const one = async (s, args) => Object.values((await db.query(s, args)).rows[0])[0]
const fails = async (s, args, pattern) =>
  assert.rejects(
    () => db.query(s, args),
    (e) => pattern.test(e.message) || assert.fail(`${s} : « ${e.message} » au lieu de ${pattern}`),
  )
const here = (town) => one('SELECT haroolife_here($1)', [town])
const players = (search = null, limit = 30) =>
  one('SELECT haroolife_players($1,$2)', [search, limit])
const names = async (search) => (await players(search)).list.map((p) => p.name)

// Habitants : 1 Ama, 2 Kofi, 3 Sena (invisible), 4 Yao (compte supprimé), 5 Edem (jamais revenu
// depuis la mise en place). 6 : visiteur sans maison (compte dans les personnes en ligne, pas
// dans la liste des habitants).
test('joueurs en ligne dans tout le jeu, liste des habitants, écrire à un absent', async (t) => {
  t.after(() => db.close())
  await sql(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth; CREATE SCHEMA private;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    GRANT USAGE ON SCHEMA auth, private TO authenticated;
    CREATE TABLE cantons(id uuid PRIMARY KEY, name text);
    CREATE TABLE profiles(id uuid PRIMARY KEY, role text, cooperative_id uuid, deleted_at timestamptz);
    CREATE TABLE haroolife_residents(user_id uuid PRIMARY KEY REFERENCES profiles(id), canton_id uuid REFERENCES cantons(id),
      display_name text, pagne smallint DEFAULT 1, visible boolean DEFAULT true, created_at timestamptz NOT NULL DEFAULT now());
    CREATE TABLE haroolife_usernames(user_id uuid PRIMARY KEY REFERENCES profiles(id), username text UNIQUE);
    INSERT INTO cantons VALUES ('${id(921)}','Bè');
    INSERT INTO profiles VALUES ('${id(1)}','none',NULL,NULL), ('${id(2)}','member',NULL,NULL),
      ('${id(3)}','none',NULL,NULL), ('${id(4)}','none',NULL,now()), ('${id(5)}','none',NULL,NULL),
      ('${id(6)}','none',NULL,NULL);
    INSERT INTO haroolife_residents(user_id, canton_id, display_name, pagne, visible, created_at) VALUES
      ('${id(1)}','${id(921)}','Ama',3,true, now() - interval '9 days'),
      ('${id(2)}','${id(921)}','Kofi',2,true, now() - interval '8 days'),
      ('${id(3)}','${id(921)}','Sena',1,false, now() - interval '7 days'),
      ('${id(4)}','${id(921)}','Yao',1,true, now() - interval '6 days'),
      ('${id(5)}','${id(921)}','Edem',4,true, now() - interval '5 days');
    INSERT INTO haroolife_usernames VALUES ('${id(1)}','ama_be'), ('${id(2)}','kofi_tg');
  `)
  for (const f of [
    '20261013_120000_haroolife_realtime_chat',
    '20261015_130000_haroolife_chat_dm',
    '20261015_150000_haroolife_money',
    '20261016_120000_haroolife_saves',
    '20261022_130000_haroolife_players',
  ])
    await sql(readFileSync(`supabase/migrations/${f}.sql`, 'utf8'))

  // Le battement : Ama à Lomé, puis un visiteur sans maison à Kara. Quatre habitants (le compte
  // supprimé ne compte pas), deux personnes en ligne.
  await as(1)
  assert.deepEqual(await here('lome'), { online: 1, players: 4 })
  await as(6)
  assert.deepEqual(await here('kara'), { online: 2, players: 4 })
  await fails('SELECT haroolife_here($1)', ['Lomé!'], /Ville inconnue/)

  // Kofi voit Ama en ligne à Lomé, puis Edem ; ni lui-même, ni l'invisible, ni le compte supprimé.
  await as(2)
  let got = await players()
  assert.equal(got.online, 2)
  assert.equal(got.players, 4)
  assert.deepEqual(got.list, [
    {
      key: key(1),
      name: 'Ama',
      username: 'ama_be',
      pagne: 3,
      online: true,
      locality: 'lome',
      seen: 'now',
    },
    {
      key: key(5),
      name: 'Edem',
      username: null,
      pagne: 4,
      online: false,
      locality: null,
      seen: null,
    },
  ])
  for (const n of [1, 2, 3, 4, 5, 6])
    assert.ok(!JSON.stringify(got).includes(id(n)), 'jamais l’identifiant du compte')

  // Recherche : nom affiché ou nom d'utilisateur (avec ou sans @) ; les jokers sont du texte.
  assert.deepEqual(await names('@AMA'), ['Ama'])
  assert.deepEqual(await names('ed'), ['Edem'])
  assert.deepEqual(await names('%'), [])
  // « _ » est un caractère : seule ama_be le contient (Edem n'a pas de nom d'utilisateur).
  assert.deepEqual(await names('_'), ['Ama'])
  assert.equal((await players(null, 1)).list.length, 1)

  // Le dernier passage n'est rendu qu'en gros : aujourd'hui, cette semaine, ou rien.
  await admin()
  await sql(
    `UPDATE haroolife_last_seen SET seen_at = now() - interval '3 hours' WHERE user_id = '${id(1)}'`,
  )
  await as(2)
  got = await players()
  assert.deepEqual(
    got.list.map((p) => [p.name, p.online, p.locality, p.seen]),
    [
      ['Ama', false, null, 'today'],
      ['Edem', false, null, null],
    ],
  )
  assert.equal(got.online, 1)
  await admin()
  await sql(
    `UPDATE haroolife_last_seen SET seen_at = now() - interval '3 days' WHERE user_id = '${id(1)}'`,
  )
  await as(2)
  assert.equal((await players()).list[0].seen, 'week')
  await admin()
  await sql(
    `UPDATE haroolife_last_seen SET seen_at = now() - interval '30 days' WHERE user_id = '${id(1)}'`,
  )
  // Une partie sauvegardée à l'instant compte comme en ligne (Edem joue sur un autre appareil).
  await sql(
    `INSERT INTO haroolife_saves(user_id, save, wallet) VALUES ('${id(5)}', '{"v":1,"life":{"wallet":0}}', 0)`,
  )
  await as(2)
  got = await players()
  assert.deepEqual(
    got.list.map((p) => [p.name, p.online, p.seen]),
    [
      ['Edem', true, 'now'],
      ['Ama', false, null],
    ],
  )

  // Battement limité : rien n'est réécrit avant 20 secondes, sauf changement de ville.
  await admin()
  await sql(
    `UPDATE haroolife_last_seen SET seen_at = now() - interval '10 seconds' WHERE user_id = '${id(6)}'`,
  )
  const before = await one(`SELECT seen_at FROM haroolife_last_seen WHERE user_id = '${id(6)}'`)
  await as(6)
  await here('kara')
  await admin()
  assert.deepEqual(
    await one(`SELECT seen_at FROM haroolife_last_seen WHERE user_id = '${id(6)}'`),
    before,
  )
  await as(6)
  await here('lome')
  await admin()
  assert.equal(
    await one(`SELECT locality FROM haroolife_last_seen WHERE user_id = '${id(6)}'`),
    'lome',
  )

  // Écrire à Edem, qui n'est pas connecté : la conversation s'ouvre ; il la lira à son retour.
  await as(2)
  const dm = await one('SELECT haroolife_dm_open($1)', [key(5)])
  assert.equal(dm.room, `dm:${[key(2), key(5)].sort().join(':')}`)

  // Un blocage, dans un sens ou dans l'autre, retire la personne de la liste.
  await as(1)
  await one('SELECT haroolife_chat_block_key($1)', [key(2)])
  await as(2)
  assert.deepEqual(await names(), ['Edem'])
  await as(1)
  assert.deepEqual(await names(), ['Edem'])

  // Droits : connexion requise, la table n'est jamais lue directement.
  await as(null)
  await fails('SELECT haroolife_players()', [], /Connexion requise/)
  await fails('SELECT haroolife_here($1)', ['lome'], /Connexion requise/)
  await as(1)
  await fails('SELECT * FROM haroolife_last_seen', [], /permission denied/)
  await sql('RESET ROLE; SET ROLE anon')
  await fails('SELECT haroolife_players()', [], /permission denied/)
})
