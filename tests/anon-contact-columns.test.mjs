// La migration qui retire les téléphones de la lecture anonyme, exécutée dans PGlite.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { PGlite } from '@electric-sql/pglite'

const sql = (p) => readFileSync(p, 'utf8')

test('anon ne lit plus les téléphones ; les colonnes publiques et les comptes connectés restent', async () => {
  const db = new PGlite()
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated;
    CREATE TABLE cooperatives(id uuid PRIMARY KEY, name text, description text, logo_url text,
      primary_color text, created_at timestamptz, updated_at timestamptz, faitiere_name text,
      level text, parent_id uuid, village_id uuid, culture_categories text[], coordo_name text,
      coordo_phone text, deleted_at timestamptz, is_demo boolean);
    CREATE TABLE techniciens(id uuid PRIMARY KEY, faitiere_id uuid, canton_id uuid, name text,
      phone text, created_at timestamptz, updated_at timestamptz);
    GRANT SELECT ON cooperatives, techniciens TO anon, authenticated;
    INSERT INTO cooperatives(id, name, coordo_name, coordo_phone)
      VALUES ('00000000-0000-4000-8000-000000000001', 'COOMARA', 'Ama', '+22890000000');
    INSERT INTO techniciens(id, name, phone) VALUES ('00000000-0000-4000-8000-000000000002', 'Kofi', '+22891111111');
  `)
  await db.exec(sql('supabase/migrations/20261014_090000_anon_contact_columns.sql'))

  await db.exec('SET ROLE anon')
  const pub = await db.query('SELECT id, name, level, parent_id, logo_url, faitiere_name FROM cooperatives')
  assert.equal(pub.rows.length, 1, 'public columns still readable')
  await assert.rejects(db.query('SELECT coordo_phone FROM cooperatives'), /permission denied/)
  await assert.rejects(db.query('SELECT coordo_name FROM cooperatives'), /permission denied/)
  await assert.rejects(db.query('SELECT * FROM cooperatives'), /permission denied/)
  assert.equal((await db.query('SELECT name FROM techniciens')).rows.length, 1)
  await assert.rejects(db.query('SELECT phone FROM techniciens'), /permission denied/)

  await db.exec('RESET ROLE; SET ROLE authenticated')
  assert.equal((await db.query('SELECT coordo_phone FROM cooperatives')).rows[0].coordo_phone, '+22890000000')
  assert.equal((await db.query('SELECT phone FROM techniciens')).rows[0].phone, '+22891111111')

  await db.exec('RESET ROLE')
  await db.exec(sql('supabase/rollbacks/20261014_090000_anon_contact_columns.rollback.sql'))
  await db.exec('SET ROLE anon')
  assert.equal((await db.query('SELECT coordo_phone FROM cooperatives')).rows.length, 1, 'rollback restores')
  await db.close()
})
