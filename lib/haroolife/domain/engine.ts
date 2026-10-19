/**
 * Interaction engine: the command handlers of the HarooLife world. A building is a point
 * of interaction; the UI dispatches a command, the handler checks the actor's capabilities
 * and the client-side mirrors of the rules, calls the real service (which hits
 * `haroolife_command` in the database, the only authority), then emits domain events.
 * Nothing in here renders or touches PlayCanvas.
 */
import type { Actor } from './actor'
import { can } from './actor'
import {
  type Command,
  type CooperativeEntered,
  DomainCommandBus,
  DomainEventDispatcher,
  type LandPledged,
  type Result,
} from './bus'
import {
  type AreaUnit,
  type LandAggregation,
  type Parcel,
  toHectares,
  validatePledge,
} from './land-aggregation'
import type { LandAggregationService, ParcelService, WorkerAggregationService } from './services'
import { type WorkerGroup, canJoin, canRecruit, eventsBetween } from './worker-group'

export type RecruitTeam = Command<
  'RecruitTeam',
  { title: string; activity: string; startsOn: string; endsOn: string; beneficiary?: string }
>
export type JoinTeam = Command<'JoinTeam', { groupId: string }>
export type LeaveTeam = Command<'LeaveTeam', { groupId: string }>
export type OpenLandPool = Command<
  'OpenLandPool',
  {
    title: string
    crop: string
    startsOn: string
    endsOn: string
    parcelId: string
    amount: number
    unit: AreaUnit
  }
>
export type PledgeLand = Command<
  'PledgeLand',
  { groupId: string; parcelId: string; amount: number; unit: AreaUnit }
>
export type EnterCooperative = Command<'EnterCooperative', { cooperativeId: string }>

export interface EngineServices {
  teams: WorkerAggregationService
  land: LandAggregationService
  parcels: ParcelService
}

const fail = <T>(error: string, code: 'forbidden' | 'invalid' | 'conflict'): Result<T> => ({
  ok: false,
  error,
  code,
})

/** Builds the bus with every handler registered. `events` is shared with the HUD and scene. */
export function createInteractionEngine(
  services: EngineServices,
  events: DomainEventDispatcher = new DomainEventDispatcher(),
) {
  const bus = new DomainCommandBus(events)

  bus.register<RecruitTeam, WorkerGroup>('RecruitTeam', async (cmd, actor) => {
    if (!canRecruit(actor))
      return fail(
        'Seuls les producteurs, administrateurs et agronomes validés recrutent.',
        'forbidden',
      )
    const p = cmd.payload
    if (p.title.trim().length < 3)
      return fail('Donnez un titre d’au moins 3 caractères.', 'invalid')
    if (p.endsOn < p.startsOn) return fail('La fin précède le début.', 'invalid')
    const group = await services.teams.create({
      title: p.title.trim(),
      activity: p.activity,
      startsOn: p.startsOn,
      endsOn: p.endsOn,
      beneficiary: p.beneficiary?.trim() || undefined,
    })
    for (const e of eventsBetween(null, group)) events.emit(e)
    return { ok: true, value: group }
  })

  bus.register<JoinTeam, WorkerGroup>(
    'JoinTeam',
    async (cmd, actor) => {
      const before = (await services.teams.open()).find((g) => g.id === cmd.payload.groupId)
      if (!before) return fail('Équipe introuvable ou fermée.', 'invalid')
      const check = canJoin(before, actor)
      if (!check.ok) return fail(check.reason ?? 'Impossible de rejoindre.', 'conflict')
      const after = await services.teams.join(before.id)
      for (const e of eventsBetween(before, after)) events.emit(e)
      return { ok: true, value: after }
    },
    'join-team',
  )

  bus.register<LeaveTeam, WorkerGroup>('LeaveTeam', async (cmd) => {
    const before = (await services.teams.open()).find((g) => g.id === cmd.payload.groupId) ?? null
    const after = await services.teams.leave(cmd.payload.groupId)
    for (const e of eventsBetween(before, after)) events.emit(e)
    return { ok: true, value: after }
  })

  const findParcel = async (id: string, actor: Actor): Promise<Parcel | null> => {
    const mine = await services.parcels.mine()
    const p = mine.find((x) => x.id === id) ?? null
    if (p && !actor.parcelIds.includes(p.id) && actor.parcelIds.length > 0) return null
    return p
  }

  bus.register<PledgeLand, LandAggregation>(
    'PledgeLand',
    async (cmd, actor) => {
      const { groupId, parcelId, amount, unit } = cmd.payload
      const amountHa = toHectares(amount, unit)
      const pool = (await services.land.openPools()).find((g) => g.id === groupId)
      if (!pool) return fail('Regroupement introuvable.', 'invalid')
      const parcel = await findParcel(parcelId, actor)
      if (!parcel) return fail('Choisissez une de vos parcelles.', 'forbidden')
      const check = validatePledge({
        aggregation: pool,
        parcel,
        amountHa,
        activePledges: [],
        cooperativeId: parcel.cooperativeId,
      })
      if (!check.ok) return fail(check.reason, 'conflict')
      const after = await services.land.pledge(groupId, parcelId, amountHa)
      events.emit<LandPledged>({
        type: 'LandPledged',
        payload: { groupId, parcelId, amountHa, committedHa: after.committedHa },
      })
      return { ok: true, value: after }
    },
    'join-land-group',
  )

  bus.register<OpenLandPool, LandAggregation>(
    'OpenLandPool',
    async (cmd, actor) => {
      const p = cmd.payload
      const amountHa = toHectares(p.amount, p.unit)
      const parcel = await findParcel(p.parcelId, actor)
      if (!parcel) return fail('Choisissez une de vos parcelles.', 'forbidden')
      if (!(amountHa > 0) || amountHa > parcel.areaHa)
        return fail(`Indiquez une surface entre 0 et ${parcel.areaHa} ha.`, 'invalid')
      if (p.title.trim().length < 3)
        return fail('Donnez un titre d’au moins 3 caractères.', 'invalid')
      if (p.endsOn < p.startsOn) return fail('La fin précède le début.', 'invalid')
      const pool = await services.land.createPool({
        title: p.title.trim(),
        crop: p.crop,
        startsOn: p.startsOn,
        endsOn: p.endsOn,
        parcelId: p.parcelId,
        amountHa,
      })
      events.emit<LandPledged>({
        type: 'LandPledged',
        payload: {
          groupId: pool.id,
          parcelId: p.parcelId,
          amountHa,
          committedHa: pool.committedHa,
        },
      })
      return { ok: true, value: pool }
    },
    'join-land-group',
  )

  bus.register<EnterCooperative, { cooperativeId: string }>(
    'EnterCooperative',
    async (cmd, actor) => {
      if (
        !can(actor, 'browse-hierarchy') &&
        !actor.organizations.some((o) => o.id === cmd.payload.cooperativeId)
      )
        return fail('Vous n’êtes pas rattaché à cette organisation.', 'forbidden')
      events.emit<CooperativeEntered>({ type: 'CooperativeEntered', payload: cmd.payload })
      return { ok: true, value: cmd.payload }
    },
    'enter-cooperative',
  )

  return { bus, events }
}
export type InteractionEngine = ReturnType<typeof createInteractionEngine>
