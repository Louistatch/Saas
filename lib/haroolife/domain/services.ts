/**
 * Service contracts of the HarooLife domain, the in-memory actor registry, the adapter
 * that maps business entities onto the 3D world, and the avatar renderer that turns an
 * actor into a drawable description. Implementations against the real backend live in
 * `http.ts` (browser) and the API routes (server).
 */
import type { Lot } from '../city/world'
import { hash } from '../city/world'
import type { Actor, OrgRef } from './actor'
import type { CooperativeDashboard, MembersPage } from './cooperative'
import type { LandAggregation, Parcel } from './land-aggregation'
import type { WorkerGroup } from './worker-group'

export interface IdentityAdapter {
  /** The signed-in actor, or null when offline / signed out. */
  me(): Promise<Actor | null>
}
export interface RoleCapabilityService {
  capabilities(actor: Actor): Set<string>
}
export interface OrganizationService {
  dashboard(cooperativeId: string): Promise<CooperativeDashboard>
  children(cooperativeId: string): Promise<OrgRef[]>
}
export interface CooperativeMembershipService {
  members(cooperativeId: string, opts: { page: number; q: string }): Promise<MembersPage>
}
export interface ParcelService {
  mine(): Promise<Parcel[]>
}
export interface WorkerAggregationService {
  open(): Promise<WorkerGroup[]>
  create(input: {
    title: string
    activity: string
    startsOn: string
    endsOn: string
    beneficiary?: string
  }): Promise<WorkerGroup>
  join(groupId: string): Promise<WorkerGroup>
  leave(groupId: string): Promise<WorkerGroup>
}
export interface LandAggregationService {
  openPools(): Promise<LandAggregation[]>
  pledge(groupId: string, parcelId: string, amountHa: number): Promise<LandAggregation>
}
export interface Offer {
  id: string
  culture: string
  quantityKg: number | null
  pricePerKg: number | null
  canton: string | null
  title: string
  kind: 'presale' | 'announcement'
  contactPath: string | null
}
export interface MarketInteractionService {
  offers(filter: { culture?: string; canton?: string }): Promise<Offer[]>
}

/** Actors known to this session, by id, with a short freshness window. */
export class ActorRegistry {
  private map = new Map<string, { actor: Actor; at: number }>()
  constructor(private ttlMs = 60_000) {}
  get(id: string, now = Date.now()): Actor | null {
    const e = this.map.get(id)
    if (!e) return null
    if (now - e.at > this.ttlMs) {
      this.map.delete(id)
      return null
    }
    return e.actor
  }
  put(actor: Actor, now = Date.now()) {
    this.map.set(actor.id, { actor, at: now })
  }
  size() {
    return this.map.size
  }
}

/** Where business entities live in the city. Deterministic, no persistence needed. */
export class GameWorldAdapter {
  constructor(private cooperativeLots: Lot[]) {}
  /** The building that stands for an organisation: stable per id. */
  lotForOrganization(org: Pick<OrgRef, 'id'>): Lot | null {
    if (this.cooperativeLots.length === 0) return null
    let h = 0
    for (let i = 0; i < org.id.length; i++) h = (h * 31 + org.id.charCodeAt(i)) >>> 0
    return this.cooperativeLots[
      Math.floor(hash(h & 0xffff, h >>> 16, 5) * this.cooperativeLots.length)
    ]
  }
  /** Organisations shown on a given building (the viewer's own are listed first). */
  organizationsAt(lot: Lot, orgs: OrgRef[]): OrgRef[] {
    return orgs.filter((o) => this.lotForOrganization(o)?.id === lot.id)
  }
}

export interface AvatarSpec {
  model: string
  pagne: number
  label: string
  /** Role icon, for the label pill. */
  badge: string
}
/** From an actor to a drawable figure: never contact data, never the full last name. */
export const AvatarRenderer = {
  describe(a: Pick<Actor, 'id' | 'displayName' | 'roles' | 'harooType'>, pagne = 1): AvatarSpec {
    const models = [
      'character-female-a',
      'character-female-b',
      'character-female-c',
      'character-male-a',
      'character-male-b',
      'character-male-c',
    ]
    let h = 0
    for (let i = 0; i < a.id.length; i++) h = (h * 31 + a.id.charCodeAt(i)) >>> 0
    const badge = a.roles.includes('producteur')
      ? '🌾'
      : a.roles.includes('ouvrier')
        ? '🛠️'
        : a.roles.includes('acheteur')
          ? '🧺'
          : a.roles.includes('agronome')
            ? '🎓'
            : a.roles.length
              ? '🏛️'
              : '🙂'
    return { model: models[h % models.length], pagne, label: a.displayName, badge }
  },
}
