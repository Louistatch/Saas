import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { PGlite } from '@electric-sql/pglite'

test('Kobo : vraie migration, hiérarchie, isolation, reprise et transaction agricole', async (t) => {
  const db = new PGlite()
  t.after(() => db.close())
  const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
  const one = async (query, args = []) => Object.values((await db.query(query, args)).rows[0])[0]
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$
      SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    CREATE TABLE cooperatives(id uuid PRIMARY KEY, parent_id uuid, deleted_at timestamptz);
    CREATE TABLE members(id uuid PRIMARY KEY, cooperative_id uuid, deleted_at timestamptz);
    CREATE TABLE member_cards(id uuid DEFAULT gen_random_uuid(), member_id uuid,
      cooperative_id uuid, card_number text, status text);
    CREATE TABLE kobo_submissions(id uuid PRIMARY KEY, cooperative_id uuid, member_id uuid,
      member_card_number text, status text DEFAULT 'pending', raw_payload jsonb,
      processed_payload jsonb, processed_at timestamptz, matched_at timestamptz,
      updated_at timestamptz, error_message text);
    CREATE TABLE parcelles(id uuid DEFAULT gen_random_uuid(), member_id uuid,
      cooperative_id uuid, name text, culture_principale text, superficie_ha numeric,
      soil_type text, irrigation_type text, source text);
    CREATE TABLE productions(id uuid DEFAULT gen_random_uuid(), member_id uuid,
      cooperative_id uuid, culture_name text, quantity_kg numeric CHECK(quantity_kg < 1000000),
      campaign_year text, source text);
    CREATE FUNCTION public.is_service_role() RETURNS boolean LANGUAGE sql AS $$
      SELECT current_setting('request.jwt.claim.role',true) = 'service_role' $$;
    CREATE FUNCTION public.is_coop_admin_or_super(p uuid) RETURNS boolean LANGUAGE sql AS $$
      SELECT auth.uid() = p $$;
    INSERT INTO cooperatives(id,parent_id) VALUES ('${id(1)}',NULL),('${id(2)}','${id(1)}'),
      ('${id(3)}','${id(2)}'),('${id(4)}',NULL);
    INSERT INTO members(id,cooperative_id) VALUES ('${id(10)}','${id(3)}'),('${id(11)}','${id(4)}');
    INSERT INTO member_cards(member_id,cooperative_id,card_number,status) VALUES
      ('${id(10)}','${id(3)}','FEN-123456','active'),('${id(11)}','${id(4)}','MAP-123456','active');
  `)
  const previous = readFileSync('supabase/migrations/20260929_120000_fix_kobo_repeat_group_mapping.sql', 'utf8')
  const numeric = previous.slice(previous.indexOf('CREATE OR REPLACE FUNCTION safe_numeric('), previous.indexOf('CREATE OR REPLACE FUNCTION process_kobo_submission('))
  await db.exec(numeric)
  await db.exec(readFileSync('supabase/migrations/20261024145232_kobo_workflow_integrity.sql', 'utf8'))
  const claims = async (root, role = 'authenticated') => db.query(
    "SELECT set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claim.role',$2,false)", [root, role],
  )
  const raw = {
    S5: [{ 'S5/culture_principale': 'maïs', 'S5/superficie_ha': '2,5' }],
    S6: [{ culture_produite: 'maïs', rendement_kg: '500', campagne_annee: '2026' }],
  }
  const seed = async (n, card = 'FEN-123456', payload = raw) => db.query(
    'INSERT INTO kobo_submissions(id,cooperative_id,member_card_number,raw_payload) VALUES ($1,$2,$3,$4)',
    [id(n), id(1), card, JSON.stringify(payload)],
  )
  const match = (n) => db.query('SELECT match_kobo_submission_to_member($1)', [id(n)])
  const process = (n) => one('SELECT process_kobo_submission($1)', [id(n)])
  await claims(id(1))

  await t.test('la carte d’une coopérative descendante est trouvée depuis la faîtière', async () => {
    await seed(100)
    await match(100)
    assert.equal(await one('SELECT member_id FROM kobo_submissions WHERE id=$1', [id(100)]), id(10))
    assert.equal((await process(100)).success, true)
    assert.equal(await one('SELECT cooperative_id FROM parcelles LIMIT 1'), id(3))
    assert.equal(Number(await one('SELECT superficie_ha FROM parcelles LIMIT 1')), 2.5)
  })
  await t.test('réexécuter la même collecte ne double ni parcelle ni production', async () => {
    assert.equal((await process(100)).already_processed, true)
    assert.equal(await one('SELECT count(*) FROM parcelles'), 1)
    assert.equal(await one('SELECT count(*) FROM productions'), 1)
  })
  await t.test('la carte d’une autre faîtière ne se rattache jamais', async () => {
    await seed(101, 'MAP-123456')
    await match(101)
    assert.equal(await one('SELECT member_id FROM kobo_submissions WHERE id=$1', [id(101)]), null)
    // Even a tampered member link is refused by the agricultural function.
    await db.query('UPDATE kobo_submissions SET member_id=$1 WHERE id=$2', [id(11), id(101)])
    assert.equal((await process(101)).success, false)
    assert.equal(await one('SELECT count(*) FROM parcelles'), 1)
  })
  await t.test('un administrateur de l’autre faîtière est refusé', async () => {
    await claims(id(4))
    await assert.rejects(match(100), /forbidden/)
    await assert.rejects(process(100), /forbidden/)
    await claims(id(1))
  })
  await t.test('un échec de production annule aussi les parcelles ; corriger puis reprendre', async () => {
    await seed(102, 'FEN-123456', { ...raw, S6: [{ culture_produite: 'maïs', rendement_kg: '1000001' }] })
    await match(102)
    await assert.rejects(process(102), /check constraint/)
    assert.equal(await one('SELECT count(*) FROM parcelles'), 1)
    assert.equal(await one('SELECT processed_at FROM kobo_submissions WHERE id=$1', [id(102)]), null)
    await db.query('UPDATE kobo_submissions SET raw_payload=$1 WHERE id=$2', [JSON.stringify(raw), id(102)])
    await process(102)
    await process(102)
    assert.equal(await one('SELECT count(*) FROM parcelles'), 2)
    assert.equal(await one('SELECT count(*) FROM productions'), 2)
  })
  await t.test('le payload normalisé est traité, la collecte originale reste conservée', async () => {
    await seed(103, 'FEN-123456', { nouveaux_groupes: 'conservés' })
    await db.query('UPDATE kobo_submissions SET processed_payload=$1 WHERE id=$2', [
      JSON.stringify({ normalized_payload: raw }), id(103),
    ])
    await match(103)
    await process(103)
    assert.equal(await one('SELECT count(*) FROM parcelles'), 3)
    assert.deepEqual(await one('SELECT raw_payload FROM kobo_submissions WHERE id=$1', [id(103)]), { nouveaux_groupes: 'conservés' })
  })
  await t.test('un repeat mal formé bloque le traitement avec une erreur visible', async () => {
    await seed(104, 'FEN-123456', { S5: 'invalide' })
    await match(104)
    await assert.rejects(process(104), /repeat arrays/)
  })
  await t.test('le rôle anonyme ne peut exécuter ces fonctions privilégiées', async () => {
    await db.exec('SET ROLE anon')
    await assert.rejects(match(100), /permission denied/)
    await assert.rejects(process(100), /permission denied/)
    await db.exec('RESET ROLE')
  })
})
