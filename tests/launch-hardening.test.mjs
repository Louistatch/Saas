import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'

const id = n => `00000000-0000-4000-8000-${String(n).padStart(12,'0')}`
const db = new PGlite()
const sql = q => db.exec(q)
const rows = async q => (await db.query(q)).rows
const role = async (name, user='') => sql(`RESET ROLE; SET ROLE ${name}; SELECT set_config('request.jwt.claim.sub','${user}',false);`)
const denied = async q => assert.rejects(() => sql(q))
const count = async table => Number((await rows(`SELECT count(*) AS n FROM ${table}`))[0].n)

test('Launch migrations enforce isolation and atomic processing', async t => {
  await sql(readFileSync(new URL('./launch-schema.sql',import.meta.url),'utf8'))
  await sql(readFileSync(new URL('./related-schema.sql',import.meta.url),'utf8'))
  await sql(readFileSync(new URL('./score-functions.sql',import.meta.url),'utf8'))
  await sql('GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role')
  // Deliberately permissive legacy policies must be removed, not merely supplemented.
  for (const table of ['members','member_cards','profiles','payments','buyer_requests','buyer_matches','academy_quiz_options']) {
    await sql(`CREATE POLICY old_allow ON ${table} TO authenticated USING(true) WITH CHECK(true);`)
  }
  await sql(`INSERT INTO cooperatives(id,name,parent_id) VALUES('${id(1)}','A',null),('${id(2)}','B',null),('${id(3)}','A child','${id(1)}');
    INSERT INTO profiles(id,email,role,cooperative_id) VALUES
    ('${id(11)}','admin-a@test.invalid','cooperative_admin','${id(1)}'),
    ('${id(12)}','admin-b@test.invalid','cooperative_admin','${id(2)}'),
    ('${id(13)}','member@test.invalid','member','${id(1)}'),
    ('${id(14)}','operator@test.invalid','none',null),
    ('${id(15)}','buyer@test.invalid','none',null),
    ('${id(16)}','root@test.invalid','super_admin',null);
    INSERT INTO auth.users VALUES('${id(13)}','member@test.invalid',now());
    INSERT INTO members(id,cooperative_id,first_name,last_name,email,phone) VALUES
    ('${id(21)}','${id(1)}','Own','Member','member@test.invalid','+22800000000'),
    ('${id(22)}','${id(2)}','Other','Member','other@test.invalid',null),
    ('${id(23)}','${id(3)}','Child','Member',null,null);
    INSERT INTO member_cards(member_id,cooperative_id,card_number) VALUES
    ('${id(21)}','${id(1)}','AAA-12345'),('${id(22)}','${id(2)}','BBB-12345');
    INSERT INTO academy_quiz_options(question_id,label,is_correct,order_index) VALUES('${id(40)}','Answer',true,1);
    INSERT INTO partners(id,partner_code,display_name) VALUES('${id(50)}','TEST','Operator');
    INSERT INTO partner_memberships(partner_id,user_id) VALUES('${id(50)}','${id(14)}');
    INSERT INTO partner_certifications(user_id,partner_id) VALUES('${id(14)}','${id(50)}');
    INSERT INTO partner_organization_assignments(id,partner_id,cooperative_id) VALUES('${id(51)}','${id(50)}','${id(1)}');
    INSERT INTO partner_assignment_scopes VALUES('${id(51)}','members.read'),('${id(51)}','cards.read');
    INSERT INTO cotisations(id,member_id,cooperative_id,amount) VALUES('${id(60)}','${id(21)}','${id(1)}',1000);
    INSERT INTO payments(id,member_id,cooperative_id,cotisation_id,amount_fcfa,reference) VALUES('${id(61)}','${id(21)}','${id(1)}','${id(60)}',1000,'TEST-PAY');
    INSERT INTO notification_templates(key,channel,body_fr) VALUES('cotisation_paid','sms','Bonjour {prenom}, {montant} reçu');`)
  for (const file of ['20260920082108_launch_access_hardening.sql','20260920082121_atomic_payments_and_notification_claims.sql','20260920131215_related_member_data_scope.sql']) {
    await sql(readFileSync(new URL(`../supabase/migrations/${file}`,import.meta.url),'utf8'))
  }
  await t.test('anonymous cannot list identities, cards or corrections', async () => {
    await role('anon')
    for (const table of ['members','member_cards','profiles','academy_quiz_options']) await denied(`SELECT * FROM ${table}`)
    await denied(`SELECT settle_payment_atomic('${id(61)}','{"status":"success"}')`)
    await denied('SELECT * FROM claim_notification_batch(1)')
  })
  await t.test('organisation administrator sees own hierarchy and cannot modify another tenant', async () => {
    await role('authenticated',id(11))
    assert.equal(await count('members'),2)
    assert.equal(await count('member_cards'),1)
    assert.equal((await rows(`UPDATE members SET first_name='Forbidden' WHERE id='${id(22)}' RETURNING id`)).length,0)
    await denied(`INSERT INTO members(cooperative_id,first_name,last_name) VALUES('${id(2)}','Forbidden','Insert')`)
    await denied(`UPDATE members SET cooperative_id='${id(2)}' WHERE id='${id(21)}'`)
    await denied(`UPDATE payments SET status='success' WHERE id='${id(61)}'`)
    await denied(`UPDATE profiles SET role='super_admin' WHERE id='${id(11)}'`)
    await denied('SELECT is_correct FROM academy_quiz_options')
    await denied('SELECT explanation,metadata FROM academy_quiz_questions')
    assert.equal((await rows('SELECT id,label FROM academy_quiz_options')).length,1)
  })
  await t.test('member can read only their verified identity and card', async () => {
    await role('authenticated',id(13))
    assert.equal(await count('members'),1)
    assert.equal(await count('member_cards'),1)
    assert.equal((await rows(`UPDATE members SET first_name='Forbidden' RETURNING id`)).length,0)
    // Editing profiles.email cannot impersonate another member.
    await sql(`UPDATE profiles SET email='other@test.invalid' WHERE id='${id(13)}'`)
    assert.equal((await rows('SELECT id FROM members'))[0].id,id(21))
  })
  await t.test('candidate has no access; certification, scope and mandate revocation are enforced', async () => {
    await role('authenticated',id(14)); assert.equal(await count('members'),0)
    await role('postgres'); await sql(`UPDATE partners SET status='active'; UPDATE partner_certifications SET certified_at=now();`)
    await role('authenticated',id(14)); assert.equal(await count('members'),1)
    assert.equal((await rows(`UPDATE members SET first_name='Forbidden' RETURNING id`)).length,0)
    await role('postgres'); await sql(`UPDATE partner_organization_assignments SET status='revoked'`)
    await role('authenticated',id(14)); assert.equal(await count('members'),0)
  })
  await t.test('request creators are distinct even when both have no organisation', async () => {
    await role('authenticated',id(15)); await sql(`INSERT INTO buyer_requests(id,buyer_name,culture,quantity_kg_needed) VALUES('${id(70)}','Test','Maize',1)`)
    assert.equal(await count('buyer_requests'),1)
    await denied(`UPDATE buyer_requests SET created_by='${id(14)}' WHERE id='${id(70)}'`)
    await role('authenticated',id(14)); assert.equal(await count('buyer_requests'),0)
    assert.equal((await rows(`UPDATE buyer_requests SET status='cancelled' RETURNING id`)).length,0)
  })
  await t.test('settlement rolls back on a failed outbox insert, then succeeds once on retry', async () => {
    await role('postgres'); await sql(`ALTER TABLE notifications_inapp ADD CONSTRAINT simulate_failure CHECK(false) NOT VALID`)
    await role('service_role'); await denied(`SELECT settle_payment_atomic('${id(61)}','{"status":"success"}')`)
    assert.equal((await rows('SELECT status FROM payments'))[0].status,'pending')
    assert.equal((await rows('SELECT status FROM cotisations'))[0].status,'pending')
    await role('postgres'); await sql('ALTER TABLE notifications_inapp DROP CONSTRAINT simulate_failure')
    await role('service_role');
    assert.deepEqual((await rows(`SELECT settle_payment_atomic('${id(61)}','{"status":"success"}') AS r`))[0].r,{claimed:true})
    assert.deepEqual((await rows(`SELECT settle_payment_atomic('${id(61)}','{"status":"success"}') AS r`))[0].r,{claimed:false})
    assert.equal((await rows('SELECT status FROM cotisations'))[0].status,'paid')
    assert.equal(await count('notifications_inapp'),1)
    assert.equal(await count('notification_queue'),1)
  })
  await t.test('notification leases prevent duplicate claims; retry budget survives a worker crash', async () => {
    const first = await rows('SELECT * FROM claim_notification_batch(1)');assert.equal(first.length,1);assert.equal(first[0].attempts,1)
    assert.equal((await rows('SELECT * FROM claim_notification_batch(1)')).length,0)
    await sql(`UPDATE notification_queue SET locked_until=now()-interval '1 minute'`)
    const retry=await rows('SELECT * FROM claim_notification_batch(1)');assert.equal(retry[0].attempts,2);assert.notEqual(retry[0].claim_token,first[0].claim_token)
    await sql(`UPDATE notification_queue SET locked_until=null,attempts=3`)
    assert.equal((await rows('SELECT * FROM claim_notification_batch(1)')).length,0)
  })
  await t.test('related financial and field data stay within the authorised member or hierarchy', async () => {
    await role('postgres')
    await sql(`INSERT INTO parcelles(id,member_id,cooperative_id) VALUES('${id(81)}','${id(21)}','${id(1)}'),('${id(82)}','${id(22)}','${id(2)}');
      INSERT INTO productions(parcelle_id,member_id,cooperative_id,quantity_kg) VALUES('${id(81)}','${id(21)}','${id(1)}',100),('${id(82)}','${id(22)}','${id(2)}',200);`)
    await role('authenticated',id(11));assert.equal(await count('parcelles'),1);assert.equal(await count('productions'),1)
    assert.equal((await rows(`UPDATE parcelles SET name='Forbidden' WHERE id='${id(82)}' RETURNING id`)).length,0)
    assert.equal((await rows(`SELECT calculate_member_ats('${id(22)}') AS score`))[0].score,null)
    await role('authenticated',id(13));assert.equal(await count('cotisations'),1)
    assert.ok((await rows(`SELECT calculate_member_ats('${id(21)}') AS score`))[0].score)
    await role('authenticated',id(14));assert.equal(await count('cotisations'),0);assert.equal(await count('parcelles'),0)
    await role('anon');await denied('SELECT * FROM cotisations');await denied('SELECT * FROM parcelles')
  })
  await db.close()
})
