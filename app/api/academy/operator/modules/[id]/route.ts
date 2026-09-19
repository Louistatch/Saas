import { getModuleWithLessons } from '@/lib/academy/operator-training'
import { assertAuthenticated } from '@/lib/security/assert-access'
import { createClient as createAdminClient } from '@/lib/supabase/admin'
import { isUuid } from '@/lib/utils/rate-limit'
// Module Opérateur complet (leçons, slides, quiz sans clé de correction,
// devoir) pour le compte authentifié — aucune contrainte de rôle ou de
// coopérative : la formation Opérateur est ouverte à tout compte.
import { type NextRequest, NextResponse } from 'next/server'

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await assertAuthenticated()
  if (!guard.ok) return guard.response

  const { id } = await params
  if (!isUuid(id)) {
    return NextResponse.json({ error: 'Identifiant invalide' }, { status: 400 })
  }

  const admin = createAdminClient()
  const module_ = await getModuleWithLessons(admin, id)
  if (!module_) {
    return NextResponse.json({ error: 'Module introuvable' }, { status: 404 })
  }
  return NextResponse.json({ module: module_ })
}
