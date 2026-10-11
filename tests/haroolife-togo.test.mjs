// HarooLife national : rôles déduits, maison choisie, monde avec effectifs réels, vie privée.
// Exécute la vraie migration dans PGlite (comme tests/haroolife.test.mjs).
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { PGlite } from '@electric-sql/pglite'

const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const db = new PGlite()
const sql = (s) => db.exec(s)
const rows = async (s, args = []) => (await db.query(s, args)).rows
const as = async (n) => {
  await sql(
    `RESET ROLE; SET ROLE authenticated; SELECT set_config('request.jwt.claim.sub','${n ? id(n) : ''}',false)`,
  )
}
const world = async (canton = null) =>
  (await rows('SELECT haroolife_world($1) AS w', [canton]))[0].w

test('HarooLife national : rôles, maison, monde et vie privée', async (t) => {
  t.after(() => db.close())
  await sql(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth; CREATE SCHEMA private;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    GRANT USAGE ON SCHEMA auth, private TO authenticated;
    CREATE TABLE regions(id uuid PRIMARY KEY, name text, code text);
    CREATE TABLE prefectures(id uuid PRIMARY KEY, region_id uuid, name text);
    CREATE TABLE cantons(id uuid PRIMARY KEY, prefecture_id uuid, name text);
    CREATE TABLE cooperatives(id uuid PRIMARY KEY, name text, level text, deleted_at timestamptz);
    CREATE TABLE profiles(id uuid PRIMARY KEY, email text, role text, haroo_type text, cooperative_id uuid, deleted_at timestamptz);
    CREATE TABLE members(id uuid PRIMARY KEY, cooperative_id uuid, email text, phone text, canton_id uuid, deleted_at timestamptz);
    CREATE TABLE haroo_ouvrier_profiles(id uuid PRIMARY KEY, user_id uuid, phone text, disponible boolean);
    CREATE TABLE haroo_ouvrier_cantons(ouvrier_id uuid, canton_id uuid);
    CREATE TABLE haroo_acheteur_profiles(id uuid PRIMARY KEY, user_id uuid);
    CREATE TABLE haroo_acheteur_cantons(acheteur_id uuid, canton_id uuid);
    CREATE TABLE haroo_agronome_profiles(id uuid PRIMARY KEY, user_id uuid, canton_id uuid);
    CREATE TABLE partners(id uuid PRIMARY KEY, status text);
    CREATE TABLE partner_memberships(id uuid PRIMARY KEY, partner_id uuid, user_id uuid, status text);
    CREATE TABLE partner_certifications(id uuid PRIMARY KEY, partner_id uuid, user_id uuid, certified_at timestamptz);
    CREATE TABLE haroolife_groups(id uuid PRIMARY KEY, owner_id uuid, kind text, title text, activity text,
      cooperative_id uuid, canton_id uuid, starts_on date, ends_on date, target numeric, expires_at timestamptz, cancelled_at timestamptz);
    CREATE TABLE haroolife_participations(group_id uuid, user_id uuid, amount numeric, left_at timestamptz);
    -- Arbre d'organisations : la faîtière (42) voit FENOMAT et sa coopérative fille.
    CREATE FUNCTION get_accessible_cooperative_ids() RETURNS uuid[] LANGUAGE sql STABLE AS $$
      SELECT CASE WHEN auth.uid() = '${id(42)}' THEN ARRAY['${id(31)}','${id(32)}']::uuid[]
                  ELSE coalesce((SELECT ARRAY[cooperative_id] FROM public.profiles WHERE id = auth.uid() AND cooperative_id IS NOT NULL), '{}') END $$;
    INSERT INTO regions VALUES ('${id(1)}','Kara','KAR'),('${id(2)}','Maritime','MAR');
    INSERT INTO prefectures VALUES ('${id(11)}','${id(1)}','Kozah'),('${id(12)}','${id(2)}','Golfe');
    INSERT INTO cantons VALUES ('${id(21)}','${id(11)}','Lama-Kara'),('${id(22)}','${id(11)}','Pya'),('${id(23)}','${id(12)}','Baguida');
    INSERT INTO cooperatives VALUES ('${id(31)}','FENOMAT','faitiere',NULL),('${id(32)}','Coop Kara','cooperative',NULL);
    INSERT INTO profiles VALUES
      ('${id(41)}','admin@x','super_admin',NULL,NULL,NULL),
      ('${id(42)}','fait@x','cooperative_admin',NULL,'${id(31)}',NULL),
      ('${id(43)}','prod@x','member',NULL,'${id(32)}',NULL),
      ('${id(44)}','ouv@x','none','ouvrier',NULL,NULL),
      ('${id(45)}','agro@x','none','agronome',NULL,NULL),
      ('${id(46)}','op@x','none',NULL,NULL,NULL),
      ('${id(47)}','gone@x','member',NULL,'${id(32)}',now());
    INSERT INTO members VALUES ('${id(51)}','${id(32)}','prod@x','90000000','${id(22)}',NULL),('${id(52)}','${id(32)}','z@x','91111111','${id(22)}',NULL);
    INSERT INTO haroo_ouvrier_profiles VALUES ('${id(61)}','${id(44)}','92222222',true);
    INSERT INTO haroo_ouvrier_cantons VALUES ('${id(61)}','${id(21)}');
    INSERT INTO haroo_agronome_profiles VALUES ('${id(62)}','${id(45)}','${id(23)}');
    INSERT INTO partners VALUES ('${id(71)}','certified');
    INSERT INTO partner_memberships VALUES ('${id(72)}','${id(71)}','${id(46)}','active');
    INSERT INTO partner_certifications VALUES ('${id(73)}','${id(71)}','${id(46)}',now());
    INSERT INTO haroolife_groups VALUES ('${id(81)}','${id(43)}','team','Récolte','recolte','${id(32)}','${id(21)}','2099-01-01','2099-01-02',8,'2099-01-01',NULL);
    INSERT INTO haroolife_participations VALUES ('${id(81)}','${id(44)}',1,NULL);
  `)
  await sql(readFileSync('supabase/migrations/20261012_120000_haroolife_togo.sql', 'utf8'))

  await t.test('les rôles viennent des données, pas de la personne', async () => {
    const roles = async (n) => (await rows('SELECT private.haroolife_roles($1) AS r', [id(n)]))[0].r
    await sql('RESET ROLE')
    assert.deepEqual(await roles(41), ['equipe'])
    assert.deepEqual(await roles(42), ['faitiere'])
    assert.deepEqual(await roles(43), ['producteur'])
    assert.deepEqual(await roles(44), ['ouvrier'])
    assert.deepEqual(await roles(45), ['agronome'])
    assert.deepEqual(await roles(46), ['operateur'])
    await as(44)
    await assert.rejects(rows('SELECT private.haroolife_roles($1)', [id(41)]), /permission denied/)
  })

  await t.test('sans maison : canton suggéré depuis ce que la plateforme sait', async () => {
    await as(44)
    let w = await world()
    assert.equal(w.me.home, null)
    assert.equal(w.me.suggested_canton, id(21))
    assert.equal(w.here, null)
    await as(43)
    w = await world()
    assert.equal(w.me.suggested_canton, id(22), 'producteur : canton de sa fiche membre')
    await as(42)
    w = await world()
    assert.equal(w.me.suggested_canton, id(22), 'faîtière : canton où vivent ses membres')
    await as(41)
    assert.equal((await world()).me.suggested_canton, null)
  })

  await t.test('choisir sa maison, et le territoire compte les vrais habitants', async () => {
    await as(44)
    await rows('SELECT haroolife_set_home($1,$2,$3,$4)', [id(21), ' Kossi ', 3, true])
    await as(43)
    await rows('SELECT haroolife_set_home($1,$2)', [id(21), 'Abalo'])
    await as(45)
    await rows('SELECT haroolife_set_home($1,$2,$3,$4)', [id(21), 'Essi', 2, false])
    await as(46)
    await rows('SELECT haroolife_set_home($1,$2)', [id(23), 'Opérateur Golfe'])
    await as(47)
    await assert.rejects(
      rows('SELECT haroolife_set_home($1,$2)', [id(21), 'X']),
      /Compte introuvable/,
    )
    await as(44)
    await assert.rejects(rows('SELECT haroolife_set_home($1,$2)', [id(99), 'X']), /Canton inconnu/)

    const w = await world()
    assert.equal(w.me.display_name, 'Kossi')
    assert.equal(w.me.pagne, 3)
    assert.deepEqual(w.me.home, {
      canton_id: id(21),
      canton: 'Lama-Kara',
      prefecture: 'Kozah',
      region: 'Kara',
      region_code: 'KAR',
    })
    const kara = w.territory.find((r) => r.code === 'KAR')
    const maritime = w.territory.find((r) => r.code === 'MAR')
    assert.equal(kara.residents, 3)
    assert.equal(maritime.residents, 1)
    const lama = kara.prefectures[0].cantons.find((c) => c.name === 'Lama-Kara')
    assert.equal(lama.residents, 3)
    assert.equal(kara.prefectures[0].cantons.find((c) => c.name === 'Pya').residents, 0)
  })

  await t.test(
    '« ici » : habitants visibles avec rôle, moi en premier, jamais un téléphone',
    async () => {
      await as(44)
      const w = await world()
      assert.deepEqual(
        w.here.residents.map((r) => [r.display_name, r.roles, r.is_me]),
        [
          ['Kossi', ['ouvrier'], true],
          ['Abalo', ['producteur'], false],
        ],
        'Essi est invisible pour les autres',
      )
      assert.ok(!JSON.stringify(w).match(/9[0-2]{7}|@x/), 'aucun téléphone ni e-mail')
      assert.deepEqual(w.here.cooperatives, [])
      assert.equal(w.here.groups.length, 1)
      assert.equal(w.here.groups[0].people, 1)
      assert.equal(w.here.groups[0].is_owner, false)
      // Essi se voit elle-même même invisible, et peut regarder un autre canton.
      await as(45)
      const mine = await world()
      assert.equal(mine.here.residents[0].display_name, 'Essi')
      assert.equal(mine.here.residents[0].is_me, true)
      const golfe = await world(id(23))
      assert.equal(golfe.here.canton.canton, 'Baguida')
      assert.deepEqual(
        golfe.here.residents.map((r) => r.roles),
        [['operateur']],
      )
      // Les coopératives du canton de Pya (où vivent les membres) sont listées avec leurs effectifs.
      const pya = await world(id(22))
      assert.deepEqual(pya.here.cooperatives, [
        { id: id(32), name: 'Coop Kara', level: 'cooperative', members: 2 },
      ])
    },
  )

  await t.test(
    'parler sur la place : résidents seulement, une fois par 20 s, visible ici',
    async () => {
      await as(44)
      const mid = (
        await rows('SELECT haroolife_say($1,$2) AS id', [id(21), '  Bonjour   la famille  '])
      )[0].id
      assert.ok(mid)
      await assert.rejects(rows('SELECT haroolife_say($1,$2)', [id(21), 'Encore']), /Attendez/)
      await assert.rejects(rows('SELECT haroolife_say($1,$2)', [id(21), '   ']), /vide/)
      await as(41)
      await assert.rejects(rows('SELECT haroolife_say($1,$2)', [id(21), 'Coucou']), /maison/)
      await as(43)
      const w = await world()
      assert.deepEqual(
        w.here.messages.map((m) => [m.display_name, m.body, m.is_me]),
        [['Kossi', 'Bonjour la famille', false]],
      )
      assert.equal((await world(id(23))).here.messages.length, 0, 'un autre canton n’entend pas')
    },
  )

  await t.test('un visiteur anonyme ne peut rien lire ni écrire', async () => {
    await sql(`RESET ROLE; SET ROLE anon; SELECT set_config('request.jwt.claim.sub','',false)`)
    await assert.rejects(rows('SELECT haroolife_world(NULL)'), /permission denied/)
    await assert.rejects(rows('SELECT * FROM haroolife_residents'), /permission denied/)
    await assert.rejects(rows('SELECT haroolife_say($1,$2)', [id(21), 'x']), /permission denied/)
    await sql('RESET ROLE; SET ROLE authenticated')
    await assert.rejects(rows('SELECT * FROM haroolife_messages'), /permission denied/)
    await assert.rejects(rows('SELECT * FROM haroolife_residents'), /permission denied/)
  })
})
