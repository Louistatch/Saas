import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { computeCreditScore } from '@/lib/credit/scoring'
import { assertRole, assertTenantAccess } from '@/lib/security/assert-access'

// Valeurs alignées sur les contraintes CHECK de credit_applications.
const createSchema = z.object({
  member_id: z.string().uuid(),
  cooperative_id: z.string().uuid(),
  amount_requested_fcfa: z.coerce.number().int().positive().max(100_000_000),
  purpose: z.enum(['semences', 'engrais', 'equipement', 'irrigation', 'stockage', 'autre']),
  duration_months: z.coerce.number().int().refine((n) => [3, 6, 12, 18, 24].includes(n)),
})

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const status = searchParams.get('status')
  const memberId = searchParams.get('member_id')

  // Les demandes de crédit relèvent des administrateurs (RLS les borne en plus
  // aux coopératives accessibles).
  const guard = await assertRole('cooperative_admin')
  if (!guard.ok) return guard.response
  const supabase = await createClient()

  let query = supabase
    .from('credit_applications')
    .select('*, members(first_name, last_name), credit_repayments(id, status)', { count: 'exact' })
    .order('created_at', { ascending: false })

  if (status) query = query.eq('status', status)
  if (memberId) query = query.eq('member_id', memberId)

  const { data, error, count } = await query
  if (error) return NextResponse.json({ error: 'Lecture impossible' }, { status: 500 })
  return NextResponse.json({ applications: data ?? [], total: count ?? 0 })
}

export async function POST(request: NextRequest) {
  const parsed = createSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Champs obligatoires manquants ou invalides' }, { status: 400 })
  }
  const { member_id, cooperative_id, amount_requested_fcfa, purpose, duration_months } = parsed.data

  const guard = await assertTenantAccess(cooperative_id)
  if (!guard.ok) return guard.response
  const supabase = await createClient()

  // Fetch ATS score
  const { data: atsData } = await supabase.rpc('calculate_member_ats', { p_member_id: member_id })
  const atsScore = (atsData as { total?: number } | null)?.total ?? 0

  // Fetch membership data
  const { data: member } = await supabase
    .from('members')
    .select('created_at, cooperative_id')
    .eq('id', member_id)
    .single()
  // Le membre doit appartenir à la coopérative de la demande.
  if (!member || member.cooperative_id !== cooperative_id) {
    return NextResponse.json({ error: 'Membre introuvable dans cette coopérative' }, { status: 400 })
  }
  const membershipMonths = member?.created_at
    ? Math.floor((Date.now() - new Date(member.created_at).getTime()) / (1000 * 60 * 60 * 24 * 30))
    : 0

  // Fetch cotisations paid %
  const { data: cotisations } = await supabase
    .from('cotisations')
    .select('status')
    .eq('member_id', member_id)
  const total = cotisations?.length ?? 0
  const paid = cotisations?.filter(c => c.status === 'paid').length ?? 0
  const cotisationsPaidPct = total > 0 ? (paid / total) * 100 : 50

  // Fetch parcelles
  const { data: parcelles } = await supabase
    .from('parcelles')
    .select('surface_ha')
    .eq('member_id', member_id)
  const parcellesCount = parcelles?.length ?? 0
  const totalSurfaceHa = parcelles?.reduce((s, p) => s + (p.surface_ha ?? 0), 0) ?? 0

  // Fetch loan history
  const { data: prevLoans } = await supabase
    .from('credit_applications')
    .select('status')
    .eq('member_id', member_id)
  const previousLoansRepaid = prevLoans?.filter(l => l.status === 'closed').length ?? 0
  const previousLoansDefaulted = prevLoans?.filter(l => l.status === 'defaulted').length ?? 0

  const result = computeCreditScore({
    atsScore, membershipMonths, cotisationsPaidPct,
    parcellesCount, totalSurfaceHa, previousLoansRepaid, previousLoansDefaulted,
  })

  const { data, error } = await supabase
    .from('credit_applications')
    .insert({
      member_id, cooperative_id,
      amount_requested_fcfa: Number(amount_requested_fcfa),
      purpose, duration_months: Number(duration_months),
      ats_score_at_application: atsScore,
      credit_score: result.score,
      credit_grade: result.grade,
      interest_rate_pct: result.interestRatePct,
      status: 'scoring',
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: 'Demande impossible' }, { status: 400 })
  return NextResponse.json({ application: data, scoring: result }, { status: 201 })
}
