import {
  authorizationSchema,
  availabilitySchema,
  productSchema,
  qualificationSchema,
  transitionSchema,
} from '@/lib/ce-it/schema'
import { enabled, failure, json, unavailable } from '@/lib/ce-it/server'
import { assertAuthenticated } from '@/lib/security/assert-access'
import { applyRateLimit } from '@/lib/utils/rate-limit-persistent'
import type { NextRequest } from 'next/server'
import { z } from 'zod'

export async function GET() {
  if (!enabled()) return unavailable()
  const guard = await assertAuthenticated()
  if (!guard.ok) return guard.response
  // Session client, never admin: RLS is the second authorization layer.
  const db = guard.ctx.supabase
  const workspace = await db.rpc('ceit_workspace')
  const result = await db
    .from('ceit_products')
    .select(
      'id,title,owner_kind,culture,skills,published_version_id,created_at,ceit_versions:ceit_versions!ceit_versions_product_id_fkey(id,number,state,created_by,payload,ceit_reviews(decision,notes))',
    )
    .order('created_at', { ascending: false })
    .is('archived_at', null)
    .limit(30)
    .limit(5, { referencedTable: 'ceit_versions' })
    .order('number', { referencedTable: 'ceit_versions', ascending: false })
  const missions = await db
    .from('ceit_missions')
    .select('id,scope,status,expires_at')
    .order('created_at', { ascending: false })
    .limit(100)
  if (result.error || missions.error || workspace.error)
    return failure(result.error ?? missions.error ?? workspace.error)
  return json({
    products: result.data ?? [],
    missions: missions.data ?? [],
    admin: guard.ctx.role === 'super_admin',
    workspace: workspace.data,
  })
}
export async function POST(request: NextRequest) {
  if (!enabled()) return unavailable()
  const guard = await assertAuthenticated()
  if (!guard.ok) return guard.response
  const limited = await applyRateLimit(request, 'verify')
  if (limited) return limited
  const raw = await request.json().catch(() => null)
  const command = z
    .object({
      action: z.enum([
        'create',
        'authorize',
        'qualify',
        'contributor',
        'transition',
        'archive',
        'availability',
        'respond',
      ]),
      data: z.unknown(),
    })
    .strict()
    .safeParse(raw)
  if (!command.success) return json({ error: 'Commande invalide.' }, 400)
  const { action, data } = command.data
  try {
    const db = guard.ctx.supabase
    let result: { data: unknown; error: unknown }
    if (action === 'create') {
      const v = productSchema.parse(data)
      result = await db.rpc('ceit_create_product', {
        k: v.owner_kind,
        f: v.faitiere_id,
        o: v.operator_id,
        t: v.title,
        c: v.culture,
        s: v.skills,
        r: v.region_id,
        p: v.prefecture_id,
        z: v.canton_id,
      })
    } else if (action === 'authorize') {
      const v = authorizationSchema.parse(data)
      result = await db.rpc('ceit_authorize', {
        kind: v.kind,
        target: v.target,
        until_at: v.until,
        faitiere: v.faitiere,
        revoked: v.revoked,
      })
    } else if (action === 'qualify') {
      const v = qualificationSchema.parse(data)
      result = await db.rpc('ceit_qualify_agronome', {
        agronome: v.agronome_id,
        cultures: v.cultures,
        skills: v.skills,
        revoked: v.revoked,
      })
    } else if (action === 'contributor') {
      const v = z
        .object({
          product: z.string().uuid(),
          agronome: z.string().uuid(),
          revoked: z.boolean().default(false),
        })
        .strict()
        .parse(data)
      result = await db.rpc('ceit_add_contributor', v)
    } else if (action === 'transition') {
      const v = transitionSchema.extend({ version: z.string().uuid() }).parse(data)
      result = await db.rpc('ceit_transition', v)
    } else if (action === 'archive') {
      const v = z.object({ product: z.string().uuid() }).strict().parse(data)
      result = await db.rpc('ceit_archive', v)
    } else if (action === 'availability') {
      const v = availabilitySchema.parse(data)
      result = await db.rpc('ceit_set_availability', {
        is_available: v.available,
        offered_cultures: v.cultures,
        offered_skills: v.skills,
        capacity: v.capacity,
      })
    } else {
      const v = z
        .object({ mission: z.string().uuid(), decision: z.enum(['accept', 'decline', 'complete']) })
        .strict()
        .parse(data)
      result = await db.rpc('ceit_respond_mission', v)
    }
    if (result.error) throw result.error
    return json({ ok: true, result: result.data })
  } catch (e) {
    return failure(e)
  }
}
