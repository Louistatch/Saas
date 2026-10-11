// Dossiers professionnels que le compte courant peut instruire.
//
// GET ?status=EN_ATTENTE|VALIDE|REJETE (défaut EN_ATTENTE)
//   - super_admin : tous les dossiers ;
//   - Opérateur officier : dossiers des faîtières de ses mandats portant
//     'professionals.validate'. Aucun mandat → liste vide.

import { assessDossier, compareForReview, professionLabel } from '@/lib/professionals/core'
import { getMandatedFaitiereIds } from '@/lib/professionals/server'
import { assertAuthenticated } from '@/lib/security/assert-access'
import { createClient as createAdminClient } from '@/lib/supabase/admin'
import { clientKeyFromHeaders, rateLimit } from '@/lib/utils/rate-limit'
import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

const statusSchema = z.enum(['EN_ATTENTE', 'VALIDE', 'REJETE']).default('EN_ATTENTE')

interface DossierRow {
  id: string
  user_id: string | null
  first_name: string | null
  last_name: string | null
  photo_url: string | null
  specialisations: string[] | null
  statut_validation: string
  badge_valide: boolean
  card_number: string | null
  faitiere_id: string | null
  profession: string | null
  validated_at: string | null
  rejection_reason: string | null
  created_at: string | null
  faitiere: { name: string | null } | null
}

export async function GET(request: NextRequest) {
  const limit = rateLimit(`pro-pending:${clientKeyFromHeaders(request.headers)}`, 60, 60_000)
  if (!limit.ok) return NextResponse.json({ error: 'Trop de requêtes' }, { status: 429 })

  const auth = await assertAuthenticated()
  if (!auth.ok) return auth.response

  const status = statusSchema.safeParse(request.nextUrl.searchParams.get('status') ?? undefined)
  if (!status.success) return NextResponse.json({ error: 'Statut invalide' }, { status: 400 })

  const isSuperAdmin = auth.ctx.role === 'super_admin'
  const faitiereIds = isSuperAdmin ? null : await getMandatedFaitiereIds()
  if (faitiereIds && faitiereIds.length === 0) {
    return NextResponse.json({ dossiers: [], can_validate: false })
  }

  const admin = createAdminClient()
  let query = admin
    .from('haroo_agronome_profiles')
    .select(
      'id, user_id, first_name, last_name, photo_url, specialisations, statut_validation, badge_valide, card_number, faitiere_id, profession, validated_at, rejection_reason, created_at, faitiere:cooperatives!haroo_agronome_profiles_faitiere_id_fkey(name)',
    )
    .eq('statut_validation', status.data)
    .order('created_at', { ascending: true })
    .limit(200)
  if (faitiereIds) query = query.in('faitiere_id', faitiereIds)

  const { data, error } = await query.returns<DossierRow[]>()
  if (error) return NextResponse.json({ error: 'Lecture impossible' }, { status: 500 })

  // Pièces déposées par dossier : de quoi dire tout de suite ce qui manque.
  const rows = data ?? []
  const userIds = [...new Set(rows.map((d) => d.user_id).filter((u): u is string => Boolean(u)))]
  const kindsByUser = new Map<string, string[]>()
  if (userIds.length > 0) {
    const { data: docs } = await admin
      .from('professional_documents')
      .select('user_id, kind')
      .eq('profile_type', 'AGRONOME')
      .in('user_id', userIds)
      .returns<{ user_id: string; kind: string }[]>()
    for (const doc of docs ?? []) {
      kindsByUser.set(doc.user_id, [...(kindsByUser.get(doc.user_id) ?? []), doc.kind])
    }
  }
  const assessed = rows.map((d) => ({
    row: d,
    assessment: assessDossier(d, d.user_id ? (kindsByUser.get(d.user_id) ?? []) : []),
  }))
  if (status.data === 'EN_ATTENTE')
    assessed.sort((a, b) => compareForReview(a.assessment, b.assessment))

  return NextResponse.json({
    can_validate: true,
    dossiers: assessed.map(({ row: d, assessment }) => ({
      id: d.id,
      first_name: d.first_name,
      last_name: d.last_name,
      photo_url: d.photo_url,
      specialisations: d.specialisations ?? [],
      statut_validation: d.statut_validation,
      badge_valide: d.badge_valide,
      card_number: d.card_number,
      faitiere_id: d.faitiere_id,
      faitiere_name: d.faitiere?.name ?? null,
      profession_label: professionLabel('AGRONOME', d.profession),
      validated_at: d.validated_at,
      rejection_reason: d.rejection_reason,
      created_at: d.created_at,
      assessment,
    })),
  })
}
