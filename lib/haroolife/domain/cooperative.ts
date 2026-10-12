/**
 * Cooperative dashboard: what a building shows inside. Pure aggregation helpers used by the
 * API route (server, from real rows) and by tests. Counts are counts of records; people are
 * never listed here beyond what the caller is allowed to see.
 */
import type { OrgRef } from './actor'
import type { LandAggregation } from './land-aggregation'
import type { WorkerGroup } from './worker-group'

export interface CropLine {
  name: string
  areaHa: number
  parcels: number
}
export interface MemberCard {
  id: string
  /** First name and last initial only. */
  name: string
  status: string
  canton: string | null
  hasCard: boolean
  cardStatus: 'ACTIVE' | 'SUSPENDED' | 'REVOKED' | 'EXPIRED' | 'NONE'
}
export interface MembersPage {
  items: MemberCard[]
  page: number
  pageSize: number
  total: number
}
export interface CooperativeDashboard {
  id: string
  name: string
  logoUrl: string | null
  level: OrgRef['level']
  /** Parents, nearest first (union, then federation). */
  lineage: OrgRef[]
  children: OrgRef[]
  membersTotal: number
  /** True when the viewer may open the member list. */
  canListMembers: boolean
  membersByStatus: { status: string; count: number }[]
  areaHa: number
  crops: CropLine[]
  announcements: number
  workerNeeds: WorkerGroup[]
  landGroups: LandAggregation[]
  activities: { kind: 'team' | 'work' | 'announcement'; title: string; when: string }[]
  /** Residents of the game currently visible and affiliated (never a fake presence). */
  online: number
}

export function summarizeParcels(
  rows: {
    culture_principale: string | null
    culture_name?: string | null
    superficie_ha: number | null
  }[],
): { areaHa: number; crops: CropLine[] } {
  const by = new Map<string, CropLine>()
  let areaHa = 0
  for (const r of rows) {
    const ha = Number(r.superficie_ha ?? 0)
    if (!Number.isFinite(ha) || ha <= 0) continue
    areaHa += ha
    const name = (r.culture_principale ?? r.culture_name ?? 'Autre').trim() || 'Autre'
    const line = by.get(name) ?? { name, areaHa: 0, parcels: 0 }
    line.areaHa += ha
    line.parcels += 1
    by.set(name, line)
  }
  const crops = [...by.values()]
    .map((c) => ({ ...c, areaHa: Math.round(c.areaHa * 100) / 100 }))
    .sort((a, b) => b.areaHa - a.areaHa)
  return { areaHa: Math.round(areaHa * 100) / 100, crops }
}
export function countByStatus(rows: { status: string }[]): { status: string; count: number }[] {
  const by = new Map<string, number>()
  for (const r of rows) by.set(r.status, (by.get(r.status) ?? 0) + 1)
  return [...by.entries()]
    .map(([status, count]) => ({ status, count }))
    .sort((a, b) => b.count - a.count)
}
/** Page of members, filtered by a case-insensitive name search, 20 per page. */
export function pageMembers(
  rows: MemberCard[],
  page: number,
  q: string,
  pageSize = 20,
): MembersPage {
  const needle = q.trim().toLowerCase()
  const filtered = needle ? rows.filter((m) => m.name.toLowerCase().includes(needle)) : rows
  const p = Math.max(1, Math.floor(page))
  return {
    items: filtered.slice((p - 1) * pageSize, p * pageSize),
    page: p,
    pageSize,
    total: filtered.length,
  }
}
/** Walks parent ids up to the root: nearest parent first. */
export function lineageOf(id: string, all: OrgRef[]): OrgRef[] {
  const byId = new Map(all.map((o) => [o.id, o]))
  const out: OrgRef[] = []
  let cur = byId.get(id)?.parentId ?? null
  const seen = new Set<string>([id])
  while (cur && !seen.has(cur)) {
    const o = byId.get(cur)
    if (!o) break
    out.push(o)
    seen.add(cur)
    cur = o.parentId
  }
  return out
}
