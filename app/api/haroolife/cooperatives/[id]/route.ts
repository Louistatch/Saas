// Tableau de bord d'une coopérative pour son bâtiment dans HarooLife. Lecture seule.
// Accès : membre de la coopérative, administrateur de son arbre, ou équipe plateforme.
// Les effectifs sont de vrais comptages ; la liste nominative n'est ouverte qu'aux
// administrateurs (route /members), jamais déduite ni inventée.
import type { Group } from '@/lib/haroolife/core'
import type { OrgRef } from '@/lib/haroolife/domain/actor'
import {
  type CooperativeDashboard,
  countByStatus,
  summarizeParcels,
} from '@/lib/haroolife/domain/cooperative'
import { fromBoardWork } from '@/lib/haroolife/domain/land-aggregation'
import { fromBoardGroup } from '@/lib/haroolife/domain/worker-group'
import { getAccessContext } from '@/lib/security/assert-access'
import { createClient as createAdminClient } from '@/lib/supabase/admin'
import { clientKeyFromHeaders, rateLimit } from '@/lib/utils/rate-limit'
import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

export const dynamic = 'force-dynamic'
const headers = { 'Cache-Control': 'private, no-store' }
type CoopRow = {
  id: string
  name: string
  level: string | null
  parent_id: string | null
  logo_url: string | null
}
const toOrg = (c: CoopRow): OrgRef => ({
  id: c.id,
  name: c.name,
  level:
    c.level === 'faitiere' || c.level === 'union' || c.level === 'cooperative' ? c.level : null,
  parentId: c.parent_id,
  logoUrl: c.logo_url,
})

/** Who may look inside: returns the access level or null. */
export async function cooperativeAccess(
  ctx: NonNullable<Awaited<ReturnType<typeof getAccessContext>>>,
  cooperativeId: string,
): Promise<'admin' | 'member' | null> {
  if (ctx.role === 'super_admin') return 'admin'
  if (ctx.role === 'cooperative_admin') {
    const { data } = await ctx.supabase.rpc('get_accessible_cooperative_ids')
    if (((data as string[] | null) ?? []).includes(cooperativeId)) return 'admin'
  }
  if (ctx.cooperativeId === cooperativeId) return 'member'
  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('email')
    .eq('id', ctx.userId)
    .maybeSingle<{ email: string }>()
  if (!profile) return null
  const { count } = await admin
    .from('members')
    .select('id', { count: 'exact', head: true })
    .eq('cooperative_id', cooperativeId)
    .ilike('email', profile.email)
    .is('deleted_at', null)
  return (count ?? 0) > 0 ? 'member' : null
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (process.env.HAROOLIFE_ENABLED !== 'true')
    return NextResponse.json({ error: 'HarooLife est en préparation.' }, { status: 503, headers })
  const { id } = await params
  if (!z.string().uuid().safeParse(id).success)
    return NextResponse.json({ error: 'Identifiant invalide' }, { status: 400, headers })
  const ctx = await getAccessContext()
  if (!ctx) return NextResponse.json({ error: 'Connexion requise' }, { status: 401, headers })
  if (
    !rateLimit(`haroolife-coop:${ctx.userId}:${clientKeyFromHeaders(request.headers)}`, 60, 60_000)
      .ok
  )
    return NextResponse.json({ error: 'Trop de demandes.' }, { status: 429, headers })
  const access = await cooperativeAccess(ctx, id)
  if (!access)
    return NextResponse.json(
      { error: 'Accès réservé aux membres de cette organisation.' },
      { status: 403, headers },
    )

  const admin = createAdminClient()
  const { data: coop } = await admin
    .from('cooperatives')
    .select('id, name, level, parent_id, logo_url')
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle<CoopRow>()
  if (!coop)
    return NextResponse.json({ error: 'Organisation introuvable' }, { status: 404, headers })

  // Lignée (union, faîtière) et enfants directs.
  const lineage: OrgRef[] = []
  let parent = coop.parent_id
  for (let i = 0; i < 3 && parent; i++) {
    const { data } = await admin
      .from('cooperatives')
      .select('id, name, level, parent_id, logo_url')
      .eq('id', parent)
      .maybeSingle<CoopRow>()
    if (!data) break
    lineage.push(toOrg(data))
    parent = data.parent_id
  }
  const { data: kids } = await admin
    .from('cooperatives')
    .select('id, name, level, parent_id, logo_url')
    .eq('parent_id', id)
    .is('deleted_at', null)
    .order('name')
    .limit(200)
  const children = ((kids ?? []) as CoopRow[]).map(toOrg)

  const { data: memberStatuses, count: membersTotal } = await admin
    .from('members')
    .select('status', { count: 'exact' })
    .eq('cooperative_id', id)
    .is('deleted_at', null)
    .limit(5000)
  const { data: parcels } = await admin
    .from('parcelles')
    .select('culture_principale, culture_name, superficie_ha')
    .eq('cooperative_id', id)
    .limit(5000)
  const { count: announcements } = await admin
    .from('producer_announcements')
    .select('id', { count: 'exact', head: true })
    .eq('cooperative_id', id)
    .neq('status', 'closed')

  // Regroupements du pilote rattachés à cette coopérative, avec leurs totaux réels.
  const { data: groupRows } = await admin
    .from('haroolife_groups')
    .select(
      'id, kind, title, activity, beneficiary, starts_on, ends_on, target, expires_at, cancelled_at, owner_id, canton_id, cantons(name)',
    )
    .eq('cooperative_id', id)
    .order('created_at', { ascending: false })
    .limit(50)
  const groups = (groupRows ?? []) as unknown as {
    id: string
    kind: 'team' | 'work'
    title: string
    activity: Group['activity']
    beneficiary: string | null
    starts_on: string
    ends_on: string
    target: number
    expires_at: string
    cancelled_at: string | null
    owner_id: string
    canton_id: string
    cantons: { name: string } | null
  }[]
  const sums = new Map<string, { total: number; people: number; joined: boolean }>()
  if (groups.length) {
    const { data: parts } = await admin
      .from('haroolife_participations')
      .select('group_id, user_id, amount')
      .in(
        'group_id',
        groups.map((g) => g.id),
      )
      .is('left_at', null)
    for (const p of (parts ?? []) as { group_id: string; user_id: string; amount: number }[]) {
      const s = sums.get(p.group_id) ?? { total: 0, people: 0, joined: false }
      s.total += Number(p.amount)
      s.people += 1
      if (p.user_id === ctx.userId) s.joined = true
      sums.set(p.group_id, s)
    }
  }
  const now = new Date()
  const asBoard = (g: (typeof groups)[number]): Group => {
    const s = sums.get(g.id) ?? { total: 0, people: 0, joined: false }
    return {
      id: g.id,
      kind: g.kind,
      title: g.title,
      beneficiary: g.beneficiary,
      activity: g.activity,
      starts_on: g.starts_on,
      ends_on: g.ends_on,
      target: Number(g.target),
      total: s.total,
      people: s.people,
      expires_at: g.expires_at,
      is_owner: g.owner_id === ctx.userId,
      joined: s.joined,
      state: g.cancelled_at
        ? 'cancelled'
        : new Date(g.expires_at) <= now
          ? 'expired'
          : s.total >= Number(g.target)
            ? 'ready'
            : 'open',
    }
  }
  const { data: pilot } = await admin
    .from('haroolife_pilot')
    .select('area_max')
    .maybeSingle<{ area_max: number }>()
  const boardPilot = {
    pilot: {
      canton: groups[0]?.cantons?.name ?? '',
      cooperative: coop.name,
      team_target: 0,
      area_target: 0,
      formation_hours: 0,
      area_max: pilot?.area_max ?? 0,
    },
  }
  const workerNeeds = groups
    .filter((g) => g.kind === 'team')
    .map((g) => fromBoardGroup(asBoard(g), now))
  const landGroups = groups
    .filter((g) => g.kind === 'work')
    .map((g) => fromBoardWork(asBoard(g), boardPilot, now))

  // Présence réelle : résidents visibles du jeu dont le compte est membre de la coopérative.
  let online = 0
  const { data: residents } = await admin
    .from('haroolife_residents')
    .select('user_id')
    .eq('visible', true)
    .limit(2000)
  const residentIds = ((residents ?? []) as { user_id: string }[]).map((r) => r.user_id)
  if (residentIds.length) {
    const { data: emails } = await admin.from('profiles').select('email').in('id', residentIds)
    const list = ((emails ?? []) as { email: string }[]).map((e) => e.email.toLowerCase())
    if (list.length) {
      const { count } = await admin
        .from('members')
        .select('id', { count: 'exact', head: true })
        .eq('cooperative_id', id)
        .is('deleted_at', null)
        .in('email', list)
      online = count ?? 0
    }
  }
  const { areaHa, crops } = summarizeParcels(
    (parcels ?? []) as {
      culture_principale: string | null
      culture_name: string | null
      superficie_ha: number | null
    }[],
  )
  const dashboard: CooperativeDashboard = {
    id: coop.id,
    name: coop.name,
    logoUrl: coop.logo_url,
    level: toOrg(coop).level,
    lineage,
    children,
    membersTotal: membersTotal ?? 0,
    canListMembers: access === 'admin',
    membersByStatus: countByStatus((memberStatuses ?? []) as { status: string }[]),
    areaHa,
    crops: crops.slice(0, 8),
    announcements: announcements ?? 0,
    workerNeeds,
    landGroups,
    activities: [
      ...workerNeeds.map((g) => ({ kind: 'team' as const, title: g.title, when: g.startsOn })),
      ...landGroups.map((g) => ({ kind: 'work' as const, title: g.title, when: g.startsOn })),
    ].slice(0, 10),
    online,
  }
  return NextResponse.json(dashboard, { headers })
}
