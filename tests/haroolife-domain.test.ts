import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Lot } from '../lib/haroolife/city/world'
import type { Group } from '../lib/haroolife/core'
import {
  type Actor,
  CooperativeActor,
  ProducerActor,
  WorkerActor,
  can,
  capabilitiesOf,
  facetsOf,
  placeholderActor,
  primaryOrganization,
  publicName,
} from '../lib/haroolife/domain/actor'
import { DomainCommandBus, DomainEventDispatcher } from '../lib/haroolife/domain/bus'
import {
  countByStatus,
  lineageOf,
  pageMembers,
  summarizeParcels,
} from '../lib/haroolife/domain/cooperative'
import { fromBoardWork, toHectares, validatePledge } from '../lib/haroolife/domain/land-aggregation'
import { ActorRegistry, AvatarRenderer, GameWorldAdapter } from '../lib/haroolife/domain/services'
import {
  canJoin,
  canTransition,
  eventsBetween,
  fromBoardGroup,
} from '../lib/haroolife/domain/worker-group'

const actor = (over: Partial<Actor>): Actor => ({ ...placeholderActor('u1'), ...over })

test('capabilities compose across roles instead of a rigid hierarchy', () => {
  const both = actor({
    roles: ['producteur', 'ouvrier'],
    organizations: [{ id: 'c1', name: 'Coop', level: 'cooperative', parentId: null }],
  })
  const caps = capabilitiesOf(both)
  assert.ok(caps.has('view-parcels') && caps.has('join-team') && caps.has('enter-cooperative'))
  assert.equal(
    facetsOf(both)
      .map((f) => f.kind)
      .join(','),
    'producer,worker',
  )
  assert.ok(ProducerActor(both) && WorkerActor(both) && !CooperativeActor(both))
  // An agronomist organises teams only once validated.
  assert.equal(can(actor({ roles: ['agronome'], validated: false }), 'organise-team'), false)
  assert.equal(can(actor({ roles: ['agronome'], validated: true }), 'organise-team'), true)
  // Nobody enters a cooperative without an affiliation.
  assert.equal(can(actor({ roles: ['producteur'] }), 'enter-cooperative'), false)
  assert.equal(primaryOrganization(both)?.id, 'c1')
  assert.equal(publicName('Abalo', 'Kodjo'), 'Abalo K.')
  assert.equal(publicName('', 'Kodjo'), 'Kodjo')
  assert.equal(publicName(null, null), 'Habitant')
})

test('the command bus checks capabilities and the dispatcher fans out events', async () => {
  const events = new DomainEventDispatcher()
  const seen: string[] = []
  events.on('WorkerJoined', (e) => seen.push(e.type))
  const bus = new DomainCommandBus(events)
  bus.register(
    'JoinTeam',
    async (c) => {
      events.emit({
        type: 'WorkerJoined',
        payload: { groupId: (c.payload as { id: string }).id, engaged: 4 },
      })
      return { ok: true, value: 4 }
    },
    'join-team',
  )
  const worker = actor({ roles: ['ouvrier'], availability: 'available' })
  const res = await bus.dispatch({ type: 'JoinTeam', payload: { id: 'g1' } }, worker)
  assert.deepEqual(res, { ok: true, value: 4 })
  assert.deepEqual(seen, ['WorkerJoined'])
  const refused = await bus.dispatch(
    { type: 'JoinTeam', payload: { id: 'g1' } },
    actor({ roles: ['acheteur'] }),
  )
  assert.equal(refused.ok, false)
  assert.equal((refused as { code?: string }).code, 'forbidden')
  const unknown = await bus.dispatch({ type: 'Nope', payload: {} }, worker)
  assert.equal(unknown.ok, false)
})

const group = (over: Partial<Group>): Group => ({
  id: 'g1',
  kind: 'team',
  title: 'Récolte',
  activity: 'recolte',
  starts_on: '2026-10-20',
  ends_on: '2026-10-22',
  target: 8,
  total: 3,
  people: 3,
  expires_at: '2026-10-18T00:00:00Z',
  is_owner: false,
  joined: false,
  state: 'open',
  ...over,
})

test('worker groups follow DRAFT → OPEN → READY → CONFIRMED → ACTIVE → COMPLETED and emit events', () => {
  const now = new Date('2026-10-12T10:00:00Z')
  assert.equal(fromBoardGroup(group({}), now).state, 'OPEN')
  assert.equal(fromBoardGroup(group({ total: 8, state: 'ready' }), now).state, 'READY')
  assert.equal(
    fromBoardGroup(group({ total: 8, state: 'ready' }), new Date('2026-10-19T00:00:00Z')).state,
    'CONFIRMED',
  )
  assert.equal(
    fromBoardGroup(group({ total: 8, state: 'ready' }), new Date('2026-10-21T00:00:00Z')).state,
    'ACTIVE',
  )
  assert.equal(
    fromBoardGroup(group({ total: 8, state: 'ready' }), new Date('2026-10-25T00:00:00Z')).state,
    'COMPLETED',
  )
  assert.equal(fromBoardGroup(group({ state: 'expired' }), now).state, 'EXPIRED')
  assert.equal(fromBoardGroup(group({ state: 'cancelled' }), now).state, 'CANCELLED')
  assert.equal(canTransition('OPEN', 'READY'), true)
  assert.equal(canTransition('COMPLETED', 'OPEN'), false)
  const open = fromBoardGroup(group({}), now)
  assert.equal(open.remaining, 5)
  const worker = actor({ roles: ['ouvrier'], availability: 'available' })
  assert.equal(canJoin(open, worker).ok, true)
  assert.equal(canJoin(open, actor({ roles: ['ouvrier'], availability: 'unavailable' })).ok, false)
  assert.equal(canJoin({ ...open, joined: true }, worker).ok, false)
  const ready = fromBoardGroup(group({ total: 8, people: 8, state: 'ready' }), now)
  const ev = eventsBetween(open, ready).map((e) => e.type)
  assert.deepEqual(ev, ['WorkerJoined', 'WorkerGroupReady'])
  assert.deepEqual(
    eventsBetween(null, open).map((e) => e.type),
    ['WorkerGroupCreated'],
  )
})

test('land pools convert units, sum only accepted pledges and refuse double engagements', () => {
  assert.equal(toHectares(2500, 'm2'), 0.25)
  assert.equal(toHectares(150, 'are'), 1.5)
  const board = {
    pilot: {
      canton: 'Kpalimé',
      cooperative: 'Coop',
      team_target: 8,
      area_target: 15,
      area_max: 16,
      formation_hours: 48,
    },
  }
  const pool = fromBoardWork(
    group({ kind: 'work', target: 15, total: 12.5, people: 4 }),
    board,
    new Date('2026-10-12'),
  )
  assert.equal(pool.committedHa, 12.5)
  assert.equal(pool.remainingHa, 2.5)
  assert.equal(pool.maxHa, 16)
  const parcel = { id: 'p1', cultureName: 'Maïs', areaHa: 3, cooperativeId: 'c1', mine: true }
  const ok = validatePledge({
    aggregation: pool,
    parcel,
    amountHa: 2,
    activePledges: [],
    cooperativeId: 'c1',
  })
  assert.deepEqual(ok, { ok: true })
  assert.equal(
    validatePledge({
      aggregation: pool,
      parcel,
      amountHa: 4,
      activePledges: [],
      cooperativeId: 'c1',
    }).ok,
    false,
  )
  assert.equal(
    validatePledge({
      aggregation: pool,
      parcel: { ...parcel, areaHa: 10 },
      amountHa: 3.6,
      activePledges: [],
      cooperativeId: 'c1',
    }).ok,
    false,
    'over the ceiling',
  )
  assert.equal(
    validatePledge({
      aggregation: pool,
      parcel,
      amountHa: 1.00001,
      activePledges: [],
      cooperativeId: 'c1',
    }).ok,
    false,
    'four decimals',
  )
  const clash = validatePledge({
    aggregation: pool,
    parcel,
    amountHa: 1,
    activePledges: [
      { parcelId: 'p1', amountHa: 1, startsOn: '2026-10-21', endsOn: '2026-10-23', groupId: 'g9' },
    ],
    cooperativeId: 'c1',
  })
  assert.equal(clash.ok, false)
  assert.equal(
    validatePledge({
      aggregation: pool,
      parcel: { ...parcel, mine: false },
      amountHa: 1,
      activePledges: [],
      cooperativeId: 'c1',
    }).ok,
    false,
  )
})

test('cooperative dashboard helpers aggregate real rows and page members', () => {
  const { areaHa, crops } = summarizeParcels([
    { culture_principale: 'Maïs', superficie_ha: 2.5 },
    { culture_principale: 'Maïs', superficie_ha: 1 },
    { culture_principale: 'Soja', superficie_ha: 4 },
    { culture_principale: null, superficie_ha: null },
  ])
  assert.equal(areaHa, 7.5)
  assert.deepEqual(crops[0], { name: 'Soja', areaHa: 4, parcels: 1 })
  assert.deepEqual(
    countByStatus([{ status: 'active' }, { status: 'active' }, { status: 'pending' }])[0],
    { status: 'active', count: 2 },
  )
  const rows = Array.from({ length: 120 }, (_, i) => ({
    id: `m${i}`,
    name: i === 7 ? 'Abalo K.' : `Membre ${i}`,
    status: 'active',
    canton: null,
    hasCard: i % 2 === 0,
    cardStatus: 'ACTIVE' as const,
  }))
  const p2 = pageMembers(rows, 2, '')
  assert.equal(p2.total, 120)
  assert.equal(p2.items.length, 20)
  assert.equal(p2.items[0].id, 'm20')
  assert.equal(pageMembers(rows, 1, 'abalo').total, 1)
  assert.equal(pageMembers(rows, 99, '').items.length, 0)
  const orgs = [
    { id: 'f', name: 'FENOMAT', level: 'faitiere' as const, parentId: null },
    { id: 'u', name: 'Union Kloto', level: 'union' as const, parentId: 'f' },
    { id: 'c', name: 'COOMARA', level: 'cooperative' as const, parentId: 'u' },
  ]
  assert.deepEqual(
    lineageOf('c', orgs).map((o) => o.name),
    ['Union Kloto', 'FENOMAT'],
  )
})

test('registry, world adapter and avatar renderer are deterministic and private', () => {
  const reg = new ActorRegistry(1000)
  reg.put(actor({ id: 'a' }), 0)
  assert.equal(reg.get('a', 500)?.id, 'a')
  assert.equal(reg.get('a', 2000), null)
  const lot = (id: string, x: number): Lot => ({
    id,
    type: 'cooperative',
    district: 'tokoin',
    x,
    y: 10,
    w: 2,
    h: 2,
    floors: 2,
    name: 'Maison',
    door: { x, y: 12 },
  })
  const world = new GameWorldAdapter([lot('A', 10), lot('B', 20), lot('C', 30)])
  const l1 = world.lotForOrganization({ id: 'c1000000-0000-4000-8000-000000000001' })
  assert.equal(l1?.id, world.lotForOrganization({ id: 'c1000000-0000-4000-8000-000000000001' })?.id)
  assert.ok(l1)
  const spec = AvatarRenderer.describe(
    { id: 'u1', displayName: 'Abalo K.', roles: ['producteur'], harooType: null },
    3,
  )
  assert.equal(spec.label, 'Abalo K.')
  assert.equal(spec.badge, '🌾')
  assert.ok(spec.model.startsWith('character-'))
})
