// Comptes d'exploitation : les migrations de main PUIS les nôtres, dans l'ordre des fichiers, sur
// un schéma proche de la production (profils, achats, fiches, stockage, auth.users). Chacune est
// passée deux fois (idempotence). On vérifie que les garanties de main restent vraies après les
// nôtres (achats privés, e-mail jamais lu dans profiles, vente protégée par ON DELETE RESTRICT)
// et que les nôtres s'ajoutent (e-mail confirmé, coordonnées masquées, profiles.email figé,
// compteur réservé au serveur, stockage écrit par le super_admin seul, une seule demande en
// cours). Enfin, le danger d'une réapplication de la migration de main après la nôtre.
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { test } from 'node:test'
import { PGlite } from '@electric-sql/pglite'

const MIGRATIONS = 'supabase/migrations'
/** Ordre d'application : celui des noms de fichiers (main d'abord, les nôtres ensuite). */
const ORDER = [
  '20261018_100000_fiches_sales_integrity.sql', // main
  '20261018_110000_academy_course_title.sql', // main
  '20261019_100000_purchases_one_pending.sql',
  '20261019_110000_fiches_storage_folder_scope.sql',
  '20261019_120000_revoke_increment_download_count.sql',
  '20261019_130000_purchases_own_read_verified_email.sql',
  '20261019_140000_purchases_pending_idx.sql',
]

const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const VICTIM = 1
const ATTACKER = 2
const LINKED = 3
const UNCONFIRMED = 4
const FAITIERE_ADMIN = 5
const SUPER = 6
const COOP_A = 20
const COOP_B = 21
const FICHE = 10
const FICHE_FREE = 11

test('ordre des fichiers : les migrations fiches/achats de main passent avant les nôtres', () => {
  const files = readdirSync(MIGRATIONS)
    .filter((f) => /^2026101[89]_/.test(f))
    .sort()
  assert.deepEqual(files, ORDER)
})

test('main puis nos migrations, deux fois : garanties de main conservées, les nôtres ajoutées', async (t) => {
  const db = new PGlite()
  t.after(() => db.close())
  const as = async (n, email) =>
    db.exec(`RESET ROLE; SET ROLE authenticated;
      SELECT set_config('request.jwt.claim.sub','${id(n)}',false),
             set_config('request.jwt.claims','${JSON.stringify({ sub: id(n), email })}',false)`)
  const asAnon = () =>
    db.exec(`RESET ROLE; SET ROLE anon;
      SELECT set_config('request.jwt.claim.sub','',false), set_config('request.jwt.claims','{}',false)`)
  const asService = () => db.exec('RESET ROLE; SET ROLE service_role')
  const reset = () => db.exec('RESET ROLE')
  const visible = async () =>
    (await db.query('SELECT id FROM public.purchases ORDER BY created_at')).rows.map((r) => r.id)

  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth; CREATE SCHEMA storage;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
    GRANT USAGE ON SCHEMA auth, storage TO anon, authenticated, service_role;
    CREATE TABLE auth.users(id uuid PRIMARY KEY, email text, email_confirmed_at timestamptz);

    CREATE TABLE public.cooperatives(id uuid PRIMARY KEY, name text, level text);
    CREATE TABLE public.profiles(
      id uuid PRIMARY KEY, email text UNIQUE, role text DEFAULT 'member',
      cooperative_id uuid REFERENCES public.cooperatives(id), first_name text, last_name text,
      deleted_at timestamptz);
    ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
    CREATE POLICY profiles_self_read ON public.profiles FOR SELECT TO authenticated USING (id = (SELECT auth.uid()));
    CREATE POLICY profiles_self_update ON public.profiles FOR UPDATE TO authenticated USING (id = (SELECT auth.uid()));
    GRANT SELECT, UPDATE ON public.profiles TO authenticated;

    CREATE TABLE public.fiches_techniques(
      id uuid PRIMARY KEY, cooperative_id uuid NOT NULL REFERENCES public.cooperatives(id) ON DELETE CASCADE,
      title text, status text, download_count int NOT NULL DEFAULT 0);
    CREATE TABLE public.purchases(
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      fiche_id uuid NOT NULL REFERENCES public.fiches_techniques(id) ON DELETE CASCADE,
      buyer_email text, buyer_phone text, amount int, currency text DEFAULT 'XOF',
      payment_status text NOT NULL DEFAULT 'pending', access_granted boolean NOT NULL DEFAULT false,
      created_at timestamptz NOT NULL DEFAULT now());
    ALTER TABLE public.purchases ENABLE ROW LEVEL SECURITY;
    GRANT SELECT ON public.purchases TO anon, authenticated;
    GRANT ALL ON public.purchases, public.fiches_techniques TO service_role;

    -- Compteur tel qu'en production : SECURITY DEFINER, exécutable par le navigateur.
    CREATE FUNCTION public.increment_download_count(target_fiche_id uuid) RETURNS void
      LANGUAGE sql SECURITY DEFINER AS $$
      UPDATE public.fiches_techniques SET download_count = download_count + 1 WHERE id = target_fiche_id $$;
    GRANT EXECUTE ON FUNCTION public.increment_download_count(uuid) TO anon, authenticated;

    -- Stockage : politiques d'avant (can_upload_fiches, sans regarder le dossier).
    CREATE TABLE storage.objects(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), bucket_id text, name text);
    ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
    GRANT SELECT, INSERT, UPDATE, DELETE ON storage.objects TO authenticated;
    CREATE FUNCTION storage.foldername(name text) RETURNS text[] LANGUAGE sql IMMUTABLE AS $$
      SELECT (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
    CREATE FUNCTION public.can_upload_fiches() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$
      SELECT EXISTS (SELECT 1 FROM public.profiles p LEFT JOIN public.cooperatives c ON c.id = p.cooperative_id
        WHERE p.id = (SELECT auth.uid()) AND (p.role = 'super_admin' OR (p.role = 'cooperative_admin' AND c.level = 'faitiere'))) $$;
    CREATE POLICY "fiches files writable by publishers" ON storage.objects FOR INSERT TO authenticated
      WITH CHECK (bucket_id = 'fiches-techniques' AND public.can_upload_fiches());
    CREATE POLICY "fiches files readable for test" ON storage.objects FOR SELECT TO authenticated USING (true);

    CREATE TABLE public.academy_modules(id uuid PRIMARY KEY, title text);
    INSERT INTO public.academy_modules VALUES ('2482e523-500e-4178-8102-1018af290c82', 'Opérateur certifié FaîtiereHub — Pilote V1');

    INSERT INTO public.cooperatives VALUES ('${id(COOP_A)}', 'Faîtière A', 'faitiere'), ('${id(COOP_B)}', 'Faîtière B', 'faitiere');
    INSERT INTO public.profiles(id, email, role, cooperative_id) VALUES
      ('${id(VICTIM)}', 'victime@exemple.tg', 'member', NULL),
      ('${id(ATTACKER)}', 'pirate@exemple.tg', 'member', NULL),
      ('${id(LINKED)}', 'lie@exemple.tg', 'member', NULL),
      ('${id(UNCONFIRMED)}', 'pasconfirme@exemple.tg', 'member', NULL),
      ('${id(FAITIERE_ADMIN)}', 'admin.a@exemple.tg', 'cooperative_admin', '${id(COOP_A)}'),
      ('${id(SUPER)}', 'super@exemple.tg', 'super_admin', NULL);
    INSERT INTO auth.users VALUES
      ('${id(VICTIM)}', 'victime@exemple.tg', now()),
      ('${id(ATTACKER)}', 'pirate@exemple.tg', now()),
      ('${id(LINKED)}', 'lie@exemple.tg', now()),
      ('${id(UNCONFIRMED)}', 'pasconfirme@exemple.tg', NULL),
      ('${id(FAITIERE_ADMIN)}', 'admin.a@exemple.tg', now()),
      ('${id(SUPER)}', 'super@exemple.tg', now());
  `)
  // Migration de base des ventes (déjà en production), puis les données.
  await db.exec(readFileSync(`${MIGRATIONS}/20261003_100000_fiches_platform_sales.sql`, 'utf8'))
  await db.exec(`
    INSERT INTO public.fiches_techniques(id, cooperative_id, title, status) VALUES
      ('${id(FICHE)}', NULL, 'Maïs', 'published'), ('${id(FICHE_FREE)}', NULL, 'Soja', 'published');
    INSERT INTO public.purchases(id, fiche_id, buyer_email, buyer_phone, buyer_name, amount, payment_status, created_at) VALUES
      ('${id(100)}', '${id(FICHE)}', 'Victime@Exemple.tg', '+22890000001', 'Afi', 1000, 'completed', now() - interval '3 hours'),
      ('${id(101)}', '${id(FICHE)}', 'pasconfirme@exemple.tg', '+22890000004', 'Kodjo', 1000, 'completed', now() - interval '2 hours'),
      ('${id(102)}', '${id(FICHE)}', NULL, '+22890000005', 'Sans e-mail', 1000, 'completed', now() - interval '1 hour');
    INSERT INTO public.purchases(id, fiche_id, user_id, buyer_email, amount, payment_status) VALUES
      ('${id(103)}', '${id(FICHE)}', '${id(LINKED)}', NULL, 1000, 'pending');
  `)

  for (const pass of [1, 2])
    for (const file of ORDER) {
      await reset()
      await db.exec(readFileSync(`${MIGRATIONS}/${file}`, 'utf8')).catch((e) => {
        throw new Error(`${file} (passage ${pass}) : ${e.message}`)
      })
    }

  // --- Garanties de main (20261018_100000) toujours vraies ---------------------------------
  // Le pirate ne peut plus écrire l'e-mail d'un autre dans son profil (nôtre) ; même s'il y
  // parvenait, ou s'il présentait un jeton à l'e-mail de la victime, il ne lit rien.
  await as(ATTACKER, 'pirate@exemple.tg')
  assert.deepEqual(await visible(), [])
  await assert.rejects(
    db.exec(`UPDATE public.profiles SET email = 'Victime@Exemple.tg' WHERE id = '${id(ATTACKER)}'`),
    /permission denied/,
  )
  await as(ATTACKER, 'victime@exemple.tg')
  assert.deepEqual(
    await visible(),
    [],
    'un e-mail du jeton qui n’est pas celui du compte ne suffit pas',
  )
  await reset()
  await db.exec(
    `UPDATE public.profiles SET email = 'Victime@Exemple.tg' WHERE id = '${id(ATTACKER)}'`,
  )
  await as(ATTACKER, 'pirate@exemple.tg')
  assert.deepEqual(await visible(), [], 'profiles.email n’est jamais lu')
  await reset()
  await db.exec(
    `UPDATE public.profiles SET email = 'pirate@exemple.tg' WHERE id = '${id(ATTACKER)}'`,
  )

  // L'acheteur voit son achat (casse ignorée) ; le compte rattaché voit le sien ; un achat
  // sans e-mail n'est vu de personne par l'e-mail.
  await as(VICTIM, 'victime@exemple.tg')
  assert.deepEqual(await visible(), [id(100)])
  await as(LINKED, 'lie@exemple.tg')
  assert.deepEqual(await visible(), [id(103)])

  // Une fiche vendue ne se supprime plus ; une fiche sans achat, si ; une seule clé étrangère.
  await reset()
  await assert.rejects(
    db.exec(`DELETE FROM public.fiches_techniques WHERE id = '${id(FICHE)}'`),
    /foreign key|violates/,
  )
  await db.exec(`DELETE FROM public.fiches_techniques WHERE id = '${id(FICHE_FREE)}'`)
  const fk = await db.query(
    `SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint
     WHERE conrelid = 'public.purchases'::regclass AND contype = 'f'`,
  )
  assert.deepEqual(
    fk.rows.map((r) => r.def).filter((d) => d.includes('fiches_techniques')),
    ['FOREIGN KEY (fiche_id) REFERENCES fiches_techniques(id) ON DELETE RESTRICT'],
  )

  // --- Nos ajouts ---------------------------------------------------------------------------
  // E-mail non confirmé : l'achat fait avec cette adresse reste invisible.
  await as(UNCONFIRMED, 'pasconfirme@exemple.tg')
  assert.deepEqual(await visible(), [])

  // Coordonnées de l'acheteur : jamais lisibles par un client connecté ; anon ne lit rien.
  await as(VICTIM, 'victime@exemple.tg')
  await assert.rejects(db.query('SELECT buyer_phone FROM public.purchases'), /permission denied/)
  await assert.rejects(db.query('SELECT buyer_name FROM public.purchases'), /permission denied/)
  await assert.rejects(db.query('SELECT * FROM public.purchases'), /permission denied/)
  const mine = await db.query(
    `SELECT id, fiche_id, amount, payment_status, access_granted, paid_at, created_at
     FROM public.purchases WHERE lower(buyer_email) = 'victime@exemple.tg'`,
  )
  assert.equal(mine.rows.length, 1, 'les colonnes lues par /api/purchases/mine restent lisibles')
  await asAnon()
  await assert.rejects(db.query('SELECT id FROM public.purchases'), /permission denied/)

  // Le profil reste modifiable pour le reste (nom, prénom).
  await as(VICTIM, 'victime@exemple.tg')
  await db.exec(`UPDATE public.profiles SET first_name = 'Afi' WHERE id = '${id(VICTIM)}'`)

  // Compteur : plus appelable par le navigateur, toujours par le serveur.
  await asAnon()
  await assert.rejects(
    db.query('SELECT public.increment_download_count($1)', [id(FICHE)]),
    /permission denied/,
  )
  await as(VICTIM, 'victime@exemple.tg')
  await assert.rejects(
    db.query('SELECT public.increment_download_count($1)', [id(FICHE)]),
    /permission denied/,
  )
  await asService()
  await db.query('SELECT public.increment_download_count($1)', [id(FICHE)])
  await reset()
  assert.equal(
    (
      await db.query('SELECT download_count FROM public.fiches_techniques WHERE id = $1', [
        id(FICHE),
      ])
    ).rows[0].download_count,
    1,
  )

  // Stockage : écriture au super_admin seul (main 40c06ee : l'opérateur publie, y compris pour
  // une faîtière, dans le dossier de celle-ci). L'admin de faîtière n'écrit plus nulle part,
  // pas même dans son propre dossier ; un membre non plus.
  const put = (name) =>
    db.query(`INSERT INTO storage.objects(bucket_id, name) VALUES ('fiches-techniques', $1)`, [
      name,
    ])
  await as(FAITIERE_ADMIN, 'admin.a@exemple.tg')
  await assert.rejects(put(`${id(COOP_A)}/f1/compte.xlsx`), /row-level security/)
  await assert.rejects(put('plateforme/f1/compte.xlsx'), /row-level security/)
  await assert.rejects(put(`${id(COOP_B)}/f1/compte.xlsx`), /row-level security/)
  await as(VICTIM, 'victime@exemple.tg')
  await assert.rejects(put(`${id(COOP_A)}/f2/compte.xlsx`), /row-level security/)
  await as(SUPER, 'super@exemple.tg')
  await put('plateforme/f1/compte.xlsx')
  await put(`${id(COOP_A)}/${id(FICHE)}/compte.xlsx`)
  await reset()
  assert.equal(
    (await db.query('SELECT count(*)::int AS n FROM storage.objects')).rows[0].n,
    2,
    'seuls les deux dépôts du super_admin sont passés',
  )

  // Une seule demande en cours de création par fiche et par numéro.
  await reset()
  const ask = () =>
    db.query(
      `INSERT INTO public.purchases(fiche_id, buyer_phone, amount) VALUES ($1, '+22890000009', 1000) RETURNING id`,
      [id(FICHE)],
    )
  await ask()
  await assert.rejects(ask, (e) => e.code === '23505')

  // Index partiels des achats en attente présents ; titre AgriAcademy (main) appliqué.
  const idx = await db.query(
    `SELECT indexname FROM pg_indexes WHERE tablename = 'purchases' AND indexname LIKE 'purchases_%pending%' ORDER BY 1`,
  )
  assert.deepEqual(
    idx.rows.map((r) => r.indexname),
    [
      'purchases_one_pending_request_uidx',
      'purchases_pending_created_idx',
      'purchases_pending_fiche_phone_idx',
    ],
  )
  assert.equal(
    (await db.query('SELECT title FROM public.academy_modules')).rows[0].title,
    'Opérateur certifié FaîtiereHub',
  )

  // Politique finale : une seule, qui ne lit ni profiles ni le jeton.
  const pol = await db.query(
    `SELECT qual FROM pg_policies WHERE tablename = 'purchases' AND policyname = 'purchases_own_read'`,
  )
  assert.equal(pol.rows.length, 1)
  assert.ok(!/profiles/.test(pol.rows[0].qual), pol.rows[0].qual)
  assert.match(pol.rows[0].qual, /verified_email/)

  // Danger documenté (en-tête de 20261019_130000 et coordination.md) : réappliquer la migration
  // de main APRÈS la nôtre remet sans erreur l'e-mail du jeton (non confirmé). Le contrôle
  // post-application le voit, et réappliquer 20261019_130000 (idempotente) rétablit la règle.
  const policyQual = async () =>
    (
      await db.query(
        `SELECT qual FROM pg_policies WHERE tablename = 'purchases' AND policyname = 'purchases_own_read'`,
      )
    ).rows[0].qual
  const postApplyCheck = async () =>
    (
      await db.query(
        `SELECT 1 FROM pg_policies WHERE tablename = 'purchases' AND policyname = 'purchases_own_read'
         AND qual LIKE '%verified_email%'`,
      )
    ).rows.length
  await reset()
  await db.exec(readFileSync(`${MIGRATIONS}/20261018_100000_fiches_sales_integrity.sql`, 'utf8'))
  assert.doesNotMatch(await policyQual(), /verified_email/)
  assert.equal(await postApplyCheck(), 0, 'le contrôle post-application signale la régression')
  await as(UNCONFIRMED, 'pasconfirme@exemple.tg')
  assert.deepEqual(await visible(), [id(101)], 'régression réelle : e-mail non confirmé relu')
  await reset()
  await db.exec(
    readFileSync(`${MIGRATIONS}/20261019_130000_purchases_own_read_verified_email.sql`, 'utf8'),
  )
  assert.equal(await postApplyCheck(), 1)
  await as(UNCONFIRMED, 'pasconfirme@exemple.tg')
  assert.deepEqual(await visible(), [])
})
