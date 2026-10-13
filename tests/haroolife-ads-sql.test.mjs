// HarooLife D4+ (M2) : campagnes des panneaux, circuit de validation, versions, statistiques.
// Exécute la vraie migration dans PGlite.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { PGlite } from '@electric-sql/pglite'

const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const db = new PGlite()
const sql = (s) => db.exec(s)
const one = async (s, args = []) => Object.values((await db.query(s, args)).rows[0] ?? {})[0]
const as = (n, role = 'authenticated') =>
  sql(
    `RESET ROLE; SET ROLE ${role}; SELECT set_config('request.jwt.claim.sub','${n ? id(n) : ''}',false)`,
  )
const creative = (over = {}) => ({
  title: 'Semences certifiées',
  body: 'Créatif de démonstration interne, aucun annonceur réel.',
  cta: 'En savoir plus',
  href: '/marche',
  palette: ['#123', '#fff', '#fc0'],
  ...over,
})

test('panneaux : circuit de validation, versions, diffusion, statistiques plafonnées', async (t) => {
  t.after(() => db.close())
  await sql(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth; CREATE SCHEMA private;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    GRANT USAGE ON SCHEMA auth, private TO authenticated, anon;
    CREATE TABLE profiles(id uuid PRIMARY KEY, role text, deleted_at timestamptz);
    INSERT INTO profiles VALUES ('${id(1)}','super_admin',NULL),('${id(2)}','member',NULL),('${id(3)}','cooperative_admin',NULL);
  `)
  await sql(readFileSync('supabase/migrations/20261013_130000_haroolife_ads.sql', 'utf8'))

  // Personne d'autre que l'équipe ne voit ni ne touche la console.
  for (const n of [2, 3]) {
    await as(n)
    await assert.rejects(() => one('SELECT haroolife_ad_admin_list()'), /Réservé/)
    await assert.rejects(
      () => one('SELECT haroolife_ad_admin_save($1)', [{ advertiser: 'x', creative: creative() }]),
      /Réservé/,
    )
  }
  await as(2)
  await assert.rejects(() => one('SELECT * FROM haroolife_ad_campaigns'), /permission denied/)

  // L'équipe crée un brouillon ; liens et textes contrôlés.
  await as(1)
  const base = {
    advertiser: 'Partenaire de démonstration',
    locality: 'lome',
    placements: ['lome-avenue'],
    startsAt: new Date(Date.now() - 3600e3).toISOString(),
    endsAt: new Date(Date.now() + 86400e3).toISOString(),
  }
  for (const bad of [
    creative({ href: 'javascript:alert(1)' }),
    creative({ href: 'https://evil.example' }),
    creative({ title: '' }),
    creative({ body: 'x'.repeat(141) }),
  ])
    await assert.rejects(
      () => one('SELECT haroolife_ad_admin_save($1)', [{ ...base, creative: bad }]),
      /Créatif invalide/,
    )
  const draft = await one('SELECT haroolife_ad_admin_save($1)', [{ ...base, creative: creative() }])
  assert.equal(draft.status, 'draft')
  assert.equal(draft.version, 1)

  // Pas de diffusion sans revue, droits et contrat.
  const live = async () => {
    await as(null, 'anon')
    const r = await one('SELECT haroolife_ads_live($1)', ['lome'])
    await as(1)
    return r
  }
  assert.equal((await live()).length, 0)
  await assert.rejects(
    () => one('SELECT haroolife_ad_admin_move($1,$2)', [draft.id, 'active']),
    /non autorisé/,
  )
  await one('SELECT haroolife_ad_admin_move($1,$2)', [draft.id, 'pending'])
  await assert.rejects(
    () => one('SELECT haroolife_ad_admin_move($1,$2)', [draft.id, 'approved']),
    /droits/,
  )
  await one('SELECT haroolife_ad_admin_move($1,$2)', [draft.id, 'draft'])
  await one('SELECT haroolife_ad_admin_save($1)', [
    { id: draft.id, ...base, creative: creative({ title: 'Semences v2' }), rightsConfirmed: true },
  ])
  await one('SELECT haroolife_ad_admin_move($1,$2)', [draft.id, 'pending'])
  await assert.rejects(
    () => one('SELECT haroolife_ad_admin_move($1,$2)', [draft.id, 'approved']),
    /contrat/,
  )
  await one('SELECT haroolife_ad_admin_move($1,$2)', [draft.id, 'draft'])
  await one('SELECT haroolife_ad_admin_save($1)', [
    {
      id: draft.id,
      ...base,
      creative: creative({ title: 'Semences v2' }),
      contractRef: 'DEMO-0001',
    },
  ])
  await one('SELECT haroolife_ad_admin_move($1,$2)', [draft.id, 'pending'])
  await one('SELECT haroolife_ad_admin_move($1,$2)', [draft.id, 'approved'])
  const active = await one('SELECT haroolife_ad_admin_move($1,$2)', [draft.id, 'active'])
  assert.equal(active.status, 'active')
  assert.equal((await live())[0].creative.title, 'Semences v2')
  assert.equal((await one('SELECT haroolife_ads_live($1)', ['kara'])).length, 0, 'locality scope')

  // Une campagne en cours ne se modifie pas ; pause, retour arrière (repasse en brouillon), versions.
  await assert.rejects(
    () =>
      one('SELECT haroolife_ad_admin_save($1)', [{ id: draft.id, ...base, creative: creative() }]),
    /pause/,
  )
  await one('SELECT haroolife_ad_admin_move($1,$2)', [draft.id, 'paused'])
  assert.equal((await live()).length, 0, 'paused is hidden at once')
  const back = await one('SELECT haroolife_ad_admin_rollback($1,$2)', [draft.id, 1])
  assert.equal(back.creative.title, 'Semences certifiées')
  assert.equal(back.status, 'draft')
  const list = await one('SELECT haroolife_ad_admin_list()')
  assert.ok(list.campaigns[0].versions >= 8)

  // Statistiques : anonymes, plafonnées, campagnes connues seulement, supports valides.
  await as(null, 'anon')
  const n = await one('SELECT haroolife_ad_record($1)', [
    JSON.stringify([
      { campaign: 'internal-marche', placement: 'lome-avenue', impressions: 5, clicks: 1 },
      { campaign: 'internal-marche', placement: 'lome-avenue', impressions: 999, clicks: 99 },
      { campaign: 'inventée', placement: 'lome-avenue', impressions: 3 },
      { campaign: draft.id, placement: 'lome-avenue', impressions: 2 },
      { campaign: 'internal-haroo', placement: '<script>', impressions: 2 },
    ]),
  ])
  assert.equal(n, 2, 'unknown or paused campaigns and bad supports ignored')
  await assert.rejects(
    () =>
      one('SELECT haroolife_ad_record($1)', [
        JSON.stringify(
          Array(9).fill({ campaign: 'internal-marche', placement: 'lome-avenue', impressions: 1 }),
        ),
      ]),
    /Lot invalide/,
  )
  await as(1)
  const stats = (await one('SELECT haroolife_ad_admin_list()')).stats
  assert.deepEqual(stats, [
    { campaign: 'internal-marche', placement: 'lome-avenue', impressions: 35, clicks: 4 },
  ])
})
