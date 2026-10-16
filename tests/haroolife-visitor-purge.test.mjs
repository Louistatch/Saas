// HarooLife : le ménage des visiteurs inactifs, exécuté sur la vraie migration dans PGlite.
// Supprimé : le visiteur parti depuis plus de 30 jours. Gardés : un visiteur récent ou qui joue
// encore, un visiteur mêlé à de l'argent du jeu, un vrai compte FaîtiereHub, et le reste en place.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { PGlite } from '@electric-sql/pglite'

const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`

test('ménage : seuls les visiteurs inactifs depuis 30 jours partent', async (t) => {
  const db = new PGlite()
  t.after(() => db.close())
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE SCHEMA auth;
    CREATE TABLE auth.users(id uuid PRIMARY KEY, is_anonymous boolean NOT NULL DEFAULT false,
      created_at timestamptz, updated_at timestamptz, last_sign_in_at timestamptz);
    CREATE TABLE auth.sessions(id serial PRIMARY KEY, user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
      created_at timestamptz, updated_at timestamptz, refreshed_at timestamp);
    CREATE TABLE public.profiles(id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE);
    CREATE TABLE public.haroolife_saves(user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
      updated_at timestamptz);
    CREATE TABLE public.haroolife_money_transfers(id serial PRIMARY KEY,
      sender_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
      recipient_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE);
    -- Une table qui retient un compte (clé étrangère sans cascade).
    CREATE TABLE public.haroolife_groups(id serial PRIMARY KEY, owner_id uuid REFERENCES public.profiles(id));
  `)
  const old = "now() - interval '60 days'"
  const add = (n, anon, created, signed = created) =>
    db.exec(`INSERT INTO auth.users VALUES ('${id(n)}', ${anon}, ${created}, ${created}, ${signed});
             INSERT INTO public.profiles VALUES ('${id(n)}');`)
  await add(1, true, old) // visiteur parti : supprimé
  await add(2, true, 'now()') // visiteur du jour : gardé
  await add(3, true, old) // visiteur ancien mais session rafraîchie hier : gardé
  await db.exec(`INSERT INTO auth.sessions(user_id, created_at, updated_at, refreshed_at)
                 VALUES ('${id(3)}', ${old}, now() - interval '1 day', now() - interval '1 day')`)
  await add(4, true, old) // visiteur ancien, partie sauvegardée la semaine dernière : gardé
  await db.exec(`INSERT INTO public.haroolife_saves VALUES ('${id(4)}', now() - interval '7 days')`)
  await add(5, true, old) // visiteur ancien qui a envoyé de l'argent : gardé
  await add(6, false, old) // vrai compte inactif : jamais touché
  await db.exec(
    `INSERT INTO public.haroolife_money_transfers(sender_id, recipient_id) VALUES ('${id(5)}', '${id(6)}')`,
  )
  await add(7, true, old) // visiteur retenu par une autre table : laissé, sans tout bloquer
  await db.exec(`INSERT INTO public.haroolife_groups(owner_id) VALUES ('${id(7)}')`)
  await add(8, true, old) // second visiteur parti : supprimé
  await db.exec(`INSERT INTO auth.sessions(user_id, created_at, updated_at, refreshed_at)
                 VALUES ('${id(8)}', ${old}, ${old}, (${old})::timestamp)`)

  await db.exec(
    readFileSync('supabase/migrations/20261017_120000_haroolife_visitor_purge.sql', 'utf8'),
  )
  // Réservée au service : un joueur ne peut pas l'appeler.
  await db.exec('SET ROLE authenticated')
  await assert.rejects(
    () => db.query('SELECT public.haroolife_purge_visitors()'),
    /permission denied/,
  )
  await db.exec('RESET ROLE')

  const r = (await db.query('SELECT public.haroolife_purge_visitors() AS r')).rows[0].r
  assert.equal(r.purged, 2)
  assert.equal(r.kept, 1)
  const left = (await db.query('SELECT id FROM auth.users ORDER BY id')).rows.map((x) => x.id)
  assert.deepEqual(left, [id(2), id(3), id(4), id(5), id(6), id(7)])
  // Le profil et la session du visiteur parti s'en vont avec lui.
  assert.equal(
    (
      await db.query(
        `SELECT count(*)::int n FROM public.profiles WHERE id IN ('${id(1)}','${id(8)}')`,
      )
    ).rows[0].n,
    0,
  )
  assert.equal(
    (await db.query(`SELECT count(*)::int n FROM auth.sessions WHERE user_id = '${id(8)}'`)).rows[0]
      .n,
    0,
  )
  // Rejouée : rien de plus.
  assert.equal(
    (await db.query('SELECT public.haroolife_purge_visitors() AS r')).rows[0].r.purged,
    0,
  )
})
