// Comptes d'exploitation : les vraies migrations dans PGlite. Avant le correctif, changer l'e-mail de
// son profil suffisait à lire les achats d'un autre ; après, seul l'e-mail du jeton compte. Et une
// fiche qui a des ventes ne peut plus être supprimée (la trace des paiements reste).
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { PGlite } from '@electric-sql/pglite'

const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const VICTIM = 1
const ATTACKER = 2

test('achats privés et ventes conservées : la faille avant, le correctif après', async (t) => {
  const db = new PGlite()
  t.after(() => db.close())
  const as = (n, email) =>
    db.exec(`RESET ROLE; SET ROLE authenticated;
      SELECT set_config('request.jwt.claim.sub','${id(n)}',false),
             set_config('request.jwt.claims','${JSON.stringify({ sub: id(n), email })}',false)`)
  const visible = async () => (await db.query('SELECT id FROM public.purchases')).rows.length
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
    GRANT USAGE ON SCHEMA auth TO authenticated;
    CREATE TABLE public.profiles(id uuid PRIMARY KEY, email text, role text DEFAULT 'member');
    ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
    CREATE POLICY profiles_self_read ON public.profiles FOR SELECT TO authenticated USING (id = (SELECT auth.uid()));
    CREATE POLICY profiles_self_update ON public.profiles FOR UPDATE TO authenticated USING (id = (SELECT auth.uid()));
    GRANT SELECT, UPDATE ON public.profiles TO authenticated;
    CREATE TABLE public.fiches_techniques(id uuid PRIMARY KEY, cooperative_id uuid NOT NULL, title text, status text);
    CREATE TABLE public.purchases(
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      fiche_id uuid NOT NULL REFERENCES public.fiches_techniques(id) ON DELETE CASCADE,
      buyer_email text, buyer_phone text, amount int, payment_status text);
    ALTER TABLE public.purchases ENABLE ROW LEVEL SECURITY;
    GRANT SELECT ON public.purchases TO authenticated;
    INSERT INTO public.profiles VALUES ('${id(VICTIM)}','victime@exemple.tg'), ('${id(ATTACKER)}','pirate@exemple.tg');
  `)
  await db.exec(readFileSync('supabase/migrations/20261003_100000_fiches_platform_sales.sql', 'utf8'))
  await db.exec(`
    INSERT INTO public.fiches_techniques VALUES ('${id(10)}', NULL, 'Maïs', 'published'), ('${id(11)}', NULL, 'Soja', 'published');
    INSERT INTO public.purchases(fiche_id, buyer_email, buyer_phone, amount, payment_status)
      VALUES ('${id(10)}', 'Victime@Exemple.tg', '+228 90 00 00 01', 1000, 'completed');
  `)

  // Avant : le pirate met l'e-mail de la victime dans SON profil et lit son achat.
  await as(ATTACKER, 'pirate@exemple.tg')
  assert.equal(await visible(), 0)
  await db.exec(`UPDATE public.profiles SET email = 'Victime@Exemple.tg' WHERE id = '${id(ATTACKER)}'`)
  assert.equal(await visible(), 1, 'la faille existe avant le correctif')

  await db.exec('RESET ROLE')
  const fix = readFileSync('supabase/migrations/20261018_100000_fiches_sales_integrity.sql', 'utf8')
  await db.exec(fix)
  await db.exec(fix) // idempotente

  // Après : le profil modifié ne donne plus rien ; l'acheteur, lui, voit son achat (casse ignorée).
  await as(ATTACKER, 'pirate@exemple.tg')
  assert.equal(await visible(), 0)
  await as(VICTIM, 'victime@exemple.tg')
  assert.equal(await visible(), 1)

  // Une fiche vendue ne se supprime plus ; une fiche sans achat, si.
  await db.exec('RESET ROLE')
  await assert.rejects(
    db.exec(`DELETE FROM public.fiches_techniques WHERE id = '${id(10)}'`),
    /foreign key|violates/,
  )
  assert.equal(
    (await db.query(`SELECT count(*)::int AS n FROM public.purchases`)).rows[0].n,
    1,
    'la vente est toujours là',
  )
  await db.exec(`DELETE FROM public.fiches_techniques WHERE id = '${id(11)}'`)
  const fk = await db.query(
    `SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint
     WHERE conrelid = 'public.purchases'::regclass AND contype = 'f'`,
  )
  assert.deepEqual(
    fk.rows.map((r) => r.def).filter((d) => d.includes('fiches_techniques')),
    ['FOREIGN KEY (fiche_id) REFERENCES fiches_techniques(id) ON DELETE RESTRICT'],
  )
})
