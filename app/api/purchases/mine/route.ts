import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

/**
 * GET /api/purchases/mine — achats du compte connecté, SaaS comme Haroo : les deux
 * passent par le même compte (profiles) et le même achat. Lu avec le client de
 * session : la politique purchases_own_read ne renvoie que ses propres lignes.
 */
export async function GET() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ purchases: [] }, { status: 401 })
  const { data } = await supabase
    .from('purchases')
    .select('id, fiche_id, amount, payment_status, access_granted, paid_at, created_at, fiches_techniques(title, culture)')
    .eq('payment_status', 'completed')
    .order('created_at', { ascending: false })
    .limit(100)
  return NextResponse.json({ purchases: data ?? [] }, { headers: { 'Cache-Control': 'no-store' } })
}
