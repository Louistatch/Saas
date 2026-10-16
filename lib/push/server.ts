import 'server-only'
import { createClient as createAdminClient } from '@/lib/supabase/admin'
import webpush from 'web-push'

interface AdminEvent {
  id: number
  kind: 'dossier.nouveau' | 'haroolife.groupe'
  faitiere_id: string | null
  title: string
  body: string
  link: string
}

interface Subscription {
  id: string
  user_id: string
  endpoint: string
  p256dh: string
  auth: string
  failures: number
}

export function pushConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY)
}

let configured = false
function configure() {
  if (configured) return
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || 'https://www.faitierehub.com',
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY as string,
    process.env.VAPID_PRIVATE_KEY as string,
  )
  configured = true
}

/**
 * Expédie, une seule fois, les événements admin en attente à leurs destinataires autorisés.
 * Idempotent : les événements sont réservés (dispatched_at) avant l'envoi ; un second appel
 * concurrent ne les revoit pas. Sans clés VAPID, ne réserve rien.
 */
export async function dispatchPendingEvents(): Promise<{ events: number; sent: number }> {
  if (!pushConfigured()) return { events: 0, sent: 0 }
  configure()
  const admin = createAdminClient()
  const { data: events } = await admin
    .from('admin_events')
    .update({ dispatched_at: new Date().toISOString() })
    .is('dispatched_at', null)
    .select('id, kind, faitiere_id, title, body, link')
    .returns<AdminEvent[]>()
  let sent = 0
  for (const event of events ?? []) {
    const { data: recipients } = await admin.rpc('admin_event_recipients', {
      p_kind: event.kind,
      p_faitiere: event.faitiere_id,
    })
    const userIds = ((recipients as string[] | null) ?? []).filter(Boolean)
    if (userIds.length === 0) continue
    const { data: subs } = await admin
      .from('push_subscriptions')
      .select('id, user_id, endpoint, p256dh, auth, failures')
      .in('user_id', userIds)
      .returns<Subscription[]>()
    const payload = JSON.stringify({
      title: event.title,
      body: event.body,
      link: event.link,
      tag: `${event.kind}:${event.id}`,
    })
    sent += await sendTo(admin, subs ?? [], payload)
  }
  const dm = await dispatchHarooLifeMessages(admin)
  const game = await dispatchHarooLifeAlerts(admin)
  return {
    events: (events?.length ?? 0) + dm.events + game.events,
    sent: sent + dm.sent + game.sent,
  }
}

interface DmPush {
  id: number
  recipient_id: string
  title: string
  body: string
}

/** Envoie une notification à chaque appareil de l'abonnement ; nettoie les abonnements morts. */
async function sendTo(
  admin: ReturnType<typeof createAdminClient>,
  subs: Subscription[],
  payload: string,
): Promise<number> {
  let sent = 0
  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload,
          { TTL: 86_400, timeout: 8_000 },
        )
        sent++
        await admin
          .from('push_subscriptions')
          .update({ last_success_at: new Date().toISOString(), failures: 0 })
          .eq('id', sub.id)
      } catch (error) {
        const status = (error as { statusCode?: number }).statusCode
        if (status === 404 || status === 410 || sub.failures >= 9) {
          await admin.from('push_subscriptions').delete().eq('id', sub.id)
        } else {
          await admin
            .from('push_subscriptions')
            .update({ failures: sub.failures + 1 })
            .eq('id', sub.id)
        }
      }
    }),
  )
  return sent
}

/**
 * Messages privés HarooLife reçus hors du jeu : « Ama t'a écrit », vers les appareils du seul
 * destinataire. Réservés avant l'envoi (une seule expédition). Sans la file en base (migration
 * non appliquée), ne fait rien.
 */
async function dispatchHarooLifeMessages(
  admin: ReturnType<typeof createAdminClient>,
): Promise<{ events: number; sent: number }> {
  const { data: pending, error } = await admin
    .from('haroolife_dm_push')
    .update({ dispatched_at: new Date().toISOString() })
    .is('dispatched_at', null)
    .select('id, recipient_id, title, body')
    .returns<DmPush[]>()
  if (error || !pending?.length) return { events: 0, sent: 0 }
  let sent = 0
  for (const item of pending) {
    const { data: subs } = await admin
      .from('push_subscriptions')
      .select('id, user_id, endpoint, p256dh, auth, failures')
      .eq('user_id', item.recipient_id)
      .returns<Subscription[]>()
    if (!subs?.length) continue
    sent += await sendTo(
      admin,
      subs,
      JSON.stringify({
        title: item.title,
        body: item.body,
        link: '/messages',
        tag: `haroolife.dm:${item.recipient_id}`,
      }),
    )
  }
  return { events: pending.length, sent }
}

interface GamePush {
  id: number
  recipient_id: string
  kind: 'money' | 'invite'
  title: string
  body: string
}

/**
 * Alertes HarooLife hors du jeu : argent du jeu reçu, ami arrivé par le lien d'invitation, vers
 * les appareils du seul destinataire. Réservées avant l'envoi (une seule expédition). Sans la
 * file en base (migration non appliquée), ne fait rien.
 */
async function dispatchHarooLifeAlerts(
  admin: ReturnType<typeof createAdminClient>,
): Promise<{ events: number; sent: number }> {
  const { data: pending, error } = await admin
    .from('haroolife_push')
    .update({ dispatched_at: new Date().toISOString() })
    .is('dispatched_at', null)
    .select('id, recipient_id, kind, title, body')
    .returns<GamePush[]>()
  if (error || !pending?.length) return { events: 0, sent: 0 }
  let sent = 0
  for (const item of pending) {
    const { data: subs } = await admin
      .from('push_subscriptions')
      .select('id, user_id, endpoint, p256dh, auth, failures')
      .eq('user_id', item.recipient_id)
      .returns<Subscription[]>()
    if (!subs?.length) continue
    sent += await sendTo(
      admin,
      subs,
      JSON.stringify({
        title: item.title,
        body: item.body,
        link: '/haroolife',
        tag: `haroolife.${item.kind}:${item.id}`,
      }),
    )
  }
  return { events: pending.length, sent }
}
