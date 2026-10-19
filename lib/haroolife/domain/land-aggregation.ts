/**
 * Land aggregation ("Regrouper nos parcelles"): a cooperative pools hectares for one
 * crop. Built on the existing pilot 'work' groups, whose target, ceiling and pledges are
 * validated by `haroolife_command` in the database. The client-side checks here mirror
 * those rules so the player gets an immediate, honest answer; the server stays the judge.
 */
import type { Board, Group } from '../core'
import type { GroupState } from './worker-group'

export type AreaUnit = 'ha' | 'are' | 'm2'
/** Everything is compared in hectares, rounded to 4 decimals like the database. */
export function toHectares(value: number, unit: AreaUnit): number {
  const ha = unit === 'ha' ? value : unit === 'are' ? value / 100 : value / 10000
  return Math.round(ha * 10000) / 10000
}

export interface Parcel {
  id: string
  cultureName: string | null
  areaHa: number
  cooperativeId: string
  /** The signed-in actor owns it (the backend re-checks ownership). */
  mine: boolean
}
export interface Pledge {
  parcelId: string
  amountHa: number
  startsOn: string
  endsOn: string
  groupId: string
}
export interface LandAggregation {
  id: string
  title: string
  crop: string
  cooperative: string
  canton: string
  startsOn: string
  endsOn: string
  targetHa: number
  maxHa: number
  /** Hectares pledged and accepted by the server (the only figure that counts). */
  committedHa: number
  remainingHa: number
  participants: number
  deadline: string
  state: GroupState
  isOwner: boolean
  joined: boolean
}

export function fromBoardWork(
  g: Group,
  board: Pick<Board, 'pilot'>,
  now = new Date(),
): LandAggregation {
  const today = now.toISOString().slice(0, 10)
  const maxHa = (board.pilot as { area_max?: number }).area_max ?? g.target
  let state: GroupState
  if (g.state === 'cancelled') state = 'CANCELLED'
  else if (g.state === 'expired') state = 'EXPIRED'
  else if (g.total >= g.target)
    state = g.ends_on < today ? 'COMPLETED' : g.starts_on <= today ? 'ACTIVE' : 'READY'
  else state = 'OPEN'
  return {
    id: g.id,
    title: g.title,
    crop: g.activity,
    cooperative: board.pilot.cooperative,
    canton: board.pilot.canton,
    startsOn: g.starts_on,
    endsOn: g.ends_on,
    targetHa: g.target,
    maxHa,
    committedHa: Math.round(g.total * 10000) / 10000,
    remainingHa: Math.max(0, Math.round((g.target - g.total) * 10000) / 10000),
    participants: g.people,
    deadline: g.expires_at,
    state,
    isOwner: g.is_owner,
    joined: g.joined,
  }
}

const overlaps = (
  a: { startsOn: string; endsOn: string },
  b: { startsOn: string; endsOn: string },
) => a.startsOn <= b.endsOn && a.endsOn >= b.startsOn

/** Client-side mirror of the database guards; the server remains the authority. */
export function validatePledge(args: {
  aggregation: LandAggregation
  parcel: Parcel
  amountHa: number
  /** Active pledges of the actor's parcels in other groups. */
  activePledges: Pledge[]
  cooperativeId: string
}): { ok: true } | { ok: false; reason: string } {
  const { aggregation: g, parcel, amountHa, activePledges, cooperativeId } = args
  if (g.state !== 'OPEN')
    return { ok: false, reason: 'Ce regroupement n’accepte plus de surfaces.' }
  if (parcel.cooperativeId !== cooperativeId || !parcel.mine)
    return { ok: false, reason: 'Cette parcelle n’est pas la vôtre dans cette coopérative.' }
  if (!Number.isFinite(amountHa) || amountHa <= 0)
    return { ok: false, reason: 'Indiquez une surface positive.' }
  if (Math.round(amountHa * 10000) / 10000 !== amountHa)
    return { ok: false, reason: 'Quatre décimales au plus (unité : hectare).' }
  if (amountHa > parcel.areaHa)
    return {
      ok: false,
      reason: `La parcelle ne fait que ${parcel.areaHa.toLocaleString('fr-FR')} ha.`,
    }
  if (g.committedHa + amountHa > g.maxHa)
    return { ok: false, reason: `Au-delà du maximum du regroupement (${g.maxHa} ha).` }
  if (g.joined) return { ok: false, reason: 'Vous participez déjà à ce regroupement.' }
  const clash = activePledges.find(
    (p) => p.parcelId === parcel.id && p.groupId !== g.id && overlaps(p, g),
  )
  if (clash) return { ok: false, reason: 'Cette parcelle est déjà engagée sur cette période.' }
  return { ok: true }
}

/** Progress of a pool, for the HUD and the 3D progress bar. */
export function progressOf(g: LandAggregation): number {
  return g.targetHa > 0 ? Math.min(1, g.committedHa / g.targetHa) : 0
}
