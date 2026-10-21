// Jouer à HarooLife sous son nom, depuis sa carte. Seul le titulaire qui a ouvert la session de
// carte (PIN remis avec la carte, ou code SMS sur le téléphone enregistré) reçoit son prénom et
// son village, pour pré-remplir l'arrivée du jeu. Un compte qui peut lire la carte
// (administrateur, partenaire) n'en est pas le titulaire : il joue sous son propre compte.
// Voir lib/haroolife/card-entry.ts.

import { type CardIdentity, displayName } from '@/lib/haroolife/card-entry'
import { requirePrivateCard } from '@/lib/security/card-access'
import { clientKeyFromHeaders, rateLimit } from '@/lib/utils/rate-limit'
import { type NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
const NO_STORE = { 'Cache-Control': 'no-store' }

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ card_number: string }> },
) {
  if (process.env.HAROOLIFE_ENABLED !== 'true')
    return NextResponse.json(
      { error: 'HarooLife est en préparation.' },
      { status: 503, headers: NO_STORE },
    )
  // Son propre compteur : la page de la carte use déjà celui de `verify:` (quatre appels par
  // ouverture), et un refus ici ferait entrer le titulaire sans son nom.
  if (!rateLimit(`verify-haroolife:${clientKeyFromHeaders(request.headers)}`, 30, 60_000).ok)
    return NextResponse.json({ error: 'Trop de requêtes' }, { status: 429, headers: NO_STORE })
  const { card_number } = await params
  const access = await requirePrivateCard(card_number)
  if (!access.ok) return access.response
  if (access.via !== 'card' || !access.card.member_id)
    return NextResponse.json(
      { error: 'Entrez le PIN de votre carte pour jouer sous votre nom.' },
      { status: 403, headers: NO_STORE },
    )
  // Client de service (session de carte) : cantonné au titulaire de CETTE carte.
  const { data, error } = await access.supabase
    .from('members')
    .select('first_name, village')
    .eq('id', access.card.member_id)
    .is('deleted_at', null)
    .maybeSingle()
  if (error)
    return NextResponse.json({ error: 'Service indisponible' }, { status: 503, headers: NO_STORE })
  if (!data)
    return NextResponse.json({ error: 'Carte inaccessible' }, { status: 404, headers: NO_STORE })
  const row = data as { first_name: string | null; village: string | null }
  const identity: CardIdentity = {
    first_name: displayName(row.first_name),
    village: displayName(row.village, 60),
  }
  return NextResponse.json(identity, { headers: NO_STORE })
}
