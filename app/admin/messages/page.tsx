'use client'

/**
 * Messages et demandes d'accès (contact_messages) : jusqu'ici reçus en base sans écran pour les
 * lire. Les plus anciens d'abord ; « Marquer comme traité » les sort de la file.
 */

import { Mail } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'

interface Message {
  id: string
  name: string | null
  email: string | null
  category: string | null
  subject: string | null
  message: string | null
  status: string
  created_at: string
}

export default function AdminMessagesPage() {
  const [tab, setTab] = useState<'nouveau' | 'traite'>('nouveau')
  const [messages, setMessages] = useState<Message[] | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(async () => {
    setMessages(null)
    try {
      const res = await fetch(`/api/admin/messages?status=${tab}`, { cache: 'no-store' })
      if (!res.ok) throw new Error()
      setMessages(((await res.json()) as { messages: Message[] }).messages)
      setError('')
    } catch {
      setError('Les messages n’ont pas pu se charger. Actualisez la page.')
      setMessages([])
    }
  }, [tab])

  useEffect(() => {
    void load()
  }, [load])

  async function mark(id: string, status: 'nouveau' | 'traite') {
    setBusy(id)
    const res = await fetch('/api/admin/messages', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, status }),
    }).catch(() => null)
    setBusy(null)
    if (res?.ok) setMessages((list) => (list ?? []).filter((m) => m.id !== id))
    else setError('Mise à jour impossible. Réessayez.')
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header className="space-y-2">
        <h1 className="text-3xl font-bold text-foreground">Messages</h1>
        <p className="text-sm text-muted-foreground">
          Formulaire de contact et demandes d’accès. Répondez par e-mail, puis marquez le message
          comme traité.
        </p>
      </header>

      <div className="flex gap-2" aria-label="Filtrer les messages">
        {(
          [
            ['nouveau', 'À traiter'],
            ['traite', 'Traités'],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            aria-pressed={tab === value}
            onClick={() => setTab(value)}
            className={`rounded-full border px-4 py-1.5 text-sm ${
              tab === value
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border bg-background'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      {messages === null ? (
        <p className="text-sm text-muted-foreground">Chargement des messages…</p>
      ) : messages.length === 0 ? (
        <p className="rounded-xl bg-primary/5 px-5 py-4 text-sm">
          {tab === 'nouveau' ? 'Aucun message en attente de réponse.' : 'Aucun message traité.'}
        </p>
      ) : (
        <ul className="space-y-4">
          {messages.map((m) => (
            <li key={m.id} className="space-y-3 rounded-xl border border-border bg-card p-5">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="font-semibold text-foreground">
                  {m.subject || (m.category === 'access' ? 'Demande d’accès' : 'Message')}
                </p>
                <time dateTime={m.created_at} className="text-xs text-muted-foreground">
                  {new Date(m.created_at).toLocaleString('fr-FR', {
                    day: 'numeric',
                    month: 'short',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </time>
              </div>
              <p className="text-sm text-muted-foreground">
                {m.name || 'Sans nom'}
                {m.email ? `, ${m.email}` : ''}
                {m.category ? ` (${m.category})` : ''}
              </p>
              {m.message && (
                <p className="whitespace-pre-line text-sm text-foreground">{m.message}</p>
              )}
              <div className="flex flex-wrap gap-2">
                {m.email && (
                  <a
                    href={`mailto:${m.email}?subject=${encodeURIComponent(`Re : ${m.subject ?? 'FaîtiereHub'}`)}`}
                    className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
                  >
                    <Mail aria-hidden="true" className="h-4 w-4" /> Répondre par e-mail
                  </a>
                )}
                <button
                  type="button"
                  disabled={busy === m.id}
                  onClick={() => void mark(m.id, tab === 'nouveau' ? 'traite' : 'nouveau')}
                  className="rounded-lg border border-border px-4 py-2 text-sm disabled:opacity-50"
                >
                  {tab === 'nouveau' ? 'Marquer comme traité' : 'Remettre à traiter'}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
