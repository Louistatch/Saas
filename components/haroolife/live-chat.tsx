'use client'

/**
 * Live discussions in the game phone (D4+, M1): rooms the database grants, messages stored before
 * they are shown to others, own messages with their delivery state, typing, presence, offline
 * queue, report / block. Text is rendered as text (React escapes it): never as HTML.
 */
import type { RealtimeClient, RealtimeSnapshot } from '@/lib/haroolife/realtime/client'
import { LIMITS, type Peer, type RoomId, isDm } from '@/lib/haroolife/realtime/protocol'
import { Send } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { AccountPrompt } from './visitor'

const TIME = new Intl.DateTimeFormat('fr-FR', {
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Africa/Lome',
})
export function roomLabel(room: RoomId, peers: Record<RoomId, Peer> = {}): string {
  if (isDm(room)) return peers[room]?.name ?? 'Conversation privée'
  if (room === 'world:togo') return 'Togo'
  if (room === 'locality:lome') return 'Lomé'
  if (room === 'locality:kara') return 'Kara'
  if (room.startsWith('canton:')) return 'Mon canton'
  if (room.startsWith('coop:')) return 'Ma coopérative'
  return room
}

export default function LiveChat({
  client,
  state,
  locality,
  onChooseHome,
  initialRoom,
}: {
  client: RealtimeClient | null
  state: RealtimeSnapshot
  locality: 'lome' | 'kara'
  onChooseHome: () => void
  /** Open on this room (a private conversation started from a player's sheet). */
  initialRoom?: RoomId | null
}) {
  // Group rooms first, then private conversations (most recent first, as the database lists them).
  const all = state.me?.rooms ?? []
  const rooms = [...all.filter((r) => !isDm(r)), ...all.filter(isDm)]
  const label = (r: RoomId) => roomLabel(r, state.peers)
  const [room, setRoom] = useState<RoomId>(initialRoom ?? `locality:${locality}`)
  const active = rooms.includes(room) ? room : (rooms[0] ?? `locality:${locality}`)
  const [draft, setDraft] = useState('')
  const [menu, setMenu] = useState<string | null>(null)
  const [error, setError] = useState('')
  const list = useRef<HTMLDivElement | null>(null)
  const messages = state.rooms[active] ?? []
  const pending = state.outbox.filter((o) => o.room === active)
  const typing = (state.typing[active] ?? []).map((t) => t.name)

  useEffect(() => {
    client?.read(active)
    return () => client?.read(null)
  }, [client, active])
  // Stay at the bottom when something new arrives.
  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll on new content only
  useEffect(() => {
    const el = list.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages.length, pending.length, active])

  const banner = useMemo(() => {
    switch (state.status) {
      case 'connecting':
      case 'idle':
        return 'Connexion à la discussion…'
      case 'offline':
        return 'Hors connexion : tes messages partiront dès le retour du réseau.'
      case 'signed-out':
        return 'Connecte-toi à FaîtiereHub pour discuter avec les habitants.'
      case 'disabled':
        return 'La discussion en direct est momentanément coupée.'
      case 'denied':
        return 'Ton compte n’a pas encore accès à la discussion en direct de HarooLife.'
      default:
        return null
    }
  }, [state.status])
  const here = state.present.length

  function submit() {
    if (!client) return
    const err = client.send(active, draft)
    if (err) setError(err)
    else {
      setDraft('')
      setError('')
    }
  }

  return (
    <section aria-label="Discussions en direct" className="space-y-2">
      <div className="flex items-center justify-between text-xs">
        <span className="flex items-center gap-1.5 font-semibold text-slate-700">
          <span
            aria-hidden
            className={`h-2 w-2 rounded-full ${state.status === 'online' ? 'bg-emerald-500' : 'bg-slate-300'}`}
          />
          {state.status === 'online' ? 'En direct' : 'Hors ligne'}
        </span>
        {state.status === 'online' && (
          <span data-testid="present-count" className="text-slate-500">
            {here === 0
              ? 'Personne d’autre ici pour l’instant'
              : `${here} ${here > 1 ? 'personnes' : 'personne'} en ligne à ${locality === 'lome' ? 'Lomé' : 'Kara'}`}
          </span>
        )}
      </div>
      {banner && (
        <output className="block rounded-xl bg-amber-50 p-2 text-xs font-semibold text-amber-900">
          {banner}
        </output>
      )}
      {rooms.length > 0 && (
        <fieldset className="-mx-1 flex gap-1 overflow-x-auto border-0 px-1" aria-label="Salons">
          {rooms.map((r) => (
            <button
              type="button"
              key={r}
              aria-pressed={r === active}
              onClick={() => setRoom(r)}
              className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-bold ${
                r === active
                  ? 'bg-slate-900 text-white'
                  : 'bg-white text-slate-700 ring-1 ring-slate-200'
              }`}
            >
              {isDm(r) ? `💬 ${label(r)}` : label(r)}
              {(state.unread[r] ?? 0) > 0 && r !== active && (
                <span className="ml-1 rounded-full bg-rose-500 px-1.5 text-[10px] text-white">
                  {state.unread[r]}
                </span>
              )}
            </button>
          ))}
        </fieldset>
      )}
      <div
        ref={list}
        role="log"
        aria-live="polite"
        aria-label={`Messages · ${label(active)}`}
        className="max-h-[42vh] min-h-32 space-y-2 overflow-y-auto rounded-2xl bg-slate-50 p-3"
      >
        {messages.length >= 30 && (
          <button
            type="button"
            onClick={() => void client?.olderThan(active)}
            className="mx-auto block text-[11px] font-semibold text-emerald-700"
          >
            Messages précédents
          </button>
        )}
        {messages.length === 0 && pending.length === 0 && (
          <p className="py-6 text-center text-xs text-slate-500">
            Aucun message ici. Écris le premier !
          </p>
        )}
        {messages.map((m) => {
          const mine = m.author.key === state.me?.key
          return (
            <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${
                  mine ? 'bg-emerald-600 text-white' : 'bg-white text-slate-800 shadow-sm'
                }`}
              >
                <div className="flex items-baseline justify-between gap-3 text-[11px] opacity-80">
                  <strong>{mine ? 'Moi' : m.author.name}</strong>
                  <span className="flex items-center gap-1">
                    {TIME.format(new Date(m.created_at))}
                    {m.edited && !m.deleted ? ' · modifié' : ''}
                    {!m.deleted && (
                      <button
                        type="button"
                        aria-label={
                          mine ? 'Options de mon message' : `Options du message de ${m.author.name}`
                        }
                        onClick={() => setMenu(menu === m.id ? null : m.id)}
                        className="-my-1 ml-1 rounded-full px-1.5 text-sm leading-none"
                      >
                        ⋯
                      </button>
                    )}
                  </span>
                </div>
                <p className="whitespace-pre-wrap break-words" data-testid="chat-body">
                  {m.deleted ? <em className="opacity-70">Message effacé</em> : m.body}
                </p>
                {mine && !m.deleted && <span className="sr-only">Enregistré</span>}
                {menu === m.id && (
                  <div className="mt-1 flex gap-2 text-[11px] font-semibold">
                    {mine ? (
                      <button
                        type="button"
                        onClick={() => {
                          setMenu(null)
                          void client?.remove(m.id).then((e) => e && setError(e))
                        }}
                        className="underline"
                      >
                        Effacer
                      </button>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            setMenu(null)
                            void client
                              ?.report(m.id, 'Signalé depuis le jeu')
                              .then((e) => setError(e ?? 'Message signalé à l’équipe. Merci.'))
                          }}
                          className="underline"
                        >
                          Signaler
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setMenu(null)
                            void client
                              ?.block(m.id)
                              .then((e) =>
                                setError(
                                  e ??
                                    `${m.author.name} est bloqué : tu ne verras plus ses messages.`,
                                ),
                              )
                          }}
                          className="underline"
                        >
                          Bloquer
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
          )
        })}
        {pending.map((o) => (
          <div key={o.clientId} className="flex justify-end">
            <div
              data-testid="chat-pending"
              data-state={o.state}
              className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${
                o.state === 'error'
                  ? 'bg-rose-50 text-rose-900 ring-1 ring-rose-200'
                  : 'bg-emerald-600/70 text-white'
              }`}
            >
              <p className="whitespace-pre-wrap break-words">{o.body}</p>
              <p className="mt-0.5 text-[11px] opacity-90">
                {o.state === 'sending'
                  ? 'Envoi…'
                  : o.state === 'queued'
                    ? 'En attente du réseau'
                    : `Non envoyé : ${o.error ?? 'erreur'}`}
              </p>
              {o.state === 'error' && (
                <span className="mt-1 flex gap-3 text-[11px] font-bold">
                  <button
                    type="button"
                    onClick={() => client?.retry(o.clientId)}
                    className="underline"
                  >
                    Réessayer
                  </button>
                  <button
                    type="button"
                    onClick={() => client?.discard(o.clientId)}
                    className="underline"
                  >
                    Annuler
                  </button>
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
      <p className="h-4 text-[11px] text-slate-500" aria-live="polite">
        {typing.length
          ? `${typing.slice(0, 2).join(' et ')} ${typing.length > 1 ? 'écrivent' : 'écrit'}…`
          : ''}
      </p>
      {error && (
        <p role="alert" className="text-xs font-semibold text-slate-700">
          {error}
        </p>
      )}
      {state.me?.visitor ? (
        <AccountPrompt reason="Les visiteurs lisent les salons." compact />
      ) : state.me && !state.me.can_write ? (
        <button
          type="button"
          onClick={onChooseHome}
          className="block w-full rounded-xl bg-amber-50 p-3 text-left text-xs font-semibold text-amber-900"
        >
          Choisis d’abord ta maison dans HarooLife pour écrire.
        </button>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            submit()
          }}
          className="flex gap-2"
        >
          <input
            aria-label="Écrire dans la discussion"
            value={draft}
            maxLength={LIMITS.body}
            disabled={!client || state.status === 'signed-out' || state.status === 'disabled'}
            onChange={(e) => {
              setDraft(e.target.value)
              client?.typing(active)
            }}
            className="min-w-0 flex-1 rounded-2xl border border-slate-200 px-3 py-3 text-sm disabled:bg-slate-100"
            placeholder={`Écrire à ${label(active)}…`}
          />
          <button
            type="submit"
            aria-label="Envoyer le message"
            disabled={!draft.trim() || !client}
            className="rounded-2xl bg-emerald-600 px-4 text-white disabled:opacity-50"
          >
            <Send size={18} />
          </button>
        </form>
      )}
      {draft.length > LIMITS.body - 80 && (
        <p className="text-right text-[11px] text-slate-500">
          {draft.length}/{LIMITS.body}
        </p>
      )}
    </section>
  )
}
