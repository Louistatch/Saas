import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { PGlite } from '@electric-sql/pglite'

const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const hash = 'a'.repeat(64)
const db = new PGlite()
const run = (sql, args = []) => db.query(sql, args)
const value = async (sql, args = []) => Object.values((await run(sql, args)).rows[0])[0]
const as = async (n, role = 'authenticated') =>
  db.exec(
    `reset role;set role ${role};select set_config('request.jwt.claim.sub','${n ? id(n) : ''}',false)`,
  )
const denied = async (fn) =>
  assert.rejects(
    fn,
    /denied|forbidden|not available|unavailable|invalid|unverified|violates|not published|transition|capacity/i,
  )
let product
test('CE/IT additive SQL, RLS, scientific workflow, card access and missions', async (t) => {
  t.after(() => db.close())
  await db.exec(`
 create role anon;create role authenticated;create role service_role bypassrls;
 create schema auth;create schema private;create schema storage;
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 grant usage on schema auth,private to anon,authenticated,service_role;
 create table profiles(id uuid primary key,role text);
 create table regions(id uuid primary key);create table prefectures(id uuid primary key,region_id uuid);
 create table cantons(id uuid primary key,prefecture_id uuid);
 create table cooperatives(id uuid primary key,parent_id uuid,level text,name text,deleted_at timestamptz);
 create table partners(id uuid primary key,status text,display_name text);
 create table partner_memberships(partner_id uuid,user_id uuid,status text);
 create table members(id uuid primary key,cooperative_id uuid,status text,deleted_at timestamptz);
 create table member_cards(id uuid primary key,card_number text,member_id uuid,cooperative_id uuid,card_type text,status text,expiry_date date,deleted_at timestamptz,revoked_at timestamptz,suspended_at timestamptz);
 create table haroo_agronome_profiles(id uuid primary key,user_id uuid,card_number text,badge_valide boolean,statut_validation text,first_name text,last_name text,canton_id uuid);
 create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 create table storage.objects(id uuid primary key,bucket_id text,name text);
 alter table storage.objects enable row level security;
 grant usage on schema storage to anon,authenticated,service_role;
 grant select,insert on storage.objects to anon,authenticated;
 grant all on storage.objects to service_role;
 create policy fixture_legacy_broad_policy on storage.objects for all to anon,authenticated using(true) with check(true);
 insert into storage.objects values('${id(200)}','ceit-documents','private.pdf'),('${id(201)}','other-bucket','public.pdf');
 grant select on profiles,haroo_agronome_profiles to authenticated;
 insert into profiles values('${id(1)}','super_admin'),('${id(2)}','none'),('${id(3)}','none'),('${id(4)}','none'),('${id(5)}','none');
 insert into regions values('${id(60)}');insert into prefectures values('${id(61)}','${id(60)}');insert into cantons values('${id(62)}','${id(61)}');
 insert into cooperatives values('${id(10)}',null,'faitiere','FENOMAT',null),('${id(11)}','${id(10)}','union','Union',null),('${id(12)}','${id(11)}','cooperative','Membres',null),('${id(13)}',null,'faitiere','Autre',null),('${id(14)}','${id(13)}','cooperative','Ailleurs',null);
 insert into partners values('${id(21)}','active','Operateur A'),('${id(22)}','active','Operateur B');
 insert into partner_memberships values('${id(21)}','${id(2)}','active'),('${id(22)}','${id(5)}','active');
 insert into members values('${id(41)}','${id(12)}','active',null),('${id(42)}','${id(14)}','active',null),('${id(43)}','${id(12)}','active',null);
 insert into member_cards(id,card_number,member_id,cooperative_id,card_type,status) values
 ('${id(31)}','COO-ONE','${id(41)}','${id(12)}','FAITIERE','active'),('${id(32)}','COO-TWO','${id(42)}','${id(14)}','FAITIERE','active'),
 ('${id(33)}','COO-THREE','${id(43)}','${id(12)}','FAITIERE','active'),('${id(34)}','AGR-ONE',null,null,'AGRONOME','active'),('${id(35)}','AGR-TWO',null,null,'AGRONOME','active');
 insert into haroo_agronome_profiles values('${id(51)}','${id(3)}','AGR-ONE',true,'VALIDE','Afi','Koffi','${id(62)}'),('${id(52)}','${id(4)}','AGR-TWO',true,'VALIDE','Ama','Yao','${id(62)}');
 `)
  for (const f of ['20261021_160000_ceit_documents', '20261021_161000_ceit_access_missions'])
    await db.exec(readFileSync(`supabase/migrations/${f}.sql`, 'utf8'))
  await t.test('private storage and financial policy start closed', async () => {
    assert.equal(
      await value('select public from storage.buckets where id=$1', ['ceit-documents']),
      false,
    )
    assert.deepEqual(
      (await run('select commission_bps,payouts_enabled from ceit_financial_policy')).rows,
      [{ commission_bps: null, payouts_enabled: false }],
    )
  })
  await t.test(
    'CE/IT storage remains private even under a permissive legacy policy, without affecting other buckets',
    async () => {
      for (const role of ['anon', 'authenticated']) {
        await as(2, role)
        const rows = (await run('select bucket_id from storage.objects')).rows
        assert.deepEqual(rows, [{ bucket_id: 'other-bucket' }])
        await denied(() =>
          run('insert into storage.objects values($1,$2,$3)', [
            id(202),
            'ceit-documents',
            'injected.pdf',
          ]),
        )
      }
      await as(0, 'service_role')
      assert.equal(await value('select count(*)::int from storage.objects'), 2)
      await db.exec('reset role;')
    },
  )
  await t.test('certification alone is not a CE/IT capability; only admin authorizes', async () => {
    await as(2)
    await denied(() =>
      value(
        "select ceit_create_product('operator',null,$1,'Mais local','mais',array['fertilisation'])",
        [id(21)],
      ),
    )
    await denied(() =>
      value("select ceit_authorize('operator',$1,now()+interval '1 year')", [id(21)]),
    )
    await as(1)
    await value("select ceit_authorize('operator',$1,now()+interval '1 year')", [id(21)])
    await value("select ceit_authorize('mandate',$1,now()+interval '1 year',$2)", [id(21), id(10)])
    for (const n of [3, 4]) {
      await value("select ceit_authorize('reviewer',$1,now()+interval '1 year')", [id(n)])
      await value("select ceit_qualify_agronome($1,array['mais'],array['fertilisation'])", [
        id(n + 48),
      ])
    }
    await as(2)
    product = await value(
      "select ceit_create_product('faitiere',$1,null,'Mais de la faitiere','mais',array['fertilisation'],$2,$3,$4)",
      [id(10), id(60), id(61), id(62)],
    )
    assert.ok(product)
    await denied(() =>
      value(
        "select ceit_create_product('faitiere',$1,null,'Autre faitiere','mais',array['fertilisation'])",
        [id(13)],
      ),
    )
    await denied(() =>
      value(
        "select ceit_create_product('platform',null,null,'Administration','mais',array['fertilisation'])",
      ),
    )
  })
  await t.test(
    'cross-operator RLS and direct SQL mutations cannot escalate privileges',
    async () => {
      await as(5)
      assert.equal(await value('select count(*)::int from ceit_products'), 0)
      await denied(() =>
        run('update ceit_products set created_by=$1 where id=$2', [id(5), product]),
      )
      await as(0, 'anon')
      await denied(() => run('select * from ceit_versions'))
      await denied(() =>
        value('select ceit_add_version($1,$2,$3,$4,$5,$5)', [
          id(2),
          product,
          id(80),
          { sources: [{ rights: 'open' }] },
          hash,
        ]),
      )
    },
  )
  await t.test(
    'version ownership, scientific independence and editorial publication are enforced',
    async () => {
      await as(2)
      await value('select ceit_add_contributor($1,$2)', [product, id(51)])
      await as(0, 'service_role')
      await denied(() =>
        value('select ceit_add_version($1,$2,$3,$4,$5,$5)', [
          id(5),
          product,
          id(80),
          { sources: [{ rights: 'open' }] },
          hash,
        ]),
      )
      await value('select ceit_add_version($1,$2,$3,$4,$5,$5)', [
        id(3),
        product,
        id(80),
        { sources: [{ rights: 'open' }] },
        hash,
      ])
      await as(2)
      await value("select ceit_transition($1,'submit')", [id(80)])
      await denied(() => value("select ceit_transition($1,'publish')", [id(80)]))
      await as(3)
      await denied(() =>
        value("select ceit_transition($1,'approve','Revue independante suffisamment detaillee')", [
          id(80),
        ]),
      )
      await as(4)
      await value(
        "select ceit_transition($1,'approve','References et hypotheses verifiees pour cette culture')",
        [id(80)],
      )
      await as(2)
      await value("select ceit_transition($1,'publish')", [id(80)])
      await denied(() =>
        run("update ceit_versions set ce_key='foreign/file.pdf' where id=$1", [id(80)]),
      )
      await as(0, 'service_role')
      await value('select ceit_add_version($1,$2,$3,$4,$5,$5)', [
        id(2),
        product,
        id(81),
        { sources: [{ rights: 'open' }] },
        hash,
      ])
      await as(2)
      await denied(() => value("select ceit_transition($1,'publish')", [id(81)]))
      await as(0, 'anon')
      const cat = (await run('select * from ceit_catalogue()')).rows
      assert.equal(cat.length, 1)
      assert.equal(cat[0].price, 1500)
      assert.equal(cat[0].version_id, id(80))
      assert.equal('ce_key' in cat[0], false)
      assert.equal('payload' in cat[0], false)
    },
  )
  let grant
  await t.test('only PIN-verified service flow can grant a member of the same tree', async () => {
    await as(2)
    await denied(() =>
      value('select ceit_grant_card($1,$2,$3,$4)', [product, id(31), id(41), hash]),
    )
    await as(0, 'service_role')
    await denied(() =>
      value('select ceit_grant_card($1,$2,$3,$4)', [product, id(32), id(42), hash]),
    )
    grant = await value('select ceit_grant_card($1,$2,$3,$4)', [product, id(31), id(41), hash])
    assert.equal(
      await value('select ceit_grant_card($1,$2,$3,$4)', [product, id(31), id(41), hash]),
      grant,
    )
    await denied(() => value('select ceit_check_grant($1,$2)', [grant, 'b'.repeat(64)]))
    assert.equal((await value('select ceit_check_grant($1,$2)', [grant, hash])).version_id, id(80))
    await as(0, 'anon')
    await denied(() => value('select ceit_check_grant($1,$2)', [grant, hash]))
  })
  await t.test(
    'inactive cards and members, suspension, moved membership and broken ancestry deny access',
    async () => {
      for (const statement of [
        `update member_cards set expiry_date=current_date-1 where id='${id(31)}'`,
        `update member_cards set suspended_at=now() where id='${id(31)}'`,
        `update member_cards set revoked_at=now() where id='${id(31)}'`,
        `update member_cards set status='inactive' where id='${id(31)}'`,
        `update members set status='inactive' where id='${id(41)}'`,
        `update members set cooperative_id='${id(14)}' where id='${id(41)}'`,
        `update cooperatives set parent_id='${id(12)}' where id='${id(11)}'`,
        `update cooperatives set deleted_at=now() where id='${id(11)}'`,
      ]) {
        await db.exec('reset role;begin;')
        await db.exec(statement)
        await as(0, 'service_role')
        await denied(() => value('select ceit_check_grant($1,$2)', [grant, hash]))
        await db.exec('rollback;reset role;')
      }
    },
  )
  await t.test('platform and operator products never get card gratuity', async () => {
    await as(1)
    for (const [kind, op] of [
      ['platform', null],
      ['operator', id(21)],
    ]) {
      const p = await value('select ceit_create_product($1,null,$2,$3,$4,$5)', [
        kind,
        op,
        `${kind} document`,
        'mais',
        ['fertilisation'],
      ])
      await as(0, 'service_role')
      await denied(() => value('select ceit_grant_card($1,$2,$3,$4)', [p, id(31), id(41), hash]))
      await as(1)
    }
  })
  await t.test(
    'suggestions require validated expertise, availability and grant proof; nobody is assigned automatically',
    async () => {
      await as(3)
      await value("select ceit_set_availability(true,array['mais'],array['fertilisation'])")
      await as(4)
      await value("select ceit_set_availability(false,array['mais'],array['fertilisation'])")
      await as(0, 'service_role')
      const candidates = (await run('select * from ceit_candidates($1,$2)', [grant, hash])).rows
      assert.equal(candidates.length, 1)
      assert.equal(candidates[0].agronome_id, id(51))
      assert.equal(candidates[0].location_rank, 0)
      assert.equal('phone' in candidates[0], false)
      await denied(() =>
        value('select ceit_propose_mission($1,$2,$3,$4,false)', [
          grant,
          hash,
          id(51),
          'Une visite technique avec objectifs et duree a convenir.',
        ]),
      )
      const mission = await value('select ceit_propose_mission($1,$2,$3,$4,true)', [
        grant,
        hash,
        id(51),
        'Une visite technique avec objectifs et duree a convenir.',
      ])
      await as(4)
      await denied(() => value("select ceit_respond_mission($1,'accept')", [mission]))
      await as(3)
      assert.equal(
        await value('select status from ceit_missions where id=$1', [mission]),
        'proposed',
      )
      await value("select ceit_respond_mission($1,'accept')", [mission])
      assert.equal(
        await value('select status from ceit_missions where id=$1', [mission]),
        'accepted',
      )
      await as(0, 'service_role')
      assert.equal(
        (await run('select * from ceit_candidates($1,$2)', [grant, hash])).rows.length,
        0,
      )
      await as(3)
      await value("select ceit_respond_mission($1,'complete')", [mission])
    },
  )
  await t.test(
    'expired mandate and revoked operator right immediately prevent new contributions',
    async () => {
      await db.exec('reset role;begin;')
      await db.exec(`update ceit_mandates set revoked_at=now() where partner_id='${id(21)}'`)
      await as(0, 'service_role')
      await denied(() =>
        value('select ceit_add_version($1,$2,$3,$4,$5,$5)', [
          id(2),
          product,
          id(82),
          { sources: [{ rights: 'open' }] },
          hash,
        ]),
      )
      await db.exec('rollback;reset role;')
      await db.exec('begin;')
      await db.exec(
        `update ceit_operator_rights set expires_at=now()-interval '1 hour' where partner_id='${id(21)}'`,
      )
      await as(2)
      await denied(() => value("select ceit_transition($1,'submit')", [id(81)]))
      await db.exec('rollback;reset role;')
    },
  )
  await t.test('published files and payload cannot be replaced by a service update', async () => {
    await as(0, 'service_role')
    await assert.rejects(
      () => run('update ceit_versions set ce_sha256=$1 where id=$2', ['b'.repeat(64), id(80)]),
      /immutable version/,
    )
    await assert.rejects(
      () => run('update ceit_versions set payload=$1 where id=$2', [{ sources: [] }, id(80)]),
      /immutable version/,
    )
  })
  await t.test('expired proof cannot download the document', async () => {
    await db.exec('reset role;begin;')
    await run(
      "update ceit_access_grants set token_expires_at=now()-interval '1 minute' where id=$1",
      [grant],
    )
    await as(0, 'service_role')
    await denied(() => value('select ceit_check_grant($1,$2)', [grant, hash]))
    await db.exec('rollback;reset role;')
  })
  await t.test(
    'two proposals compete for one available slot; acceptance cannot overbook',
    async () => {
      await as(0, 'service_role')
      const second = await value('select ceit_grant_card($1,$2,$3,$4)', [
        product,
        id(33),
        id(43),
        hash,
      ])
      const missions = []
      for (const g of [grant, second])
        missions.push(
          await value('select ceit_propose_mission($1,$2,$3,$4,true)', [
            g,
            hash,
            id(51),
            'Visite avec objectif borne et accord specifique avant prestation.',
          ]),
        )
      await assert.rejects(
        () =>
          value('select ceit_propose_mission($1,$2,$3,$4,true)', [
            second,
            hash,
            id(51),
            'Nouvelle visite avec objectif borne et accord specifique.',
          ]),
        /unique|duplicate/i,
      )
      await as(3)
      const results = await Promise.allSettled(
        missions.map((m) => value("select ceit_respond_mission($1,'accept')", [m])),
      )
      assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1)
      assert.equal(results.filter((r) => r.status === 'rejected').length, 1)
      assert.equal(
        await value("select count(*)::int from ceit_missions where status='accepted'"),
        1,
      )
    },
  )
  await t.test(
    'paid confirmation is service-only, gated, exact-price and idempotent for the buyer',
    async () => {
      const args = [product, id(80), id(101), id(5), 1500, 'XOF', hash, 'fedapay:tx-123']
      await as(2)
      await denied(() => value('select ceit_confirm_purchase($1,$2,$3,$4,$5,$6,$7,$8)', args))
      await as(0, 'service_role')
      await assert.rejects(
        () => value('select ceit_confirm_purchase($1,$2,$3,$4,$5,$6,$7,$8)', args),
        /disabled/,
      )
      await db.exec('reset role;update ceit_financial_policy set payment_adapter_enabled=true;')
      await as(0, 'service_role')
      await assert.rejects(
        () =>
          value('select ceit_confirm_purchase($1,$2,$3,$4,$5,$6,$7,$8)', [
            ...args.slice(0, 4),
            250,
            'XOF',
            hash,
            'fedapay:tx-123',
          ]),
        /invalid/,
      )
      await assert.rejects(
        () =>
          value('select ceit_confirm_purchase($1,$2,$3,$4,$5,$6,$7,$8)', [
            ...args.slice(0, 5),
            'USD',
            hash,
            'fedapay:tx-123',
          ]),
        /invalid/,
      )
      const paid = await value('select ceit_confirm_purchase($1,$2,$3,$4,$5,$6,$7,$8)', args)
      assert.equal(await value('select ceit_confirm_purchase($1,$2,$3,$4,$5,$6,$7,$8)', args), paid)
      await assert.rejects(
        () =>
          value('select ceit_confirm_purchase($1,$2,$3,$4,$5,$6,$7,$8)', [
            product,
            id(80),
            id(101),
            id(4),
            1500,
            'XOF',
            hash,
            'fedapay:tx-123',
          ]),
        /mismatch/,
      )
      await assert.rejects(
        () =>
          value('select ceit_confirm_purchase($1,$2,$3,$4,$5,$6,$7,$8)', [
            product,
            id(80),
            id(102),
            id(5),
            1500,
            'XOF',
            hash,
            'fedapay:tx-123',
          ]),
        /unique|duplicate/i,
      )
      await denied(() => value('select ceit_check_grant($1,$2,$3)', [paid, hash, null]))
      await denied(() => value('select ceit_check_grant($1,$2,$3)', [paid, '', id(4)]))
      assert.equal(
        (await value('select ceit_check_grant($1,$2,$3)', [paid, '', id(5)])).version_id,
        id(80),
      )
      assert.equal(
        await value("select count(*)::int from ceit_access_grants where source='purchase'"),
        1,
      )
      await db.exec('reset role;update ceit_financial_policy set payment_adapter_enabled=false;')
    },
  )
})
