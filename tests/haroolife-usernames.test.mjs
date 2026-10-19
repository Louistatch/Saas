// HarooLife : le nom d'utilisateur, sur la vraie migration dans PGlite. Unique sans tenir compte de
// la casse, format court, noms réservés ; en changer libère l'ancien ; il devient le nom affiché
// dans le jeu et donne une maison au visiteur qui n'en avait pas (canton du quartier choisi).
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { PGlite } from '@electric-sql/pglite'

const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`

test('nom d’utilisateur : unique, réservé à soi, et il ouvre la maison du visiteur', async (t) => {
  const db = new PGlite()
  t.after(() => db.close())
  const as = (n) =>
    db.exec(`RESET ROLE; SET ROLE authenticated;
      SELECT set_config('request.jwt.claim.sub','${id(n)}',false)`)
  const one = async (s, args) => Object.values((await db.query(s, args)).rows[0])[0]
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE SCHEMA auth; CREATE SCHEMA private;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    GRANT USAGE ON SCHEMA auth TO authenticated, anon;
    CREATE TABLE public.profiles(id uuid PRIMARY KEY);
    CREATE TABLE public.cantons(id uuid PRIMARY KEY, name text NOT NULL);
    INSERT INTO public.cantons VALUES
      ('10000000-0000-4000-8000-000000000001', 'Lome Commune'),
      ('10000000-0000-4000-8000-000000000002', 'Agoè Assiyéyé'),
      ('10000000-0000-4000-8000-000000000003', 'Baguida');
    CREATE TABLE public.haroolife_residents(
      user_id uuid PRIMARY KEY REFERENCES public.profiles(id),
      canton_id uuid NOT NULL REFERENCES public.cantons(id),
      display_name text NOT NULL, pagne smallint NOT NULL DEFAULT 1,
      visible boolean NOT NULL DEFAULT true, updated_at timestamptz DEFAULT now());
  `)
  for (let n = 1; n <= 3; n++) await db.exec(`INSERT INTO public.profiles VALUES ('${id(n)}')`)
  // Kofi (3) a déjà une maison à Baguida, avec un autre nom affiché.
  await db.exec(`INSERT INTO public.haroolife_residents(user_id, canton_id, display_name)
                 VALUES ('${id(3)}', '10000000-0000-4000-8000-000000000003', 'Kofi')`)
  await db.exec(readFileSync('supabase/migrations/20261017_160000_haroolife_usernames.sql', 'utf8'))
  await db.exec(
    readFileSync('supabase/migrations/20261017_170000_haroolife_username_adult.sql', 'utf8'),
  )

  // Avant de créer le compte, n'importe qui vérifie qu'un nom est libre.
  await db.exec('RESET ROLE; SET ROLE anon')
  assert.deepEqual(await one('SELECT haroolife_username_available($1)', [' Kodjo_Lome ']), {
    username: 'kodjo_lome',
    available: true,
    reason: null,
  })
  for (const [name, reason] of [
    ['ko', 'format'],
    ['1kodjo', 'format'],
    ['kodjo lomé', 'format'],
    ['a'.repeat(21), 'format'],
    ['admin', 'reserved'],
    ['FaitiereHub_officiel', 'reserved'],
    ['harooteam', 'reserved'],
  ])
    assert.equal(
      (await one('SELECT haroolife_username_available($1)', [name])).reason,
      reason,
      name,
    )
  await assert.rejects(db.query("SELECT haroolife_take_username('kodjo_lome', p_adult => true)"))

  // Ama (1), visiteuse sans maison, prend son nom à Agoè : il devient son nom dans le jeu.
  // Sans la déclaration « 18 ans ou plus », rien n'est pris.
  await as(1)
  assert.equal(await one('SELECT haroolife_my_username()'), null)
  await assert.rejects(db.query("SELECT haroolife_take_username('ama_agoe', 'agoe', 4)"), /18 ans/)
  // L'ancienne entrée, sans déclaration, refuse toujours.
  await assert.rejects(
    db.query("SELECT haroolife_claim_username('ama_agoe', 'agoe', 4)"),
    /18 ans/,
  )
  await assert.rejects(
    db.query("SELECT haroolife_take_username('ama_agoe', 'agoe', 4, false)"),
    /18 ans/,
  )
  assert.equal(await one('SELECT haroolife_my_username()'), null)
  assert.deepEqual(
    await one("SELECT haroolife_take_username('Ama_Agoe', 'agoe', 4, p_adult => true)"),
    {
      username: 'ama_agoe',
    },
  )
  assert.equal(await one('SELECT haroolife_my_username()'), 'ama_agoe')
  await db.exec('RESET ROLE')
  const home = (
    await db.query(`SELECT canton_id, display_name, pagne FROM public.haroolife_residents
                                WHERE user_id = '${id(1)}'`)
  ).rows[0]
  assert.deepEqual(home, {
    canton_id: '10000000-0000-4000-8000-000000000002',
    display_name: 'ama_agoe',
    pagne: 4,
  })
  // Le même appel une deuxième fois ne change rien ; changer de nom libère l'ancien (sa maison
  // reste à Agoè) ; elle reprend le premier.
  await as(1)
  assert.deepEqual(
    await one("SELECT haroolife_take_username('ama_agoe', 'agoe', p_adult => true)"),
    {
      username: 'ama_agoe',
    },
  )
  await one("SELECT haroolife_take_username('ama_bis', 'baguida', p_adult => true)")
  assert.equal(await one('SELECT haroolife_my_username()'), 'ama_bis')
  assert.equal((await one('SELECT haroolife_username_available($1)', ['ama_agoe'])).available, true)
  await one("SELECT haroolife_take_username('ama_agoe', p_adult => true)")

  // Yawa (2) ne peut pas le prendre, même en majuscules ; il n'est plus libre pour personne.
  await as(2)
  await assert.rejects(
    db.query("SELECT haroolife_take_username('AMA_AGOE', p_adult => true)"),
    /déjà pris/,
  )
  assert.equal((await one('SELECT haroolife_username_available($1)', ['ama_agoe'])).reason, 'taken')
  // Un quartier inconnu donne Lomé Commune.
  await one("SELECT haroolife_take_username('yawa_tokoin', 'nulle-part', p_adult => true)")

  // Kofi (3) garde sa maison de Baguida ; son nom affiché devient son nom d'utilisateur.
  await as(3)
  await one("SELECT haroolife_take_username('kofi228', 'agoe', p_adult => true)")
  await db.exec('RESET ROLE')
  const rows = (
    await db.query(`SELECT user_id, canton_id, display_name FROM public.haroolife_residents
                                ORDER BY user_id`)
  ).rows
  assert.deepEqual(
    rows.map((r) => [r.canton_id.slice(-1), r.display_name]),
    [
      ['2', 'ama_agoe'],
      ['1', 'yawa_tokoin'],
      ['3', 'kofi228'],
    ],
  )

  // La déclaration est datée pour chacun ; la date de naissance n'est jamais stockée.
  await db.exec('RESET ROLE')
  const cols = (
    await db.query(`SELECT column_name FROM information_schema.columns
                                WHERE table_name = 'haroolife_usernames' ORDER BY 1`)
  ).rows
  assert.deepEqual(
    cols.map((c) => c.column_name),
    ['adult_confirmed_at', 'created_at', 'user_id', 'username'],
  )
  assert.equal(
    (
      await db.query(
        'SELECT count(*)::int AS n FROM public.haroolife_usernames WHERE adult_confirmed_at IS NULL',
      )
    ).rows[0].n,
    0,
  )

  // La table reste fermée aux joueurs.
  await as(1)
  await assert.rejects(db.query('SELECT * FROM public.haroolife_usernames'))
  await assert.rejects(
    db.query(`INSERT INTO public.haroolife_usernames VALUES ('${id(1)}', 'pirate')`),
  )
})
