'use client'

/**
 * HarooLife private messages outside the game: the conversations someone was written to, with
 * their unread count, in the dashboard (card) and on /messages (read and reply). The list and the
 * unread counts come from the database (haroolife_dm_inbox), so they survive leaving the game;
 * the relay, when reachable, brings new messages live and carries replies so the other player
 * sees them at once in the game. Without the relay, replies are stored through the database.
 */
import { useRealtime } from '@/components/haroolife/use-realtime'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { uuid } from '@/lib/haroolife/realtime/client'
import { dmHooks } from '@/lib/haroolife/realtime/dm-hooks'
import type { ChatMessage } from '@/lib/haroolife/realtime/protocol'
import { Bell, BellOff, ChevronLeft, MessageCircle, Send } from 'lucide-react'
import Link from 'next/link'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

export interface InboxEntry {
  room: string
  peer: { key: string; name: string; pagne: number }
  last: { body: string; mine: boolean; at: string }
  unread: number
}

function timeAgo(iso: string) {
  const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000)
  if (min < 1) return 'à l’instant'
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return `${h} h`
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
}

async function rpc<T>(fn: string, args?: Record<string, unknown>): Promise<T | null> {
  const { createClient } = await import('@/lib/supabase/client')
  const { data, error } = await createClient().rpc(fn, args)
  return error ? null : (data as T)
}

/** The inbox, refreshed when a private message arrives live and every minute otherwise. */
function useInbox() {
  const { client, state } = useRealtime()
  const [entries, setEntries] = useState<InboxEntry[] | null>(null)
  const [available, setAvailable] = useState(true)
  const load = useCallback(async () => {
    const data = await rpc<InboxEntry[]>('haroolife_dm_inbox')
    if (data === null) setAvailable(false)
    else {
      setAvailable(true)
      setEntries(data)
    }
  }, [])
  useEffect(() => {
    void load()
    const t = window.setInterval(() => void load(), 60_000)
    return () => window.clearInterval(t)
  }, [load])
  // The newest private message the relay has seen: a change means the inbox moved.
  const latest = useMemo(() => {
    let best = 0
    for (const [room, list] of Object.entries(state.rooms))
      if (room.startsWith('dm:') && list.length) best = Math.max(best, list[list.length - 1].seq)
    return best
  }, [state.rooms])
  useEffect(() => {
    if (!latest) return
    const t = window.setTimeout(() => void load(), 400)
    return () => window.clearTimeout(t)
  }, [latest, load])
  return { entries, available, reload: load, client, state }
}

function Initial({ name }: { name: string }) {
  return (
    <span
      aria-hidden
      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-base font-black text-emerald-800"
    >
      {name.slice(0, 1).toUpperCase()}
    </span>
  )
}

function Preview({ entry }: { entry: InboxEntry }) {
  const text = entry.last.body || 'Message supprimé'
  return (
    <span className="block truncate text-sm text-muted-foreground">
      {entry.last.mine ? `Toi : ${text}` : text}
    </span>
  )
}

/** Dashboard card: shown only when there is at least one conversation. */
export function HarooLifeMessagesCard() {
  const { entries, available } = useInbox()
  if (process.env.NEXT_PUBLIC_HAROOLIFE_ENABLED !== 'true' || !available || !entries?.length)
    return null
  const unread = entries.reduce((n, e) => n + e.unread, 0)
  return (
    <Card data-testid="haroolife-messages-card">
      <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0 pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <MessageCircle className="h-5 w-5 text-emerald-700" aria-hidden />
          Messages HarooLife
        </CardTitle>
        {unread > 0 && (
          <span className="rounded-full bg-emerald-600 px-2.5 py-0.5 text-xs font-bold text-white">
            {unread} non lu{unread > 1 ? 's' : ''}
          </span>
        )}
      </CardHeader>
      <CardContent className="space-y-1">
        {entries.slice(0, 3).map((e) => (
          <Link
            key={e.room}
            href={`/messages?room=${encodeURIComponent(e.room)}`}
            className="flex items-center gap-3 rounded-lg p-2 hover:bg-muted focus-visible:outline-2"
          >
            <Initial name={e.peer.name} />
            <span className="min-w-0 flex-1">
              <span className="flex items-baseline justify-between gap-2">
                <span className={`truncate ${e.unread ? 'font-bold' : 'font-medium'}`}>
                  {e.peer.name}
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">{timeAgo(e.last.at)}</span>
              </span>
              <Preview entry={e} />
            </span>
            {e.unread > 0 && (
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full bg-emerald-600"
                aria-label={`${e.unread} non lu${e.unread > 1 ? 's' : ''}`}
              />
            )}
          </Link>
        ))}
        <Link
          href="/messages"
          className="block pt-2 text-sm font-semibold text-emerald-800 hover:underline"
        >
          Lire et répondre
        </Link>
      </CardContent>
    </Card>
  )
}

const VAPID = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? ''

function urlBase64ToUint8Array(base64: string) {
  const padded = (base64 + '='.repeat((4 - (base64.length % 4)) % 4))
    .replace(/-/g, '+')
    .replace(/_/g, '/')
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0))
}

type PushState = 'unsupported' | 'off' | 'on' | 'denied' | 'busy'

/** Alerts on this phone when someone writes (Web Push, the same subscriptions as the console). */
function PushToggle() {
  const [state, setState] = useState<PushState>('unsupported')
  const [note, setNote] = useState('')
  useEffect(() => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !VAPID) return
    navigator.serviceWorker
      .getRegistration('/')
      .then((reg) => reg?.pushManager.getSubscription() ?? null)
      .then((sub) => {
        if (Notification.permission === 'denied') setState('denied')
        else setState(sub ? 'on' : 'off')
      })
      .catch(() => setState('unsupported'))
  }, [])
  if (state === 'unsupported') return null
  const enable = async () => {
    setState('busy')
    setNote('')
    try {
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') {
        setState(permission === 'denied' ? 'denied' : 'off')
        return
      }
      await navigator.serviceWorker.register('/sw.js', { scope: '/' })
      const reg = await navigator.serviceWorker.ready
      const sub =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID),
        }))
      const res = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sub.toJSON()),
      })
      if (!res.ok) throw new Error('subscribe')
      setState('on')
      setNote('Tu seras prévenu sur ce téléphone quand on t’écrit.')
    } catch {
      setState('off')
      setNote('Activation impossible sur ce navigateur.')
    }
  }
  const disable = async () => {
    setState('busy')
    try {
      const reg = await navigator.serviceWorker.getRegistration('/')
      const sub = await reg?.pushManager.getSubscription()
      if (sub) {
        await fetch('/api/push/subscribe', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        })
        await sub.unsubscribe()
      }
      setState('off')
      setNote('')
    } catch {
      setState('on')
    }
  }
  return (
    <div className="space-y-1">
      {state === 'on' ? (
        <Button variant="outline" size="sm" onClick={() => void disable()}>
          <BellOff className="mr-2 h-4 w-4" aria-hidden /> Ne plus me prévenir
        </Button>
      ) : state === 'denied' ? (
        <p className="text-xs text-muted-foreground">
          Les notifications sont bloquées pour ce site dans les réglages du navigateur.
        </p>
      ) : (
        <Button
          variant="outline"
          size="sm"
          disabled={state === 'busy'}
          onClick={() => void enable()}
        >
          <Bell className="mr-2 h-4 w-4" aria-hidden /> Me prévenir sur ce téléphone
        </Button>
      )}
      {note && <p className="text-xs text-muted-foreground">{note}</p>}
    </div>
  )
}

/** One conversation: history, live messages, reply. */
function Conversation({
  entry,
  inbox,
  onBack,
}: {
  entry: InboxEntry
  inbox: ReturnType<typeof useInbox>
  onBack: () => void
}) {
  const { client, state, reload } = inbox
  const live = state.status === 'online' && state.me?.rooms.includes(entry.room)
  const [stored, setStored] = useState<ChatMessage[]>([])
  const [draft, setDraft] = useState('')
  const [error, setError] = useState('')
  const [sending, setSending] = useState(false)
  const end = useRef<HTMLDivElement>(null)

  const fetchHistory = useCallback(async () => {
    const list = await rpc<ChatMessage[]>('haroolife_chat_history', {
      p_room: entry.room,
      p_limit: 50,
    })
    if (list) setStored(list)
  }, [entry.room])
  useEffect(() => {
    void fetchHistory()
    dmHooks.dmRead?.(entry.room)
  }, [fetchHistory, entry.room])
  // Read on screen while open: the relay's own unread count and the database's.
  useEffect(() => {
    if (!client) return
    client.read(entry.room)
    return () => client.read(null)
  }, [client, entry.room])

  const messages = useMemo(() => {
    const byId = new Map<string, ChatMessage>()
    for (const m of stored) byId.set(m.id, m)
    for (const m of state.rooms[entry.room] ?? []) byId.set(m.id, m)
    return [...byId.values()].sort((a, b) => a.seq - b.seq)
  }, [stored, state.rooms, entry.room])
  const pending = state.outbox.filter((o) => o.room === entry.room)
  // Keep the newest message in view as the conversation grows.
  const count = messages.length + pending.length
  useEffect(() => {
    if (count) end.current?.scrollIntoView({ block: 'end' })
  }, [count])

  const submit = async () => {
    const text = draft.trim()
    if (!text || sending) return
    setError('')
    if (live && client) {
      const refused = client.send(entry.room, text)
      if (refused) setError(refused)
      else setDraft('')
      return
    }
    // Relay out of reach: stored through the database, seen by the other player next time.
    setSending(true)
    const { createClient } = await import('@/lib/supabase/client')
    const { error: e } = await createClient().rpc('haroolife_chat_send', {
      p_room: entry.room,
      p_body: text,
      p_client_id: uuid(),
    })
    setSending(false)
    if (e) {
      setError('Envoi impossible : vérifie ta connexion et réessaie.')
      return
    }
    setDraft('')
    dmHooks.dmSent?.()
    await fetchHistory()
    void reload()
  }

  return (
    <section
      aria-label={`Conversation avec ${entry.peer.name}`}
      className="flex min-h-[60dvh] flex-col"
    >
      <header className="flex items-center gap-3 border-b pb-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={onBack}
          aria-label="Retour aux conversations"
          className="md:hidden"
        >
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <Initial name={entry.peer.name} />
        <div className="min-w-0">
          <p className="truncate font-bold">{entry.peer.name}</p>
          <p className="text-xs text-muted-foreground">
            {live ? 'Habitant de HarooLife · en direct' : 'Habitant de HarooLife'}
          </p>
        </div>
      </header>
      <div
        role="log"
        aria-label={`Messages avec ${entry.peer.name}`}
        className="flex-1 space-y-2 overflow-y-auto py-4"
      >
        {messages.map((m) => {
          // Two people in the conversation: anything not from the other player is mine.
          const mine = m.author.key !== entry.peer.key
          return (
            <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
              <p
                className={`max-w-[85%] whitespace-pre-wrap break-words rounded-2xl px-3 py-2 text-sm ${
                  mine ? 'bg-emerald-600 text-white' : 'bg-muted text-foreground'
                } ${m.deleted ? 'italic opacity-70' : ''}`}
              >
                {m.deleted ? 'Message supprimé' : m.body}
                <span
                  className={`mt-1 block text-[10px] ${mine ? 'text-emerald-100' : 'text-muted-foreground'}`}
                >
                  {timeAgo(m.created_at)}
                </span>
              </p>
            </div>
          )
        })}
        {pending.map((o) => (
          <div key={o.clientId} className="flex justify-end">
            <p className="max-w-[85%] rounded-2xl bg-emerald-600/60 px-3 py-2 text-sm text-white">
              {o.body}
              <span className="mt-1 block text-[10px] text-emerald-100">
                {o.state === 'error' ? (o.error ?? 'Non envoyé') : 'Envoi…'}
              </span>
            </p>
          </div>
        ))}
        <div ref={end} />
      </div>
      <form
        className="flex gap-2 border-t pt-3"
        onSubmit={(e) => {
          e.preventDefault()
          void submit()
        }}
      >
        <input
          aria-label={`Répondre à ${entry.peer.name}`}
          value={draft}
          maxLength={500}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={`Répondre à ${entry.peer.name}…`}
          className="min-w-0 flex-1 rounded-xl border bg-background px-3 py-2.5 text-sm"
        />
        <Button type="submit" disabled={!draft.trim() || sending} aria-label="Envoyer">
          <Send className="h-4 w-4" />
        </Button>
      </form>
      {error && (
        <p role="alert" className="pt-2 text-sm text-red-700">
          {error}
        </p>
      )}
    </section>
  )
}

/** The /messages page: the list, and the open conversation beside it (below on a phone). */
export function HarooLifeMessagesPage({ initialRoom }: { initialRoom: string | null }) {
  const inbox = useInbox()
  const [open, setOpen] = useState<string | null>(initialRoom)
  const entries = inbox.entries
  const current = entries?.find((e) => e.room === open) ?? null

  if (!inbox.available)
    return (
      <p className="text-muted-foreground">
        La messagerie HarooLife n’est pas encore disponible sur ce compte.
      </p>
    )
  return (
    <div className="grid gap-6 md:grid-cols-[minmax(0,320px)_1fr]">
      <div className={current ? 'hidden md:block' : ''}>
        <div className="mb-4">
          <PushToggle />
        </div>
        {entries === null ? (
          <p className="text-sm text-muted-foreground">Chargement…</p>
        ) : entries.length === 0 ? (
          <div className="rounded-xl border p-5 text-sm">
            <p className="font-semibold">Aucune conversation pour l’instant.</p>
            <p className="mt-1 text-muted-foreground">
              Dans HarooLife, touche l’étiquette verte d’un joueur croisé dans la rue, puis «
              Discuter ».
            </p>
            <Link
              href="/haroolife"
              prefetch={false}
              className="mt-3 inline-block font-semibold text-emerald-800 hover:underline"
            >
              Ouvrir HarooLife
            </Link>
          </div>
        ) : (
          <ul aria-label="Conversations" className="space-y-1">
            {entries.map((e) => (
              <li key={e.room}>
                <button
                  type="button"
                  onClick={() => setOpen(e.room)}
                  aria-current={e.room === open ? 'true' : undefined}
                  className={`flex w-full items-center gap-3 rounded-lg p-2 text-left hover:bg-muted ${
                    e.room === open ? 'bg-muted' : ''
                  }`}
                >
                  <Initial name={e.peer.name} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-2">
                      <span className={`truncate ${e.unread ? 'font-bold' : 'font-medium'}`}>
                        {e.peer.name}
                      </span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {timeAgo(e.last.at)}
                      </span>
                    </span>
                    <Preview entry={e} />
                  </span>
                  {e.unread > 0 && (
                    <span className="rounded-full bg-emerald-600 px-2 py-0.5 text-xs font-bold text-white">
                      {e.unread}
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {current ? (
        <Conversation
          key={current.room}
          entry={current}
          inbox={inbox}
          onBack={() => setOpen(null)}
        />
      ) : (
        entries?.length !== 0 && (
          <p className="hidden self-center text-center text-sm text-muted-foreground md:block">
            Choisis une conversation.
          </p>
        )
      )}
    </div>
  )
}
