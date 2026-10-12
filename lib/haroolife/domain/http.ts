'use client'

/**
 * Browser adapters: the domain services implemented against the HarooLife API routes
 * (same-origin, HttpOnly session). Each call maps the server payload to domain objects;
 * nothing here applies a business rule.
 */
import type { Board, Group } from '../core'
import type { Actor, OrgRef } from './actor'
import type { CooperativeDashboard, MembersPage } from './cooperative'
import { type LandAggregation, type Parcel, fromBoardWork } from './land-aggregation'
import type {
  CooperativeMembershipService,
  IdentityAdapter,
  LandAggregationService,
  MarketInteractionService,
  Offer,
  OrganizationService,
  ParcelService,
  WorkerAggregationService,
} from './services'
import { type WorkerGroup, fromBoardGroup } from './worker-group'

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: 'no-store' })
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string }
    throw new Error(body.error ?? `Erreur ${res.status}`)
  }
  return (await res.json()) as T
}
async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = (await res.json().catch(() => ({}))) as T & { error?: string }
  if (!res.ok) throw new Error(data.error ?? `Erreur ${res.status}`)
  return data
}

export class HttpIdentityAdapter implements IdentityAdapter {
  async me(): Promise<Actor | null> {
    const res = await fetch('/api/haroolife/me', { cache: 'no-store' }).catch(() => null)
    if (!res || res.status === 401 || res.status === 503) return null
    if (!res.ok) return null
    return (await res.json().catch(() => null)) as Actor | null
  }
}
export class HttpOrganizationService implements OrganizationService, CooperativeMembershipService {
  dashboard(id: string) {
    return getJson<CooperativeDashboard>(`/api/haroolife/cooperatives/${encodeURIComponent(id)}`)
  }
  async children(id: string) {
    return (await this.dashboard(id)).children as OrgRef[]
  }
  members(id: string, opts: { page: number; q: string }) {
    const qs = new URLSearchParams({ page: String(opts.page), q: opts.q })
    return getJson<MembersPage>(
      `/api/haroolife/cooperatives/${encodeURIComponent(id)}/members?${qs}`,
    )
  }
}

const uuid = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random()}`

/** Worker teams and land pools share the pilot board and command endpoint. */
export class HttpAggregationService
  implements WorkerAggregationService, LandAggregationService, ParcelService
{
  private boardCache: Board | null = null
  async board(force = false): Promise<Board> {
    if (!force && this.boardCache) return this.boardCache
    this.boardCache = await getJson<Board>('/api/haroolife')
    return this.boardCache
  }
  private async command(action: string, payload: unknown): Promise<Board> {
    await postJson('/api/haroolife', { action, request_id: uuid(), payload })
    return this.board(true)
  }
  async open(): Promise<WorkerGroup[]> {
    const b = await this.board()
    return b.groups.filter((g) => g.kind === 'team').map((g) => fromBoardGroup(g))
  }
  async openPools(): Promise<LandAggregation[]> {
    const b = await this.board()
    return b.groups.filter((g) => g.kind === 'work').map((g) => fromBoardWork(g, b))
  }
  async create(input: {
    title: string
    activity: string
    startsOn: string
    endsOn: string
    beneficiary?: string
  }) {
    const b = await this.command('create', {
      kind: 'team',
      title: input.title,
      activity: input.activity,
      starts_on: input.startsOn,
      ends_on: input.endsOn,
      ...(input.beneficiary ? { beneficiary: input.beneficiary } : {}),
    })
    const g = b.groups.find((x) => x.title === input.title && x.kind === 'team') as Group
    return fromBoardGroup(g)
  }
  async join(groupId: string) {
    const b = await this.command('join', { group_id: groupId })
    return fromBoardGroup(b.groups.find((x) => x.id === groupId) as Group)
  }
  async leave(groupId: string) {
    const b = await this.command('leave', { group_id: groupId })
    return fromBoardGroup(b.groups.find((x) => x.id === groupId) as Group)
  }
  async pledge(groupId: string, parcelId: string, amountHa: number) {
    const b = await this.command('join', {
      group_id: groupId,
      parcel_id: parcelId,
      amount: amountHa,
    })
    return fromBoardWork(b.groups.find((x) => x.id === groupId) as Group, b)
  }
  async createPool(input: {
    title: string
    crop: string
    startsOn: string
    endsOn: string
    parcelId: string
    amountHa: number
  }) {
    const b = await this.command('create', {
      kind: 'work',
      title: input.title,
      activity: input.crop,
      starts_on: input.startsOn,
      ends_on: input.endsOn,
      parcel_id: input.parcelId,
      amount: input.amountHa,
    })
    const g = b.groups.find((x) => x.title === input.title && x.kind === 'work') as Group
    return fromBoardWork(g, b)
  }
  async mine(): Promise<Parcel[]> {
    const b = await this.board()
    return b.parcels.map((p) => ({
      id: p.id,
      cultureName: p.culture,
      areaHa: p.area,
      cooperativeId: '',
      mine: true,
    }))
  }
}
export class HttpMarketService implements MarketInteractionService {
  offers(filter: { culture?: string; canton?: string }) {
    const qs = new URLSearchParams()
    if (filter.culture) qs.set('culture', filter.culture)
    if (filter.canton) qs.set('canton', filter.canton)
    return getJson<Offer[]>(`/api/haroolife/market?${qs}`)
  }
}
