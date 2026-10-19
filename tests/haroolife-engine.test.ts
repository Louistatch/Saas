import assert from 'node:assert/strict'
import { test } from 'node:test'
import { type Actor, placeholderActor } from '../lib/haroolife/domain/actor'
import type { DomainEvent } from '../lib/haroolife/domain/bus'
import { createInteractionEngine } from '../lib/haroolife/domain/engine'
import type { LandAggregation, Parcel } from '../lib/haroolife/domain/land-aggregation'
import type {
  LandAggregationService,
  ParcelService,
  WorkerAggregationService,
} from '../lib/haroolife/domain/services'
import type { WorkerGroup } from '../lib/haroolife/domain/worker-group'

// In-memory services with the same guards as haroolife_command (one worker = 1, pledges in
// hectares, ceiling, no parcel twice). The engine never trusts them more than the real backend.
function fakeServices(opts: { maxHa?: number } = {}) {
  const teams = new Map<string, WorkerGroup>()
  const pools = new Map<string, LandAggregation>()
  const pledged = new Set<string>()
  const members = new Map<string, Set<string>>()
  let current = 'u1'
  const joinedBy = (groupId: string) => members.get(groupId)?.has(current) ?? false
  const mark = (groupId: string, on: boolean) => {
    const set = members.get(groupId) ?? new Set<string>()
    if (on) set.add(current)
    else set.delete(current)
    members.set(groupId, set)
  }
  let n = 0
  const id = () => `g${++n}`
  const team = (over: Partial<WorkerGroup>): WorkerGroup => ({
    id: id(),
    title: 'Équipe',
    activity: 'recolte',
    beneficiary: null,
    startsOn: '2026-11-01',
    endsOn: '2026-11-03',
    target: 8,
    engaged: 0,
    remaining: 8,
    deadline: '2026-10-30T00:00:00Z',
    state: 'OPEN',
    isOwner: false,
    joined: false,
    ...over,
  })
  const pool = (over: Partial<LandAggregation>): LandAggregation => ({
    id: id(),
    title: 'Regroupement maïs 15 ha',
    crop: 'semis',
    cooperative: 'COOMARA',
    canton: 'Kpalimé',
    startsOn: '2026-11-10',
    endsOn: '2026-11-20',
    targetHa: 15,
    maxHa: opts.maxHa ?? 16,
    committedHa: 0,
    remainingHa: 15,
    participants: 0,
    deadline: '2026-11-09T00:00:00Z',
    state: 'OPEN',
    isOwner: false,
    joined: false,
    ...over,
  })
  const parcels: Parcel[] = [
    { id: 'p1', cultureName: 'Maïs', areaHa: 3, cooperativeId: 'c1', mine: true },
    { id: 'p2', cultureName: 'Soja', areaHa: 1.5, cooperativeId: 'c1', mine: true },
  ]
  const svc: WorkerAggregationService & LandAggregationService & ParcelService = {
    async open() {
      return [...teams.values()].map((g) => ({ ...g, joined: joinedBy(g.id) }))
    },
    async create(input) {
      const g = team({ title: input.title, isOwner: true })
      teams.set(g.id, g)
      return g
    },
    async join(groupId) {
      const g = teams.get(groupId) as WorkerGroup
      const engaged = g.engaged + 1
      mark(g.id, true)
      const next = {
        ...g,
        engaged,
        remaining: Math.max(0, g.target - engaged),
        state: engaged >= g.target ? ('READY' as const) : g.state,
      }
      teams.set(g.id, next)
      return { ...next, joined: true }
    },
    async leave(groupId) {
      const g = teams.get(groupId) as WorkerGroup
      mark(g.id, false)
      const next = { ...g, engaged: g.engaged - 1, remaining: g.remaining + 1 }
      teams.set(g.id, next)
      return { ...next, joined: false }
    },
    async openPools() {
      return [...pools.values()].map((g) => ({ ...g, joined: joinedBy(g.id) }))
    },
    async pledge(groupId, parcelId, amountHa) {
      const g = pools.get(groupId) as LandAggregation
      if (pledged.has(parcelId)) throw new Error('Cette parcelle participe déjà sur cette période')
      if (g.committedHa + amountHa > g.maxHa) throw new Error('Au-delà du maximum')
      pledged.add(parcelId)
      mark(g.id, true)
      const committedHa = Math.round((g.committedHa + amountHa) * 10000) / 10000
      const next = {
        ...g,
        committedHa,
        remainingHa: Math.max(0, g.targetHa - committedHa),
        participants: g.participants + 1,
        state: committedHa >= g.targetHa ? ('READY' as const) : g.state,
      }
      pools.set(g.id, next)
      return { ...next, joined: true }
    },
    async createPool(input) {
      const g = pool({ title: input.title, isOwner: true })
      pools.set(g.id, g)
      return svc.pledge(g.id, input.parcelId, input.amountHa)
    },
    async mine() {
      return parcels
    },
  }
  return {
    svc,
    teams,
    pools,
    as: (id: string) => {
      current = id
    },
    seedPool: (over: Partial<LandAggregation>) => {
      const g = pool(over)
      pools.set(g.id, g)
      return g
    },
  }
}
const actor = (over: Partial<Actor>): Actor => ({ ...placeholderActor('u1'), ...over })
const producer = actor({
  roles: ['producteur'],
  organizations: [{ id: 'c1', name: 'COOMARA', level: 'cooperative', parentId: null }],
  parcelIds: ['p1', 'p2'],
})
const worker = actor({
  id: 'w1',
  roles: ['ouvrier'],
  harooType: 'ouvrier',
  availability: 'available',
  organizations: [],
})
const busyWorker = { ...worker, availability: 'unavailable' as const }

test('scenario A: a producer recruits, available workers join, the team becomes ready', async () => {
  const fake = fakeServices()
  const { svc } = fake
  const { bus, events } = createInteractionEngine({ teams: svc, land: svc, parcels: svc })
  const seen: string[] = []
  events.on('*', (e: DomainEvent) => seen.push(e.type))

  const denied = await bus.dispatch(
    {
      type: 'RecruitTeam',
      payload: {
        title: 'Récolte',
        activity: 'recolte',
        startsOn: '2026-11-01',
        endsOn: '2026-11-03',
      },
    },
    worker,
  )
  assert.equal(denied.ok, false)
  const created = await bus.dispatch<WorkerGroup>(
    {
      type: 'RecruitTeam',
      payload: {
        title: 'Récolte',
        activity: 'recolte',
        startsOn: '2026-11-01',
        endsOn: '2026-11-03',
      },
    },
    producer,
  )
  assert.ok(created.ok)
  const groupId = created.ok ? created.value.id : ''
  assert.deepEqual(seen, ['WorkerGroupCreated'])

  const notWorker = await bus.dispatch({ type: 'JoinTeam', payload: { groupId } }, producer)
  assert.equal(notWorker.ok, false)
  assert.equal(notWorker.ok ? '' : notWorker.code, 'forbidden')
  const busy = await bus.dispatch({ type: 'JoinTeam', payload: { groupId } }, busyWorker)
  assert.equal(busy.ok ? '' : busy.error, 'Déclarez-vous disponible pour rejoindre une équipe.')

  for (let i = 0; i < 8; i++) {
    fake.as(`w${i}`)
    const r = await bus.dispatch<WorkerGroup>(
      { type: 'JoinTeam', payload: { groupId } },
      { ...worker, id: `w${i}` },
    )
    assert.ok(r.ok, `join ${i}`)
    if (i === 3) {
      // The same worker cannot count twice.
      const again = await bus.dispatch(
        { type: 'JoinTeam', payload: { groupId } },
        { ...worker, id: 'w3' },
      )
      assert.equal(again.ok ? '' : again.error, 'Vous êtes déjà dans cette équipe.')
    }
  }
  fake.as('late')
  assert.equal((await svc.open())[0].state, 'READY')
  assert.ok(seen.includes('WorkerGroupReady'))
  assert.equal(seen.filter((t) => t === 'WorkerJoined').length, 8)

  const full = await bus.dispatch(
    { type: 'JoinTeam', payload: { groupId } },
    { ...worker, id: 'late' },
  )
  assert.equal(full.ok, false)
})

test('scenario B: 15 ha pool, a 2 ha pledge is accepted, units convert, double engagement refused', async () => {
  const fake = fakeServices()
  const { svc, seedPool } = fake
  const pool = seedPool({ committedHa: 12.5, remainingHa: 2.5, participants: 2 })
  const { bus, events } = createInteractionEngine({ teams: svc, land: svc, parcels: svc })
  const pledges: number[] = []
  events.on('LandPledged', (e) => pledges.push((e.payload as { committedHa: number }).committedHa))

  const ok = await bus.dispatch<LandAggregation>(
    { type: 'PledgeLand', payload: { groupId: pool.id, parcelId: 'p1', amount: 2, unit: 'ha' } },
    producer,
  )
  assert.ok(ok.ok)
  assert.equal(ok.ok ? ok.value.committedHa : 0, 14.5)
  assert.deepEqual(pledges, [14.5])

  // Already in the pool: refused before the backend is called.
  const twice = await bus.dispatch(
    { type: 'PledgeLand', payload: { groupId: pool.id, parcelId: 'p2', amount: 50, unit: 'are' } },
    producer,
  )
  assert.equal(twice.ok ? '' : twice.error, 'Vous participez déjà à ce regroupement.')

  // Another producer: above the parcel, above the ceiling, then a valid 50 are = 0.5 ha.
  const other = { ...producer, id: 'u2' }
  fake.as('u2')
  const tooBig = await bus.dispatch(
    { type: 'PledgeLand', payload: { groupId: pool.id, parcelId: 'p2', amount: 2, unit: 'ha' } },
    other,
  )
  assert.match(tooBig.ok ? '' : tooBig.error, /ne fait que 1,5 ha/)
  const over = await bus.dispatch(
    {
      type: 'PledgeLand',
      payload: { groupId: pool.id, parcelId: 'p1', amount: 20000, unit: 'm2' },
    },
    other,
  )
  assert.match(over.ok ? '' : over.error, /maximum/)
  const dup = await bus.dispatch(
    { type: 'PledgeLand', payload: { groupId: pool.id, parcelId: 'p1', amount: 1, unit: 'ha' } },
    other,
  )
  assert.match(dup.ok ? '' : dup.error, /participe déjà/)
  const fine = await bus.dispatch<LandAggregation>(
    { type: 'PledgeLand', payload: { groupId: pool.id, parcelId: 'p2', amount: 50, unit: 'are' } },
    other,
  )
  assert.ok(fine.ok)
  assert.equal(fine.ok ? fine.value.committedHa : 0, 15)
  assert.equal(fine.ok ? fine.value.state : '', 'READY')

  // A worker has no land capability at all.
  const denied = await bus.dispatch(
    { type: 'PledgeLand', payload: { groupId: pool.id, parcelId: 'p1', amount: 1, unit: 'ha' } },
    worker,
  )
  assert.equal(denied.ok ? '' : denied.code, 'forbidden')
})

test('scenario C: entering a cooperative respects organisation boundaries', async () => {
  const { svc } = fakeServices()
  const { bus, events } = createInteractionEngine({ teams: svc, land: svc, parcels: svc })
  let entered = ''
  events.on('CooperativeEntered', (e) => {
    entered = (e.payload as { cooperativeId: string }).cooperativeId
  })
  assert.ok(
    (await bus.dispatch({ type: 'EnterCooperative', payload: { cooperativeId: 'c1' } }, producer))
      .ok,
  )
  assert.equal(entered, 'c1')
  const foreign = await bus.dispatch(
    { type: 'EnterCooperative', payload: { cooperativeId: 'c9' } },
    producer,
  )
  assert.equal(foreign.ok ? '' : foreign.code, 'forbidden')
  const nobody = await bus.dispatch(
    { type: 'EnterCooperative', payload: { cooperativeId: 'c1' } },
    placeholderActor(),
  )
  assert.equal(nobody.ok ? '' : nobody.code, 'forbidden')
  const union = actor({
    roles: ['union'],
    organizations: [{ id: 'u1', name: 'Union', level: 'union', parentId: null }],
  })
  assert.ok(
    (await bus.dispatch({ type: 'EnterCooperative', payload: { cooperativeId: 'c1' } }, union)).ok,
  )
})

test('scenario D: opening a pool brings the first pledge and validates the parcel', async () => {
  const { svc } = fakeServices()
  const { bus } = createInteractionEngine({ teams: svc, land: svc, parcels: svc })
  const bad = await bus.dispatch(
    {
      type: 'OpenLandPool',
      payload: {
        title: 'Semis',
        crop: 'semis',
        startsOn: '2026-11-10',
        endsOn: '2026-11-20',
        parcelId: 'p1',
        amount: 4,
        unit: 'ha',
      },
    },
    producer,
  )
  assert.match(bad.ok ? '' : bad.error, /entre 0 et 3 ha/)
  const foreign = await bus.dispatch(
    {
      type: 'OpenLandPool',
      payload: {
        title: 'Semis',
        crop: 'semis',
        startsOn: '2026-11-10',
        endsOn: '2026-11-20',
        parcelId: 'px',
        amount: 1,
        unit: 'ha',
      },
    },
    producer,
  )
  assert.equal(foreign.ok ? '' : foreign.code, 'forbidden')
  const r = await bus.dispatch<LandAggregation>(
    {
      type: 'OpenLandPool',
      payload: {
        title: 'Semis de maïs',
        crop: 'semis',
        startsOn: '2026-11-10',
        endsOn: '2026-11-20',
        parcelId: 'p1',
        amount: 250,
        unit: 'are',
      },
    },
    producer,
  )
  assert.ok(r.ok)
  assert.equal(r.ok ? r.value.committedHa : 0, 2.5)
  assert.equal(r.ok ? r.value.joined : false, true)
})
