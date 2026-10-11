// Centre de pilotage super_admin : tout ce qui attend une action, compté et classé, plus le
// pouls de la plateforme. Lecture seule, service_role après la garde super_admin.
import { assertRole } from '@/lib/security/assert-access'
import { createClient as createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

type Level = 'urgent' | 'attention' | 'info'
export interface InboxItem {
  key: string
  count: number
  level: Level
  title: string
  detail: string
  href: string
}

const DAY = 86_400_000
const CREDIT_DONE = [
  'approved',
  'rejected',
  'disbursed',
  'closed',
  'expired',
  'cancelled',
  'repaid',
]

export async function GET() {
  const guard = await assertRole('super_admin')
  if (!guard.ok) return guard.response
  const db = createAdminClient()
  const count = (q: PromiseLike<{ count: number | null }>) => q.then((r) => r.count ?? 0)
  const head = { count: 'exact' as const, head: true }
  const stuckBefore = new Date(Date.now() - 30 * 60_000).toISOString()

  const [
    dossiers,
    messages,
    oldestMessage,
    cardsToPay,
    cardsToPrint,
    credits,
    notifFailed,
    paymentsStuck,
    coops,
    members,
    activeCards,
    users,
    pros,
    hl,
  ] = await Promise.all([
    db
      .from('haroo_agronome_profiles')
      .select('created_at')
      .eq('statut_validation', 'EN_ATTENTE')
      .order('created_at', { ascending: true })
      .limit(500)
      .returns<{ created_at: string | null }[]>(),
    count(db.from('contact_messages').select('id', head).eq('status', 'nouveau')),
    db
      .from('contact_messages')
      .select('created_at')
      .eq('status', 'nouveau')
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle<{ created_at: string }>(),
    count(db.from('card_print_orders').select('id', head).eq('status', 'requested')),
    count(db.from('card_print_orders').select('id', head).eq('status', 'paid')),
    count(
      db
        .from('credit_applications')
        .select('id', head)
        .not('status', 'in', `(${CREDIT_DONE.join(',')})`),
    ),
    count(db.from('notification_queue').select('id', head).in('status', ['failed', 'dead'])),
    count(
      db
        .from('partner_payment_intents')
        .select('id', head)
        .in('status', ['pending', 'processing'])
        .lt('created_at', stuckBefore),
    ),
    count(db.from('cooperatives').select('id', head).is('deleted_at', null)),
    count(db.from('members').select('id', head)),
    count(db.from('member_cards').select('id', head).eq('status', 'active')),
    count(db.from('profiles').select('id', head).is('deleted_at', null)),
    count(db.from('haroo_agronome_profiles').select('id', head).eq('statut_validation', 'VALIDE')),
    db.rpc('admin_activity_haroolife'),
  ])

  const now = Date.now()
  const pendingRows = dossiers.data ?? []
  const oldestDossierDays = pendingRows[0]?.created_at
    ? Math.floor((now - new Date(pendingRows[0].created_at).getTime()) / DAY)
    : 0
  const messageDays = oldestMessage.data
    ? Math.floor((now - new Date(oldestMessage.data.created_at).getTime()) / DAY)
    : 0

  const items: InboxItem[] = []
  const push = (item: InboxItem) => item.count > 0 && items.push(item)
  push({
    key: 'dossiers',
    count: pendingRows.length,
    level: oldestDossierDays >= 7 ? 'urgent' : oldestDossierDays >= 3 ? 'attention' : 'info',
    title: 'Dossiers professionnels à valider',
    detail:
      oldestDossierDays > 0
        ? `Le plus ancien attend depuis ${oldestDossierDays} j.`
        : 'Reçus aujourd’hui.',
    href: '/operator/professionals',
  })
  push({
    key: 'messages',
    count: messages,
    level: messageDays >= 2 ? 'urgent' : 'attention',
    title: 'Messages et demandes d’accès sans réponse',
    detail: messageDays > 0 ? `Le plus ancien date de ${messageDays} j.` : 'Reçus aujourd’hui.',
    href: '/admin/messages',
  })
  push({
    key: 'payments',
    count: paymentsStuck,
    level: 'urgent',
    title: 'Paiements d’opérateurs bloqués',
    detail: 'En attente depuis plus de 30 min : vérifiez auprès du prestataire.',
    href: '/admin/partners',
  })
  push({
    key: 'notifications',
    count: notifFailed,
    level: 'attention',
    title: 'Notifications SMS ou e-mail en échec',
    detail: 'Des membres n’ont pas reçu leur message.',
    href: '/admin/logs',
  })
  push({
    key: 'cards-print',
    count: cardsToPrint,
    level: 'attention',
    title: 'Commandes de cartes payées à imprimer',
    detail: 'Payées, pas encore imprimées.',
    href: '/admin/cartes',
  })
  push({
    key: 'cards-pay',
    count: cardsToPay,
    level: 'info',
    title: 'Commandes de cartes en attente de paiement',
    detail: 'Demandées par les organisations, non payées.',
    href: '/admin/cartes',
  })
  push({
    key: 'credits',
    count: credits,
    level: 'info',
    title: 'Demandes de crédit en cours d’instruction',
    detail: 'Suivies par les coopératives.',
    href: '/admin/cooperatives',
  })

  const haroolife = hl.data as {
    enabled: boolean
    cooperative: string | null
    canton: string | null
    workers_available: number
    producers_with_account: number
    groups_open: number
    groups_ready: number
    groups_expiring_12h: number
  } | null
  if (haroolife?.enabled) {
    push({
      key: 'hl-expiring',
      count: haroolife.groups_expiring_12h,
      level: 'urgent',
      title: 'Groupes HarooLife incomplets qui expirent sous 12 h',
      detail: `${haroolife.cooperative}, ${haroolife.canton}.`,
      href: '/haroolife',
    })
    push({
      key: 'hl-ready',
      count: haroolife.groups_ready,
      level: 'info',
      title: 'Groupes HarooLife complets à confirmer',
      detail: 'Objectif atteint : à confirmer avec les participants.',
      href: '/haroolife',
    })
  }
  const order: Record<Level, number> = { urgent: 0, attention: 1, info: 2 }
  items.sort((a, b) => order[a.level] - order[b.level] || b.count - a.count)

  return NextResponse.json(
    {
      items,
      vitals: { coops, members, activeCards, users, pros },
      haroolife: haroolife?.enabled ? haroolife : null,
    },
    { headers: { 'Cache-Control': 'private, no-store' } },
  )
}
