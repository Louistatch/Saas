// HarooLife : quelle partie gagne à l'ouverture, celle du téléphone ou celle en ligne.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { type CloudCopy, type CloudMeta, decideOnLoad, readMeta } from '../lib/haroolife/cloud-save'

const cloud = (version: number, at: string): CloudCopy => ({
  save: {},
  version,
  updated_at: at,
  wallet: 0,
})
const meta = (m: Partial<CloudMeta>): CloudMeta => ({
  owner: 'ama',
  version: 1,
  syncedAt: 1000,
  localAt: 1000,
  ...m,
})

test('rien en ligne : la partie du téléphone part en ligne (neuve si elle est à un autre compte)', () => {
  assert.deepEqual(decideOnLoad('ama', null, null), { action: 'push-local', base: 0 })
  assert.deepEqual(decideOnLoad('ama', meta({}), null), { action: 'push-local', base: 0 })
  assert.deepEqual(decideOnLoad('ama', meta({ owner: 'kofi' }), null), {
    action: 'push-fresh',
    base: 0,
  })
})

test('même version : on continue sur ce téléphone', () => {
  assert.deepEqual(decideOnLoad('ama', meta({ version: 4 }), cloud(4, '2026-10-16T10:00:00Z')), {
    action: 'push-local',
    base: 4,
  })
})

test('un autre appareil a sauvegardé : la plus récente gagne', () => {
  const later = Date.parse('2026-10-16T12:00:00Z')
  // Rien changé ici depuis la dernière synchro : la partie en ligne.
  assert.equal(
    decideOnLoad('ama', meta({ version: 2 }), cloud(5, '2026-10-16T10:00:00Z')).action,
    'adopt-cloud',
  )
  // Des changements ici, plus récents que la partie en ligne : ce téléphone.
  assert.deepEqual(
    decideOnLoad('ama', meta({ version: 2, localAt: later }), cloud(5, '2026-10-16T10:00:00Z')),
    { action: 'push-local', base: 5 },
  )
  // Des changements ici, mais plus anciens : la partie en ligne.
  assert.equal(
    decideOnLoad(
      'ama',
      meta({ version: 2, localAt: Date.parse('2026-10-16T09:00:00Z') }),
      cloud(5, '2026-10-16T10:00:00Z'),
    ).action,
    'adopt-cloud',
  )
})

test('partie locale d’un autre compte ou inconnue : la partie en ligne', () => {
  assert.equal(decideOnLoad('ama', meta({ owner: 'kofi' }), cloud(3, 'x')).action, 'adopt-cloud')
  assert.equal(decideOnLoad('ama', null, cloud(3, 'x')).action, 'adopt-cloud')
})

test('mémo du téléphone illisible : ignoré', () => {
  assert.equal(readMeta('{'), null)
  assert.equal(readMeta('{"owner":1}'), null)
  assert.deepEqual(readMeta('{"owner":"ama","version":2}'), {
    owner: 'ama',
    version: 2,
    syncedAt: 0,
    localAt: 0,
  })
})

test('un visiteur crée son compte FaîtiereHub : sa partie le suit, sauf si le compte a déjà la sienne', () => {
  const visit = meta({ owner: 'anonyme', visitor: true })
  assert.deepEqual(decideOnLoad('ama', visit, null), { action: 'push-local', base: 0 })
  assert.deepEqual(decideOnLoad('ama', visit, cloud(3, '2026-10-16T10:00:00Z')), {
    action: 'adopt-cloud',
    base: 3,
  })
  assert.equal(readMeta(JSON.stringify(visit))?.visitor, true)
  assert.equal(readMeta(JSON.stringify(meta({})))?.visitor, undefined)
})
