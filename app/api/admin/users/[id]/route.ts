// Rôles d'un compte, côté serveur et journalisés (audit_logs).
//
// PATCH : rôle d'organisation, coopérative de rattachement, type Haroo.
//   - super_admin uniquement ;
//   - on ne retire pas son propre rôle super_admin, ni le dernier super_admin ;
//   - un type Haroo n'est posé qu'avec sa fiche métier (créée si absente, comme à
//     l'activation) ; changer de type ou le retirer ne supprime aucune donnée.
// GET : les 20 derniers changements de rôle de ce compte.
import { assertRole } from '@/lib/security/assert-access'
import { createClient as createAdminClient } from '@/lib/supabase/admin'
import { ASSIGNABLE_ROLES, HAROO_TYPES, type HarooType } from '@/types/domain'
import type { Database } from '@/types/supabase'
import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

const PROFILE_TABLES: Record<
  HarooType,
  'haroo_ouvrier_profiles' | 'haroo_acheteur_profiles' | 'haroo_agronome_profiles'
> = {
  ouvrier: 'haroo_ouvrier_profiles',
  acheteur: 'haroo_acheteur_profiles',
  agronome: 'haroo_agronome_profiles',
}

const bodySchema = z
  .object({
    role: z.enum(ASSIGNABLE_ROLES).optional(),
    cooperative_id: z.string().uuid().nullable().optional(),
    haroo_type: z.enum(HAROO_TYPES).nullable().optional(),
  })
  .strict()

interface ProfileRow {
  id: string
  role: string
  cooperative_id: string | null
  haroo_type: HarooType | null
  first_name: string | null
  last_name: string | null
  deleted_at: string | null
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await assertRole('super_admin')
  if (!guard.ok) return guard.response
  const { id } = await params
  if (!z.string().uuid().safeParse(id).success) {
    return NextResponse.json({ error: 'Identifiant invalide' }, { status: 400 })
  }
  const { data } = await createAdminClient()
    .from('audit_logs')
    .select('action, details, created_at, user_id')
    .eq('resource', 'profiles')
    .eq('resource_id', id)
    .order('created_at', { ascending: false })
    .limit(20)
  return NextResponse.json({ history: data ?? [] }, { headers: { 'Cache-Control': 'no-store' } })
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (request.headers.get('origin') !== request.nextUrl.origin) {
    return NextResponse.json({ error: 'Origine invalide' }, { status: 403 })
  }
  const guard = await assertRole('super_admin')
  if (!guard.ok) return guard.response
  const { id } = await params
  if (!z.string().uuid().safeParse(id).success) {
    return NextResponse.json({ error: 'Identifiant invalide' }, { status: 400 })
  }
  const parsed = bodySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Modification invalide' }, { status: 400 })

  const admin = createAdminClient()
  const { data: before } = await admin
    .from('profiles')
    .select('id, role, cooperative_id, haroo_type, first_name, last_name, deleted_at')
    .eq('id', id)
    .maybeSingle<ProfileRow>()
  if (!before || before.deleted_at) {
    return NextResponse.json({ error: 'Compte introuvable' }, { status: 404 })
  }

  const next = parsed.data
  if (next.role && next.role !== 'super_admin' && before.role === 'super_admin') {
    if (id === guard.ctx.userId) {
      return NextResponse.json(
        { error: 'Vous ne pouvez pas retirer votre propre rôle de super administrateur.' },
        { status: 409 },
      )
    }
    const { count } = await admin
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('role', 'super_admin')
      .is('deleted_at', null)
    if ((count ?? 0) <= 1) {
      return NextResponse.json(
        { error: 'C’est le dernier super administrateur : nommez-en un autre d’abord.' },
        { status: 409 },
      )
    }
  }
  const role = next.role ?? before.role
  const cooperativeId =
    next.cooperative_id !== undefined ? next.cooperative_id : before.cooperative_id
  if ((role === 'cooperative_admin' || role === 'member') && !cooperativeId) {
    return NextResponse.json(
      { error: 'Choisissez la coopérative de rattachement pour ce rôle.' },
      { status: 422 },
    )
  }

  // Fiche métier Haroo d'abord : un compte typé sans fiche aurait un espace Haroo vide.
  let createdHarooProfile: HarooType | null = null
  if (next.haroo_type && next.haroo_type !== before.haroo_type) {
    const table = PROFILE_TABLES[next.haroo_type]
    const { data: existing } = await admin.from(table).select('id').eq('user_id', id).maybeSingle()
    if (!existing) {
      if (!before.first_name?.trim() || !before.last_name?.trim()) {
        return NextResponse.json(
          { error: 'Le compte doit avoir un prénom et un nom avant de recevoir un type Haroo.' },
          { status: 422 },
        )
      }
      const { error } = await admin
        .from(table)
        .insert({
          user_id: id,
          first_name: before.first_name.trim(),
          last_name: before.last_name.trim(),
        })
      if (error)
        return NextResponse.json(
          { error: 'Création de la fiche Haroo impossible' },
          { status: 502 },
        )
      createdHarooProfile = next.haroo_type
    }
  }

  const update: Database['public']['Tables']['profiles']['Update'] = {}
  if (next.role !== undefined) update.role = next.role
  if (next.cooperative_id !== undefined) update.cooperative_id = next.cooperative_id
  if (next.haroo_type !== undefined) {
    update.haroo_type = next.haroo_type
    if (next.haroo_type && next.haroo_type !== before.haroo_type) {
      update.haroo_activated_at = new Date().toISOString()
    }
  }
  const { error } = await admin.from('profiles').update(update).eq('id', id)
  if (error) {
    if (createdHarooProfile) {
      await admin.from(PROFILE_TABLES[createdHarooProfile]).delete().eq('user_id', id)
    }
    return NextResponse.json({ error: 'Mise à jour impossible' }, { status: 502 })
  }

  await admin.from('audit_logs').insert({
    user_id: guard.ctx.userId,
    action: 'profile_roles_changed',
    resource: 'profiles',
    resource_id: id,
    details: {
      before: {
        role: before.role,
        cooperative_id: before.cooperative_id,
        haroo_type: before.haroo_type,
      },
      after: {
        role,
        cooperative_id: cooperativeId,
        haroo_type: next.haroo_type !== undefined ? next.haroo_type : before.haroo_type,
      },
      created_haroo_profile: createdHarooProfile,
    } as unknown as Database['public']['Tables']['audit_logs']['Insert']['details'],
  })

  return NextResponse.json({ ok: true, refresh_required: true })
}
