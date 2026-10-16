// Le visiteur HarooLife n'est pas un compte FaîtiereHub : exécute la vraie migration dans PGlite.
// Un compte connecté lit l'Académie et ajoute un prix ; un visiteur (jeton is_anonymous) ne lit
// rien de réservé aux comptes et n'écrit rien, mais lit encore ce qui est public (prix du marché).
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { PGlite } from '@electric-sql/pglite'

test('visiteur : rien de FaîtiereHub au-delà du public ; un compte n’est pas gêné', async (t) => {
  const db = new PGlite()
  t.after(() => db.close())
  const as = (visitor) =>
    db.exec(`RESET ROLE; SET ROLE authenticated;
      SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000001","is_anonymous":${visitor}}',false)`)
  const count = async (table) =>
    (await db.query(`SELECT count(*)::int AS n FROM ${table}`)).rows[0].n
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claims', true), '')::jsonb $$;
    GRANT USAGE ON SCHEMA auth TO authenticated;
    CREATE TABLE public.academy_lessons(id int PRIMARY KEY, title text);
    ALTER TABLE public.academy_lessons ENABLE ROW LEVEL SECURITY;
    CREATE POLICY "lessons readable" ON public.academy_lessons FOR SELECT TO authenticated USING (true);
    CREATE TABLE public.market_prices(id serial PRIMARY KEY, price int);
    ALTER TABLE public.market_prices ENABLE ROW LEVEL SECURITY;
    CREATE POLICY "read all" ON public.market_prices FOR SELECT TO public USING (true);
    CREATE POLICY "add" ON public.market_prices FOR INSERT TO authenticated WITH CHECK (true);
    GRANT SELECT ON public.academy_lessons TO authenticated;
    GRANT SELECT, INSERT ON public.market_prices TO authenticated;
    GRANT USAGE ON SEQUENCE public.market_prices_id_seq TO authenticated;
    INSERT INTO public.academy_lessons VALUES (1, 'Compostage');
    INSERT INTO public.market_prices(price) VALUES (350);
  `)
  const migration = 'supabase/migrations/20261016_150000_visitors_outside_faitierehub.sql'
  await db.exec(readFileSync(migration, 'utf8'))
  // Rejouable sans doublon (DROP POLICY IF EXISTS).
  await db.exec(readFileSync(migration, 'utf8'))

  await as(false)
  assert.equal(await count('academy_lessons'), 1)
  await db.exec('INSERT INTO market_prices(price) VALUES (400)')

  await as(true)
  assert.equal(await count('academy_lessons'), 0)
  assert.equal(await count('market_prices'), 2)
  await assert.rejects(
    () => db.exec('INSERT INTO market_prices(price) VALUES (1)'),
    /row-level security/,
  )

  // Retour arrière : le visiteur relit comme tout compte connecté.
  await db.exec('RESET ROLE')
  await db.exec(
    readFileSync(
      'supabase/rollbacks/20261016_150000_visitors_outside_faitierehub.rollback.sql',
      'utf8',
    ),
  )
  await as(true)
  assert.equal(await count('academy_lessons'), 1)
})
