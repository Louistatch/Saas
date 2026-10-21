'use client'

/**
 * Everyone in HarooLife, in the phone: how many people are online right now in the whole game,
 * and the residents, online first. « Écrire » opens a private conversation even with someone who
 * is not connected: the message waits for them, in the game and on their dashboard. With the live
 * relay the conversation opens in the game; without it, on /messages (stored in the database).
 */
import {
  type PlayerCounts,
  type PlayerList,
  listPlayers,
  onlineSaid,
  openConversation,
  seenSaid,
} from '@/lib/haroolife/players'
import type { RealtimeClient } from '@/lib/haroolife/realtime/client'
import { useEffect, useState } from 'react'
import { PAGNES } from './pagnes'

export default function PlayersDirectory({
  counts,
  client,
  relayOnline,
  onRoom,
}: {
  /** From the game's heartbeat, shown until the list answers. */
  counts: PlayerCounts | null
  client: RealtimeClient | null
  relayOnline: boolean
  /** A conversation opened through the relay: show it in the game. */
  onRoom: (room: string) => void
}) {
  const [query, setQuery] = useState('')
  const [data, setData] = useState<PlayerList | null>(null)
  const [unavailable, setUnavailable] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [note, setNote] = useState<{ key: string; text: string } | null>(null)

  // The list: at once, after a pause in typing, then every minute.
  useEffect(() => {
    let alive = true
    const load = async () => {
      const got = await listPlayers(query)
      if (!alive) return
      if (got) {
        setData(got)
        setUnavailable(false)
      } else setUnavailable(true)
    }
    const first = window.setTimeout(() => void load(), query ? 300 : 0)
    const id = window.setInterval(() => void load(), 60_000)
    return () => {
      alive = false
      window.clearTimeout(first)
      window.clearInterval(id)
    }
  }, [query])

  const write = async (key: string) => {
    setBusy(key)
    setNote(null)
    if (relayOnline && client) {
      const r = await client.openDm(key)
      setBusy(null)
      if ('error' in r) setNote({ key, text: r.error })
      else onRoom(r.room)
      return
    }
    const r = await openConversation(key)
    setBusy(null)
    if ('error' in r) setNote({ key, text: r.error })
    else window.location.assign(`/messages?room=${encodeURIComponent(r.room)}`)
  }

  const shown = data ?? counts
  return (
    <section aria-label="Tous les joueurs" className="space-y-3" data-testid="players-directory">
      <div className="rounded-2xl bg-[#195f51] p-4 text-white">
        <p className="flex items-center gap-2 text-2xl font-black" data-testid="players-online">
          <span aria-hidden className="h-3 w-3 rounded-full bg-lime-300" />
          {shown ? onlineSaid(shown.online) : 'En ligne : …'}
        </p>
        <p className="mt-0.5 text-sm text-emerald-100">
          Dans tout HarooLife, visiteurs compris
          {shown ? ` · ${shown.players} habitant${shown.players > 1 ? 's' : ''}` : ''}
        </p>
      </div>
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        maxLength={40}
        placeholder="Chercher un joueur : nom ou @pseudo"
        aria-label="Chercher un joueur"
        className="w-full rounded-xl border border-slate-300 px-3 py-3 text-base"
      />
      {unavailable && !data && (
        <p className="text-sm text-slate-600">
          La liste des joueurs ne répond pas pour l’instant. Réessaie dans un moment.
        </p>
      )}
      {data && !data.list.length && (
        <p className="text-sm text-slate-600">
          {query.trim()
            ? `Aucun habitant ne correspond à « ${query.trim()} ».`
            : 'Aucun autre habitant pour l’instant : invite tes amis depuis « Inviter des amis ».'}
        </p>
      )}
      {data && data.list.length > 0 && (
        <ul className="space-y-2">
          {data.list.map((p) => (
            <li
              key={p.key}
              className="rounded-xl border border-slate-200 bg-white p-3"
              data-testid="player-row"
            >
              <div className="flex items-center gap-3">
                <span
                  aria-hidden
                  className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-base font-black text-white"
                  style={{ background: PAGNES[(p.pagne - 1) % PAGNES.length] ?? PAGNES[0] }}
                >
                  {p.name.slice(0, 1).toUpperCase()}
                  {p.online && (
                    <span className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-white bg-lime-500" />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-black text-slate-900">
                    {p.name}
                    {p.username && (
                      <span className="ml-1.5 font-semibold text-slate-500">@{p.username}</span>
                    )}
                  </p>
                  <p
                    className={`text-xs ${p.online ? 'font-bold text-emerald-700' : 'text-slate-500'}`}
                  >
                    {seenSaid(p)}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={busy === p.key}
                  onClick={() => void write(p.key)}
                  className="shrink-0 rounded-xl bg-emerald-600 px-3 py-2.5 text-sm font-black text-white disabled:opacity-50"
                >
                  Écrire
                </button>
              </div>
              {note?.key === p.key && (
                <p role="alert" className="mt-2 text-xs font-semibold text-red-700">
                  {note.text}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-slate-500">
        Pas connecté ? Ton message l’attend : la personne le lit à son retour, dans le jeu ou sur
        son tableau de bord.
      </p>
    </section>
  )
}
