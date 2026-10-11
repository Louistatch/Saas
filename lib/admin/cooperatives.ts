import 'server-only'
import type { createClient as createAdminClient } from '@/lib/supabase/admin'
import { cooperativeSchema } from '@/lib/validators/schemas'
import type { Database } from '@/types/supabase'
import { z } from 'zod'

export const LEVELS = ['faitiere', 'union', 'cooperative'] as const
export const organisationSchema = cooperativeSchema.extend({
  level: z.enum(LEVELS),
  parent_id: z.string().uuid().nullable().optional(),
})
export type OrganisationInput = z.infer<typeof organisationSchema>

type Admin = ReturnType<typeof createAdminClient>
type Json = Database['public']['Tables']['audit_logs']['Insert']['details']

/** Une union se rattache à une faîtière ; une coopérative à une union ou une faîtière. */
export async function checkParent(admin: Admin, input: OrganisationInput, selfId?: string) {
  if (input.level === 'faitiere') return null
  if (!input.parent_id) return 'Choisissez l’organisation de rattachement.'
  if (input.parent_id === selfId) return 'Une organisation ne peut pas être son propre parent.'
  const { data: parent } = await admin
    .from('cooperatives')
    .select('level, deleted_at')
    .eq('id', input.parent_id)
    .maybeSingle<{ level: string | null; deleted_at: string | null }>()
  if (!parent || parent.deleted_at) return 'Organisation de rattachement introuvable.'
  const allowed = input.level === 'union' ? ['faitiere'] : ['faitiere', 'union']
  return allowed.includes(parent.level ?? '')
    ? null
    : 'Ce rattachement ne respecte pas la hiérarchie.'
}

export async function audit(
  admin: Admin,
  userId: string,
  action: string,
  id: string,
  details: unknown,
) {
  await admin.from('audit_logs').insert({
    user_id: userId,
    action,
    resource: 'cooperatives',
    resource_id: id,
    details: details as Json,
  })
}
