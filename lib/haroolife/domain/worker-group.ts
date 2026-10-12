/**
 * Worker groups (team formation) with an explicit lifecycle on top of the existing pilot
 * board (`haroolife_board` / `haroolife_command`). The database keeps its four states
 * (open, ready, expired, cancelled); CONFIRMED, ACTIVE and COMPLETED are derived from the
 * dates, never written, until the production mechanism is extended on purpose.
 */
import type { Group } from '../core'
import type { Actor } from './actor'
import { can } from './actor'
import type { DomainEvent } from './bus'

export type GroupState =
  | 'DRAFT'
  | 'OPEN'
  | 'READY'
  | 'CONFIRMED'
  | 'ACTIVE'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'EXPIRED'
export const TRANSITIONS: Record<GroupState, GroupState[]> = {
  DRAFT: ['OPEN', 'CANCELLED'],
  OPEN: ['READY', 'CANCELLED', 'EXPIRED'],
  READY: ['CONFIRMED', 'OPEN', 'CANCELLED', 'EXPIRED'],
  CONFIRMED: ['ACTIVE', 'CANCELLED'],
  ACTIVE: ['COMPLETED', 'CANCELLED'],
  COMPLETED: [],
  CANCELLED: [],
  EXPIRED: [],
}
export const canTransition = (from: GroupState, to: GroupState) => TRANSITIONS[from].includes(to)

export interface WorkerGroup {
  id: string
  title: string
  activity: string
  beneficiary: string | null
  startsOn: string
  endsOn: string
  /** Workers wanted. */
  target: number
  /** Workers engaged (each worker counts 1). */
  engaged: number
  remaining: number
  /** Formation deadline. */
  deadline: string
  state: GroupState
  isOwner: boolean
  joined: boolean
}

const day = (d: Date) => d.toISOString().slice(0, 10)
/** Maps a board group to the lifecycle, deriving the time-based states. */
export function fromBoardGroup(g: Group, now: Date = new Date()): WorkerGroup {
  const today = day(now)
  let state: GroupState
  if (g.state === 'cancelled') state = 'CANCELLED'
  else if (g.state === 'expired') state = 'EXPIRED'
  else if (g.state === 'ready' || g.total >= g.target) {
    if (g.ends_on < today) state = 'COMPLETED'
    else if (g.starts_on <= today) state = 'ACTIVE'
    else if (new Date(g.expires_at).getTime() <= now.getTime()) state = 'CONFIRMED'
    else state = 'READY'
  } else state = 'OPEN'
  return {
    id: g.id,
    title: g.title,
    activity: g.activity,
    beneficiary: g.beneficiary ?? null,
    startsOn: g.starts_on,
    endsOn: g.ends_on,
    target: g.target,
    engaged: Math.round(g.total),
    remaining: Math.max(0, g.target - Math.round(g.total)),
    deadline: g.expires_at,
    state,
    isOwner: g.is_owner,
    joined: g.joined,
  }
}
export const STATE_LABELS: Record<GroupState, string> = {
  DRAFT: 'Brouillon',
  OPEN: 'En constitution',
  READY: 'Effectif atteint',
  CONFIRMED: 'Confirmé',
  ACTIVE: 'En cours',
  COMPLETED: 'Terminé',
  CANCELLED: 'Annulé',
  EXPIRED: 'Délai dépassé',
}

/** Whether this actor may join (consent is theirs; the backend re-checks everything). */
export function canJoin(group: WorkerGroup, actor: Actor): { ok: boolean; reason?: string } {
  if (!can(actor, 'join-team')) return { ok: false, reason: 'Profil ouvrier requis.' }
  if (actor.availability !== 'available')
    return { ok: false, reason: 'Déclarez-vous disponible pour rejoindre une équipe.' }
  if (group.state !== 'OPEN') return { ok: false, reason: STATE_LABELS[group.state] }
  if (group.joined) return { ok: false, reason: 'Vous êtes déjà dans cette équipe.' }
  if (group.remaining <= 0) return { ok: false, reason: 'Équipe complète.' }
  return { ok: true }
}
/** Whether this actor may open a recruitment (producer, cooperative admin, validated agronomist). */
export function canRecruit(actor: Actor): boolean {
  return can(actor, 'request-workers') || can(actor, 'organise-team')
}

/** Events implied by a change of the same group (used after a command round-trip). */
export function eventsBetween(prev: WorkerGroup | null, next: WorkerGroup): DomainEvent[] {
  const at = Date.now()
  const out: DomainEvent[] = []
  if (!prev) {
    out.push({ type: 'WorkerGroupCreated', payload: { groupId: next.id }, at })
    return out
  }
  if (next.engaged > prev.engaged)
    out.push({ type: 'WorkerJoined', payload: { groupId: next.id, engaged: next.engaged }, at })
  if (next.engaged < prev.engaged)
    out.push({ type: 'WorkerLeft', payload: { groupId: next.id, engaged: next.engaged }, at })
  if (prev.state === 'OPEN' && (next.state === 'READY' || next.state === 'CONFIRMED'))
    out.push({ type: 'WorkerGroupReady', payload: { groupId: next.id }, at })
  if (prev.state !== 'EXPIRED' && next.state === 'EXPIRED')
    out.push({ type: 'WorkerGroupExpired', payload: { groupId: next.id }, at })
  return out
}
