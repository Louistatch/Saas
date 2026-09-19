/**
 * Mandat Partenaire ↔ Organisation (§13 du plan). Posé en PR 1 (schéma,
 * `has_partner_org_access()`) mais jamais câblé : rien n'insérait encore de
 * ligne dans `partner_organization_assignments`, ce qui rendait tout le
 * circuit de la carte physique (PR 3) — qui exige un Partenaire assigné —
 * inatteignable en pratique. Même situation que la validation de
 * certification en PR 2.1 : une petite action admin manuelle débloque le
 * pipeline, en attendant qu'un futur parcours en libre-service existe.
 *
 * Accès délégué, jamais une hiérarchie (§15) : révoquer un mandat ne touche
 * à aucune donnée de l'organisation, seulement à la ligne d'assignation
 * elle-même.
 */
import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/supabase'
import type { PartnerAccessScope } from '@/types/domain'

type AdminClient = SupabaseClient<Database>

export interface AssignmentActionResult {
  ok: boolean
  error?: string
  assignment_id?: string
}

/**
 * Assigne un Partenaire à une coopérative avec un périmètre explicite de
 * droits délégués (§14 — jamais un accès total implicite). Idempotent au
 * sens strict : l'index unique `idx_partner_assignment_active_unique`
 * (partner_id, cooperative_id) WHERE status='active' fait déjà respecter
 * qu'un seul mandat actif existe à la fois — un second appel avec les mêmes
 * identifiants échoue proprement plutôt que de dupliquer.
 */
export async function assignPartnerToOrganization(
  admin: AdminClient,
  params: {
    partnerId: string
    cooperativeId: string
    scopes: PartnerAccessScope[]
    approvedBy: string
    isPrimaryOperator?: boolean
  },
): Promise<AssignmentActionResult> {
  if (params.scopes.length === 0) {
    return { ok: false, error: 'Au moins un périmètre est requis' }
  }

  const { data: partner } = await admin
    .from('partners')
    .select('status')
    .eq('id', params.partnerId)
    .maybeSingle<{ status: string }>()
  if (!partner) {
    return { ok: false, error: 'Partenaire introuvable' }
  }
  if (partner.status !== 'active') {
    // Un Partenaire non actif (candidat, suspendu…) ne peut pas recevoir de
    // mandat — l'activation (lib/partners/certification.ts) vient d'abord.
    return { ok: false, error: 'Seul un Partenaire actif peut recevoir un mandat' }
  }

  const { data: assignment, error } = await admin
    .from('partner_organization_assignments')
    .insert({
      partner_id: params.partnerId,
      cooperative_id: params.cooperativeId,
      approved_by: params.approvedBy,
      is_primary_operator: params.isPrimaryOperator ?? false,
    })
    .select('id')
    .single()

  if (error || !assignment) {
    // Le cas le plus probable : un mandat actif existe déjà (contrainte
    // unique). Le message reste générique — pas besoin d'exposer le code
    // d'erreur Postgres au client.
    return { ok: false, error: 'Mandat impossible — un mandat actif existe peut-être déjà' }
  }

  const { error: scopesError } = await admin
    .from('partner_assignment_scopes')
    .insert(params.scopes.map((scope) => ({ assignment_id: assignment.id, scope })))
  if (scopesError) {
    await admin.from('partner_organization_assignments').delete().eq('id', assignment.id)
    return { ok: false, error: 'Écriture des périmètres impossible' }
  }

  await admin.from('audit_logs').insert({
    user_id: params.approvedBy,
    action: 'partner_organization_assigned',
    resource: 'partner_organization_assignments',
    resource_id: assignment.id,
    details: {
      partner_id: params.partnerId,
      cooperative_id: params.cooperativeId,
      scopes: params.scopes,
    } as unknown as Database['public']['Tables']['audit_logs']['Insert']['details'],
  })

  return { ok: true, assignment_id: assignment.id }
}

/**
 * Révoque un mandat actif. L'organisation garde toutes ses données (§15) ;
 * seul l'accès délégué s'arrête.
 */
export async function revokePartnerAssignment(
  admin: AdminClient,
  params: { assignmentId: string; revokedBy: string },
): Promise<AssignmentActionResult> {
  const now = new Date().toISOString()
  const { data, error } = await admin
    .from('partner_organization_assignments')
    .update({ status: 'revoked', revoked_by: params.revokedBy, ended_at: now, updated_at: now })
    .eq('id', params.assignmentId)
    .eq('status', 'active')
    .select('id, partner_id, cooperative_id')
    .maybeSingle()

  if (error) return { ok: false, error: 'Écriture impossible' }
  if (!data) return { ok: false, error: 'Aucun mandat actif à révoquer' }

  await admin.from('audit_logs').insert({
    user_id: params.revokedBy,
    action: 'partner_organization_revoked',
    resource: 'partner_organization_assignments',
    resource_id: data.id,
    details: {
      partner_id: data.partner_id,
      cooperative_id: data.cooperative_id,
    } as unknown as Database['public']['Tables']['audit_logs']['Insert']['details'],
  })

  return { ok: true, assignment_id: data.id }
}
