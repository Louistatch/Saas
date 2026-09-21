import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'

const org = '00000000-0000-4000-8000-000000000001'
const legacy = '00000000-0000-4000-8000-000000000002'
const fresh = '00000000-0000-4000-8000-000000000003'
const migrationDir = new URL('../supabase/migrations/', import.meta.url)
const migration = readdirSync(migrationDir).find(name => name.endsWith('_free_card_allowance.sql'))

test('Card allowance: ten free issuances, preserved history, protected counter', async t => {
  const db = new PGlite()
  const sql = q => db.exec(q)
  const used = async id => (await db.query(`SELECT cards_issued FROM private.cooperative_card_allowances WHERE cooperative_id='${id}'`)).rows[0]?.cards_issued ?? 0
  const insert = (id, number) => `INSERT INTO public.member_cards(cooperative_id,card_number) VALUES('${id}','${number}')`
  try {
    await sql(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
      CREATE SCHEMA private; GRANT USAGE ON SCHEMA private TO authenticated,service_role;
      CREATE TABLE public.cooperatives(id uuid PRIMARY KEY);
      CREATE TABLE public.member_cards(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), cooperative_id uuid REFERENCES public.cooperatives(id), member_id uuid, card_number text UNIQUE NOT NULL, card_type text NOT NULL DEFAULT 'FAITIERE', status text DEFAULT 'active', expiry_date date, deleted_at timestamptz);
      INSERT INTO cooperatives VALUES('${org}'),('${legacy}'),('${fresh}');
      INSERT INTO member_cards(cooperative_id,card_number) SELECT '${legacy}','OLD-'||n FROM generate_series(1,12) n;
      GRANT SELECT,INSERT,UPDATE,DELETE ON member_cards TO authenticated,service_role;`)
    await sql('BEGIN;'+readFileSync(new URL(migration,migrationDir),'utf8')+'COMMIT;')
    await t.test('first ten work; eleventh fails without changing usage', async () => {
      await sql('SET ROLE authenticated')
      for (let n=1;n<=10;n++) await sql(insert(org,`NEW-${n}`))
      await assert.rejects(sql(insert(org,'ELEVEN')), e=>e.code==='P0010')
      await sql('RESET ROLE'); assert.equal(await used(org),10)
    })
    await t.test('counter and trigger cannot be accessed directly by clients', async () => {
      await sql('SET ROLE authenticated')
      await assert.rejects(sql('UPDATE private.cooperative_card_allowances SET card_limit=1000'))
      await assert.rejects(sql('SELECT private.enforce_cooperative_card_allowance()'))
      await sql('RESET ROLE')
    })
    await t.test('renewal works; delete and revoke never refill; identities cannot be moved', async () => {
      await sql('SET ROLE authenticated')
      await sql("UPDATE member_cards SET expiry_date='2030-01-01' WHERE card_number='NEW-1'")
      await sql("UPDATE member_cards SET status='revoked' WHERE card_number='NEW-2'")
      await sql("DELETE FROM member_cards WHERE card_number='NEW-3'")
      await assert.rejects(sql(insert(org,'REPLACEMENT')),e=>e.code==='P0010')
      await assert.rejects(sql(`UPDATE member_cards SET cooperative_id='${fresh}' WHERE card_number='NEW-1'`),e=>e.code==='P0011')
      await sql('RESET ROLE'); assert.equal(await used(org),10)
    })
    await t.test('historical cards above quota remain usable but new issuance stops', async () => {
      assert.equal(await used(legacy),12)
      await sql("UPDATE member_cards SET expiry_date='2030-01-01' WHERE card_number='OLD-1'")
      await assert.rejects(sql(insert(legacy,'OLD-13')),e=>e.code==='P0010')
    })
    await t.test('multirow overflow and failed inserts roll back the counter', async () => {
      await assert.rejects(sql(`INSERT INTO member_cards(cooperative_id,card_number) SELECT '${fresh}','BULK-'||n FROM generate_series(1,11) n`),e=>e.code==='P0010')
      assert.equal(await used(fresh),0)
      await assert.rejects(sql(insert(fresh,'OLD-1')),e=>e.code==='23505')
      assert.equal(await used(fresh),0)
      await sql(insert(fresh,'FRESH-1')); assert.equal(await used(fresh),1)
    })
    await t.test('approved allowance increase works; standalone Haroo cards are unaffected', async () => {
      await sql(`UPDATE private.cooperative_card_allowances SET card_limit=11,adjustment_reason='Test approved extension' WHERE cooperative_id='${org}'`)
      await sql('SET ROLE service_role'); await sql(insert(org,'APPROVED-11'))
      await assert.rejects(sql(insert(org,'OVER-APPROVAL')),e=>e.code==='P0010')
      await sql("INSERT INTO member_cards(card_number,card_type) VALUES('OUV-TEST','OUVRIER')")
      await sql('RESET ROLE'); assert.equal(await used(org),11)
    })
  } finally { await db.close() }
})
