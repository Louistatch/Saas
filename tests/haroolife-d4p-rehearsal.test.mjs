// Répétition des migrations D4+ (M1 chat, M2 panneaux) sur un schéma CALQUÉ sur la production
// (lu le 13/10/2026 en lecture seule : profiles.role de type énuméré user_role, haroo_type
// haroo_profile_type, colonnes NOT NULL et clés étrangères identiques). Aucune base distante.
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

test('M1 + M2 sur le schéma de production : application, droits, parcours', async (t) => {
  t.after(() => db.close())
  await sql(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth; CREATE SCHEMA private;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    GRANT USAGE ON SCHEMA auth TO authenticated, anon;
    CREATE TYPE public.user_role AS ENUM ('super_admin','cooperative_admin','member','guest','ouvrier','acheteur','agronome','none');
    CREATE TYPE public.haroo_profile_type AS ENUM ('ouvrier','acheteur','agronome');
    CREATE TABLE public.cantons(id uuid PRIMARY KEY, prefecture_id uuid NOT NULL, commune_id uuid, name text NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
    CREATE TABLE public.profiles(id uuid PRIMARY KEY, email text NOT NULL, first_name text, last_name text,
      role public.user_role NOT NULL DEFAULT 'none', cooperative_id uuid, created_at timestamptz, updated_at timestamptz,
      deleted_at timestamptz, haroo_type public.haroo_profile_type, haroo_activated_at timestamptz,
      org_activated_at timestamptz, is_demo boolean NOT NULL DEFAULT false);
    CREATE TABLE public.haroolife_residents(user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
      canton_id uuid NOT NULL REFERENCES public.cantons(id), display_name text NOT NULL, pagne smallint NOT NULL DEFAULT 1,
      visible boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
    INSERT INTO public.cantons(id, prefecture_id, name) VALUES ('${id(21)}','${id(11)}','Bè'),('${id(22)}','${id(12)}','Lama-Kara');
    INSERT INTO public.profiles(id, email, role, cooperative_id, haroo_type) VALUES
      ('${id(1)}','a@x','member','${id(31)}',NULL), ('${id(2)}','b@x','none',NULL,'ouvrier'),
      ('${id(3)}','c@x','cooperative_admin','${id(32)}',NULL), ('${id(4)}','d@x','super_admin',NULL,NULL);
    INSERT INTO public.haroolife_residents(user_id, canton_id, display_name, pagne) VALUES
      ('${id(1)}','${id(21)}','Ama',3), ('${id(2)}','${id(22)}','Kofi',5);
  `)
  for (const f of [
    '20261013_120000_haroolife_realtime_chat.sql',
    '20261013_130000_haroolife_ads.sql',
  ])
    await sql(readFileSync(`supabase/migrations/${f}`, 'utf8'))

  // Chat : rôles de type énuméré, salons, envoi idempotent, isolation.
  await as(1)
  const ama = await one('SELECT haroolife_chat_me()')
  assert.deepEqual(ama.rooms, [
    'world:togo',
    'locality:lome',
    'locality:kara',
    `canton:${id(21)}`,
    `coop:${id(31)}`,
  ])
  const m = await one('SELECT haroolife_chat_send($1,$2,$3)', ['locality:lome', 'Bonjour', id(100)])
  assert.equal(
    (await one('SELECT haroolife_chat_send($1,$2,$3)', ['locality:lome', 'Bonjour', id(100)])).id,
    m.id,
  )
  await assert.rejects(
    () => one('SELECT haroolife_chat_send($1,$2,$3)', [`canton:${id(22)}`, 'x', id(101)]),
    /non autorisé/,
  )
  // Un ouvrier sans organisation (role none) qui a une maison écrit dans sa ville et son canton.
  await as(2)
  const kofi = await one('SELECT haroolife_chat_me()')
  assert.deepEqual(kofi.rooms, ['world:togo', 'locality:lome', 'locality:kara', `canton:${id(22)}`])
  assert.equal((await one('SELECT haroolife_chat_history($1)', ['locality:lome'])).length, 1)
  // Admin de coopérative sans maison : lit sa coopérative, n'écrit pas en ville.
  await as(3)
  const coop = await one('SELECT haroolife_chat_me()')
  assert.ok(coop.rooms.includes(`coop:${id(32)}`))
  assert.equal(coop.can_write, false)
  await assert.rejects(
    () => one('SELECT haroolife_chat_send($1,$2,$3)', ['locality:lome', 'x', id(102)]),
    /non autorisé/,
  )
  assert.ok(
    (await one('SELECT haroolife_chat_send($1,$2,$3)', [`coop:${id(32)}`, 'Réunion', id(103)])).id,
  )

  // Panneaux : console réservée au super_admin (énuméré), diffusion publique des seules campagnes valides.
  await as(1)
  await assert.rejects(() => one('SELECT haroolife_ad_admin_list()'), /Réservé/)
  await as(4)
  const c = await one('SELECT haroolife_ad_admin_save($1)', [
    {
      advertiser: 'Démonstration (fictif)',
      locality: 'lome',
      placements: ['lome-avenue'],
      rightsConfirmed: true,
      contractRef: 'DEMO-1',
      startsAt: new Date(Date.now() - 3600e3).toISOString(),
      endsAt: new Date(Date.now() + 3600e3).toISOString(),
      creative: {
        title: 'Démo',
        body: 'Créatif fictif',
        cta: 'Voir',
        href: '/marche',
        palette: ['#000', '#fff', '#f00'],
      },
    },
  ])
  for (const s of ['pending', 'approved', 'active'])
    await one('SELECT haroolife_ad_admin_move($1,$2)', [c.id, s])
  await as(null, 'anon')
  assert.equal((await one('SELECT haroolife_ads_live($1)', ['lome'])).length, 1)
  assert.equal(
    await one('SELECT haroolife_ad_record($1)', [
      JSON.stringify([
        { campaign: 'internal-marche', placement: 'lome-avenue', impressions: 2, clicks: 1 },
      ]),
    ]),
    1,
  )
  await assert.rejects(() => one('SELECT haroolife_ad_admin_list()'), /permission denied|Réservé/)

  // Retours arrière : les deux s'appliquent proprement, dans l'ordre inverse.
  await sql('RESET ROLE')
  await sql(readFileSync('supabase/rollbacks/20261013_130000_haroolife_ads.rollback.sql', 'utf8'))
  await sql(
    readFileSync('supabase/rollbacks/20261013_120000_haroolife_realtime_chat.rollback.sql', 'utf8'),
  )
  assert.equal(
    await one(
      `SELECT count(*)::int FROM pg_class WHERE relname LIKE 'haroolife_chat_%' OR relname LIKE 'haroolife_ad_%'`,
    ),
    0,
  )
  assert.equal(
    await one('SELECT count(*)::int FROM public.haroolife_residents'),
    2,
    'existing data untouched',
  )
})
