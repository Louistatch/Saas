'use client'

/**
 * Live presence for the Lomé 3D neighbourhood: the signed-in account's canton, its
 * residents and the place messages, from the existing HarooLife world API.
 * Offline (not signed in, or HarooLife disabled) the game stays fully playable alone.
 */
import type { World } from '@/lib/haroolife/world'
import { useCallback, useEffect, useState } from 'react'

export type PresenceStatus = 'loading' | 'ready' | 'offline' | 'unavailable'

export function usePresence(refreshMs = 60_000) {
  const [world, setWorld] = useState<World | null>(null)
  const [status, setStatus] = useState<PresenceStatus>('loading')

  const reload = useCallback(async () => {
    const res = await fetch('/api/haroolife/world', { cache: 'no-store' }).catch(() => null)
    if (!res) return setStatus('offline')
    if (res.status === 401) return setStatus('offline')
    if (res.status === 503) return setStatus('unavailable')
    if (!res.ok) return setStatus('offline')
    const w = (await res.json().catch(() => null)) as World | null
    if (!w) return setStatus('offline')
    setWorld(w)
    setStatus('ready')
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])
  useEffect(() => {
    if (status !== 'ready') return
    const id = window.setInterval(() => {
      if (document.visibilityState === 'visible') void reload()
    }, refreshMs)
    return () => window.clearInterval(id)
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
  if (res?.status === 401)
    return 'Les visiteurs écoutent la place. Crée ton compte FaîtiereHub pour parler : ta partie te suit.'
  const data: { error?: string } = res ? await res.json().catch(() => ({})) : {}
  return data.error ?? 'Connexion interrompue. Réessayez.'
}
