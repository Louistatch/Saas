// Marché de proximité et travail : exécute la vraie migration dans PGlite. Téléphone retiré de
// la lecture anonyme, ouvriers disponibles (vie privée, proximité), réponse « je suis
// intéressé », invitation d'un ouvrier, décision et échange des numéros, retrait, clôture,
// nouvelles non lues, droits, retour arrière.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { PGlite } from '@electric-sql/pglite'

const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const db = new PGlite()
const sql = (s) =>
  db.exec(s).catch((e) => {
    throw new Error(`${s.slice(0, 120)} → ${e.message}`)
  })
const as = (n) =>
  sql(
    `RESET ROLE; SET ROLE authenticated; SELECT set_config('request.jwt.claim.sub','${n ? id(n) : ''}',false)`,
  )
const anon = () =>
  sql(`RESET ROLE; SET ROLE anon; SELECT set_config('request.jwt.claim.sub','',false)`)
const one = async (s, args) => {
  try {
    return Object.values((await db.query(s, args)).rows[0])[0]
  } catch (e) {
    throw new Error(`${s} → ${e.message}`)
  }
}
const fails = async (s, args, pattern) =>
  assert.rejects(
    () => db.query(s, args),
    (e) => pattern.test(e.message) || assert.fail(`${s} : « ${e.message} » au lieu de ${pattern}`),
  )

const respond = (a, msg = null, qty = null, phone = null) =>
  one('SELECT market_respond($1,$2,$3,$4)', [a, msg, qty, phone])
const invite = (a, worker) => one('SELECT market_invite($1,$2,$3)', [a, worker, 'Venez lundi'])
const decide = (r, ok) => one('SELECT market_decide($1,$2)', [r, ok])
const withdraw = (r) => one('SELECT market_withdraw($1)', [r])
const activity = () => one('SELECT market_activity()')
const unread = () => one('SELECT market_unread()')
const workers = (canton) => one('SELECT market_workers($1,NULL,NULL,NULL)', [canton])

// Comptes : 1 Kossi (employeur, sans profil Haroo), 2 Ama (acheteuse), 5 Komla (ouvrier, Bè),
// 6 Essi (ouvrière, Kara), 7 Yao (indisponible), 8 ouvrier de démonstration, 9 Afi (ouvrier
// sans numéro).
const OUV = { komla: id(51), essi: id(61), yao: id(71), demo: id(81), afi: id(91) }
const ANN = { job: id(301), presale: id(302), member: id(303), expired: id(304) }
const BE = id(921)

test('marché et travail : réponses, invitations, décisions, numéros, droits', async (t) => {
  t.after(() => db.close())
  await sql(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth; CREATE SCHEMA private;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    GRANT USAGE ON SCHEMA auth, private TO authenticated, anon;
    CREATE TABLE regions(id uuid PRIMARY KEY, name text);
    CREATE TABLE prefectures(id uuid PRIMARY KEY, region_id uuid REFERENCES regions(id), name text);
    CREATE TABLE cantons(id uuid PRIMARY KEY, prefecture_id uuid REFERENCES prefectures(id), name text);
    CREATE TABLE profiles(id uuid PRIMARY KEY, first_name text, last_name text, role text,
      haroo_type text, deleted_at timestamptz, is_demo boolean NOT NULL DEFAULT false);
    CREATE TABLE haroo_ouvrier_profiles(id uuid PRIMARY KEY, user_id uuid UNIQUE, first_name text NOT NULL,
      last_name text NOT NULL, phone text, competences text[] NOT NULL DEFAULT '{}', disponible boolean NOT NULL DEFAULT true,
      note_moyenne numeric(3,2) NOT NULL DEFAULT 0, nombre_avis integer NOT NULL DEFAULT 0);
    CREATE TABLE haroo_acheteur_profiles(id uuid PRIMARY KEY, user_id uuid UNIQUE, first_name text, last_name text, phone text);
    CREATE TABLE haroo_agronome_profiles(id uuid PRIMARY KEY, user_id uuid UNIQUE, first_name text, last_name text, phone text);
    CREATE TABLE haroo_ouvrier_cantons(ouvrier_id uuid REFERENCES haroo_ouvrier_profiles(id), canton_id uuid REFERENCES cantons(id));
    CREATE TABLE producer_announcements(
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), member_id uuid, cooperative_id uuid,
      type text NOT NULL CHECK (type IN ('job','prevente','mission','autre')), title text NOT NULL,
      description text, culture text, quantity_kg numeric, price_per_kg_fcfa numeric, location_canton text,
      contact_phone text, status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','closed','expired')),
      created_at timestamptz NOT NULL DEFAULT now(), author_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
      region_id uuid, prefecture_id uuid, canton_id uuid REFERENCES cantons(id), expires_at timestamptz,
      updated_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT producer_announcements_has_owner CHECK (author_id IS NOT NULL OR member_id IS NOT NULL));
    ALTER TABLE producer_announcements ENABLE ROW LEVEL SECURITY;
    CREATE POLICY announcements_public ON producer_announcements FOR SELECT TO anon, authenticated USING (status = 'active');
    GRANT SELECT ON producer_announcements TO anon, authenticated;
    INSERT INTO regions VALUES ('${id(901)}','Maritime'), ('${id(902)}','Kara');
    INSERT INTO prefectures VALUES ('${id(911)}','${id(901)}','Golfe'), ('${id(912)}','${id(902)}','Kozah');
    INSERT INTO cantons VALUES ('${BE}','${id(911)}','Bè'), ('${id(922)}','${id(912)}','Lama');
    INSERT INTO profiles(id, first_name, last_name, role, haroo_type, is_demo) VALUES
      ('${id(1)}','Kossi','AGBO','member',NULL,false), ('${id(2)}','ama','KPOGO','none','acheteur',false),
      ('${id(5)}','Komla','ADJO','none','ouvrier',false), ('${id(6)}','Essi','KPODAR','none','ouvrier',false),
      ('${id(7)}','Yao','MENSAH','none','ouvrier',false), ('${id(8)}','Démo','TEST','none','ouvrier',true),
      ('${id(9)}','Afi','DOSSOU','none','ouvrier',false);
    INSERT INTO haroo_acheteur_profiles VALUES ('${id(201)}','${id(2)}','Ama','KPOGO','90 11 22 33');
    INSERT INTO haroo_ouvrier_profiles VALUES
      ('${OUV.komla}','${id(5)}','Komla','ADJO','+22890000001','{désherbage,labour,récolte,semis,traitement}',true,4.5,12),
      ('${OUV.essi}','${id(6)}','Essi','KPODAR','+228 91 00 00 02','{récolte}',true,0,0),
      ('${OUV.yao}','${id(7)}','Yao','MENSAH','+22890000003','{labour}',false,5,9),
      ('${OUV.demo}','${id(8)}','Démo','TEST','+22890000004','{labour}',true,5,1),
      ('${OUV.afi}','${id(9)}','Afi','DOSSOU',NULL,'{semis}',true,0,0);
    INSERT INTO haroo_ouvrier_cantons VALUES ('${OUV.komla}','${BE}'), ('${OUV.essi}','${id(922)}');
    INSERT INTO producer_announcements(id, type, title, author_id, contact_phone, canton_id, prefecture_id, region_id)
      VALUES ('${ANN.job}','job','Désherbage de 2 ha','${id(1)}','+228 92 00 00 01','${BE}','${id(911)}','${id(901)}'),
             ('${ANN.presale}','prevente','Maïs blanc','${id(1)}','92000001','${BE}','${id(911)}','${id(901)}');
    INSERT INTO producer_announcements(id, type, title, member_id, contact_phone) VALUES
      ('${ANN.member}','prevente','Soja (fiche membre)','${id(400)}','+22893000000');
    INSERT INTO producer_announcements(id, type, title, author_id, expires_at) VALUES
      ('${ANN.expired}','prevente','Ancienne récolte','${id(1)}', now() - interval '1 day');
  `)
  const migration = readFileSync('supabase/migrations/20261023_150000_market_work.sql', 'utf8')
  await sql(migration)
  await sql(`UPDATE producer_announcements SET wage_per_day_fcfa = 2500, positions = 2,
    starts_on = current_date + 3, work_days = 2 WHERE id = '${ANN.job}'`)

  // ── Lecture anonyme : l'annonce oui, le téléphone et l'auteur non ──
  await anon()
  const pub = await db.query(
    'SELECT title, has_contact, accepts_responses, wage_per_day_fcfa FROM producer_announcements WHERE id = $1',
    [ANN.job],
  )
  assert.deepEqual(pub.rows[0], {
    title: 'Désherbage de 2 ha',
    has_contact: true,
    accepts_responses: true,
    wage_per_day_fcfa: 2500,
  })
  await fails('SELECT contact_phone FROM producer_announcements', [], /permission denied/)
  await fails('SELECT author_id FROM producer_announcements', [], /permission denied/)
  await fails('SELECT * FROM producer_announcements', [], /permission denied/)
  await fails('SELECT market_workers()', [], /permission denied/)
  await fails('SELECT market_respond($1)', [ANN.job], /permission denied/)
  assert.equal(
    (
      await db.query('SELECT accepts_responses FROM producer_announcements WHERE id = $1', [
        ANN.member,
      ])
    ).rows[0].accepts_responses,
    false,
  )
  // Les comptes connectés ne changent pas ; la table des réponses leur reste fermée.
  await as(2)
  assert.equal(
    await one('SELECT contact_phone FROM producer_announcements WHERE id = $1', [ANN.job]),
    '+228 92 00 00 01',
  )
  await fails('SELECT * FROM market_responses', [], /permission denied/)
  // Nouvelle annonce : elle expire d'elle-même.
  await sql('RESET ROLE')
  const fresh = await one(
    `INSERT INTO producer_announcements(type, title, author_id) VALUES ('autre','Tricycle à louer','${id(2)}') RETURNING expires_at > now() + interval '44 days'`,
  )
  assert.equal(fresh, true)

  // ── Ouvriers disponibles : les plus proches d'abord, jamais de téléphone ni de nom ──
  await as(1)
  const list = await workers(BE)
  assert.deepEqual(
    list.map((w) => [w.name, w.proximity]),
    [
      ['Komla A.', 0],
      ['Afi D.', 3],
      ['Essi K.', 3],
    ],
  )
  assert.deepEqual(list[0].skills, ['désherbage', 'labour', 'récolte', 'semis', 'traitement'])
  assert.equal(list[0].note, 4.5)
  assert.equal(list[2].note, null, 'pas de note sans avis')
  assert.deepEqual(list[0].cantons, ['Bè'])
  const shown = JSON.stringify(list)
  assert.ok(!shown.includes('+228') && !shown.includes('ADJO'), 'ni téléphone ni nom de famille')
  assert.ok(!shown.includes('Yao') && !shown.includes('Démo'), 'indisponible et démo exclus')
  assert.deepEqual(
    (await one('SELECT market_workers(NULL,NULL,NULL,$1)', ['RÉCOLTE'])).map((w) => w.name),
    ['Komla A.', 'Essi K.'],
  )
  await as(5)
  assert.ok(
    !(await workers(BE)).some((w) => w.name.startsWith('Komla')),
    'on ne se voit pas soi-même',
  )

  // ── Répondre à une prévente ──
  await as(2)
  await fails('SELECT market_respond($1)', [ANN.expired], /plus ouverte/)
  await fails('SELECT market_respond($1)', [ANN.member], /par téléphone/)
  await fails('SELECT market_respond($1,$2,$3,$4)', [ANN.presale, null, null, 'abc12'], /invalide/)
  await fails(
    'SELECT market_respond($1,$2,$3,$4)',
    [ANN.presale, 'x'.repeat(281), null, null],
    /trop long/,
  )
  const ama = await respond(ANN.presale, 'Je prends 500 kg', 500)
  assert.equal(ama.status, 'envoyee')
  assert.equal(ama.phone, null, 'le numéro de l’auteur attend la décision')
  assert.equal(ama.announcement.title, 'Maïs blanc')
  assert.equal(ama.author.name, 'Kossi A.')
  assert.equal((await respond(ANN.presale)).id, ama.id, 'rejouer ne crée rien')
  await as(1)
  await fails('SELECT market_respond($1)', [ANN.presale], /votre annonce/)
  assert.equal(await unread(), 1, 'une décision à prendre')
  assert.equal(await one('SELECT market_seen()'), 1, 'lire ne fait pas disparaître la décision')
  let mine = await activity()
  const presale = mine.announcements.find((a) => a.id === ANN.presale)
  assert.equal(presale.responses.length, 1)
  assert.equal(presale.responses[0].person.name, 'Ama K.')
  assert.equal(presale.responses[0].person.kind, 'acheteur')
  assert.equal(presale.responses[0].quantity_kg, 500)
  assert.equal(presale.responses[0].phone, null, 'le numéro du répondant attend la décision')

  // Seul l'auteur décide d'une réponse ; retenir échange les numéros.
  await as(2)
  await fails('SELECT market_decide($1,$2)', [ama.id, true], /attend pas votre décision/)
  await as(6)
  await fails('SELECT market_decide($1,$2)', [ama.id, true], /introuvable/)
  await as(1)
  const kept = await decide(ama.id, true)
  assert.equal(kept.status, 'retenue')
  assert.equal(kept.phone, '+22890112233', 'numéro local normalisé')
  assert.equal((await decide(ama.id, true)).status, 'retenue', 'rejouer ne change rien')
  assert.equal(await unread(), 0)
  await as(2)
  assert.equal(await unread(), 1, 'Ama a une nouvelle : réponse retenue')
  const amaView = (await activity()).sent.find((r) => r.id === ama.id)
  assert.equal(amaView.phone, '+22892000001', 'le numéro de l’auteur une fois retenue')
  assert.equal(await one('SELECT market_seen()'), 0)

  // ── Inviter un ouvrier sur une offre de travail ──
  await as(2)
  await fails('SELECT market_invite($1,$2,$3)', [ANN.job, OUV.komla, null], /Seul l’auteur/)
  await as(1)
  await fails('SELECT market_invite($1,$2,$3)', [ANN.presale, OUV.komla, null], /offre de travail/)
  await fails('SELECT market_invite($1,$2,$3)', [ANN.job, OUV.yao, null], /plus disponible/)
  const inv = await invite(ANN.job, OUV.komla)
  assert.equal(inv.status, 'invitee')
  assert.equal(inv.person.name, 'Komla A.')
  assert.equal(inv.phone, null)
  assert.equal((await invite(ANN.job, OUV.komla)).id, inv.id, 'inviter deux fois ne crée rien')
  await as(5)
  assert.equal(await unread(), 1, 'une invitation à accepter')
  const invited = (await activity()).sent[0]
  assert.equal(invited.status, 'invitee')
  assert.equal(invited.announcement.wage_per_day_fcfa, 2500)
  assert.equal(invited.announcement.place, 'Bè, Golfe')
  assert.equal(invited.phone, null)
  await fails('SELECT market_respond($1)', [ANN.job], /Vous êtes invité/)
  await fails('SELECT market_withdraw($1)', [inv.id], /Impossible de retirer/)
  const accepted = await decide(inv.id, true)
  assert.equal(accepted.status, 'retenue')
  assert.equal(accepted.phone, '+22892000001', 'l’ouvrier reçoit le numéro de l’employeur')
  await as(1)
  assert.equal(await unread(), 1, 'Kossi : invitation acceptée')
  mine = await activity()
  const job = mine.announcements.find((a) => a.id === ANN.job)
  assert.equal(job.hired, 1)
  assert.equal(job.responses[0].phone, '+22890000001', 'l’employeur reçoit le numéro de l’ouvrier')

  // Une invitation retirée disparaît ; on peut réinviter ; une invitation déclinée est finale.
  const essi = await invite(ANN.job, OUV.essi)
  assert.equal((await withdraw(essi.id)).status, 'retiree')
  await as(6)
  assert.equal(await unread(), 0)
  assert.deepEqual((await activity()).sent, [])
  await as(1)
  assert.equal((await invite(ANN.job, OUV.essi)).status, 'invitee')
  await as(6)
  assert.equal((await decide(essi.id, false)).status, 'declinee')
  await as(1)
  await fails('SELECT market_invite($1,$2,$3)', [ANN.job, OUV.essi, null], /déjà répondu/)

  // L'ouvrier sans numéro ne peut pas accepter sans en donner un.
  const afi = await invite(ANN.job, OUV.afi)
  await as(9)
  await fails('SELECT market_decide($1,$2)', [afi.id, true], /Ajoutez votre numéro/)
  await fails('SELECT market_respond($1)', [ANN.presale], /Indiquez un numéro/)

  // ── Retirer sa réponse, se représenter ──
  await as(2)
  assert.equal((await withdraw(ama.id)).status, 'retiree')
  await as(1)
  assert.equal(
    await unread(),
    3,
    'non lus : invitation acceptée, invitation déclinée, réponse retirée',
  )
  await as(2)
  const again = await respond(ANN.presale, 'Finalement 300 kg', 300)
  assert.equal(again.id, ama.id)
  assert.equal(again.status, 'envoyee')

  // ── Clôturer : plus de réponses ni de décisions ──
  await as(2)
  await fails('SELECT market_close($1)', [ANN.presale], /introuvable/)
  await as(1)
  assert.equal(await one('SELECT market_close($1)', [ANN.presale]), true)
  assert.equal(await one('SELECT market_close($1)', [ANN.presale]), false, 'déjà close')
  await fails('SELECT market_decide($1,$2)', [ama.id, true], /close/)
  await as(5)
  await fails('SELECT market_respond($1,$2,$3,$4)', [ANN.presale, null, null, null], /plus ouverte/)
  await as(1)
  assert.equal(
    (await activity()).announcements.find((a) => a.id === ANN.presale).open,
    false,
    'l’annonce close reste dans le suivi',
  )

  // ── Retour arrière : le téléphone redevient lisible, la table disparaît ──
  await sql('RESET ROLE')
  await sql(readFileSync('supabase/rollbacks/20261023_150000_market_work.rollback.sql', 'utf8'))
  await anon()
  assert.equal(
    await one('SELECT contact_phone FROM producer_announcements WHERE id = $1', [ANN.job]),
    '+228 92 00 00 01',
  )
  await sql('RESET ROLE')
  assert.equal(await one(`SELECT to_regclass('public.market_responses') IS NULL`), true)
})
