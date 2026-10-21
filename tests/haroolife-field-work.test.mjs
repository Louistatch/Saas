// HarooLife : recruter un ouvrier pour « Mon champ ». Exécute les vraies migrations dans PGlite :
// liste des ouvriers (vie privée), proposition, solde, une à la fois, réponse de l'ouvrier, paie
// par le transfert d'argent du jeu (une seule fois), expiration, retrait, droits.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { PGlite } from '@electric-sql/pglite'

const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
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

const workers = (region) => one('SELECT haroolife_field_workers($1)', [region])
const offer = (worker, days, crop = 'mais', town = 'lome') =>
  one('SELECT haroolife_field_offer($1,$2,$3,$4)', [worker, days, crop, town])
const answer = (o, accept) => one('SELECT haroolife_field_answer($1,$2)', [o, accept])
const mine = () => one('SELECT haroolife_field_offers_mine()')
const save = (wallet) => one('SELECT haroolife_save_put($1,$2)', [{ v: 1, life: { wallet } }, 0])

// Joueurs : 1 Ama (visiteuse, Lomé), 2 Kofi (joueur sans ouvrier). Ouvriers Haroo : 5 Komla
// (Maritime, disponible), 6 Essi (Kara, disponible), 7 Yao (indisponible), 8 Afi (profil d'ouvrier
// mais le compte n'est plus ouvrier).
const OUVRIER = { komla: id(51), essi: id(61), yao: id(71), afi: id(81) }

test('recruter un ouvrier pour son champ : proposition, réponse, paie, expiration', async (t) => {
  t.after(() => db.close())
  await sql(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth; CREATE SCHEMA private;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    GRANT USAGE ON SCHEMA auth, private TO authenticated;
    CREATE TABLE regions(id uuid PRIMARY KEY, name text);
    CREATE TABLE prefectures(id uuid PRIMARY KEY, region_id uuid REFERENCES regions(id), name text);
    CREATE TABLE cantons(id uuid PRIMARY KEY, prefecture_id uuid REFERENCES prefectures(id), name text);
    CREATE TABLE profiles(id uuid PRIMARY KEY, role text, cooperative_id uuid, haroo_type text, deleted_at timestamptz);
    CREATE TABLE haroolife_residents(user_id uuid PRIMARY KEY REFERENCES profiles(id), canton_id uuid REFERENCES cantons(id),
      display_name text, pagne smallint DEFAULT 1, visible boolean DEFAULT true);
    CREATE TABLE haroolife_usernames(user_id uuid PRIMARY KEY REFERENCES profiles(id), username text UNIQUE);
    CREATE TABLE haroo_ouvrier_profiles(id uuid PRIMARY KEY, user_id uuid UNIQUE, card_number text, first_name text NOT NULL,
      last_name text NOT NULL, phone text, competences text[] NOT NULL DEFAULT '{}', disponible boolean NOT NULL DEFAULT true,
      note_moyenne numeric(3,2) NOT NULL DEFAULT 0, nombre_avis integer NOT NULL DEFAULT 0);
    CREATE TABLE haroo_ouvrier_cantons(ouvrier_id uuid REFERENCES haroo_ouvrier_profiles(id), canton_id uuid REFERENCES cantons(id));
    INSERT INTO regions VALUES ('${id(901)}','Maritime'), ('${id(902)}','Kara');
    INSERT INTO prefectures VALUES ('${id(911)}','${id(901)}','Golfe'), ('${id(912)}','${id(902)}','Kozah');
    INSERT INTO cantons VALUES ('${id(921)}','${id(911)}','Bè'), ('${id(922)}','${id(912)}','Lama');
    INSERT INTO profiles VALUES ('${id(1)}','none',NULL,NULL,NULL), ('${id(2)}','member',NULL,NULL,NULL),
      ('${id(5)}','none',NULL,'ouvrier',NULL), ('${id(6)}','none',NULL,'ouvrier',NULL),
      ('${id(7)}','none',NULL,'ouvrier',NULL), ('${id(8)}','member',NULL,NULL,NULL);
    INSERT INTO haroolife_residents VALUES ('${id(1)}','${id(921)}','Ama',3,true);
    INSERT INTO haroolife_usernames VALUES ('${id(1)}','ama_be');
    INSERT INTO haroo_ouvrier_profiles VALUES
      ('${OUVRIER.komla}','${id(5)}','HOU-1001','KOMLA Ama','ADJO','+22890000001','{désherbage,labour,récolte,semis}',true,4.5,12),
      ('${OUVRIER.essi}','${id(6)}','HOU-1002','essi','KPODAR','+22890000002','{récolte}',true,4.8,3),
      ('${OUVRIER.yao}','${id(7)}','HOU-1003','Yao','MENSAH','+22890000003','{labour}',false,5,9),
      ('${OUVRIER.afi}','${id(8)}','HOU-1004','Afi','DOSSOU','+22890000004','{semis}',true,5,1);
    INSERT INTO haroo_ouvrier_cantons VALUES ('${OUVRIER.komla}','${id(921)}'), ('${OUVRIER.essi}','${id(922)}');
  `)
  for (const f of [
    '20261013_120000_haroolife_realtime_chat',
    '20261015_130000_haroolife_chat_dm',
    '20261015_150000_haroolife_money',
    '20261016_120000_haroolife_saves',
    '20261022_120000_haroolife_field_work',
  ])
    await sql(readFileSync(`supabase/migrations/${f}.sql`, 'utf8'))

  // Les ouvriers disponibles, ceux de la région d'abord : prénom, trois compétences, note.
  await as(1)
  const list = await workers('Maritime')
  assert.deepEqual(
    list.map((w) => [w.name, w.nearby]),
    [
      ['Komla', true],
      ['Essi', false],
    ],
  )
  assert.deepEqual(list[0].skills, ['désherbage', 'labour', 'récolte'])
  assert.deepEqual(Object.keys(list[0]).sort(), ['name', 'nearby', 'note', 'ref', 'reviews', 'skills'])
  assert.ok(!JSON.stringify(list).includes('+228'), 'jamais de téléphone')
  assert.ok(!JSON.stringify(list).includes('ADJO'), 'jamais de nom de famille')
  // Un ouvrier ne se voit pas lui-même ; le compte qui n'est plus ouvrier n'apparaît jamais.
  await as(5)
  assert.deepEqual(
    (await workers('Kara')).map((w) => w.name),
    ['Essi'],
  )

  // Sans partie en ligne, puis sans assez d'argent : refusé.
  await as(1)
  await fails('SELECT haroolife_field_offer($1,$2,$3,$4)', [OUVRIER.komla, 1, 'mais', 'lome'], /pas encore sauvegardée/)
  await save(2000)
  await fails('SELECT haroolife_field_offer($1,$2,$3,$4)', [OUVRIER.komla, 2, 'mais', 'lome'], /Solde insuffisant/)
  await fails('SELECT haroolife_field_offer($1,$2,$3,$4)', [OUVRIER.yao, 1, 'mais', 'lome'], /plus disponible/)
  await fails('SELECT haroolife_field_offer($1,$2,$3,$4)', [OUVRIER.afi, 1, 'mais', 'lome'], /plus disponible/)
  await fails('SELECT haroolife_field_offer($1,$2,$3,$4)', [OUVRIER.komla, 4, 'mais', 'lome'], /Entre 1 et 3/)
  await fails('SELECT haroolife_field_offer($1,$2,$3,$4)', [OUVRIER.komla, 1, 'Maïs;--', 'lome'], /invalide/)

  // Une journée à 1 500 FCFA du jeu ; une seule proposition en attente à la fois.
  const first = await offer(OUVRIER.komla, 1)
  assert.equal(first.status, 'pending')
  assert.equal(first.pay, 1500)
  assert.equal(first.worker, 'Komla')
  assert.equal(first.employer, '@ama_be')
  await fails('SELECT haroolife_field_offer($1,$2,$3,$4)', [OUVRIER.essi, 1, 'mais', 'lome'], /attend déjà/)

  // Seul l'ouvrier visé répond ; il voit la proposition (nom de jeu du joueur, pas d'identifiant).
  await as(6)
  assert.deepEqual((await mine()).asked, [])
  await fails('SELECT haroolife_field_answer($1,$2)', [first.id, true], /introuvable/)
  await as(5)
  const asked = (await mine()).asked
  assert.equal(asked.length, 1)
  assert.equal(asked[0].employer, '@ama_be')
  const accepted = await answer(first.id, true)
  assert.equal(accepted.status, 'accepted')
  // La même réponse rejouée : la même proposition, une seule paie.
  assert.equal((await answer(first.id, true)).status, 'accepted')
  await fails('SELECT haroolife_field_answer($1,$2)', [first.id, false], /n’attend plus/)
  admin()
  assert.equal(
    await one(`SELECT count(*)::int FROM haroolife_money_transfers WHERE client_id='${first.id}'`),
    1,
  )
  // L'ouvrier encaisse sa paie dans le jeu, une seule fois.
  await as(5)
  const paid = await one('SELECT haroolife_money_claim()')
  assert.deepEqual(
    paid.map((p) => [p.amount, p.note]),
    [[1500, 'Travail au champ']],
  )
  assert.deepEqual(await one('SELECT haroolife_money_claim()'), [])

  // Le joueur voit la réponse, en prend acte une fois.
  await as(1)
  const hired = (await mine()).hired
  assert.equal(hired[0].status, 'accepted')
  assert.equal(hired[0].seen, false)
  assert.equal(await one('SELECT haroolife_field_seen($1)', [first.id]), true)
  assert.equal(await one('SELECT haroolife_field_seen($1)', [first.id]), false)
  assert.equal((await mine()).hired[0].seen, true)

  // Le serveur compte la paie : 2 000 − 1 500 = 500 FCFA, plus assez pour une autre journée.
  await fails('SELECT haroolife_field_offer($1,$2,$3,$4)', [OUVRIER.essi, 1, 'mais', 'lome'], /Solde insuffisant/)

  // Kofi : refus, retrait, expiration, et un joueur qui ne peut plus payer.
  await as(2)
  await save(9000)
  const refused = await offer(OUVRIER.essi, 2)
  await as(6)
  assert.equal((await answer(refused.id, false)).status, 'declined')
  await as(2)
  const withdrawn = await offer(OUVRIER.essi, 1)
  assert.equal((await one('SELECT haroolife_field_cancel($1)', [withdrawn.id])).status, 'cancelled')
  await fails('SELECT haroolife_field_cancel($1)', [withdrawn.id], /déjà répondue/)
  await as(6)
  await fails('SELECT haroolife_field_answer($1,$2)', [withdrawn.id, true], /n’attend plus/)

  await as(2)
  const late = await offer(OUVRIER.essi, 1)
  admin()
  await sql(`UPDATE haroolife_field_offers SET expires_at = now() - interval '1 minute' WHERE id='${late.id}'`)
  await as(6)
  assert.equal((await answer(late.id, true)).status, 'expired')
  await as(2)
  assert.equal((await mine()).hired.find((o) => o.id === late.id).status, 'expired')

  // Le joueur a tout dépensé entre-temps (son envoi d'argent est compté par le serveur).
  const broke = await offer(OUVRIER.essi, 3)
  admin()
  await sql(`UPDATE haroolife_saves SET wallet = 1000 WHERE user_id='${id(2)}'`)
  await as(6)
  const cancelled = await answer(broke.id, true)
  assert.equal(cancelled.status, 'cancelled')
  assert.match(cancelled.reason, /plus de quoi payer/)
  admin()
  assert.equal(
    await one(`SELECT count(*)::int FROM haroolife_money_transfers WHERE client_id='${broke.id}'`),
    0,
  )

  // Au plus 10 propositions par 24 h : Kofi en a fait 4, puis 6 retirées ; la 11ᵉ est refusée.
  await sql(`UPDATE haroolife_saves SET wallet = 50000 WHERE user_id='${id(2)}'`)
  await as(2)
  for (let i = 0; i < 6; i++) {
    const o = await offer(OUVRIER.essi, 1)
    await one('SELECT haroolife_field_cancel($1)', [o.id])
  }
  await fails('SELECT haroolife_field_offer($1,$2,$3,$4)', [OUVRIER.essi, 1, 'mais', 'lome'], /réessaie demain/)

  // Personne sans connexion ; la table n'est lisible que par les fonctions.
  await as(null)
  await fails('SELECT haroolife_field_workers($1)', ['Maritime'], /Connexion requise/)
  await as(1)
  await fails('SELECT * FROM haroolife_field_offers', [], /permission denied/)
  await sql("RESET ROLE; SET ROLE anon")
  await fails('SELECT haroolife_field_offers_mine()', [], /permission denied/)
})
