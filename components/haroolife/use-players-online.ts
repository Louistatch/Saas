'use client'

/**
 * The open game's heartbeat (haroolife_here): once on opening, then every minute while the game
 * is on screen, and at once when the player changes town. Returns how many people are online in
 * the whole game and how many residents it has; null until known (signed out, or unavailable).
 */
import type { LocalityId } from '@/lib/haroolife/city/locality'
import { type PlayerCounts, imHere } from '@/lib/haroolife/players'
import { useEffect, useState } from 'react'

export function usePlayersOnline(locality: LocalityId, enabled: boolean) {
  const [counts, setCounts] = useState<PlayerCounts | null>(null)
  useEffect(() => {
    if (!enabled) return
    let stop = false
    const beat = async () => {
      if (document.visibilityState !== 'visible') return
      const c = await imHere(locality)
      if (!stop && c) setCounts(c)
    }
    void beat()
    const id = window.setInterval(() => void beat(), 60_000)
    document.addEventListener('visibilitychange', beat)
    return () => {
      stop = true
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', beat)
    }
  }, [locality, enabled])
  return counts
}
