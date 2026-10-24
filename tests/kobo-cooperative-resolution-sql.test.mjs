import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { PGlite } from '@electric-sql/pglite'

test('Kobo : isolation réelle des lignes et résolution atomique par faîtière', async (t) => {
  const db = new PGlite()
  t.after(() => db.close())
  const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
  const one = async (s, p = []) => Object.values((await db.query(s, p)).rows[0])[0]
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth; CREATE SCHEMA private;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
      SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    GRANT USAGE ON SCHEMA auth,private TO authenticated;
    CREATE TYPE public.user_role AS ENUM('super_admin','cooperative_admin','member');
    CREATE TABLE cooperatives(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL,
      parent_id uuid REFERENCES cooperatives(id), level text, faitiere_name text, deleted_at timestamptz);
    CREATE TABLE profiles(id uuid PRIMARY KEY, cooperative_id uuid, role user_role, deleted_at timestamptz);
    CREATE TABLE integrations(id uuid DEFAULT gen_random_uuid(), cooperative_id uuid, type text, status text, config jsonb);
    CREATE TABLE kobo_submissions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), cooperative_id uuid, raw_payload jsonb);
    CREATE TABLE members(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), cooperative_id uuid, first_name text);
    INSERT INTO cooperatives(id,name,level) VALUES ('${id(1)}','FAITIERE A','faitiere'),('${id(2)}','FAITIERE B','faitiere');
    INSERT INTO cooperatives(id,name,parent_id,level) VALUES ('${id(3)}','Espoir de Kpèlèwouaï','${id(1)}','cooperative');
    INSERT INTO profiles VALUES ('${id(101)}','${id(1)}','cooperative_admin',NULL),
      ('${id(102)}','${id(2)}','cooperative_admin',NULL),('${id(103)}','${id(1)}','member',NULL);
  `)
  // This is the actual hierarchy function used by the production guards.
  const authSource = readFileSync(
    'supabase/migrations/20260530_120000_auth_core_and_scale.sql',
    'utf8',
  )
  const hierarchy = authSource.match(
    /CREATE OR REPLACE FUNCTION public\.get_accessible_cooperative_ids\(\)[\s\S]*?\$\$;/,
  )?.[0]
  assert.ok(hierarchy)
  await db.exec(hierarchy)
  // Same profiles-based guard and RLS predicate as the live Kobo tables, verified 24/10/2026.
  await db.exec(`
    CREATE FUNCTION public.is_coop_admin_or_super(target_coop uuid)
    RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
      SELECT EXISTS(SELECT 1 FROM profiles p WHERE p.id=auth.uid() AND
        (p.role='super_admin' OR (p.role='cooperative_admin'
          AND target_coop=ANY(public.get_accessible_cooperative_ids())))) $$;
    ALTER TABLE kobo_submissions ENABLE ROW LEVEL SECURITY;
    ALTER TABLE integrations ENABLE ROW LEVEL SECURITY;
    ALTER TABLE members ENABLE ROW LEVEL SECURITY;
    CREATE POLICY kobo_scope ON kobo_submissions FOR ALL TO authenticated
      USING(is_coop_admin_or_super(cooperative_id)) WITH CHECK(is_coop_admin_or_super(cooperative_id));
    CREATE POLICY integration_scope ON integrations FOR ALL TO authenticated
      USING(is_coop_admin_or_super(cooperative_id)) WITH CHECK(is_coop_admin_or_super(cooperative_id));
    CREATE POLICY member_scope ON members FOR ALL TO authenticated
      USING(is_coop_admin_or_super(cooperative_id)) WITH CHECK(is_coop_admin_or_super(cooperative_id));
    GRANT SELECT,INSERT,UPDATE ON kobo_submissions,integrations,members TO authenticated;
    INSERT INTO kobo_submissions(id,cooperative_id,raw_payload) VALUES
      ('${id(201)}','${id(1)}','{"private":"A"}'),('${id(202)}','${id(2)}','{"private":"B"}');
    INSERT INTO members(cooperative_id,first_name) VALUES ('${id(3)}','A'),('${id(2)}','B');
    INSERT INTO integrations(cooperative_id,type,status,config) VALUES
      ('${id(1)}','kobo','connected','{"form_id":"assetA"}'),
      ('${id(2)}','kobo','connected','{"form_id":"assetB"}');
  `)
  await db.exec(
    readFileSync('supabase/migrations/20261024150737_kobo_cooperative_resolution.sql', 'utf8'),
  )
  const login = async (n) =>
    db.exec(
      `RESET ROLE; SET ROLE authenticated; SELECT set_config('request.jwt.claim.sub','${id(n)}',false)`,
    )
  await t.test('A ne lit que A, y compris si l’UUID de la collecte B est connu', async () => {
    await login(101)
    assert.equal(await one('SELECT count(*) FROM kobo_submissions'), 1)
    assert.equal(
      (await db.query('SELECT raw_payload FROM kobo_submissions WHERE id=$1', [id(202)])).rows
        .length,
      0,
    )
    assert.equal(await one('SELECT count(*) FROM integrations'), 1)
    assert.deepEqual((await db.query('SELECT first_name FROM members')).rows, [{ first_name: 'A' }])
    await assert.rejects(
      db.query('INSERT INTO kobo_submissions(cooperative_id) VALUES($1)', [id(2)]),
      /row-level security/,
    )
    assert.equal(
      (
        await db.query('UPDATE kobo_submissions SET cooperative_id=$1 WHERE id=$2 RETURNING id', [
          id(1),
          id(202),
        ])
      ).rows.length,
      0,
    )
  })
  await t.test(
    'B est isolée de A ; un membre ordinaire ne reçoit pas les collectes administratives',
    async () => {
      await login(102)
      assert.equal(await one("SELECT raw_payload->>'private' FROM kobo_submissions"), 'B')
      await login(103)
      assert.equal(await one('SELECT count(*) FROM kobo_submissions'), 0)
      await db.exec('RESET ROLE')
    },
  )
  const resolve = (root, parent, name, match = null) =>
    one('SELECT kobo_resolve_organization($1,$2,$3,$4,$5)', [
      id(root),
      id(parent),
      name,
      'cooperative',
      match,
    ])
  await t.test('accents, casse et SCOOPS : même clé exacte et même organisation', async () => {
    const first = await resolve(1, 1, 'KPELEWAÏ')
    for (const variant of ['SCOOPS KPELEWAÏ', 'Scoops kpelewaï', 'S.C.O.O.P.S. Kpéléwaï']) {
      assert.equal((await resolve(1, 1, variant)).id, first.id)
    }
    assert.equal(await one("SELECT count(*) FROM cooperatives WHERE name='KPELEWAÏ'"), 1)
  })
  await t.test('un même nom dans une autre faîtière conserve une identité distincte', async () => {
    const a = await resolve(1, 1, 'COOP ESPOIR UNIQUE')
    const b = await resolve(2, 2, 'SCOOPS ESPOIR UNIQUE')
    assert.notEqual(a.id, b.id)
    await assert.rejects(resolve(1, 1, 'Autre graphie', b.id), /outside configured organization/)
    await assert.rejects(resolve(1, 2, 'Nouveau nom'), /outside configured organization/)
  })
  await t.test(
    'une correspondance distinctive validée retrouve la référence sans renommer sa fiche',
    async () => {
      const result = await resolve(1, 1, 'Kpelouwai', id(3))
      assert.equal(result.id, id(3))
      assert.equal(result.name, 'Espoir de Kpèlèwouaï')
    },
  )
  await t.test(
    'deux collecteurs concurrents avec des variantes ne créent qu’une fiche',
    async () => {
      const results = await Promise.all([
        resolve(1, 1, 'COOP ZOGBEDJI'),
        resolve(1, 1, 'Scoops zogbedji'),
      ])
      assert.equal(results[0].id, results[1].id)
    },
  )
  await t.test('un formulaire connecté à A ne peut être connecté simultanément à B', async () => {
    await assert.rejects(
      db.query(
        "INSERT INTO integrations(cooperative_id,type,status,config) VALUES($1,'kobo','connected',$2)",
        [id(2), JSON.stringify({ form_id: 'assetA' })],
      ),
      /duplicate key/,
    )
  })
  await t.test(
    'la résolution privilégiée est fermée aux comptes navigateur et anonymes',
    async () => {
      await login(101)
      await assert.rejects(resolve(1, 1, 'Nouveau nom'), /permission denied/)
      await db.exec('RESET ROLE; SET ROLE anon')
      await assert.rejects(resolve(1, 1, 'Nouveau nom'), /permission denied/)
      await db.exec('RESET ROLE')
    },
  )
})
