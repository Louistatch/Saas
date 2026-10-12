/**
 * Command bus and event dispatcher. Every business action in the 3D world (and in the
 * classic screens) goes through a command; handlers call the real services and the
 * backend validates. Domain events fan out the results to whoever listens (HUD, scene,
 * notifications) without the scene knowing the rules.
 */
import type { Actor, Capability } from './actor'
import { can } from './actor'

export interface Command<T extends string = string, P = unknown> {
  type: T
  payload: P
  /** Idempotency key for the backend (uuid). */
  requestId?: string
}
export type Result<T = unknown> =
  | { ok: true; value: T }
  | { ok: false; error: string; code?: 'forbidden' | 'invalid' | 'conflict' | 'unavailable' }
export type Handler<C extends Command = Command, T = unknown> = (
  command: C,
  actor: Actor,
) => Promise<Result<T>>

export interface DomainEvent<T extends string = string, P = unknown> {
  type: T
  payload: P
  at: number
}
export type Listener<E extends DomainEvent = DomainEvent> = (event: E) => void

export class DomainEventDispatcher {
  private listeners = new Map<string, Set<Listener>>()
  on<E extends DomainEvent>(type: E['type'], fn: Listener<E>): () => void {
    const set = this.listeners.get(type) ?? new Set()
    set.add(fn as Listener)
    this.listeners.set(type, set)
    return () => set.delete(fn as Listener)
  }
  emit<E extends DomainEvent>(event: Omit<E, 'at'> & { at?: number }): E {
    const full = { ...event, at: event.at ?? Date.now() } as E
    for (const fn of this.listeners.get(event.type) ?? []) fn(full)
    for (const fn of this.listeners.get('*') ?? []) fn(full)
    return full
  }
}

export class DomainCommandBus {
  private handlers = new Map<string, { handler: Handler; requires?: Capability }>()
  constructor(readonly events: DomainEventDispatcher = new DomainEventDispatcher()) {}
  /** Registers a handler; `requires` is checked against the actor before it runs. */
  register<C extends Command, T>(type: C['type'], handler: Handler<C, T>, requires?: Capability) {
    this.handlers.set(type, { handler: handler as Handler, requires })
    return this
  }
  async dispatch<T = unknown>(command: Command, actor: Actor): Promise<Result<T>> {
    const entry = this.handlers.get(command.type)
    if (!entry) return { ok: false, error: `Commande inconnue : ${command.type}`, code: 'invalid' }
    if (entry.requires && !can(actor, entry.requires))
      return { ok: false, error: 'Action non autorisée pour ce profil.', code: 'forbidden' }
    try {
      return (await entry.handler(command, actor)) as Result<T>
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : 'Erreur', code: 'unavailable' }
    }
  }
  has(type: string) {
    return this.handlers.has(type)
  }
}

/** Domain events of the aggregation and cooperative features. */
export type WorkerGroupCreated = DomainEvent<'WorkerGroupCreated', { groupId: string }>
export type WorkerJoined = DomainEvent<'WorkerJoined', { groupId: string; engaged: number }>
export type WorkerLeft = DomainEvent<'WorkerLeft', { groupId: string; engaged: number }>
export type WorkerGroupReady = DomainEvent<'WorkerGroupReady', { groupId: string }>
export type WorkerGroupExpired = DomainEvent<'WorkerGroupExpired', { groupId: string }>
export type LandPledged = DomainEvent<
  'LandPledged',
  { groupId: string; parcelId: string; amountHa: number; committedHa: number }
>
export type CooperativeEntered = DomainEvent<'CooperativeEntered', { cooperativeId: string }>
