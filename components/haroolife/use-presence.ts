'use client'

/**
 * Live presence for the Lomé 3D neighbourhood: the signed-in account's canton, its
 * residents and the place messages, from the existing HarooLife world API.
 * Offline (not signed in, or HarooLife disabled) the game stays fully playable alone.
 */
import type { World } from '@/lib/haroolife/world'
import { useCallback, useEffect, useRef, useState } from 'react'

export type PresenceStatus = 'loading' | 'ready' | 'offline' | 'unavailable'

export function usePresence(refreshMs = 60_000) {
  const [world, setWorld] = useState<World | null>(null)
  const [status, setStatus] = useState<PresenceStatus>('loading')
  const busy = useRef(false)

  const reload = useCallback(async () => {
    if (busy.current) return
    busy.current = true
    try {
      const res = await fetch('/api/haroolife/world', {
        cache: 'no-store',
        signal: AbortSignal.timeout(15_000),
      }).catch(() => null)
      if (!res) return setStatus('offline')
      if (res.status === 401) return setStatus('offline')
      if (res.status === 503) return setStatus('unavailable')
      if (!res.ok) return setStatus('offline')
      const w = (await res.json().catch(() => null)) as World | null
      if (!w) return setStatus('offline')
      setWorld(w)
      setStatus('ready')
    } finally {
      busy.current = false
    }
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])
  useEffect(() => {
    if (status !== 'ready') return
    let stopped = false
    let timer = 0
    const schedule = () => {
      timer = window.setTimeout(
        async () => {
          if (document.visibilityState === 'visible') await reload()
          if (!stopped) schedule()
        },
        refreshMs * (0.8 + Math.random() * 0.4),
      )
    }
    schedule()
    return () => {
      stopped = true
      window.clearTimeout(timer)
    }
  }, [status, reload, refreshMs])

  return { world, status, reload }
}

export async function sayOnPlace(cantonId: string, body: string): Promise<string | null> {
  const res = await fetch('/api/haroolife/say', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ canton_id: cantonId, body }),
  }).catch(() => null)
  if (res?.ok) return null
  const data: { error?: string } = res ? await res.json().catch(() => ({})) : {}
  return data.error ?? 'Connexion interrompue. Réessayez.'
}
