// HarooLife : le visiteur (compte anonyme, sans e-mail). Exécute les vraies migrations dans PGlite :
// il lit les salons, n'écrit nulle part (salons, messages privés), n'envoie pas d'argent ; une fois
// sa partie gardée avec un e-mail (même compte), il écrit comme les autres.
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
const dm = (a, b) => `dm:${[keyOf(a), keyOf(b)].sort().join(':')}`
let db
const sql = (s) => db.exec(s)
/** Signed in as n; `visitor`: the token carries is_anonymous, as Supabase's does. */
const as = (n, visitor = false) =>
  sql(`RESET ROLE; SET ROLE authenticated;
    SELECT set_config('request.jwt.claim.sub','${id(n)}',false);
    SELECT set_config('request.jwt.claims','{"sub":"${id(n)}","is_anonymous":${visitor}}',false)`)
const one = async (s, args) => Object.values((await db.query(s, args)).rows[0])[0]
let c = 1000
const send = (room, body) => one('SELECT haroolife_chat_send($1,$2,$3)', [room, body, id(c++)])

// Avec la sauvegarde en ligne (main) et sans elle (la production tant qu'elle n'y est pas).
const scenario = (withSaves) => async (t) => {
  db = new PGlite()
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
    INSERT INTO profiles VALUES ('${id(1)}','member',NULL,NULL), ('${id(7)}','none',NULL,NULL);
    INSERT INTO haroolife_residents VALUES
      ('${id(1)}','${id(21)}','Ama',3,true), ('${id(7)}','${id(21)}','Visiteur',1,true);
  `)
  for (const f of [
    '20261013_120000_haroolife_realtime_chat',
    '20261015_130000_haroolife_chat_dm',
    '20261015_150000_haroolife_money',
    ...(withSaves ? ['20261016_120000_haroolife_saves'] : []),
    '20261016_130000_haroolife_moderation',
    '20261016_140000_haroolife_visitors',
  ])
    await sql(readFileSync(`supabase/migrations/${f}.sql`, 'utf8'))

  // Ama, joueuse avec un compte, écrit sur la place de Lomé.
  await as(1)
  await send('locality:lome', 'Bienvenue à Lomé')
  assert.equal((await one('SELECT haroolife_chat_me()')).can_write, true)
  assert.equal((await one('SELECT haroolife_chat_me()')).visitor, false)

  // Le visiteur lit le salon, mais l'interface sait qu'il n'écrit pas.
  await as(7, true)
  const me = await one('SELECT haroolife_chat_me()')
  assert.equal(me.visitor, true)
  assert.equal(me.can_write, false)
  assert.ok(me.rooms.includes('locality:lome'))
  const history = await one('SELECT haroolife_chat_history($1,NULL,NULL,50)', ['locality:lome'])
  assert.equal(history.at(-1).body, 'Bienvenue à Lomé')
  // Ni salon ni message privé ni argent.
  await assert.rejects(() => send('locality:lome', 'spam'), /non autorisé/)
  await assert.rejects(() => send(dm(1, 7), 'salut'), /non autorisé/)
  if (withSaves) await one('SELECT haroolife_save_put($1,0)', [{ v: 1, life: { wallet: 8000 } }])
  await assert.rejects(
    () => one('SELECT haroolife_money_send($1,$2,$3,$4)', [keyOf(1), 100, null, id(500)]),
    /Garde ta partie/,
  )
  // Sa partie en ligne fonctionne (elle le suivra quand il gardera sa partie).
  if (withSaves) assert.equal((await one('SELECT haroolife_save_get()')).wallet, 8000)
  await sql('RESET ROLE')
  assert.equal(
    (await one('SELECT count(*)::int FROM haroolife_money_transfers')) ?? 0,
    0,
    'aucun virement du visiteur',
  )

  // Partie gardée avec un e-mail : même compte, il n'est plus visiteur, il écrit.
  await as(7, false)
  assert.equal((await one('SELECT haroolife_chat_me()')).can_write, true)
  await send('locality:lome', 'Merci, je reste !')
  await one('SELECT haroolife_money_send($1,$2,$3,$4)', [keyOf(1), 100, null, id(501)])
}

test(
  'visiteur : lit, n’écrit pas, n’envoie pas d’argent ; écrit une fois sa partie gardée',
  scenario(true),
)
test('visiteur, sans la sauvegarde en ligne (production actuelle) : mêmes règles', scenario(false))
