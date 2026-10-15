'use client'

/**
 * Browser side effects of private conversations, shared by the game and the dashboard: a read
 * conversation is recorded in the database (so it stops counting as unread everywhere), and a
 * sent message asks the server to alert its recipient's phone. Both are best effort: the chat
 * works without them (migration not applied, alerts not configured).
 */
import type { ClientHooks } from './client'
import type { RoomId } from './protocol'

const lastRead = new Map<RoomId, number>()

async function markRead(room: RoomId) {
  const now = Date.now()
  if (now - (lastRead.get(room) ?? 0) < 3000) return
  lastRead.set(room, now)
  const { createClient } = await import('@/lib/supabase/client')
  await createClient().rpc('haroolife_dm_read', { p_room: room })
}

export const dmHooks: ClientHooks = {
  dmRead: (room) => void markRead(room).catch(() => {}),
  dmSent: () =>
    void fetch('/api/push/dispatch', { method: 'POST', keepalive: true }).catch(() => {}),
}
