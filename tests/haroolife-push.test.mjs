// HarooLife : notifications hors du jeu. Exécute les vraies migrations dans PGlite : un envoi
// d'argent du jeu et un ami arrivé par le lien mettent chacun une alerte en file, pour le seul
// destinataire, lisible seulement par le serveur.
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

test('alertes : argent reçu et ami arrivé, au seul destinataire', async (t) => {
  const db = new PGlite()
  t.after(() => db.close())
  const sql = (s) => db.exec(s)
  const as = (n) =>
    sql(
      `RESET ROLE; SET ROLE authenticated; SELECT set_config('request.jwt.claim.sub','${id(n)}',false)`,
    )
  const one = async (s, args) => Object.values((await db.query(s, args)).rows[0])[0]
  const queue = async () => {
    await sql('RESET ROLE')
    return (
      await db.query('SELECT recipient_id, kind, title, body FROM haroolife_push ORDER BY id')
    ).rows
  }
  await sql(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth; CREATE SCHEMA private;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    GRANT USAGE ON SCHEMA auth, private TO authenticated;
    CREATE TABLE auth.users(id uuid PRIMARY KEY, created_at timestamptz DEFAULT now());
    CREATE TABLE cantons(id uuid PRIMARY KEY, name text);
    CREATE TABLE profiles(id uuid PRIMARY KEY, role text, cooperative_id uuid, deleted_at timestamptz);
    CREATE TABLE haroolife_residents(user_id uuid PRIMARY KEY REFERENCES profiles(id), canton_id uuid REFERENCES cantons(id),
      display_name text, pagne smallint DEFAULT 1, visible boolean DEFAULT true);
    INSERT INTO cantons VALUES ('${id(21)}','Bè');
    INSERT INTO auth.users VALUES ('${id(1)}', now() - interval '60 days'), ('${id(2)}', now()), ('${id(3)}', now());
    INSERT INTO profiles VALUES ('${id(1)}','member',NULL,NULL), ('${id(2)}','none',NULL,NULL), ('${id(3)}','member',NULL,NULL);
    INSERT INTO haroolife_residents VALUES
      ('${id(1)}','${id(21)}','Ama',3,true), ('${id(2)}','${id(21)}','Yawa',7,true), ('${id(3)}','${id(21)}','Kofi',5,true);
  `)
  for (const f of [
    '20261013_120000_haroolife_realtime_chat',
    '20261015_130000_haroolife_chat_dm',
    '20261015_150000_haroolife_money',
    '20261017_130000_haroolife_invites',
    '20261017_140000_haroolife_push',
  ])
    await sql(readFileSync(`supabase/migrations/${f}.sql`, 'utf8'))

  // Ama envoie 12 500 FCFA du jeu à Yawa, avec un mot : une alerte pour Yawa seulement.
  await as(1)
  const sent = await one('SELECT haroolife_money_send($1,$2,$3,$4)', [
    keyOf(2),
    12500,
    'pour le taxi',
    id(900),
  ])
  assert.equal(sent.duplicate, false)
  // Le même envoi rejoué (même client_id) n'alerte pas deux fois.
  await as(1)
  await one('SELECT haroolife_money_send($1,$2,$3,$4)', [keyOf(2), 12500, 'pour le taxi', id(900)])
  assert.deepEqual(await queue(), [
    {
      recipient_id: id(2),
      kind: 'money',
      title: 'Ama t’a envoyé 12 500 FCFA',
      body: 'Argent du jeu à encaisser dans HarooLife : « pour le taxi »',
    },
  ])

  // Kofi, nouveau joueur, arrive par le lien d'Ama : une alerte pour Ama, avec son bonus.
  await as(1)
  const code = (await one('SELECT haroolife_invite_code()')).code
  await as(3)
  assert.equal((await one('SELECT haroolife_invite_accept($1)', [code])).ok, true)
  const all = await queue()
  assert.equal(all.length, 2)
  assert.deepEqual(all[1], {
    recipient_id: id(1),
    kind: 'invite',
    title: 'Kofi est arrivé par ton lien',
    body: 'Ton bonus de 2 000 FCFA de jeu t’attend dans HarooLife.',
  })

  // La file n'est lisible ni par les joueurs ni par un visiteur anonyme.
  await as(2)
  await assert.rejects(db.query('SELECT * FROM haroolife_push'), /permission denied/)
  await sql('RESET ROLE; SET ROLE anon')
  await assert.rejects(db.query('SELECT * FROM haroolife_push'), /permission denied/)
  await sql('RESET ROLE')
  // Le retour arrière retire la file sans toucher aux transferts ni aux invitations.
  await sql(readFileSync('supabase/rollbacks/20261017_140000_haroolife_push.rollback.sql', 'utf8'))
  assert.equal(await one('SELECT count(*)::int FROM haroolife_money_transfers'), 1)
  assert.equal(await one('SELECT count(*)::int FROM haroolife_referrals'), 1)
  assert.equal(await one("SELECT to_regclass('public.haroolife_push') IS NULL"), true)
})
