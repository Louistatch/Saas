import { getAccessContext } from '@/lib/security/assert-access'
import { CartesTable, type CarteRow } from './cartes-table'

/**
 * Cartes et PIN — toutes les cartes de membre de la plateforme.
 *
 * Le layout /admin réserve déjà l'accès au super-administrateur (requireRole).
 * C'est lui seul qui émet les PIN ; la route /api/cards/pin le re-vérifie.
 */

export const dynamic = 'force-dynamic'

interface DbCard {
  card_number: string
  card_type: string
  status: string
  expiry_date: string | null
  member: { first_name: string | null; last_name: string | null } | null
  cooperative: { name: string } | null
}

export default async function AdminCartesPage() {
  const ctx = await getAccessContext()
  if (!ctx) return null

  const { data } = await ctx.supabase
    .from('member_cards')
    .select(
      'card_number, card_type, status, expiry_date, member:members(first_name, last_name), cooperative:cooperatives(name)',
    )
    .is('deleted_at', null)
    .eq('card_type', 'FAITIERE')
    .order('card_number')
    .limit(1000)
    .returns<DbCard[]>()

  const cards: CarteRow[] = (data ?? []).map((c) => ({
    cardNumber: c.card_number,
    status: c.status,
    expiry: c.expiry_date,
    memberName: [c.member?.first_name, c.member?.last_name].filter(Boolean).join(' ') || '—',
    cooperative: c.cooperative?.name ?? '—',
  }))

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Cartes et PIN</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Le PIN est remis au titulaire avec sa carte. Il s&apos;affiche une seule fois et ne peut
          pas être relu : en cas de perte, émettez-en un nouveau (l&apos;ancien cesse de marcher).
        </p>
      </div>
      <CartesTable cards={cards} />
    </div>
  )
}
