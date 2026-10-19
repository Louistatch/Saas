/**
 * B10 — Fichiers vendus : chemin rattaché à l'auteur, présence réelle,
 * taille/type du stockage, signature des premiers octets (lib/fiches/files.ts),
 * et POST /api/fiches qui s'en sert.
 */
import assert from 'node:assert/strict'
import { beforeEach, test } from 'node:test'
import {
  type FicheStorage,
  checkFileSignature,
  safeDownloadName,
  validateFichePath,
  verifyStoredFiles,
} from '../lib/fiches/files'
import { FakeClient, Store, installFetch, installStubs, resetStore } from './fiches-fake-db'

for (const level of ['log', 'info', 'warn', 'error', 'debug'] as const) console[level] = () => {}

const COOP = '0c0c0c0c-0000-4000-8000-0000000000c1'
const OTHER = '0c0c0c0c-0000-4000-8000-0000000000c2'
const FICHE = '0f0f0f0f-0000-4000-8000-0000000000f1'
const PDF = [0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]
const ZIP = [0x50, 0x4b, 0x03, 0x04, 0x14, 0, 0x06, 0]
const OLE = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]

test('validateFichePath : chemins acceptés et refusés', () => {
  const platform = { platform: true, cooperativeId: null, ficheId: FICHE }
  const coop = { platform: false, cooperativeId: COOP, ficheId: FICHE }
  // Acceptés
  assert.ok(validateFichePath('plateforme/1790984748604-ecx2ed.xlsx', platform))
  assert.ok(validateFichePath(`plateforme/${FICHE}/v2.pdf`, platform))
  assert.ok(validateFichePath(`${COOP}/1790-ab12.docx`, coop))
  assert.ok(validateFichePath(`${COOP}/${FICHE}/v2.pdf`, coop))
  // Refusés
  for (const p of [
    `${OTHER}/1790-ab12.docx`, // autre faîtière
    '../fiches-covers/x.webp',
    'plateforme/../x.pdf',
    '/plateforme/x.pdf',
    'plateforme/sous/dossier/x.pdf',
    `plateforme/${OTHER}/x.pdf`, // sous-dossier qui n'est pas la fiche
    'plateforme/x y.pdf',
    'plateforme\\x.pdf',
    'plateforme/x\u0000.pdf',
    '',
  ])
    assert.equal(validateFichePath(p, platform), false, p)
  assert.equal(validateFichePath('plateforme/1-a.xlsx', coop), false)
  assert.equal(validateFichePath(`${COOP}/1-a.xlsx`, platform), false)
  // Faîtière sans organisation : rien n'est accepté.
  assert.equal(
    validateFichePath(`${COOP}/1-a.xlsx`, { platform: false, cooperativeId: null }),
    false,
  )
  // POST (pas encore d'id) : pas de sous-dossier.
  assert.equal(
    validateFichePath(`plateforme/${FICHE}/v2.pdf`, { platform: true, cooperativeId: null }),
    false,
  )
})

test('checkFileSignature : PDF, OOXML (xlsx/docx), OLE (xls/doc)', () => {
  const b = (a: number[]) => Uint8Array.from(a)
  assert.ok(checkFileSignature('pdf', b(PDF)))
  assert.ok(checkFileSignature('xlsx', b(ZIP)))
  assert.ok(checkFileSignature('DOCX', b(ZIP)))
  assert.ok(checkFileSignature('xls', b(OLE)))
  assert.ok(checkFileSignature('doc', b(OLE)))
  assert.equal(checkFileSignature('pdf', b(ZIP)), false)
  assert.equal(checkFileSignature('xlsx', b(PDF)), false)
  assert.equal(checkFileSignature('xls', b(ZIP)), false)
  assert.equal(checkFileSignature('exe', b([0x4d, 0x5a])), false)
  assert.equal(checkFileSignature('pdf', b([])), false)
})

test('safeDownloadName : sans / \\ ni caractère de contrôle', () => {
  assert.equal(safeDownloadName('a/b\\c\u0007.pdf'), 'abc.pdf')
  assert.equal(safeDownloadName('  '), 'fichier')
  assert.equal(safeDownloadName(null), 'fichier')
})

// ── verifyStoredFiles avec un faux stockage ─────────────────────────────────

function world() {
  const store = new Store()
  const client = new FakeClient(store, 'admin')
  installFetch(store, [])
  return { store, storage: client.storage as unknown as FicheStorage }
}

test('verifyStoredFiles : taille et type repris du stockage, pas du client', async () => {
  const { store, storage } = world()
  store.put(
    'fiches-techniques',
    'plateforme/1-a.xlsx',
    [...ZIP, 1, 2, 3],
    'application/vnd.ms-excel.real',
  )
  const r = await verifyStoredFiles(
    storage,
    [{ name: 'Compte.xlsx', url: 'plateforme/1-a.xlsx', type: 'pdf', size: 999_999 }],
    { platform: true, cooperativeId: null },
  )
  assert.ok(r.ok)
  assert.deepEqual(r.ok && r.files, [
    {
      name: 'Compte.xlsx',
      url: 'plateforme/1-a.xlsx',
      type: 'xlsx',
      size: 11,
      mime: 'application/vnd.ms-excel.real',
    },
  ])
})

test('verifyStoredFiles : objet absent → 400, rien supprimé', async () => {
  const { store, storage } = world()
  const r = await verifyStoredFiles(storage, [{ name: 'X.pdf', url: 'plateforme/absent.pdf' }], {
    platform: true,
    cooperativeId: null,
  })
  assert.deepEqual(r, {
    ok: false,
    status: 400,
    error: 'Fichier « X.pdf » invalide ou absent',
    field: 'files',
  })
  assert.ok(!store.storageCalls.some((c) => c.op === 'remove'))
})

test('verifyStoredFiles : signature fausse → 400 et objet supprimé', async () => {
  const { store, storage } = world()
  store.put('fiches-techniques', 'plateforme/1-a.pdf', ZIP)
  const r = await verifyStoredFiles(storage, [{ name: 'faux.pdf', url: 'plateforme/1-a.pdf' }], {
    platform: true,
    cooperativeId: null,
  })
  assert.equal(r.ok, false)
  assert.equal(store.bucket('fiches-techniques').has('plateforme/1-a.pdf'), false)
})

test('verifyStoredFiles : chemin d’une autre faîtière → 400, et surtout PAS supprimé', async () => {
  const { store, storage } = world()
  store.put('fiches-techniques', `${OTHER}/1-a.pdf`, PDF)
  const r = await verifyStoredFiles(storage, [{ name: 'vol.pdf', url: `${OTHER}/1-a.pdf` }], {
    platform: false,
    cooperativeId: COOP,
  })
  assert.equal(r.ok, false)
  assert.equal(store.bucket('fiches-techniques').has(`${OTHER}/1-a.pdf`), true)
})

test('verifyStoredFiles : fichier déjà référencé → ni relu ni supprimé', async () => {
  const { store, storage } = world()
  const previous = { name: 'ancien.xls', url: 'plateforme/old.xls', type: 'xls', size: 42 }
  const r = await verifyStoredFiles(
    storage,
    [{ name: 'ancien.xls', url: 'plateforme/old.xls' }],
    {
      platform: true,
      cooperativeId: null,
    },
    { alreadyReferenced: [previous] },
  )
  assert.ok(r.ok)
  assert.deepEqual(r.ok && r.files, [previous])
  assert.equal(store.storageCalls.length, 0)
})

// ── POST /api/fiches ─────────────────────────────────────────────────────────

const state = installStubs()
const { NextRequest } = require('next/server') as typeof import('next/server')
const ficheRoute = require('../app/api/fiches/route') as {
  POST: (req: InstanceType<typeof NextRequest>) => Promise<Response>
}

beforeEach(() => {
  resetStore(state)
  installFetch(state.store, [])
  state.store.rows('cultures').push({ name: 'Mais' }, { name: 'Soja' })
})

const post = (body: Record<string, unknown>) =>
  ficheRoute.POST(
    new NextRequest('https://app.test/api/fiches', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
  )

const fiche = {
  title: 'Maïs pluvial',
  culture: 'Maïs',
  type_agriculture: 'conventionnel',
  price_non_member: 1000,
  platform: true,
}

test('POST /api/fiches : faîtière (publication fermée, lib/fiches/publishing.ts) → 403, rien écrit', async () => {
  // Depuis 40c06ee (main), seul le super_admin publie. Le contrôle du dossier d'un fichier
  // déclaré par une faîtière reste couvert par validateFichePath (ci-dessus).
  state.ctx = {
    userId: 'u-f',
    role: 'cooperative_admin',
    cooperativeId: COOP,
    cooperativeLevel: 'faitiere',
  }
  state.store.put('fiches-techniques', 'plateforme/1790984748604-ecx2ed.xlsx', ZIP)
  const res = await post({
    ...fiche,
    files: [{ name: 'vol.xlsx', url: 'plateforme/1790984748604-ecx2ed.xlsx' }],
  })
  assert.equal(res.status, 403)
  assert.equal(state.store.rows('fiches_techniques').length, 0)
  assert.equal(state.store.bucket('fiches-techniques').size, 1)
})

test('POST /api/fiches : brouillon sans fichier accepté, culture enregistrée sous le nom du référentiel', async () => {
  state.ctx = { userId: 'u-s', role: 'super_admin', cooperativeId: null, cooperativeLevel: null }
  const res = await post({ ...fiche, status: 'draft' })
  assert.equal(res.status, 201)
  const row = state.store.rows('fiches_techniques')[0]
  assert.equal(row?.culture, 'Mais')
  assert.deepEqual(row?.files, [])
  assert.equal(row?.cooperative_id, null)
})

test('POST /api/fiches : publication avec un vrai fichier → taille du stockage enregistrée', async () => {
  state.ctx = { userId: 'u-s', role: 'super_admin', cooperativeId: null, cooperativeLevel: null }
  state.store.put('fiches-techniques', 'plateforme/1-a.pdf', [...PDF, 9, 9], 'application/pdf')
  const res = await post({
    ...fiche,
    files: [{ name: 'Guide.pdf', url: 'plateforme/1-a.pdf', size: 1 }],
  })
  assert.equal(res.status, 201)
  assert.deepEqual(state.store.rows('fiches_techniques')[0]?.files, [
    {
      name: 'Guide.pdf',
      url: 'plateforme/1-a.pdf',
      type: 'pdf',
      size: 10,
      mime: 'application/pdf',
    },
  ])
})

test('POST /api/fiches : culture inconnue → 400 par champ', async () => {
  state.ctx = { userId: 'u-s', role: 'super_admin', cooperativeId: null, cooperativeLevel: null }
  const res = await post({ ...fiche, culture: 'Sorgho', status: 'draft' })
  assert.equal(res.status, 400)
  assert.match((await res.json()).details.culture[0], /Culture inconnue/)
})
