import { settlePurchase } from '@/lib/fiches/purchases'
import { createClient as createAdminClient } from '@/lib/supabase/admin'
import { applyRateLimit } from '@/lib/utils/rate-limit-persistent'
import { type NextRequest, NextResponse } from 'next/server'

/**
 * GET /api/purchases/[id] — état d'un achat (page de retour). L'identifiant
 * d'achat (UUID aléatoire) sert de jeton : on ne renvoie que l'état et le titre,
 * jamais les coordonnées de l'acheteur. ?refresh=1 relit FedaPay si en attente.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const limited = await applyRateLimit(request, 'marketplace')
  if (limited) return limited
  const { id } = await params
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: 'Achat invalide' }, { status: 400 })
  const refresh = new URL(request.url).searchParams.get('refresh') === '1'
  const p = refresh ? await settlePurchase(id) : null
  const { data } = await createAdminClient()
    .from('purchases')
    .select('id, fiche_id, amount, payment_status, access_granted, paid_at, fiches_techniques(title)')
    .eq('id', id)
    .maybeSingle()
  if (!data && !p) return NextResponse.json({ error: 'Achat introuvable' }, { status: 404 })
  const row = data as unknown as {
    id: string
    fiche_id: string
    amount: number
    payment_status: string
    access_granted: boolean
    paid_at: string | null
    fiches_techniques: { title: string } | null
  }
  return NextResponse.json(
    {
      id: row.id,
      fiche_id: row.fiche_id,
      title: row.fiches_techniques?.title ?? 'Compte d’exploitation',
      amount: row.amount,
      status: row.payment_status,
      access_granted: row.access_granted,
      paid_at: row.paid_at,
    },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
