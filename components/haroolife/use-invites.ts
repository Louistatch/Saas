'use client'

/**
 * The game side of the invitations (supabase/migrations/20261017_130000_haroolife_invites.sql):
 * - a friend's code kept on this phone (see game-entry.tsx) is accepted as soon as the server
 *   allows it (a new player with a home): their bonus is added to the game at once;
 * - the bonuses of the friends this player brought are collected when the game opens, every
 *   two minutes, and when the « Inviter » app is opened.
 * Signed out or server unreachable: nothing happens, the code waits.
 */
import { INVITE_STORAGE, inviteCodeFrom } from '@/lib/haroolife/invite'
import { useCallback, useEffect, useRef } from 'react'

async function supabase() {
  const { createClient } = await import('@/lib/supabase/client')
  return createClient()
}

type Accept =
  | { ok: true; bonus: number; inviter: string }
  | { ok: false; final: boolean; reason: string }
type Claim = { total: number; friends: string[] }

const stored = () => {
  try {
    return inviteCodeFrom(localStorage.getItem(INVITE_STORAGE))
  } catch {
    return null
  }
}
const forget = () => {
  try {
    localStorage.removeItem(INVITE_STORAGE)
  } catch {
    // Storage refused: the server refuses a second use anyway.
  }
}

export function useInvites({
  loaded,
  credit,
}: {
  loaded: boolean
  /** Add game money to the player's wallet, with the line shown to them. */
  credit: (amount: number, line: string) => void
}) {
  const give = useRef(credit)
  give.current = credit
  const busy = useRef(false)

  const run = useCallback(async () => {
    if (busy.current) return
    busy.current = true
    try {
      const sb = await supabase()
      const { data: auth } = await sb.auth.getSession()
      if (!auth.session) return
      const code = stored()
      if (code) {
        const { data, error } = await sb.rpc('haroolife_invite_accept', { p_code: code })
        const r = data as Accept | null
        if (!error && r) {
          if (r.ok) {
            forget()
            give.current(
              r.bonus,
              `Bienvenue ! ${r.inviter} t’a invité : +${r.bonus.toLocaleString('fr-FR')} FCFA de jeu.`,
            )
          } else if (r.final) forget()
        }
      }
      const { data, error } = await sb.rpc('haroolife_invite_claim')
      const c = data as Claim | null
      if (!error && c && c.total > 0) {
        const who = c.friends.slice(0, 3).join(', ')
        give.current(
          c.total,
          `${who || 'Tes amis'} ${c.friends.length > 1 ? 'sont arrivés' : 'est arrivé'} grâce à toi : +${c.total.toLocaleString('fr-FR')} FCFA de jeu.`,
        )
      }
    } catch {
      // Offline: next time.
    } finally {
      busy.current = false
    }
  }, [])

  useEffect(() => {
    if (!loaded) return
    void run()
    const id = window.setInterval(() => void run(), 120_000)
    return () => window.clearInterval(id)
  }, [loaded, run])

  return { refresh: run }
}
