'use client'

// Messages d'assistance des organisations de la zone de l'opérateur (jamais les siens).
import { ProtectedRoute } from '@/app/components/protected-route'
import { ReplyBox, Thread, type ThreadReply, postReply } from '@/components/support/thread'
import { messageCategoryLabel } from '@/lib/support'
import { ArrowLeft } from 'lucide-react'
import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'

interface Msg {
  id: string
  name: string | null
  email: string | null
  category: string | null
  subject: string | null
  message: string | null
  created_at: string
  cooperative_name: string | null
  replies?: ThreadReply[]
}

function Inbox() {
  const [tab, setTab] = useState<'nouveau' | 'traite'>('nouveau')
  const [rows, setRows] = useState<Msg[] | null>(null)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setRows(null)
    const res = await fetch(`/api/operator/messages?status=${tab}`, { cache: 'no-store' }).catch(
      () => null,
    )
    setRows(res?.ok ? ((await res.json()) as { messages: Msg[] }).messages : [])
    if (!res?.ok) setError('Les messages n’ont pas pu se charger.')
  }, [tab])

  useEffect(() => {
    void load()
  }, [load])

  async function mark(id: string) {
    const res = await fetch('/api/operator/messages', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, status: tab === 'nouveau' ? 'traite' : 'nouveau' }),
    }).catch(() => null)
    if (res?.ok) setRows((r) => (r ?? []).filter((m) => m.id !== id))
    else setError('Mise à jour impossible. Réessayez.')
  }

  return (
    <main className="mx-auto max-w-xl space-y-6 px-4 py-6">
      <Link
        href="/operator"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground"
      >
        <ArrowLeft aria-hidden="true" className="h-4 w-4" /> Espace opérateur
      </Link>
      <header className="space-y-2">
        <h1 className="text-3xl font-bold text-foreground">Messages de votre zone</h1>
        <p className="text-sm text-muted-foreground">
          Réclamations, suggestions et demandes d’aide des organisations que vous accompagnez.
          L’équipe FaîtiereHub les reçoit aussi.
        </p>
      </header>
      <div className="flex gap-2" aria-label="Filtrer les messages">
        {(
          [
            ['nouveau', 'À traiter'],
            ['traite', 'Traités'],
          ] as const
        ).map(([v, l]) => (
          <button
            key={v}
            type="button"
            aria-pressed={tab === v}
            onClick={() => setTab(v)}
            className={`rounded-full border px-4 py-1.5 text-sm ${
              tab === v
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border bg-background'
            }`}
          >
            {l}
          </button>
        ))}
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {rows === null ? (
        <p className="text-sm text-muted-foreground">Chargement…</p>
      ) : rows.length === 0 ? (
        <p className="rounded-xl bg-primary/5 px-5 py-4 text-sm">
          {tab === 'nouveau' ? 'Aucun message de votre zone en attente.' : 'Aucun message traité.'}
        </p>
      ) : (
        <ul className="space-y-4">
          {rows.map((m) => (
            <li key={m.id} className="space-y-3 rounded-xl border border-border bg-card p-5">
              <p className="text-xs font-medium text-primary">
                {messageCategoryLabel(m.category)}
                {m.cooperative_name ? `, ${m.cooperative_name}` : ''}
              </p>
              <p className="font-semibold text-foreground">{m.subject}</p>
              <p className="text-sm text-muted-foreground">
                {m.name}
                {m.email ? `, ${m.email}` : ''},{' '}
                {new Date(m.created_at).toLocaleString('fr-FR', {
                  day: 'numeric',
                  month: 'short',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </p>
              <Thread
                original={m.message ?? ''}
                createdAt={m.created_at}
                senderName={m.name ?? 'Expéditeur'}
                replies={m.replies ?? []}
                viewer="equipe"
              />
              <ReplyBox
                hint="La réponse s’affiche dans son tableau de bord (« Mes échanges ») et lui est envoyée par e-mail."
                onSend={async (body) => {
                  const err = await postReply(`/api/operator/messages/${m.id}/reply`, body)
                  if (!err) void load()
                  return err
                }}
              />
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void mark(m.id)}
                  className="rounded-lg border border-border px-4 py-2 text-sm"
                >
                  {tab === 'nouveau' ? 'Marquer comme traité' : 'Remettre à traiter'}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}

export default function OperatorMessagesPage() {
  return (
    <ProtectedRoute>
      <Inbox />
    </ProtectedRoute>
  )
}
