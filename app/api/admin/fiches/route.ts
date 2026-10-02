import { assertRole } from '@/lib/security/assert-access'
import { createClient as createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'

/**
 * GET /api/admin/fiches — tous les comptes d'exploitation (tous statuts) et les
 * ventes, pour l'écran super-admin. Lecture par le client de service, APRÈS le
 * contrôle super-admin (lu dans profiles par assertRole).
 */
export async function GET() {
  const guard = await assertRole('super_admin')
  if (!guard.ok) return guard.response
  const admin = createAdminClient()
  const [{ data: fiches }, { data: purchases }] = await Promise.all([
    admin
      .from('fiches_techniques')
      .select('id, title, description, culture, type_agriculture, campaign, price_non_member, is_free_for_members, status, files, download_count, cooperative_id, created_at, cooperatives(name)')
      .order('created_at', { ascending: false })
      .limit(500),
    admin
      .from('purchases')
      .select('id, fiche_id, amount, payment_status, buyer_name, buyer_phone, buyer_email, user_id, created_at, paid_at')
      .order('created_at', { ascending: false })
      .limit(500),
  ])
  const completed = (purchases ?? []).filter((p) => p.payment_status === 'completed')
  return NextResponse.json(
    {
      fiches: fiches ?? [],
      purchases: purchases ?? [],
      totals: { sales: completed.length, revenue: completed.reduce((s, p) => s + (p.amount ?? 0), 0) },
    },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
