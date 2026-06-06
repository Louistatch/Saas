import { createClient } from '@/lib/supabase/server'

export type NotificationChannel = 'sms' | 'whatsapp' | 'email' | 'in_app'

interface QueueNotificationParams {
  cooperativeId: string
  memberId?: string
  channel: NotificationChannel
  templateKey: string
  variables: Record<string, string>
  recipientPhone?: string
  recipientEmail?: string
  scheduledAt?: Date
}

/**
 * Add a notification to the queue for async processing.
 * Fire-and-forget — never awaited inline.
 */
export async function queueNotification(params: QueueNotificationParams): Promise<void> {
  try {
    const supabase = await createClient()

    // Fetch template
    const { data: template } = await supabase
      .from('notification_templates')
      .select('body_fr')
      .eq('key', params.templateKey)
      .eq('channel', params.channel)
      .maybeSingle()

    // Render body
    let body = template?.body_fr ?? ''
    for (const [key, value] of Object.entries(params.variables)) {
      body = body.replace(new RegExp(`\\{${key}\\}`, 'g'), value)
    }

    await supabase.from('notification_queue').insert({
      member_id: params.memberId ?? null,
      cooperative_id: params.cooperativeId,
      channel: params.channel,
      template_key: params.templateKey,
      recipient_phone: params.recipientPhone ?? null,
      recipient_email: params.recipientEmail ?? null,
      variables: params.variables,
      body_rendered: body,
      scheduled_at: params.scheduledAt?.toISOString() ?? new Date().toISOString(),
    })
  } catch {
    // Silent — notifications must never break the main flow
  }
}

/**
 * Queue an in-app notification visible in the dashboard.
 */
export async function queueInAppNotification(params: {
  cooperativeId: string
  title: string
  body: string
  type?: 'info' | 'success' | 'warning' | 'alert'
  icon?: string
  link?: string
}): Promise<void> {
  try {
    const supabase = await createClient()
    await supabase.from('notifications_inapp').insert({
      cooperative_id: params.cooperativeId,
      title: params.title,
      body: params.body,
      type: params.type ?? 'info',
      icon: params.icon ?? null,
      link: params.link ?? null,
    })
  } catch {
    // Silent
  }
}
