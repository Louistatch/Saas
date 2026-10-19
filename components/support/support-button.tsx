'use client'

// « Écrire à l'équipe » : bouton toujours accessible depuis les tableaux de bord. Le message
// part au super_admin et aux opérateurs de la zone. Les réponses s'affichent ici, dans l'onglet
// « Mes échanges » (pastille de non-lus sur le bouton), et arrivent aussi par e-mail.
import { useAuth } from '@/app/context/auth-context'
import { ReplyBox, Thread, type ThreadReply, postReply } from '@/components/support/thread'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { SUPPORT_CATEGORIES, type SupportCategory, messageCategoryLabel } from '@/lib/support'
import { ChevronLeft, MessageCircle } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'

interface SupportThread {
  id: string
  category: string | null
  subject: string | null
  message: string | null
  status: string
  created_at: string
  last_reply_at: string | null
  replies: ThreadReply[]
  unread: number
}

const day = (iso: string) =>
  new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })

const field =
  'w-full rounded-md border border-border bg-background p-2 text-sm text-foreground focus-visible:outline-2 focus-visible:outline-offset-2'

export function SupportButton() {
  const { user } = useAuth()
  const pathname = usePathname()
  // Le tableau de bord possède sa propre barre d’onglets fixe sur mobile.
  // Le bouton flottant doit rester au-dessus et sous son niveau d’empilement,
  // sinon il intercepte les clics destinés notamment à l’onglet « Plus ».
  const floatingPosition = pathname.startsWith('/dashboard')
    ? 'bottom-24 z-30 xl:bottom-5'
    : 'bottom-5 z-40'
  const [open, setOpen] = useState(false)
  const [category, setCategory] = useState<SupportCategory>('assistance')
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [sentTo, setSentTo] = useState<string | null | undefined>(undefined)
  const [tab, setTab] = useState<'ecrire' | 'echanges'>('ecrire')
  const [threads, setThreads] = useState<SupportThread[] | null>(null)
  const [unread, setUnread] = useState(0)
  const [openId, setOpenId] = useState<string | null>(null)
  const enabled = !!user && user.role !== 'super_admin'
  const isSuperAdmin = user?.role === 'super_admin'
  const [inboxCount, setInboxCount] = useState(0)

  // Le super_admin reçoit les messages : son bouton ouvre la messagerie, avec les messages en attente.
  useEffect(() => {
    if (!isSuperAdmin) return
    const load = async () => {
      const res = await fetch('/api/admin/messages?status=nouveau', { cache: 'no-store' }).catch(
        () => null,
      )
      if (res?.ok) setInboxCount(((await res.json()) as { messages: unknown[] }).messages.length)
    }
    void load()
    const timer = window.setInterval(() => void load(), 120_000)
    return () => window.clearInterval(timer)
  }, [isSuperAdmin])

  const loadThreads = useCallback(async () => {
    const res = await fetch('/api/support/threads', { cache: 'no-store' }).catch(() => null)
    if (!res?.ok) return
    const data = (await res.json()) as { threads: SupportThread[]; unread: number }
    setThreads(data.threads)
    setUnread(data.unread)
  }, [])

  // Pastille de non-lus : vérifiée à l'arrivée puis toutes les 2 minutes.
  useEffect(() => {
    if (!enabled) return
    void loadThreads()
    const timer = window.setInterval(() => void loadThreads(), 120_000)
    return () => window.clearInterval(timer)
  }, [enabled, loadThreads])

  if (isSuperAdmin && !pathname.startsWith('/admin')) {
    return (
      <Link
        href="/admin/messages"
        data-support-button=""
        className={`fixed right-5 inline-flex items-center gap-2 rounded-full bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground shadow-lg hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 print:hidden ${floatingPosition}`}
      >
        <MessageCircle aria-hidden="true" className="h-5 w-5" />
        Messagerie
        {inboxCount > 0 && (
          <span className="ml-1 inline-flex min-w-6 items-center justify-center rounded-full bg-amber-400 px-1.5 text-xs font-bold text-amber-950">
            {inboxCount}
            <span className="sr-only"> message{inboxCount > 1 ? 's' : ''} à traiter</span>
          </span>
        )}
      </Link>
    )
  }
  // Le super_admin ne s'écrit pas à lui-même.
  if (!enabled) return null

  function openButton() {
    setTab(unread > 0 ? 'echanges' : 'ecrire')
    setOpen(true)
  }

  async function openThread(t: SupportThread) {
    setOpenId(t.id)
    if (t.unread === 0) return
    setThreads((list) => (list ?? []).map((x) => (x.id === t.id ? { ...x, unread: 0 } : x)))
    setUnread((n) => Math.max(0, n - t.unread))
    await fetch(`/api/support/threads/${t.id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'read' }),
    }).catch(() => null)
  }

  const current = threads?.find((t) => t.id === openId) ?? null

  function close(next: boolean) {
    setOpen(next)
    if (!next) setOpenId(null)
    if (!next && sentTo !== undefined) {
      setSentTo(undefined)
      setSubject('')
      setMessage('')
    }
  }

  async function send() {
    setBusy(true)
    setError('')
    const res = await fetch('/api/support', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ category, subject, message, page: pathname }),
    }).catch(() => null)
    const data: { error?: string; reply_to?: string | null } = res
      ? await res.json().catch(() => ({}))
      : {}
    setBusy(false)
    if (!res?.ok) {
      setError(data.error ?? 'Connexion interrompue : votre message n’est pas parti, réessayez.')
      return
    }
    setSentTo(data.reply_to ?? null)
    void loadThreads()
  }

  return (
    <>
      <button
        type="button"
        onClick={openButton}
        data-support-button=""
        className={`fixed right-5 inline-flex items-center gap-2 rounded-full bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground shadow-lg hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 print:hidden ${floatingPosition}`}
      >
        <MessageCircle aria-hidden="true" className="h-5 w-5" />
        Écrire à l’équipe
        {unread > 0 && (
          <span className="ml-1 inline-flex min-w-6 items-center justify-center rounded-full bg-amber-400 px-1.5 text-xs font-bold text-amber-950">
            {unread}
            <span className="sr-only">
              {' '}
              réponse{unread > 1 ? 's' : ''} non lue{unread > 1 ? 's' : ''}
            </span>
          </span>
        )}
      </button>
      <Dialog open={open} onOpenChange={close}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Équipe FaîtiereHub</DialogTitle>
          </DialogHeader>
          <div className="flex gap-1 rounded-full bg-muted p-1" role="tablist">
            {(
              [
                ['ecrire', 'Écrire'],
                ['echanges', 'Mes échanges'],
              ] as const
            ).map(([v, l]) => (
              <button
                key={v}
                type="button"
                role="tab"
                aria-selected={tab === v}
                onClick={() => {
                  setTab(v)
                  setOpenId(null)
                  if (v === 'echanges') void loadThreads()
                }}
                className={`flex-1 rounded-full px-3 py-1.5 text-sm font-medium ${
                  tab === v ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground'
                }`}
              >
                {l}
                {v === 'echanges' && unread > 0 && (
                  <span className="ml-1.5 rounded-full bg-amber-400 px-1.5 text-xs font-bold text-amber-950">
                    {unread}
                  </span>
                )}
              </button>
            ))}
          </div>
          {tab === 'echanges' ? (
            current ? (
              <div className="space-y-4 py-2">
                <button
                  type="button"
                  onClick={() => setOpenId(null)}
                  className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
                >
                  <ChevronLeft aria-hidden="true" className="h-4 w-4" /> Tous mes échanges
                </button>
                <div>
                  <p className="text-xs font-medium text-primary">
                    {messageCategoryLabel(current.category)}
                  </p>
                  <p className="font-semibold text-foreground">{current.subject}</p>
                </div>
                <Thread
                  original={current.message ?? ''}
                  createdAt={current.created_at}
                  senderName="Vous"
                  replies={current.replies}
                  viewer="expediteur"
                />
                <ReplyBox
                  placeholder="Répondre à l’équipe…"
                  onSend={async (body) => {
                    const err = await postReply(`/api/support/threads/${current.id}`, body)
                    if (!err) void loadThreads()
                    return err
                  }}
                />
              </div>
            ) : threads === null ? (
              <p className="py-4 text-sm text-muted-foreground">Chargement…</p>
            ) : threads.length === 0 ? (
              <div className="space-y-3 py-2">
                <p className="text-sm text-foreground">
                  Vous n’avez encore écrit à personne. Les réponses de l’équipe et des opérateurs de
                  votre zone s’afficheront ici.
                </p>
                <button
                  type="button"
                  onClick={() => setTab('ecrire')}
                  className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
                >
                  Écrire un message
                </button>
              </div>
            ) : (
              <ul className="divide-y divide-border py-1">
                {threads.map((t) => {
                  const last = t.replies[t.replies.length - 1]
                  return (
                    <li key={t.id}>
                      <button
                        type="button"
                        onClick={() => void openThread(t)}
                        className="flex w-full items-start gap-3 py-3 text-left hover:bg-muted/50"
                      >
                        <span
                          aria-hidden="true"
                          className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${
                            t.unread > 0 ? 'bg-amber-500' : 'bg-transparent'
                          }`}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="flex items-baseline justify-between gap-2">
                            <span
                              className={`truncate text-sm text-foreground ${t.unread > 0 ? 'font-semibold' : 'font-medium'}`}
                            >
                              {t.subject}
                            </span>
                            <span className="shrink-0 text-xs text-muted-foreground">
                              {day(t.last_reply_at ?? t.created_at)}
                            </span>
                          </span>
                          <span className="block truncate text-sm text-muted-foreground">
                            {last
                              ? `${last.author_role === 'utilisateur' ? 'Vous' : last.author_role === 'equipe' ? 'Équipe' : 'Opérateur'} : ${last.body}`
                              : 'En attente de réponse'}
                          </span>
                          {t.unread > 0 && (
                            <span className="sr-only">
                              {t.unread} nouvelle{t.unread > 1 ? 's' : ''} réponse
                              {t.unread > 1 ? 's' : ''}
                            </span>
                          )}
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )
          ) : sentTo !== undefined ? (
            <div className="space-y-3 py-2">
              <p className="text-sm text-foreground">
                Message envoyé à l’équipe et aux opérateurs de votre zone. La réponse s’affichera
                dans « Mes échanges »{sentTo ? ` et arrivera aussi par e-mail à ${sentTo}` : ''}.
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setSentTo(undefined)
                    setSubject('')
                    setMessage('')
                    setTab('echanges')
                  }}
                  className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
                >
                  Voir mes échanges
                </button>
                <button
                  type="button"
                  onClick={() => close(false)}
                  className="rounded-lg border border-border px-4 py-2 text-sm"
                >
                  Fermer
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-4 py-2">
              <div className="flex flex-wrap gap-2" aria-label="Type de message">
                {(Object.keys(SUPPORT_CATEGORIES) as SupportCategory[]).map((c) => (
                  <button
                    key={c}
                    type="button"
                    aria-pressed={category === c}
                    onClick={() => setCategory(c)}
                    className={`rounded-full border px-3 py-1.5 text-sm ${
                      category === c
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-border bg-background'
                    }`}
                  >
                    {SUPPORT_CATEGORIES[c]}
                  </button>
                ))}
              </div>
              <label className="block space-y-1 text-sm font-medium">
                Objet
                <input
                  className={field}
                  value={subject}
                  maxLength={120}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="Ex. : ma carte n’est pas arrivée"
                />
              </label>
              <label className="block space-y-1 text-sm font-medium">
                Votre message
                <textarea
                  className={`${field} min-h-32`}
                  value={message}
                  maxLength={2000}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Décrivez la situation : ce que vous faisiez, ce qui s’est passé, ce que vous attendez."
                />
              </label>
              {error && (
                <p role="alert" className="text-sm text-destructive">
                  {error}
                </p>
              )}
              <button
                type="button"
                disabled={busy || subject.trim().length < 3 || message.trim().length < 10}
                onClick={() => void send()}
                className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
              >
                {busy ? 'Envoi…' : 'Envoyer le message'}
              </button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
