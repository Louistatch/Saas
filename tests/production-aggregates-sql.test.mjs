import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { PGlite } from '@electric-sql/pglite'

test('agrégats complets, prix identiques à la vue et isolation sous RLS', async (t) => {
  const db = new PGlite()
  t.after(() => db.close())
  const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
  const one = async (sql, params = []) => Object.values((await db.query(sql, params)).rows[0])[0]
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create table regions(id uuid primary key, name text);
    create table prefectures(id uuid primary key, name text, region_id uuid);
    create table cantons(id uuid primary key, name text, prefecture_id uuid);
    create table cultures(id uuid primary key, name text);
    create table cooperatives(id uuid primary key, parent_id uuid, deleted_at timestamptz);
    create table members(id uuid primary key default gen_random_uuid(), cooperative_id uuid,
      first_name text, last_name text, prefecture text, deleted_at timestamptz);
    create table parcelles(id uuid primary key default gen_random_uuid(), member_id uuid,
      cooperative_id uuid, surface_ha numeric, culture_name text);
    create table market_prices(id uuid primary key default gen_random_uuid(), culture_id uuid,
      region_id uuid, prefecture_id uuid, canton_id uuid, market_name text,
      observed_at timestamptz, created_at timestamptz default now(), price numeric,
      price_type text, source text, data_kind text);
    insert into cooperatives values ('${id(1)}',null,null),('${id(2)}',null,null),
      ('${id(3)}','${id(1)}',null),('${id(4)}','${id(3)}',null);
    insert into members(cooperative_id,first_name,last_name,prefecture)
      select '${id(4)}','A','Membre '||i,'Kozah' from generate_series(1,1203) i;
    insert into members(cooperative_id,first_name,last_name,prefecture)
      select '${id(2)}','B','Autre '||i,'Golfe' from generate_series(1,1101) i;
    insert into members(cooperative_id,first_name,last_name,prefecture,deleted_at)
      values('${id(4)}','Supprimé','Archive','Kozah',now());
    insert into parcelles(member_id,cooperative_id,surface_ha,culture_name)
      select id,cooperative_id,1.5,'Maïs' from members;
    alter table members enable row level security;
    alter table parcelles enable row level security;
    alter table cooperatives enable row level security;
    create policy members_scope on members for select to authenticated using
      (cooperative_id=any(string_to_array(current_setting('test.coops',true),',')::uuid[]));
    create policy parcelles_scope on parcelles for select to authenticated using
      (cooperative_id=any(string_to_array(current_setting('test.coops',true),',')::uuid[]));
    create policy coop_scope on cooperatives for select to authenticated using
      (id=any(string_to_array(current_setting('test.coops',true),',')::uuid[]));
    grant select on members,parcelles,cooperatives to authenticated;
    grant select on regions,prefectures,cantons,cultures,market_prices to anon,authenticated;
    insert into cultures values ('${id(90)}','Maïs');
  `)
  for (let n = 1; n <= 5; n++) {
    await db.query('insert into regions values($1,$2)', [id(100 + n), `Région ${n}`])
    await db.query('insert into prefectures values($1,$2,$3)', [
      id(200 + n),
      `Préfecture ${n}`,
      id(100 + n),
    ])
    await db.query('insert into cantons values($1,$2,$3)', [
      id(300 + n),
      `Canton ${n}`,
      id(200 + n),
    ])
    // Matched markets over several weeks, plus duplicate observations.
    for (const [market, day, price] of [
      ['A', 40, 100],
      ['A', 25, 120],
      ['A', 2, 150],
      ['B', 40, 200],
      ['B', 2, 300],
      ['A', 2, 150],
    ]) {
      await db.query(
        `insert into market_prices(culture_id,region_id,prefecture_id,canton_id,
        market_name,observed_at,price,source) values($1,$2,$3,$4,$5,current_date-$6::int,$7,'fixture')`,
        [id(90), id(100 + n), id(200 + n), id(300 + n), market + n, day, price],
      )
    }
  }
  await db.exec(
    readFileSync('supabase/migrations/20261003_120000_market_trend_matched_markets.sql', 'utf8'),
  )
  await db.exec(
    readFileSync('supabase/migrations/20261024194412_production_read_aggregates.sql', 'utf8'),
  )
  await db.exec(
    readFileSync('supabase/migrations/20261024194828_market_price_query_plan.sql', 'utf8'),
  )
  await db.exec(
    readFileSync('supabase/migrations/20261024195114_market_price_custom_plans.sql', 'utf8'),
  )
  await db.exec(
    readFileSync('supabase/migrations/20261024195643_market_price_materialized_steps.sql', 'utf8'),
  )
  await db.exec('grant select on market_price_scoped to anon,authenticated')
  await t.test(
    'le calcul paramétré préserve tous les champs scientifiques à chaque maille',
    async () => {
      await db.exec('set role anon')
      for (const scope of ['region', 'prefecture', 'canton']) {
        const reference = (
          await db.query(
            `select to_jsonb(v) as row from market_price_scoped v
        where scope=$1 order by age_days,culture_id,scope_id`,
            [scope],
          )
        ).rows.map((r) => r.row)
        const prices = await one('select get_market_prices($1)', [scope])
        assert.equal(prices.length, 5)
        assert.deepEqual(prices, reference)
        assert.equal(prices[0].price, 225)
        assert.equal(prices[0].n_obs, 2)
        assert.equal(prices[0].trend_known, true)
        assert.equal(prices[0].n_markets, 2)
      }
      const filtered = await one('select get_market_prices($1,$2,$3,$4)', [
        'canton',
        id(301),
        id(101),
        id(90),
      ])
      assert.equal(filtered.length, 1)
      assert.equal(filtered[0].scope_id, id(301))
      assert.deepEqual(
        await one('select get_market_prices($1,$2,$3)', ['canton', id(301), id(102)]),
        [],
      )
      assert.equal((await db.query('select * from get_market_location_counts()')).rows.length, 5)
      assert.deepEqual(
        (await db.query('select * from get_market_location_counts($1,$2)', ['prefecture', id(101)]))
          .rows,
        [{ scope_id: id(201), price_count: 1 }],
      )
    },
  )
  await t.test('1203 lignes agrégées et aucune fuite entre faîtières', async () => {
    await db.exec(
      `reset role; set role authenticated; select set_config('test.coops','${[1, 3, 4].map(id).join(',')}',false)`,
    )
    assert.deepEqual(
      (await db.query('select * from get_member_cooperative_counts($1)', [id(1)])).rows,
      [{ child_id: id(3), member_count: 1203 }],
    )
    assert.deepEqual(await one('select get_cooperative_branch($1)', [id(1)]), [1, 3, 4].map(id))
    assert.deepEqual(await one('select get_cooperative_branch($1)', [id(2)]), [])
    const stats = await one('select get_map_statistics()')
    assert.equal(stats.total, 1203)
    assert.equal(stats.byPrefecture.length, 1)
    assert.equal(stats.byPrefecture[0].prefecture, 'Kozah')
    assert.equal((await one("select get_map_statistics('surface_ha')")).max, 1804.5)
    assert.equal((await one("select get_map_statistics('members',$1)", [id(2)])).total, 0)
    assert.deepEqual(
      (await db.query('select * from get_member_cooperative_counts($1)', [id(2)])).rows,
      [],
    )
    await db.exec(`select set_config('test.coops','${id(2)}',false)`)
    assert.equal((await one('select get_map_statistics()')).total, 1101)
    assert.equal((await one('select get_map_statistics()')).byPrefecture[0].prefecture, 'Golfe')
  })
  await t.test('les RPC privés refusent les anonymes et restent SECURITY INVOKER', async () => {
    await db.exec('reset role; set role anon')
    await assert.rejects(db.query('select get_map_statistics()'), /permission denied/)
    await assert.rejects(
      db.query('select * from get_member_cooperative_counts($1)', [id(1)]),
      /permission denied/,
    )
    await db.exec('reset role')
    const unsafe = await one(`select count(*) from pg_proc where proname in
      ('get_map_statistics','get_member_cooperative_counts','get_market_prices','get_market_location_counts') and prosecdef`)
    assert.equal(unsafe, 0)
  })
})
