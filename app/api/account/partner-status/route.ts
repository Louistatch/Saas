// Statut Opérateur/Partenaire du compte courant — lecture seule.
//
// Distinct de getPartnerContext() (lib/security/assert-partner-access.ts) :
// celui-ci ne renvoie une valeur que pour une adhésion déjà ACTIVE, donc rien
// pour un candidat dont le Partenaire est encore au statut 'candidate' —
// exactement le cas que /operator doit pouvoir afficher.

import { OPERATOR_MODULE_ID } from '@/lib/academy/operator-training'
import { getAccessContext } from '@/lib/security/assert-access'
import type { PartnerStatus } from '@/types/domain'
import { NextResponse } from 'next/server'

interface PartnerStatusRow {
  partner_id: string
  partners: { partner_code: string; display_name: string; status: PartnerStatus } | null
}

export async function GET() {
  const ctx = await getAccessContext()
  if (!ctx) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }

  const { data: membership } = await ctx.supabase
    .from('partner_memberships')
    .select('partner_id, partners(partner_code, display_name, status)')
    .eq('user_id', ctx.userId)
    .eq('status', 'active')
    .maybeSingle<PartnerStatusRow>()

  if (!membership?.partners) {
    return NextResponse.json({ has_applied: false })
  }

  const { data: certification } = await ctx.supabase
    .from('partner_certifications')
    .select('training_completed_at, exam_passed_at, certified_at')
    .eq('user_id', ctx.userId)
    .maybeSingle<{
      training_completed_at: string | null
      exam_passed_at: string | null
      certified_at: string | null
    }>()

  // Avancement de la formation (lecture sous RLS : ses propres lignes seulement).
  const [{ count: lessonsTotal }, { count: lessonsCompleted }] = await Promise.all([
    ctx.supabase
      .from('academy_lessons')
      .select('id', { count: 'exact', head: true })
      .eq('module_id', OPERATOR_MODULE_ID),
    ctx.supabase
      .from('academy_profile_progress')
      .select('id', { count: 'exact', head: true })
      .eq('profile_id', ctx.userId)
      .eq('module_id', OPERATOR_MODULE_ID)
      .eq('status', 'completed')
      .not('lesson_id', 'is', null),
  ])

  return NextResponse.json({
    has_applied: true,
    training: { lessons_completed: lessonsCompleted ?? 0, lessons_total: lessonsTotal ?? 0 },
    partner_id: membership.partner_id,
    partner_code: membership.partners.partner_code,
    display_name: membership.partners.display_name,
    status: membership.partners.status,
    training_completed_at: certification?.training_completed_at ?? null,
    exam_passed_at: certification?.exam_passed_at ?? null,
    certified_at: certification?.certified_at ?? null,
  })
}
