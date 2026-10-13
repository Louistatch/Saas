'use client'

/**
 * The HarooLife realtime relay in React (D4+, M1). Enabled only when
 * NEXT_PUBLIC_HAROOLIFE_REALTIME_URL is set; otherwise status is 'disabled' and the game keeps
 * the existing HTTP place messages. The token is the person's own Supabase session, refreshed by
 * the Supabase client; the relay verifies it.
 */
import { RealtimeClient, type RealtimeSnapshot } from '@/lib/haroolife/realtime/client'
import { useEffect, useState, useSyncExternalStore } from 'react'

export const REALTIME_URL = process.env.NEXT_PUBLIC_HAROOLIFE_REALTIME_URL ?? ''

const DISABLED: RealtimeSnapshot = {
  status: 'disabled',
  me: null,
  rooms: {},
  outbox: [],
  unread: {},
  typing: {},
  present: [],
  version: 0,
}
const noop = () => () => {}

async function sessionToken(): Promise<string | null> {
  const { createClient } = await import('@/lib/supabase/client')
  const { data } = await createClient().auth.getSession()
  return data.session?.access_token ?? null
}

export function useRealtime(enabled = true) {
  const [client, setClient] = useState<RealtimeClient | null>(null)
  useEffect(() => {
    if (!REALTIME_URL || !enabled) return
    const c = new RealtimeClient(REALTIME_URL, sessionToken)
    setClient(c)
    void c.start()
    return () => {
      c.stop()
      setClient(null)
    }
  }, [enabled])
  const state = useSyncExternalStore(
    client?.subscribe ?? noop,
    client?.snapshot ?? (() => DISABLED),
    () => DISABLED,
  )
  return { client, state }
}
