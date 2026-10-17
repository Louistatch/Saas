// HarooLife : les joueurs louent les panneaux de la rue. Exécute les vraies migrations dans
// PGlite : emplacements identiques au jeu, textes contrôlés (ni numéro, ni lien, ni e-mail),
// loyer retiré du solde connu du serveur, un panneau à la fois, signalements, modération.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { PGlite } from '@electric-sql/pglite'
import { PLACEMENTS } from '../lib/haroolife/ads/campaigns'
import { boardTextProblem } from '../lib/haroolife/ads/rental'

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const db = new PGlite()
const sql = (s: string) => db.exec(s)
const as = (n: number | null, role = 'authenticated') =>
  sql(
    `RESET ROLE; SET ROLE ${role}; SELECT set_config('request.jwt.claim.sub','${n ? id(n) : ''}',false)`,
  )
// biome-ignore lint/suspicious/noExplicitAny: rows of the database, checked field by field
const one = async (s: string, args: unknown[] = []): Promise<any> =>
  Object.values(((await db.query(s, args)).rows[0] ?? {}) as Record<string, unknown>)[0]
let c = 500
const rent = (
  placement: string,
  hours: number,
  title: string,
  body: string,
  palette = 0,
  client = id(c++),
) =>
  one('SELECT haroolife_board_rent($1,$2,$3,$4,$5,$6)', [
    placement,
    hours,
    title,
    body,
    palette,
    client,
  ])
const save = (wallet: number) =>
  one('SELECT haroolife_save_put($1,$2)', [{ v: 1, life: { wallet, events: [] } }, 0])
const live = async (locality: string, viewer: number | null = null) => {
  await as(viewer, viewer ? 'authenticated' : 'anon')
  return one('SELECT haroolife_board_posts_live($1)', [locality])
}
const MIGRATION = 'supabase/migrations/20261017_190000_haroolife_board_posts.sql'

test('panneaux loués par les joueurs : emplacements, textes, loyer, signalements, modération', async (t) => {
  t.after(() => db.close())
  await sql(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth; CREATE SCHEMA private;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    GRANT USAGE ON SCHEMA auth, private TO authenticated, anon;
    CREATE TABLE cantons(id uuid PRIMARY KEY, name text);
    CREATE TABLE profiles(id uuid PRIMARY KEY, role text, cooperative_id uuid, deleted_at timestamptz, email text);
    CREATE TABLE haroolife_residents(user_id uuid PRIMARY KEY REFERENCES profiles(id), canton_id uuid REFERENCES cantons(id),
      display_name text, pagne smallint DEFAULT 1, visible boolean DEFAULT true);
    INSERT INTO cantons VALUES ('${id(21)}','Bè');
    INSERT INTO profiles VALUES ('${id(1)}','member',NULL,NULL,'ama@x.tg'), ('${id(2)}','member',NULL,NULL,'yawa@x.tg'),
      ('${id(3)}','member',NULL,NULL,'kofi@x.tg'), ('${id(4)}','none',NULL,NULL,NULL),
      ('${id(5)}','member',NULL,NULL,'sans-maison@x.tg'), ('${id(9)}','super_admin',NULL,NULL,'equipe@x.tg');
    INSERT INTO haroolife_residents VALUES
      ('${id(1)}','${id(21)}','Ama',3,true), ('${id(2)}','${id(21)}','Yawa',7,true),
      ('${id(3)}','${id(21)}','Kofi',5,true), ('${id(4)}','${id(21)}','Sena',2,true);
  `)
  for (const f of [
    '20261013_120000_haroolife_realtime_chat',
    '20261015_130000_haroolife_chat_dm',
    '20261015_150000_haroolife_money',
    '20261016_120000_haroolife_saves',
    '20261016_130000_haroolife_moderation',
    '20261017_160000_haroolife_usernames',
  ])
    await sql(readFileSync(`supabase/migrations/${f}.sql`, 'utf8'))
  await sql(readFileSync(MIGRATION, 'utf8'))
  await sql(`INSERT INTO haroolife_usernames(user_id, username) VALUES ('${id(1)}','ama_be')`)

  // Les emplacements de la base sont exactement ceux du jeu, dans la bonne ville.
  const listed = new Set(readFileSync(MIGRATION, 'utf8').match(/'(lome|kara)-[a-z-]+'/g) ?? [])
  assert.deepEqual(
    [...listed].map((s) => s.slice(1, -1)).sort(),
    PLACEMENTS.map((p) => p.id).sort(),
  )
  for (const p of PLACEMENTS)
    assert.equal(await one('SELECT private.haroolife_board_locality($1)', [p.id]), p.locality)
  assert.equal(await one('SELECT private.haroolife_board_locality($1)', ['lome-nulle-part']), null)

  // Le téléphone refuse les mêmes textes que la base, pour la même raison.
  for (const text of [
    'Je vends mon maïs, 25 000 le sac',
    'Tontine : 2 000 par semaine, 12 membres',
    'Cours de maths, 3e et 2nde, Bè.',
    'Appelle au 90 12 34 56',
    '(228) 90-12-34-56',
    'www.monmais.com',
    'Visite monmais.tg ce soir',
    'https://x.y',
    'écris à ama@mail.tg',
  ])
    assert.equal(
      await one('SELECT private.haroolife_board_text_problem($1)', [text]),
      boardTextProblem(text),
      text,
    )

  // Tout le monde lit les panneaux ; personne ne lit les tables.
  assert.deepEqual(await live('lome'), [])
  await as(1)
  await assert.rejects(() => one('SELECT * FROM haroolife_board_posts'), /permission denied/)
  await as(null, 'anon')
  await assert.rejects(() => rent('lome-assigame', 24, 'Maïs', 'Je vends'), /permission denied/)

  // Sans partie en ligne, pas de loyer ; sans maison, pas de panneau.
  await as(1)
  await assert.rejects(
    () => rent('lome-assigame', 24, 'Maïs de Bè', 'Je vends mon maïs'),
    /pas encore sauvegardée/,
  )
  await as(5)
  await assert.rejects(() => rent('lome-assigame', 24, 'Maïs', 'Je vends'), /ta maison/)

  // Les textes : longueur, et jamais de numéro, de lien ni d'e-mail.
  await as(1)
  await save(8000)
  const refused: [string, number, string, string, number, RegExp][] = [
    ['lome-nulle-part', 24, 'Maïs de Bè', 'Je vends mon maïs', 0, /Panneau inconnu/],
    ['lome-assigame', 12, 'Maïs de Bè', 'Je vends mon maïs', 0, /24 heures ou 3 jours/],
    ['lome-assigame', 24, 'Ma', 'Je vends mon maïs', 0, /Titre/],
    ['lome-assigame', 24, 'Maïs de Bè', 'x'.repeat(121), 0, /Message/],
    ['lome-assigame', 24, 'Maïs de Bè', 'Appelle-moi au 90 12 34 56', 0, /numéro/],
    ['lome-assigame', 24, 'Maïs de Bè', 'Contact : +228.90.12.34.56', 0, /numéro/],
    ['lome-assigame', 24, 'Maïs de Bè', 'Tout sur www.monmais.com', 0, /lien/],
    ['lome-assigame', 24, 'Maïs de Bè', 'Visite monmais.tg ce soir', 0, /lien/],
    ['lome-assigame', 24, 'Maïs de Bè', 'Écris à ama@mail.tg', 0, /e-mail/],
    ['lome-assigame', 24, 'Maïs de Bè', 'Je vends mon maïs', 7, /Couleur/],
  ]
  for (const [p, h, title, body, pal, err] of refused)
    await assert.rejects(() => rent(p, h, title, body, pal), err)

  // Ama loue un jour à Assigamé : 5 000 FCFA ; rejouer l'appel ne paie pas deux fois.
  const client = id(900)
  const ama = await rent(
    'lome-assigame',
    24,
    '  Maïs   de Bè ',
    'Je vends mon maïs, 25 000 le sac. Passe au marché samedi.',
    1,
    client,
  )
  assert.deepEqual(
    [ama.placement, ama.price, ama.title, ama.author, ama.mine, ama.duplicate],
    ['lome-assigame', 5000, 'Maïs de Bè', '@ama_be', true, false],
  )
  assert.equal((await rent('lome-assigame', 24, 'Autre', 'Autre texte', 0, client)).duplicate, true)
  // Une location à la fois.
  await assert.rejects(
    () => rent('lome-marche-be', 24, 'Encore', 'Un autre panneau'),
    /déjà un panneau loué/,
  )
  // Le loyer compte dans le solde du serveur : une sauvegarde gonflée est ramenée à
  // 8 000 − 5 000 + 20 000 de marge de gain, pas 28 000.
  await sql(`RESET ROLE; UPDATE haroolife_saves SET version = 0 WHERE user_id = '${id(1)}'`)
  await as(1)
  const back = await one('SELECT haroolife_save_put($1,$2)', [
    { v: 1, life: { wallet: 40000, events: [] } },
    0,
  ])
  assert.deepEqual([back.wallet, back.clamped], [23000, true])

  // Un panneau, un locataire : Yawa prend celui du marché de Bè pour trois jours.
  await as(2)
  await save(20000)
  await assert.rejects(() => rent('lome-assigame', 24, 'Fête', 'Anniversaire samedi'), /déjà loué/)
  const yawa = await rent(
    'lome-marche-be',
    72,
    'Anniversaire',
    'Kossi a 30 ans samedi, tout le quartier est invité',
    2,
  )
  assert.equal(yawa.price, 12000)
  // Kofi n'a pas de quoi payer.
  await as(3)
  await save(3000)
  await assert.rejects(
    () => rent('lome-port-be', 24, 'Taxi', 'Taxi moto pas cher'),
    /Solde insuffisant/,
  )

  // Ce que la rue affiche : les deux panneaux, sans dire à qui appartient le compte.
  const shown = await live('lome')
  assert.deepEqual(
    shown.map((p: { placement: string; author: string; mine: boolean }) => [
      p.placement,
      p.author,
      p.mine,
    ]),
    [
      ['lome-assigame', '@ama_be', false],
      ['lome-marche-be', 'Yawa', false],
    ],
  )
  assert.equal(JSON.stringify(shown).includes(id(1)), false)
  assert.equal((await live('lome', 1))[0].mine, true)
  assert.deepEqual(await live('kara'), [])

  // Signalements : pas le sien, pas deux fois ; trois joueurs, et le panneau est masqué.
  await as(1)
  await assert.rejects(() => one('SELECT haroolife_board_report($1,$2)', [yawa.id, 'pub']), /Motif/)
  await as(2)
  await assert.rejects(
    () => one('SELECT haroolife_board_report($1,$2)', [yawa.id, 'insulte']),
    /son propre panneau/,
  )
  for (const n of [1, 1, 3]) {
    await as(n)
    assert.equal(
      (await one('SELECT haroolife_board_report($1,$2)', [yawa.id, 'insulte'])).hidden,
      false,
    )
  }
  await as(4)
  assert.equal(
    (await one('SELECT haroolife_board_report($1,$2)', [yawa.id, 'arnaque'])).hidden,
    true,
  )
  assert.deepEqual(
    (await live('lome')).map((p: { placement: string }) => p.placement),
    ['lome-assigame'],
  )

  // L'équipe seulement : la file, rétablir, masquer.
  await as(1)
  await assert.rejects(() => one('SELECT haroolife_board_mod_queue()'), /Réservé/)
  await assert.rejects(
    () => one('SELECT haroolife_board_mod_act($1,$2,$3)', [yawa.id, 'show', null]),
    /Réservé/,
  )
  await as(9)
  const queue = await one('SELECT haroolife_board_mod_queue()')
  assert.equal(queue.length, 1)
  assert.deepEqual(
    [queue[0].id, queue[0].count, queue[0].hidden, queue[0].author.name, queue[0].reasons.sort()],
    [yawa.id, 3, true, 'Yawa', ['arnaque', 'insulte']],
  )
  assert.equal(
    (await one('SELECT haroolife_board_mod_act($1,$2,$3)', [yawa.id, 'show', 'Rien de grave']))
      .hidden,
    false,
  )
  assert.deepEqual(await one('SELECT haroolife_board_mod_queue()'), [])
  assert.equal((await live('lome')).length, 2)
  await as(9)
  await assert.rejects(
    () => one('SELECT haroolife_board_mod_act($1,$2,$3)', [yawa.id, 'brule', null]),
    /Action inconnue/,
  )
  assert.equal(
    (await one('SELECT haroolife_board_mod_act($1,$2,$3)', [ama.id, 'hide', 'Hors sujet'])).hidden,
    true,
  )
  assert.equal((await live('lome')).length, 1)

  // Masqué, le panneau d'Assigamé est libre à nouveau ; deux locations par jour au plus.
  await as(4)
  await save(60000)
  const first = await rent('lome-assigame', 24, 'Gari frais', 'Gari de Tsévié au marché de Bè')
  await as(9)
  await one('SELECT haroolife_board_mod_act($1,$2,$3)', [first.id, 'hide', null])
  await as(4)
  const second = await rent('kara-chu', 24, 'Gari frais', 'Gari de Tsévié, aussi à Kara')
  assert.equal((await live('kara'))[0].id, second.id)
  await as(9)
  await one('SELECT haroolife_board_mod_act($1,$2,$3)', [second.id, 'hide', null])
  await as(4)
  await assert.rejects(
    () => rent('kara-lycee', 24, 'Gari frais', 'Encore du gari'),
    /Deux locations/,
  )

  // Une location finie libère le panneau.
  await sql(
    `RESET ROLE; UPDATE haroolife_board_posts SET starts_at = now() - interval '2 days', ends_at = now() - interval '1 minute' WHERE id = '${yawa.id}'`,
  )
  assert.deepEqual(await live('lome'), [])
  await as(2)
  await save(20000)
  assert.equal(
    (await rent('lome-marche-be', 24, 'Tontine', 'Réunion de la tontine dimanche après la messe'))
      .placement,
    'lome-marche-be',
  )

  // Un joueur suspendu par l'équipe ne publie plus.
  await as(9)
  await one('SELECT haroolife_mod_act($1,$2,$3,$4,$5)', ['player', id(3), 'suspend', 'Spam', 7])
  await sql(`RESET ROLE; UPDATE haroolife_saves SET wallet = 50000 WHERE user_id = '${id(3)}'`)
  await as(3)
  await assert.rejects(
    () => rent('lome-port-be', 24, 'Taxi', 'Taxi moto pas cher'),
    /ne peut pas publier/,
  )
})
