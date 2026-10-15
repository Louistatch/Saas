import 'server-only'
import { createClient as createAdminClient } from '@/lib/supabase/admin'
import { normalizedCardNumber } from '@/lib/security/card-number'
import { cardSessionCookieName, verifyCardSession } from '@/lib/security/card-session'
import { createClient } from '@/lib/supabase/server'
import { clientKeyFromHeaders, rateLimit } from '@/lib/utils/rate-limit'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

// Réexporté : de nombreuses routes l'importent d'ici.
export { normalizedCardNumber }

/** Public lookup: only a single validated card, never arbitrary filters or member details. */
export async function resolvePublicCard(value: string) {
  const number = normalizedCardNumber(value)
  if (!number) return null
  const { data, error } = await createAdminClient()
    .from('member_cards')
    .select('member_id, cooperative_id, expiry_date')
    .eq('card_number', number)
    .eq('status', 'active')
    .is('deleted_at', null)
    .maybeSingle()
  if (error) throw new Error('Card lookup unavailable')
  if (!data || (data.expiry_date && data.expiry_date < new Date().toISOString().slice(0, 10)))
    return null
  return data
}

const todayIso = () => new Date().toISOString().slice(0, 10)

interface PrivateCardRow {
  member_id: string | null
  cooperative_id: string | null
  expiry_date: string | null
}

/**
 * Session de carte : le cookie signé émis par /api/auth/card/verify après le
 * code SMS. Renvoie le membre qu'elle autorise pour CETTE carte, sinon `null`.
 */
async function readCardSession(cardNumber: string): Promise<{ memberId: string } | null> {
  const jar = await cookies()
  return verifyCardSession(jar.get(cardSessionCookieName(cardNumber))?.value, cardNumber)
}

/**
 * Relit la carte à chaque requête, par le client de service. Une session signée
 * ne suffit pas : la carte a pu être révoquée, expirer ou changer de titulaire
 * depuis l'émission du cookie, et huit heures c'est long.
 */
async function loadCardForSession(
  cardNumber: string,
  memberId: string,
): Promise<PrivateCardRow | null> {
  const { data } = await createAdminClient()
    .from('member_cards')
    .select('member_id, cooperative_id, expiry_date, card_type')
    .eq('card_number', cardNumber)
    .eq('status', 'active')
    .is('deleted_at', null)
    .maybeSingle<PrivateCardRow & { card_type: string }>()
  if (!data || data.card_type !== 'FAITIERE' || data.member_id !== memberId) return null
  if (data.expiry_date && data.expiry_date < todayIso()) return null
  return { member_id: data.member_id, cooperative_id: data.cooperative_id, expiry_date: data.expiry_date }
}

/**
 * Accès privé à une carte. Deux façons de l'obtenir, essayées dans cet ordre :
 *
 *  1. un COMPTE connecté — le RLS reste l'autorité : la carte n'est lisible que
 *     par son propriétaire ou un administrateur de son organisation ;
 *  2. une SESSION DE CARTE — le titulaire s'est connecté avec le code SMS reçu
 *     sur le téléphone enregistré, sans avoir de compte.
 *
 * ⚠️ Pour la session de carte, `supabase` est le client de SERVICE : il contourne
 * le RLS, faute d'identité Supabase à laquelle l'accrocher. Toute route qui
 * l'utilise DOIT donc cantonner chacune de ses requêtes à `card.member_id` (ou
 * `card.cooperative_id`), jamais à une valeur venue du client. Les sept routes
 * qui appellent cette fonction le font déjà explicitement.
 *
 * `userId` vaut `null` pour une session de carte : il n'y a pas de profil.
 */
export async function requirePrivateCard(value: string) {
  const number = normalizedCardNumber(value)
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  let accountFailure: NextResponse | null = null

  if (user) {
    if (!number) {
      return {
        ok: false as const,
        response: NextResponse.json({ error: 'Carte invalide' }, { status: 404 }),
      }
    }
    const { data: card, error } = await supabase
      .from('member_cards')
      .select('member_id, cooperative_id, expiry_date')
      .eq('card_number', number)
      .eq('status', 'active')
      .is('deleted_at', null)
      .maybeSingle()
    if (error) {
      return {
        ok: false as const,
        response: NextResponse.json({ error: 'Service indisponible' }, { status: 503 }),
      }
    }
    if (card && !(card.expiry_date && card.expiry_date < todayIso())) {
      return {
        ok: true as const,
        card: card as PrivateCardRow,
        supabase,
        userId: user.id as string | null,
        via: 'account' as 'account' | 'card',
      }
    }
    // Un compte connecté mais sans droit sur cette carte n'exclut pas que son
    // titulaire ait, sur le même navigateur, une session de carte valide.
    accountFailure = NextResponse.json({ error: 'Carte inaccessible' }, { status: 404 })
  }

  if (number) {
    const session = await readCardSession(number)
    if (session) {
      const card = await loadCardForSession(number, session.memberId)
      if (card) {
        return {
          ok: true as const,
          card,
          // Même classe que le client de session, typé comme lui : les routes
          // appellent les mêmes méthodes. Ce n'est PAS le même niveau de droits.
          supabase: createAdminClient() as unknown as typeof supabase,
          userId: null as string | null,
          via: 'card' as 'account' | 'card',
        }
      }
    }
  }

  return {
    ok: false as const,
    response:
      accountFailure ??
      NextResponse.json(
        { error: 'Connectez-vous pour accéder aux informations privées de cette carte.' },
        { status: 401 },
      ),
  }
}

export function cardRateLimit(request: Request) {
  const result = rateLimit(`verify:${clientKeyFromHeaders(request.headers)}`, 10, 60_000)
  return result.ok ? null : NextResponse.json({ error: 'Trop de requêtes' }, { status: 429 })
}
