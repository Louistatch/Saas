// HarooLife D4+ (M1) : messagerie persistante du relais Socket.IO.
// Exécute la vraie migration dans PGlite : autorisations par salon, idempotence, curseurs,
// blocage, signalement, modification, effacement, vie privée.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { PGlite } from '@electric-sql/pglite'

const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const db = new PGlite()
const sql = (s) => db.exec(s)
const rows = async (s, args = []) => (await db.query(s, args)).rows
const as = async (n) =>
  sql(
    `RESET ROLE; SET ROLE authenticated; SELECT set_config('request.jwt.claim.sub','${n ? id(n) : ''}',false)`,
  )
const one = async (s, args) => Object.values((await rows(s, args))[0])[0]
const fails = async (fn, re) => assert.rejects(fn, re)
const send = (room, body, client) =>
  one('SELECT haroolife_chat_send($1,$2,$3)', [room, body, client])
const history = (room, after = null, before = null, limit = 50) =>
  one('SELECT haroolife_chat_history($1,$2,$3,$4)', [room, after, before, limit])

test('messagerie temps réel : salons, idempotence, rattrapage, modération, vie privée', async (t) => {
  t.after(() => db.close())
  await sql(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth; CREATE SCHEMA private;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    GRANT USAGE ON SCHEMA auth, private TO authenticated;
    CREATE TABLE cantons(id uuid PRIMARY KEY, name text);
    CREATE TABLE profiles(id uuid PRIMARY KEY, email text, phone text, role text, cooperative_id uuid, deleted_at timestamptz);
    CREATE TABLE haroolife_residents(user_id uuid PRIMARY KEY REFERENCES profiles(id), canton_id uuid REFERENCES cantons(id),
      display_name text, pagne smallint DEFAULT 1, visible boolean DEFAULT true);
    INSERT INTO cantons VALUES ('${id(21)}','Bè'),('${id(22)}','Lama-Kara');
    INSERT INTO profiles VALUES
      ('${id(1)}','ama@x','90000001','member','${id(31)}',NULL),
      ('${id(2)}','kofi@x','90000002','member','${id(32)}',NULL),
      ('${id(3)}','sans@x',NULL,'none',NULL,NULL),
      ('${id(4)}','admin@x',NULL,'super_admin',NULL,NULL),
      ('${id(5)}','parti@x',NULL,'member','${id(31)}',now());
    INSERT INTO haroolife_residents VALUES
      ('${id(1)}','${id(21)}','Ama',3,true), ('${id(2)}','${id(22)}','Kofi',5,true);
  `)
  await sql(readFileSync('supabase/migrations/20261013_120000_haroolife_realtime_chat.sql', 'utf8'))

  // Tables fermées : rien en direct pour les comptes, seules les fonctions donnent accès.
  await as(1)
  await fails(() => rows('SELECT * FROM haroolife_chat_messages'), /permission denied/)
  await fails(
    () =>
      rows(
        'INSERT INTO haroolife_chat_messages(room,user_id,body,client_id) VALUES ($1,$2,$3,$4)',
        ['locality:lome', id(1), 'x', id(900)],
      ),
    /permission denied/,
  )

  // Anonyme refusé.
  await as(null)
  await fails(() => one('SELECT haroolife_chat_me()'), /Connexion requise/)
  await fails(() => send('locality:lome', 'bonjour', id(901)), /Connexion requise/)

  // Salons d'Ama : Togo, Lomé, Kara, son canton, sa coopérative — jamais ceux de Kofi.
  await as(1)
  const ama = await one('SELECT haroolife_chat_me()')
  assert.deepEqual(ama.rooms, [
    'world:togo',
    'locality:lome',
    'locality:kara',
    `canton:${id(21)}`,
    `coop:${id(31)}`,
  ])
  assert.equal(ama.name, 'Ama')
  assert.equal(ama.can_write, true)
  assert.match(ama.key, /^[0-9a-f]{16}$/)
  assert.ok(!JSON.stringify(ama).includes(id(1)), 'pas d’identifiant de compte')

  // Envoi enregistré, puis renvoi du même client_id après coupure : même message, pas de doublon.
  const m1 = await send('locality:lome', '  Bonjour   Lomé ! ', id(101))
  assert.equal(m1.body, 'Bonjour Lomé !')
  assert.equal(m1.duplicate, false)
  assert.equal(m1.mine, true)
  const again = await send('locality:lome', 'Bonjour Lomé !', id(101))
  assert.equal(again.id, m1.id)
  assert.equal(again.duplicate, true)
  // Still no direct read of the table for an account, even to count.
  assert.equal(
    await one('SELECT count(*)::int FROM haroolife_chat_messages').catch(() => null),
    null,
  )

  // Isolation : Ama ne peut ni écrire ni lire le canton ou la coopérative de Kofi.
  await fails(() => send(`canton:${id(22)}`, 'intrus', id(102)), /Salon non autorisé/)
  await fails(() => send(`coop:${id(32)}`, 'intrus', id(103)), /Salon non autorisé/)
  await fails(() => history(`coop:${id(32)}`), /Salon non autorisé/)
  await fails(() => send('dm:quelquun', 'x', id(104)), /Salon non autorisé|violates check/)
  const m2 = await send(`canton:${id(21)}`, 'Réunion au marché de Bè', id(105))

  // Validation : vide, trop long, caractères de contrôle.
  await fails(() => send('locality:lome', '   ', id(106)), /vide ou trop long/)
  await fails(() => send('locality:lome', 'x'.repeat(501), id(107)), /vide ou trop long/)
  await fails(() => send('locality:lome', 'a\u0007b', id(108)), /non autorisés/)
  // Le texte est stocké tel quel (le rendu est échappé par React), jamais interprété.
  const html = await send('locality:lome', '<img src=x onerror=alert(1)>', id(109))
  assert.equal(html.body, '<img src=x onerror=alert(1)>')

  // Sans maison : lecture du monde oui, écriture non.
  await as(3)
  const sans = await one('SELECT haroolife_chat_me()')
  assert.equal(sans.can_write, false)
  assert.deepEqual(sans.rooms, ['world:togo', 'locality:lome', 'locality:kara'])
  assert.equal((await history('locality:lome')).length, 2)
  await fails(() => send('locality:lome', 'je n’ai pas de maison', id(110)), /Salon non autorisé/)

  // Kofi lit Lomé : auteur nommé par son nom d'habitant, clé opaque, jamais l'identifiant ni le téléphone.
  await as(2)
  const seen = await history('locality:lome')
  assert.deepEqual(
    seen.map((m) => m.body),
    ['Bonjour Lomé !', '<img src=x onerror=alert(1)>'],
  )
  assert.equal(seen[0].author.name, 'Ama')
  assert.equal(seen[0].mine, false)
  assert.equal(seen[0].client_id, null)
  for (const leak of [id(1), '90000001', 'ama@x']) assert.ok(!JSON.stringify(seen).includes(leak))
  await fails(() => history(`canton:${id(21)}`), /Salon non autorisé/)

  // Rattrapage après reconnexion : seulement ce qui suit le dernier seq reçu, dans l'ordre.
  const k1 = await send('locality:lome', 'Salut Ama', id(201))
  const k2 = await send('locality:lome', 'Je suis à Kara', id(202))
  const missed = await history('locality:lome', seen[1].seq)
  assert.deepEqual(
    missed.map((m) => m.id),
    [k1.id, k2.id],
  )
  // Pagination vers le passé : avant un curseur, les plus récents d'abord retenus, rendus en ordre.
  const page = await history('locality:lome', null, k2.seq, 2)
  assert.deepEqual(
    page.map((m) => m.seq),
    [seen[1].seq, k1.seq],
  )

  // Modifier son message (pas celui des autres), effacer, modération super_admin.
  const edited = await one('SELECT haroolife_chat_edit($1,$2)', [k1.id, 'Salut Ama !'])
  assert.equal(edited.edited, true)
  await fails(() => one('SELECT haroolife_chat_edit($1,$2)', [m1.id, 'piraté']), /plus modifiable/)
  await fails(() => one('SELECT haroolife_chat_delete($1)', [m1.id]), /introuvable/)
  const gone = await one('SELECT haroolife_chat_delete($1)', [k2.id])
  assert.equal(gone.deleted, true)
  assert.equal(gone.body, '')

  // Signaler et bloquer : l'auteur bloqué disparaît de l'historique de Kofi seulement.
  await one('SELECT haroolife_chat_report($1,$2)', [html.id, 'Contenu suspect'])
  await one('SELECT haroolife_chat_report($1,$2)', [html.id, 'Encore'])
  const blockedKey = await one('SELECT haroolife_chat_block($1)', [m1.id])
  assert.equal(blockedKey, ama.key)
  assert.deepEqual((await one('SELECT haroolife_chat_me()')).blocked, [ama.key])
  assert.ok((await history('locality:lome')).every((m) => m.author.key !== ama.key))
  await fails(() => one('SELECT haroolife_chat_block($1)', [k1.id]), /introuvable/) // soi-même

  await as(1)
  assert.equal((await history('locality:lome')).length, 4)

  // Compte supprimé : plus aucun salon.
  await as(5)
  await fails(() => one('SELECT haroolife_chat_me()'), /Compte inconnu/)

  // super_admin : modère partout.
  await as(4)
  assert.equal((await history(`coop:${id(32)}`)).length, 0)
  const mod = await one('SELECT haroolife_chat_delete($1)', [html.id])
  assert.equal(mod.deleted, true)
  await sql('RESET ROLE')
  assert.equal(await one('SELECT count(*)::int FROM haroolife_chat_reports'), 1)
  assert.equal(await one('SELECT count(*)::int FROM haroolife_chat_messages'), 5)
  void m2
})
