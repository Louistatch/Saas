import assert from 'node:assert/strict'
import { test } from 'node:test'
import { acquireFreeAccess } from '../lib/ce-it/access-flow'
import { generateDocuments } from '../lib/ce-it/pdf'
import { digitalSettlement, productSchema, versionSchema } from '../lib/ce-it/schema'
import { documentInput } from './ce-it-fixture'

const id = '00000000-0000-4000-8000-000000000001'
test('CE/IT refuses inconsistent owners and client-supplied prices or payment status', () => {
  assert.equal(
    productSchema.safeParse({
      owner_kind: 'platform',
      faitiere_id: id,
      title: 'Compte maïs',
      culture: 'mais',
      skills: ['semis'],
    }).success,
    false,
  )
  assert.equal(
    productSchema.safeParse({
      owner_kind: 'operator',
      title: 'Compte maïs',
      culture: 'mais',
      skills: ['semis'],
    }).success,
    false,
  )
  assert.equal(
    productSchema.safeParse({
      owner_kind: 'platform',
      title: 'Compte maïs',
      culture: 'mais',
      skills: ['semis'],
      price: 0,
      payment_status: 'completed',
    }).success,
    false,
  )
  assert.equal(
    productSchema.safeParse({
      owner_kind: 'faitiere',
      faitiere_id: id,
      title: 'Compte maïs',
      culture: 'mais',
      skills: ['semis'],
    }).success,
    true,
  )
})
test('sources, rights, quantities and dated operations are mandatory before creating files', () => {
  assert.ok(versionSchema.safeParse(documentInput).success)
  for (const value of [
    { ...documentInput, sources: [] },
    { ...documentInput, sources: [{ ...documentInput.sources[0], rights: 'restricted' }] },
    { ...documentInput, costs: [{ ...documentInput.costs[0], unitPrice: -1 }] },
    { ...documentInput, itinerary: [{ ...documentInput.itinerary[0], dayEnd: -1 }] },
    { ...documentInput, areaHa: Number.POSITIVE_INFINITY },
    { ...documentInput, costs: [documentInput.costs[0], documentInput.costs[0]] },
  ])
    assert.equal(versionSchema.safeParse(value).success, false)
})
test('PIN failure cannot create an access grant; account or extra client fields cannot bypass it', async () => {
  let grants = 0
  const deps = {
    verifyPin: async () => ({ ok: false as const }),
    issueGrant: async () => {
      grants++
      return { grant_id: id, token: 'a'.repeat(64) }
    },
  }
  assert.equal(
    await acquireFreeAccess({ product_id: id, card_number: 'COO-12345', pin: '654321' }, deps),
    null,
  )
  await assert.rejects(() =>
    acquireFreeAccess(
      { product_id: id, card_number: 'COO-12345', pin: '654321', member_id: id, paid: true },
      deps,
    ),
  )
  assert.equal(grants, 0)
})
test('the beneficiary comes exclusively from successful PIN verification', async () => {
  const seen: string[][] = []
  const proof = await acquireFreeAccess(
    { product_id: id, card_number: 'COO-12345', pin: '654321' },
    {
      verifyPin: async () => ({ ok: true as const, memberId: 'trusted-member' }),
      issueGrant: async (...args) => {
        seen.push(args)
        return { grant_id: id, token: 'a'.repeat(64) }
      },
    },
  )
  assert.equal(proof?.grant_id, id)
  assert.deepEqual(seen, [[id, 'COO-12345', 'trusted-member']])
})
test('generated PDF pair contains the CE calculation, itinerary and scientific references', () => {
  const pdf = generateDocuments('Maïs de test', versionSchema.parse(documentInput))
  for (const bytes of [pdf.ce, pdf.it]) {
    const text = new TextDecoder().decode(bytes)
    assert.ok(text.startsWith('%PDF-'))
    assert.ok(text.includes('example.org/reference'))
    assert.ok(text.includes('consultation personnalisee'))
  }
  const ce = new TextDecoder().decode(pdf.ce)
  assert.ok(ce.includes('1080000'))
  assert.ok(ce.includes('40000'))
  assert.ok(ce.includes('1040000'))
  assert.ok(new TextDecoder().decode(pdf.it).includes('Semis'))
})
test('digital commission is configurable and inactive until expressly approved, with no card flat fee', () => {
  assert.deepEqual(
    digitalSettlement(1500, { commissionBps: null, approved: false, payoutsEnabled: false }),
    { enabled: false },
  )
  assert.deepEqual(
    digitalSettlement(1500, { commissionBps: 1000, approved: false, payoutsEnabled: true }),
    { enabled: false },
  )
  assert.deepEqual(
    digitalSettlement(1500, { commissionBps: 1000, approved: true, payoutsEnabled: false }),
    { enabled: false },
  )
  assert.deepEqual(
    digitalSettlement(1500, { commissionBps: 1000, approved: true, payoutsEnabled: true }),
    { enabled: true, commission: 150, net: 1350 },
  )
  assert.throws(() =>
    digitalSettlement(250, { commissionBps: 0, approved: true, payoutsEnabled: true }),
  )
})
