// Dossiers professionnels que le compte courant peut instruire.
//
// GET ?status=EN_ATTENTE|VALIDE|REJETE (défaut EN_ATTENTE)
//   - super_admin : tous les dossiers ;
//   - Opérateur officier : dossiers des faîtières de ses mandats portant
//     'professionals.validate'. Aucun mandat → liste vide.

import { getMandatedFaitiereIds } from '@/lib/professionals/server'
import { assertAuthenticated } from '@/lib/security/assert-access'
import { createClient as createAdminClient } from '@/lib/supabase/admin'
import { clientKeyFromHeaders, rateLimit } from '@/lib/utils/rate-limit'
import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

const statusSchema = z.enum(['EN_ATTENTE', 'VALIDE', 'REJETE']).default('EN_ATTENTE')

interface DossierRow {
  id: string
  first_name: string | null
  last_name: string | null
  photo_url: string | null
  specialisations: string[] | null
  statut_validation: string
  badge_valide: boolean
  card_number: string | null
  faitiere_id: string | null
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
      'id, first_name, last_name, photo_url, specialisations, statut_validation, badge_valide, card_number, faitiere_id, validated_at, rejection_reason, created_at, faitiere:cooperatives!haroo_agronome_profiles_faitiere_id_fkey(name)',
    )
    .eq('statut_validation', status.data)
    .order('created_at', { ascending: true })
    .limit(200)
  if (faitiereIds) query = query.in('faitiere_id', faitiereIds)

  const { data, error } = await query.returns<DossierRow[]>()
  if (error) return NextResponse.json({ error: 'Lecture impossible' }, { status: 500 })

  return NextResponse.json({
    can_validate: true,
    dossiers: (data ?? []).map((d) => ({
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
      validated_at: d.validated_at,
      rejection_reason: d.rejection_reason,
      created_at: d.created_at,
    })),
  })
}
