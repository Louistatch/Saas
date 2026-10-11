import 'server-only'
import { emailSuperAdmins, emailUser } from '@/lib/email/resend'
import type { createClient as createAdminClient } from '@/lib/supabase/admin'

export type ReplyRole = 'equipe' | 'operateur' | 'utilisateur'
type Admin = ReturnType<typeof createAdminClient>

export interface Reply {
  id: string
  message_id: string
  author_role: ReplyRole
  body: string
  created_at: string
}

export async function repliesFor(
  admin: Admin,
  messageIds: string[],
): Promise<Map<string, Reply[]>> {
  const map = new Map<string, Reply[]>()
  if (messageIds.length === 0) return map
  const { data } = await admin
    .from('support_replies')
    .select('id, message_id, author_role, body, created_at')
    .in('message_id', messageIds)
    .order('created_at', { ascending: true })
  for (const r of (data ?? []) as Reply[])
    map.set(r.message_id, [...(map.get(r.message_id) ?? []), r])
  return map
}

/**
 * Ajoute une réponse au fil. L'équipe ou un opérateur qui répond classe le message « traité » ;
 * l'utilisateur qui répond le rouvre (« nouveau »). La personne d'en face est prévenue par e-mail.
 */
export async function addReply(
  admin: Admin,
  params: { messageId: string; authorId: string; role: ReplyRole; body: string },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: msg } = await admin
    .from('contact_messages')
    .select('id, user_id, subject, cooperative_id')
    .eq('id', params.messageId)
    .maybeSingle()
  if (!msg) return { ok: false, error: 'Conversation introuvable' }
  const now = new Date().toISOString()
  const { error } = await admin.from('support_replies').insert({
    message_id: params.messageId,
    author_id: params.authorId,
    author_role: params.role,
    body: params.body,
  })
  if (error) return { ok: false, error: 'Envoi impossible' }
  await admin
    .from('contact_messages')
    .update({
      last_reply_at: now,
      status: params.role === 'utilisateur' ? 'nouveau' : 'traite',
      ...(params.role === 'utilisateur' ? { user_last_read_at: now } : {}),
    })
    .eq('id', params.messageId)

  const subject = msg.subject ?? 'votre message'
  if (params.role === 'utilisateur') {
    await emailSuperAdmins(`Nouvelle réponse : ${subject}`, {
      title: `Nouvelle réponse : ${subject}`,
      lines: [params.body.slice(0, 600)],
      cta: { label: 'Ouvrir la conversation', path: '/admin/messages' },
    })
  } else if (msg.user_id) {
    await emailUser(msg.user_id, `Réponse à « ${subject} »`, {
      title: 'Vous avez une réponse',
      lines: [
        params.role === 'equipe'
          ? 'L’équipe FaîtiereHub vous a répondu :'
          : 'Un opérateur de votre zone vous a répondu :',
        params.body.slice(0, 600),
        'Retrouvez toute la conversation dans votre tableau de bord, bouton « Écrire à l’équipe », onglet « Mes échanges ».',
      ],
      cta: { label: 'Voir la conversation', path: '/dashboard' },
    })
  }
  return { ok: true }
}
