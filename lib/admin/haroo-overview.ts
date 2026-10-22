// Vue d'ensemble Haroo du centre de pilotage : qui est inscrit, qui a une carte, ce qui bouge.
// Fonction pure : la route lit les tables, ce module compte et classe. Aucun téléphone ni
// e-mail n'en sort.

import { type CardPublicStatus, computeCardStatus } from '@/lib/professionals/core'

export type HarooKind = 'ouvrier' | 'acheteur' | 'agronome'

export interface ProfileRow {
  user_id: string
  first_name: string | null
  last_name: string | null
  card_number: string | null
  created_at: string | null
  /** Agronome uniquement. */
  statut_validation?: string | null
  profession?: string | null
  faitiere_id?: string | null
  /** Ouvrier uniquement. */
  disponible?: boolean | null
  /** Acheteur uniquement. */
  type_acheteur?: string | null
}

export interface CardRow {
  card_number: string
  status: string
  expiry_date: string | null
  revoked_at: string | null
  created_at: string | null
}

export interface OverviewInput {
  ouvriers: ProfileRow[]
  acheteurs: ProfileRow[]
  agronomes: ProfileRow[]
  /** Comptes marqués is_demo dans profiles. */
  demoUserIds: Set<string>
  cards: CardRow[]
  faitieres: Map<string, string>
  missions: { statut: string | null; accepted_at: string | null; created_at: string | null }[]
  jobsOpen: number
  presalesOpen: number
  announcements: { type: string | null }[]
  now?: Date
}

export interface Person {
  name: string
  kind: HarooKind
  status: string
  card: { number: string; status: CardPublicStatus; issuedAt: string | null } | null
  faitiere: string | null
  signedUpAt: string | null
  demo: boolean
}

export interface Alert {
  key: string
  text: string
  href: string
}

export interface HarooOverview {
  totals: Record<HarooKind, { all: number; demo: number }>
  agronomes: { pending: number; validated: number; rejected: number }
  cards: { issued: number } & Record<CardPublicStatus, number>
  holders: Person[]
  people: Person[]
  activity: {
    missions: { requested: number; inProgress: number; done: number; stalled: number }
    jobsOpen: number
    presalesOpen: number
    announcements: { job: number; prevente: number; mission: number; other: number }
  }
  alerts: Alert[]
}

/** Une mission « en cours » depuis plus longtemps est signalée comme bloquée. */
export const STALLED_DAYS = 30
const DAY = 86_400_000

const VALIDATION_LABEL: Record<string, string> = {
  VALIDE: 'Validé',
  EN_ATTENTE: 'Dossier en attente',
  REJETE: 'Dossier rejeté',
}

function fullName(row: ProfileRow): string {
  const name = [row.first_name, row.last_name]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(' ')
  return name || 'Sans nom'
}

function statusOf(kind: HarooKind, row: ProfileRow): string {
  if (kind === 'agronome') {
    return VALIDATION_LABEL[row.statut_validation ?? ''] ?? 'Dossier non déposé'
  }
  if (kind === 'ouvrier') return row.disponible === false ? 'Indisponible' : 'Disponible'
  const type = row.type_acheteur?.trim().toLowerCase()
  return type ? type.charAt(0).toUpperCase() + type.slice(1) : 'Type non précisé'
}

const plural = (n: number, one: string, many: string) => `${n} ${n > 1 ? many : one}`

export function summarizeHaroo(input: OverviewInput): HarooOverview {
  const now = input.now ?? new Date()
  const cardByNumber = new Map(input.cards.map((c) => [c.card_number, c]))
  const groups: [HarooKind, ProfileRow[]][] = [
    ['ouvrier', input.ouvriers],
    ['acheteur', input.acheteurs],
    ['agronome', input.agronomes],
  ]

  const totals = {
    ouvrier: { all: 0, demo: 0 },
    acheteur: { all: 0, demo: 0 },
    agronome: { all: 0, demo: 0 },
  }
  const people: Person[] = []
  for (const [kind, rows] of groups) {
    for (const row of rows) {
      const demo = input.demoUserIds.has(row.user_id)
      totals[kind].all++
      if (demo) totals[kind].demo++
      const card = row.card_number ? cardByNumber.get(row.card_number) : undefined
      people.push({
        name: fullName(row),
        kind,
        status: statusOf(kind, row),
        card:
          row.card_number && card
            ? {
                number: row.card_number,
                status: computeCardStatus(card, now),
                issuedAt: card.created_at,
              }
            : null,
        faitiere: row.faitiere_id ? (input.faitieres.get(row.faitiere_id) ?? null) : null,
        signedUpAt: row.created_at,
        demo,
      })
    }
  }

  // Les vrais comptes d'abord, puis ceux qui ont une carte, puis les plus récents.
  people.sort(
    (a, b) =>
      Number(a.demo) - Number(b.demo) ||
      Number(Boolean(b.card)) - Number(Boolean(a.card)) ||
      (b.signedUpAt ?? '').localeCompare(a.signedUpAt ?? ''),
  )

  const agronomes = { pending: 0, validated: 0, rejected: 0 }
  for (const row of input.agronomes) {
    if (row.statut_validation === 'EN_ATTENTE') agronomes.pending++
    else if (row.statut_validation === 'VALIDE') agronomes.validated++
    else if (row.statut_validation === 'REJETE') agronomes.rejected++
  }

  const cards = { issued: 0, ACTIVE: 0, SUSPENDED: 0, REVOKED: 0, EXPIRED: 0 }
  const holders = people.filter((p) => p.card)
  for (const holder of holders) {
    cards.issued++
    if (holder.card) cards[holder.card.status]++
  }

  const missions = { requested: 0, inProgress: 0, done: 0, stalled: 0 }
  for (const m of input.missions) {
    if (m.statut === 'DEMANDE') missions.requested++
    else if (m.statut === 'EN_COURS') {
      missions.inProgress++
      const since = Date.parse(m.accepted_at ?? m.created_at ?? '')
      if (Number.isFinite(since) && now.getTime() - since > STALLED_DAYS * DAY) missions.stalled++
    } else if (m.statut === 'TERMINEE') missions.done++
  }

  const announcements = { job: 0, prevente: 0, mission: 0, other: 0 }
  for (const a of input.announcements) {
    if (a.type === 'job' || a.type === 'prevente' || a.type === 'mission') announcements[a.type]++
    else announcements.other++
  }

  const alerts: Alert[] = []
  if (agronomes.pending > 0) {
    alerts.push({
      key: 'pending',
      text: `${plural(agronomes.pending, 'dossier d’agronome attend', 'dossiers d’agronome attendent')} votre validation.`,
      href: '/admin/haroo',
    })
  }
  const validatedWithoutCard = input.agronomes.filter(
    (row) => row.statut_validation === 'VALIDE' && !row.card_number,
  ).length
  if (validatedWithoutCard > 0) {
    alerts.push({
      key: 'no-card',
      text: `${plural(validatedWithoutCard, 'agronome validé n’a', 'agronomes validés n’ont')} pas encore de carte.`,
      href: '/admin/haroo',
    })
  }
  if (missions.stalled > 0) {
    alerts.push({
      key: 'stalled',
      text: `${plural(missions.stalled, 'mission est', 'missions sont')} « en cours » depuis plus de ${STALLED_DAYS} jours.`,
      href: '/admin/haroo',
    })
  }

  return {
    totals,
    agronomes,
    cards,
    holders,
    people,
    activity: {
      missions,
      jobsOpen: input.jobsOpen,
      presalesOpen: input.presalesOpen,
      announcements,
    },
    alerts,
  }
}
