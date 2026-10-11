// Files de suivi en lecture seule pour le super_admin : commandes d'impression de cartes et
// demandes de crédit. Les actions restent dans leurs circuits (opérateurs, coopératives).
import { assertRole } from '@/lib/security/assert-access'
import { createClient as createAdminClient } from '@/lib/supabase/admin'
import { type NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const guard = await assertRole('super_admin')
  if (!guard.ok) return guard.response
  const db = createAdminClient()
  const type = request.nextUrl.searchParams.get('type')

  if (type === 'print') {
    const { data, error } = await db
      .from('card_print_orders')
      .select(
        'id, status, amount_fcfa, provider, created_at, paid_at, printed_at, delivered_at, cancelled_at, cooperative:cooperatives(name)',
      )
      .order('created_at', { ascending: false })
      .limit(200)
    if (error) return NextResponse.json({ error: 'Lecture impossible' }, { status: 500 })
    return NextResponse.json({ rows: data ?? [] }, { headers: { 'Cache-Control': 'no-store' } })
  }
  if (type === 'credit') {
    const { data, error } = await db
      .from('credit_applications')
      .select(
        'id, status, amount_requested_fcfa, amount_approved_fcfa, purpose, duration_months, credit_grade, created_at, reviewed_at, cooperative:cooperatives(name)',
      )
      .order('created_at', { ascending: false })
      .limit(200)
    if (error) return NextResponse.json({ error: 'Lecture impossible' }, { status: 500 })
    return NextResponse.json({ rows: data ?? [] }, { headers: { 'Cache-Control': 'no-store' } })
  }
  return NextResponse.json({ error: 'Type inconnu' }, { status: 400 })
}
