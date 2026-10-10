import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { PGlite } from '@electric-sql/pglite'

const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const db = new PGlite()
const sql = (s) => db.exec(s)
const rows = async (s, args = []) => (await db.query(s, args)).rows
const role = async (name, n = 0) => {
  await sql(
    `RESET ROLE; SET ROLE ${name}; SELECT set_config('request.jwt.claim.sub','${n ? id(n) : ''}',false)`,
  )
}
const board = async () => (await rows('SELECT haroolife_board() AS b'))[0].b
let request = 1000
const command = async (action, payload, key = ++request) =>
  (
    await rows('SELECT haroolife_command($1,$2,$3) AS id', [
      action,
      id(key),
      JSON.stringify(payload),
    ])
  )[0].id
const create = (kind, extra = {}) => ({
  kind,
  title: 'Récolte du village',
  activity: 'recolte',
  starts_on: '2099-10-20',
  ends_on: '2099-10-22',
  ...extra,
})

test('HarooLife pilot: ownership, lifecycle and atomic commands', async (t) => {
  t.after(() => db.close())
  await sql(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,email_confirmed_at timestamptz);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    GRANT USAGE ON SCHEMA auth TO authenticated;
    CREATE TABLE cooperatives(id uuid PRIMARY KEY,name text);
    CREATE TABLE cantons(id uuid PRIMARY KEY,name text);
    CREATE TABLE profiles(id uuid PRIMARY KEY,role text,haroo_type text,cooperative_id uuid,deleted_at timestamptz);
    CREATE TABLE members(id uuid PRIMARY KEY,cooperative_id uuid,email text);
    CREATE TABLE parcelles(id uuid PRIMARY KEY,member_id uuid,cooperative_id uuid,culture_principale text,superficie_ha numeric);
    CREATE TABLE haroo_ouvrier_profiles(id uuid PRIMARY KEY,user_id uuid,disponible boolean);
    CREATE TABLE haroo_ouvrier_cantons(ouvrier_id uuid,canton_id uuid);
    CREATE FUNCTION get_accessible_cooperative_ids() RETURNS uuid[] LANGUAGE sql STABLE AS $$ SELECT array_agg(cooperative_id) FROM public.profiles WHERE id=auth.uid() $$;
    INSERT INTO cooperatives VALUES('${id(1)}','Coop A'),('${id(2)}','Coop B');
    INSERT INTO cantons VALUES('${id(3)}','Canton A'),('${id(4)}','Canton B');
    INSERT INTO profiles VALUES
      ('${id(11)}','member',NULL,'${id(1)}',NULL),('${id(12)}','member',NULL,'${id(1)}',NULL),
      ('${id(13)}','member',NULL,'${id(2)}',NULL),('${id(14)}','cooperative_admin',NULL,'${id(1)}',NULL);
    INSERT INTO auth.users VALUES('${id(11)}','a@test.invalid',now()),('${id(12)}','b@test.invalid',now()),('${id(13)}','c@test.invalid',now());
    INSERT INTO members VALUES('${id(21)}','${id(1)}','a@test.invalid'),('${id(22)}','${id(1)}','b@test.invalid'),('${id(23)}','${id(2)}','c@test.invalid');
    INSERT INTO parcelles VALUES('${id(31)}','${id(21)}','${id(1)}','Maïs',6),('${id(32)}','${id(22)}','${id(1)}','Maïs',7),('${id(33)}','${id(23)}','${id(2)}','Riz',50);
  `)
  for (let i = 40; i <= 50; i++)
    await sql(`INSERT INTO profiles VALUES('${id(i)}','none','ouvrier',NULL,NULL);
    INSERT INTO haroo_ouvrier_profiles VALUES('${id(i + 100)}','${id(i)}',true);
    INSERT INTO haroo_ouvrier_cantons VALUES('${id(i + 100)}','${id(i === 50 ? 4 : 3)}');`)
  // Execute the actual existing ownership helpers, not a permissive stub.
  const helpers = readFileSync(
    new URL('../supabase/migrations/20260920082108_launch_access_hardening.sql', import.meta.url),
    'utf8',
  ).split('-- Membership alone')[0]
  await sql(helpers)
  await sql(
    readFileSync(
      new URL('../supabase/migrations/20261010_160000_haroolife_pilot.sql', import.meta.url),
      'utf8',
    ),
  )
  await t.test('disabled by default; anonymous and direct writes denied', async () => {
    await role('authenticated', 11)
    await assert.rejects(board, /Pilote indisponible/)
    await assert.rejects(() => sql('UPDATE haroolife_pilot SET enabled=true'))
    await role('anon')
    await assert.rejects(board, /permission denied/)
    await assert.rejects(() => command('create', create('team')), /permission denied/)
    await role('postgres')
    await sql(
      `UPDATE haroolife_pilot SET enabled=true,cooperative_id='${id(1)}',canton_id='${id(3)}'`,
    )
  })
  await t.test('board scopes parcels; other organisation and canton are rejected', async () => {
    await role('authenticated', 11)
    assert.deepEqual(
      (await board()).parcels.map((p) => p.id),
      [id(31)],
    )
    for (const user of [13, 50]) {
      await role('authenticated', user)
      await assert.rejects(board, /réservé/)
    }
    await role('authenticated', 14)
    assert.equal((await board()).access.can_work, false)
    await assert.rejects(
      () => command('create', create('work', { parcel_id: id(31), amount: 5 })),
      /parcelle personnelle/,
    )
  })
  let work
  await t.test(
    'contributes actual selected area, preserves identity privacy and deduplicates retries',
    async () => {
      await role('authenticated', 11)
      const payload = create('work', { parcel_id: id(31), amount: 4 })
      work = await command('create', payload, 2000)
      assert.equal(await command('create', payload, 2000), work)
      await assert.rejects(() => command('create', { ...payload, amount: 5 }, 2000), /déjà utilisé/)
      const g = (await board()).groups.find((g) => g.id === work)
      assert.equal(Number(g.total), 4)
      assert.equal(g.people, 1)
      assert.equal(g.state, 'open')
      assert.equal(g.owner_id, undefined)
      assert.equal(g.parcel_id, undefined)
      await assert.rejects(() => sql('SELECT * FROM haroolife_participations'), /permission denied/)
      await assert.rejects(
        () => sql(`UPDATE haroolife_groups SET target=1 WHERE id='${work}'`),
        /permission denied/,
      )
    },
  )
  await t.test(
    'cannot contribute another parcel, exceed area or double-book a parcel',
    async () => {
      await role('authenticated', 12)
      await assert.rejects(
        () => command('join', { group_id: work, parcel_id: id(31), amount: 1 }),
        /inaccessible/,
      )
      await assert.rejects(
        () => command('join', { group_id: work, parcel_id: id(32), amount: 8 }),
        /Surface/,
      )
      await role('authenticated', 11)
      await assert.rejects(
        () => command('create', create('work', { parcel_id: id(31), amount: 1 })),
        /participe déjà/,
      )
      assert.equal((await board()).groups.length, 1) // Failed creation rolled back, no orphan.
    },
  )
  await t.test('threshold reached and withdrawal reopens the group', async () => {
    await role('authenticated', 12)
    await command('join', { group_id: work, parcel_id: id(32), amount: 6 })
    assert.equal((await board()).groups[0].state, 'ready')
    await assert.rejects(() => command('cancel', { group_id: work }), /créateur/)
    await command('leave', { group_id: work })
    const g = (await board()).groups[0]
    assert.equal(g.state, 'open')
    assert.equal(Number(g.total), 4)
    assert.equal(g.joined, false)
  })
  let team
  await t.test(
    'team fills exactly to eight; rejects duplicate and overlapping participation',
    async () => {
      await role('authenticated', 40)
      team = await command('create', create('team'))
      await assert.rejects(() => command('join', { group_id: team }), /participez déjà/)
      await assert.rejects(() => command('create', create('team')), /déjà une équipe/)
      for (let i = 41; i <= 47; i++) {
        await role('authenticated', i)
        await command('join', { group_id: team })
      }
      await role('authenticated', 48)
      await assert.rejects(() => command('join', { group_id: team }), /déjà complet/)
      const g = (await board()).groups.find((g) => g.id === team)
      assert.equal(Number(g.total), 8)
      assert.equal(g.state, 'ready')
    },
  )
  await t.test(
    'expired groups cannot accept, and cancellation preserves an audit trail',
    async () => {
      await role('postgres')
      await sql(
        `UPDATE haroolife_groups SET expires_at=now()-interval '1 second' WHERE id='${work}'`,
      )
      await role('authenticated', 12)
      assert.equal((await board()).groups.find((g) => g.id === work).state, 'expired')
      await assert.rejects(
        () => command('join', { group_id: work, parcel_id: id(32), amount: 1 }),
        /fermé/,
      )
      await role('authenticated', 40)
      await assert.rejects(() => command('leave', { group_id: team }), /créateur/)
      await command('cancel', { group_id: team })
      assert.equal((await board()).groups.find((g) => g.id === team).state, 'cancelled')
      await role('postgres')
      assert.equal(
        Number(
          (
            await rows(
              `SELECT count(*) AS n FROM haroolife_participations WHERE group_id='${team}'`,
            )
          )[0].n,
        ),
        8,
      )
      assert.equal(
        Number(
          (
            await rows(
              `SELECT count(*) AS n FROM haroolife_events WHERE group_id='${team}' AND action='cancel'`,
            )
          )[0].n,
        ),
        1,
      )
    },
  )
  await t.test(
    'deleted profile, changed availability, and disabled pilot fail closed',
    async () => {
      await role('postgres')
      await sql(
        `UPDATE profiles SET deleted_at=now() WHERE id='${id(40)}'; UPDATE haroo_ouvrier_profiles SET disponible=false WHERE user_id='${id(41)}'`,
      )
      await role('authenticated', 40)
      await assert.rejects(board, /Profil requis/)
      await role('authenticated', 41)
      await assert.rejects(board, /réservé/)
      await role('postgres')
      await sql('UPDATE haroolife_pilot SET enabled=false')
      await role('authenticated', 11)
      await assert.rejects(board, /indisponible/)
    },
  )
})
