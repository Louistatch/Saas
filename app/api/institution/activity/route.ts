// Activité d'un opérateur : tout pour le gérant (filtrable par agent), la sienne pour un agent.

import { ACTIVITY_LABEL, roleAtLeast } from '@/lib/payg/model'
import { profileNames, requirePaygMember } from '@/lib/payg/server'
import { type NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const guard = await requirePaygMember(url.searchParams.get('partner_id'))
  if (!guard.ok) return guard.response
  const { ctx, membership } = guard
  const manager = roleAtLeast(membership.role, 'manager')
  let query = ctx.admin
    .from('partner_activity_log')
    .select('id, actor_id, action, cooperative_id, details, created_at, cooperatives(name)')
    .eq('partner_id', membership.partnerId)
    .order('created_at', { ascending: false })
    .limit(200)
  const agent = url.searchParams.get('agent_id')
  if (!manager) query = query.eq('actor_id', ctx.userId)
  else if (agent) query = query.eq('actor_id', agent)
  const { data } =
    await query.returns<
      {
        id: string
        actor_id: string | null
        action: string
        cooperative_id: string | null
        details: Record<string, unknown>
        created_at: string
        cooperatives: { name: string } | null
      }[]
    >()
  const names = await profileNames(
    ctx.admin,
    (data ?? []).map((r) => r.actor_id).filter((x): x is string => !!x),
  )
  return NextResponse.json({
    activity: (data ?? []).map((r) => ({
      id: r.id,
      at: r.created_at,
      action: r.action,
      label: ACTIVITY_LABEL[r.action] ?? r.action,
      actor: r.actor_id ? (names.get(r.actor_id)?.name ?? '') : 'FaîtièreHub',
      cooperative: r.cooperatives?.name ?? null,
      details: r.details,
    })),
  })
}
