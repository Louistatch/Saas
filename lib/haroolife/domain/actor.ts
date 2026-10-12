/**
 * HarooLife domain — actors.
 *
 * An actor is a real account seen through the game: identity, roles, organisations,
 * skills, availability, cards and capabilities. Roles are composed, never a class
 * hierarchy: one account can be a cooperative member, an agricultural worker and a
 * buyer at once. The specialised "actors" (ProducerActor, WorkerActor, …) are facets
 * derived from the same record. No contact data lives here, and nothing here renders:
 * the 3D world asks `AvatarRenderer` (services.ts) for a drawable description.
 */
import type { Role } from '../world'

export type OrgLevel = 'faitiere' | 'union' | 'cooperative'
export interface OrgRef {
  id: string
  name: string
  level: OrgLevel | null
  parentId: string | null
  logoUrl?: string | null
}
export type CardStatus = 'ACTIVE' | 'SUSPENDED' | 'REVOKED' | 'EXPIRED' | 'NONE'
export interface CardRef {
  kind: 'member' | 'haroo'
  number: string | null
  status: CardStatus
  /** Public verification path of the existing card system, when the card has a number. */
  verifyPath: string | null
  validUntil: string | null
}
export type Availability = 'available' | 'unavailable' | 'unknown'
export type HarooType = 'ouvrier' | 'acheteur' | 'agronome'

export interface Actor {
  /** Stable account id (auth user id). */
  id: string
  /** Name shown in the world (chosen display name, else first name and initial). */
  displayName: string
  roles: Role[]
  harooType: HarooType | null
  /** Agronomists must be validated to organise teams. */
  validated: boolean
  organizations: OrgRef[]
  /** Organisations the actor administers (own cooperative, or its tree for unions/federations). */
  administers: string[]
  canton: { id: string; name: string } | null
  skills: string[]
  availability: Availability
  visible: boolean
  cards: CardRef[]
  /** Parcels the actor may act on (ids only; details come from ParcelService). */
  parcelIds: string[]
}

export type Capability =
  | 'set-availability'
  | 'show-skills'
  | 'search-jobs'
  | 'join-team'
  | 'view-open-groups'
  | 'enter-cooperative'
  | 'answer-recruitment'
  | 'follow-missions'
  | 'view-parcels'
  | 'view-crops'
  | 'join-land-group'
  | 'request-workers'
  | 'prepare-presale'
  | 'request-agronomist'
  | 'view-member-card'
  | 'search-products'
  | 'view-offers'
  | 'contact-producer'
  | 'propose-deal'
  | 'follow-deals'
  | 'view-missions'
  | 'propose-support'
  | 'organise-team'
  | 'organise-training'
  | 'view-members'
  | 'manage-cooperative'
  | 'browse-hierarchy'

const BY_ROLE: Record<Role, Capability[]> = {
  ouvrier: [
    'set-availability',
    'show-skills',
    'search-jobs',
    'join-team',
    'view-open-groups',
    'enter-cooperative',
    'answer-recruitment',
    'follow-missions',
    'view-member-card',
  ],
  producteur: [
    'view-parcels',
    'view-crops',
    'join-land-group',
    'request-workers',
    'prepare-presale',
    'request-agronomist',
    'enter-cooperative',
    'view-member-card',
    'view-open-groups',
  ],
  acheteur: [
    'search-products',
    'view-offers',
    'contact-producer',
    'propose-deal',
    'follow-deals',
    'view-member-card',
  ],
  agronome: [
    'view-missions',
    'propose-support',
    'organise-training',
    'contact-producer',
    'view-member-card',
    'view-open-groups',
  ],
  admin_coop: [
    'enter-cooperative',
    'view-members',
    'manage-cooperative',
    'request-workers',
    'view-open-groups',
    'view-parcels',
  ],
  union: ['enter-cooperative', 'view-members', 'browse-hierarchy', 'view-open-groups'],
  faitiere: ['enter-cooperative', 'view-members', 'browse-hierarchy', 'view-open-groups'],
  operateur: ['enter-cooperative', 'view-members', 'browse-hierarchy'],
  equipe: ['enter-cooperative', 'view-members', 'browse-hierarchy', 'view-open-groups'],
}

/** Capabilities are the union of what each role allows, plus validated-only powers. */
export function capabilitiesOf(a: Actor): Set<Capability> {
  const out = new Set<Capability>()
  for (const r of a.roles) for (const c of BY_ROLE[r] ?? []) out.add(c)
  if (a.roles.includes('agronome') && a.validated) out.add('organise-team')
  if (a.organizations.length === 0) out.delete('enter-cooperative')
  return out
}
export const can = (a: Actor, c: Capability) => capabilitiesOf(a).has(c)

/** Facets: the specialised actors, as views over the same record. */
export interface Facet {
  kind:
    | 'producer'
    | 'worker'
    | 'buyer'
    | 'agronomist'
    | 'cooperative'
    | 'union'
    | 'federation'
    | 'operator'
    | 'service-provider'
  label: string
  capabilities: Capability[]
}
const FACET_ROLE: [Role, Facet['kind'], string][] = [
  ['producteur', 'producer', 'Producteur'],
  ['ouvrier', 'worker', 'Ouvrier agricole'],
  ['acheteur', 'buyer', 'Acheteur'],
  ['agronome', 'agronomist', 'Agronome'],
  ['admin_coop', 'cooperative', 'Coopérative'],
  ['union', 'union', 'Union'],
  ['faitiere', 'federation', 'Faîtière'],
  ['operateur', 'operator', 'Opérateur de zone'],
  ['equipe', 'service-provider', 'Équipe FaîtiereHub'],
]
export function facetsOf(a: Actor): Facet[] {
  const caps = capabilitiesOf(a)
  return FACET_ROLE.filter(([r]) => a.roles.includes(r)).map(([r, kind, label]) => ({
    kind,
    label,
    capabilities: (BY_ROLE[r] ?? []).filter((c) => caps.has(c)),
  }))
}
export const ProducerActor = (a: Actor) => facetsOf(a).find((f) => f.kind === 'producer') ?? null
export const WorkerActor = (a: Actor) => facetsOf(a).find((f) => f.kind === 'worker') ?? null
export const BuyerActor = (a: Actor) => facetsOf(a).find((f) => f.kind === 'buyer') ?? null
export const AgronomistActor = (a: Actor) =>
  facetsOf(a).find((f) => f.kind === 'agronomist') ?? null
export const CooperativeActor = (a: Actor) =>
  facetsOf(a).find((f) => f.kind === 'cooperative') ?? null
export const UnionActor = (a: Actor) => facetsOf(a).find((f) => f.kind === 'union') ?? null
export const FederationActor = (a: Actor) =>
  facetsOf(a).find((f) => f.kind === 'federation') ?? null
export const OperatorActor = (a: Actor) => facetsOf(a).find((f) => f.kind === 'operator') ?? null
export const ServiceProviderActor = (a: Actor) =>
  facetsOf(a).find((f) => f.kind === 'service-provider') ?? null

/** The organisation an actor "belongs to" first: own cooperative, else first affiliation. */
export function primaryOrganization(a: Actor): OrgRef | null {
  return a.organizations.find((o) => o.level === 'cooperative') ?? a.organizations[0] ?? null
}
/** A short public display name from first and last names (never the full last name). */
export function publicName(
  first: string | null,
  last: string | null,
  fallback = 'Habitant',
): string {
  const f = (first ?? '').trim()
  const l = (last ?? '').trim()
  if (!f && !l) return fallback
  return l ? `${f || l} ${f ? `${l[0].toUpperCase()}.` : ''}`.trim() : f
}
export function placeholderActor(id = 'anonymous'): Actor {
  return {
    id,
    displayName: 'Visiteur',
    roles: [],
    harooType: null,
    validated: false,
    organizations: [],
    administers: [],
    canton: null,
    skills: [],
    availability: 'unknown',
    visible: false,
    cards: [],
    parcelIds: [],
  }
}
