/**
 * « Afficher le numéro » d'une annonce du marché.
 *
 * Le numéro ne figure plus dans la liste des annonces et le rôle anonyme ne peut plus le lire
 * dans la table (migration 20261023_150000_market_work) : sans cela, une seule requête
 * suffisait à aspirer tous les numéros publiés. Il se demande ici, une annonce à la fois,
 * avec une limite par adresse IP. Le client de service ne sert qu'à lire cette colonne d'une
 * annonce ouverte ; rien d'autre n'en sort.
 */
import { isOpen } from '@/lib/market/work'
import { createClient as createAdminClient } from '@/lib/supabase/admin'
import { clientKeyFromHeaders, isUuid, rateLimit } from '@/lib/utils/rate-limit'
import { applyRateLimit } from '@/lib/utils/rate-limit-persistent'
import { type NextRequest, NextResponse } from 'next/server'

const NO_STORE = { 'Cache-Control': 'private, no-store' }

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const limited = await applyRateLimit(request, 'verify')
  if (limited) return limited
  // Au-delà de la minute : 30 numéros par heure et par adresse suffisent à un acheteur.
  const hourly = rateLimit(`market-contact:${clientKeyFromHeaders(request.headers)}`, 30, 3_600_000)
  if (!hourly.ok) {
    return NextResponse.json(
      { error: 'Trop de numéros demandés. Réessayez dans une heure.' },
      { status: 429, headers: NO_STORE },
    )
  }

  const { id } = await params
  if (!isUuid(id)) {
    return NextResponse.json({ error: 'Annonce introuvable' }, { status: 404, headers: NO_STORE })
  }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('producer_announcements')
    .select('contact_phone, status, expires_at')
    .eq('id', id)
    .maybeSingle<{ contact_phone: string | null; status: string; expires_at: string | null }>()

  if (error) {
    return NextResponse.json({ error: 'Numéro indisponible' }, { status: 503, headers: NO_STORE })
  }
  if (!data || data.status !== 'active' || !isOpen(data.expires_at)) {
    return NextResponse.json(
      { error: 'Cette annonce n’est plus ouverte' },
      { status: 404, headers: NO_STORE },
    )
  }
  const phone = data.contact_phone?.trim()
  if (!phone) {
    return NextResponse.json(
      { error: 'Pas de numéro sur cette annonce' },
      { status: 404, headers: NO_STORE },
    )
  }
  return NextResponse.json({ phone }, { headers: NO_STORE })
}
