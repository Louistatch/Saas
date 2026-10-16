// HarooLife : inviter un ami, sur la vraie migration dans PGlite. Le nouveau joueur reçoit son
// bonus en acceptant, l'inviteur le sien une seule fois ; pas d'auto-invitation, une invitation par
// compte, comptes récents seulement, au plus 5 bonus d'inviteur par semaine.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { PGlite } from '@electric-sql/pglite'

const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`

test('invitations : bonus pour les deux, une fois, sans triche', async (t) => {
  const db = new PGlite()
  t.after(() => db.close())
  const as = (n) =>
    db.exec(`RESET ROLE; SET ROLE authenticated;
      SELECT set_config('request.jwt.claim.sub','${id(n)}',false)`)
  const one = async (s, args) => Object.values((await db.query(s, args)).rows[0])[0]
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    GRANT USAGE ON SCHEMA auth TO authenticated;
    CREATE TABLE auth.users(id uuid PRIMARY KEY, created_at timestamptz DEFAULT now());
    CREATE TABLE public.profiles(id uuid PRIMARY KEY);
    CREATE TABLE public.haroolife_residents(user_id uuid PRIMARY KEY REFERENCES public.profiles(id), display_name text);
  `)
  for (let n = 1; n <= 9; n++)
    await db.exec(`INSERT INTO auth.users VALUES ('${id(n)}', now() - interval '${n === 1 || n === 8 ? 60 : 0} days');
                   INSERT INTO public.profiles VALUES ('${id(n)}');`)
  for (const n of [1, 2, 3, 4, 5, 6, 7, 8])
    await db.exec(`INSERT INTO public.haroolife_residents VALUES ('${id(n)}', 'Joueur ${n}')`)
  await db.exec(readFileSync('supabase/migrations/20261017_130000_haroolife_invites.sql', 'utf8'))

  // Ama (1), joueuse ancienne, a un code stable.
  await as(1)
  const mine = await one('SELECT haroolife_invite_code()')
  assert.match(mine.code, /^[A-HJ-NP-Z2-9]{6}$/)
  assert.equal((await one('SELECT haroolife_invite_code()')).code, mine.code)
  // Elle ne s'invite pas elle-même ; l'invitation est pour les nouveaux joueurs.
  const self = await one('SELECT haroolife_invite_accept($1)', [mine.code])
  assert.equal(self.ok, false)

  // Kofi (2), nouveau, accepte : son bonus tout de suite, une seule fois.
  await as(2)
  assert.equal((await one('SELECT haroolife_invite_accept($1)', ['nope00'])).final, true)
  const ok = await one('SELECT haroolife_invite_accept($1)', [mine.code.toLowerCase()])
  assert.deepEqual(ok, { ok: true, bonus: 2000, inviter: 'Joueur 1' })
  assert.equal((await one('SELECT haroolife_invite_accept($1)', [mine.code])).ok, false)

  // Un nouveau sans maison attend (final: false) ; un ancien compte est refusé.
  await as(9)
  assert.deepEqual(await one('SELECT haroolife_invite_accept($1)', [mine.code]), {
    ok: false,
    final: false,
    reason: 'Choisis d’abord ta maison.',
  })
  await as(8)
  assert.equal((await one('SELECT haroolife_invite_accept($1)', [mine.code])).final, true)

  // Ama reçoit le bonus de Kofi, une seule fois.
  await as(1)
  assert.equal((await one('SELECT haroolife_invite_code()')).pending, 2000)
  assert.deepEqual(await one('SELECT haroolife_invite_claim()'), {
    total: 2000,
    friends: ['Joueur 2'],
  })
  assert.deepEqual(await one('SELECT haroolife_invite_claim()'), { total: 0, friends: [] })

  // Au plus 5 bonus d'inviteur par semaine : le 6e ami a le sien, pas Ama.
  for (const n of [3, 4, 5, 6, 7]) {
    await as(n)
    assert.equal((await one('SELECT haroolife_invite_accept($1)', [mine.code])).ok, true)
  }
  await as(1)
  const week = await one('SELECT haroolife_invite_claim()')
  assert.equal(week.total, 4 * 2000)
  assert.equal((await one('SELECT haroolife_invite_code()')).friends, 6)

  // Les tables restent fermées aux joueurs.
  await assert.rejects(
    () => db.query('SELECT * FROM public.haroolife_referrals'),
    /permission denied/,
  )
})
