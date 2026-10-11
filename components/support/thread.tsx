'use client'

// Fil d'une conversation d'assistance : le message d'origine puis les réponses. L'expéditeur est à
// gauche (neutre), l'équipe et les opérateurs à droite (vert), signés pour savoir qui répond.
import { useState } from 'react'

export interface ThreadReply {
  id: string
  author_role: 'equipe' | 'operateur' | 'utilisateur'
  body: string
  created_at: string
}

const AUTHOR: Record<ThreadReply['author_role'], string> = {
  equipe: 'Équipe FaîtiereHub',
  operateur: 'Opérateur de votre zone',
  utilisateur: 'Vous',
}

const stamp = (iso: string) =>
  new Date(iso).toLocaleString('fr-FR', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })

export function Thread({
  original,
  createdAt,
  senderName,
  replies,
  viewer,
}: {
  original: string
  createdAt: string
  senderName: string
  replies: ThreadReply[]
  viewer: 'expediteur' | 'equipe'
}) {
  const label = (role: ThreadReply['author_role']) =>
    role === 'utilisateur' ? (viewer === 'expediteur' ? 'Vous' : senderName) : AUTHOR[role]
  const items = [
    { id: 'origin', author_role: 'utilisateur' as const, body: original, created_at: createdAt },
    ...replies,
  ]
  return (
    <ol className="space-y-3" aria-label="Conversation">
      {items.map((r) => {
        const staff = r.author_role !== 'utilisateur'
        return (
          <li key={r.id} className={`flex ${staff ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm ${
                staff
                  ? 'rounded-br-md bg-primary text-primary-foreground'
                  : 'rounded-bl-md bg-muted text-foreground'
              }`}
            >
              <p
                className={`mb-1 text-xs font-medium ${staff ? 'text-primary-foreground/80' : 'text-muted-foreground'}`}
              >
                {label(r.author_role)}, {stamp(r.created_at)}
              </p>
              <p className="whitespace-pre-line">{r.body}</p>
            </div>
          </li>
        )
      })}
    </ol>
  )
}

export function ReplyBox({
  onSend,
  placeholder = 'Écrire une réponse…',
  hint,
}: {
  onSend: (body: string) => Promise<string | null>
  placeholder?: string
  hint?: string
}) {
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function send() {
    setBusy(true)
    setError('')
    const err = await onSend(body.trim())
    setBusy(false)
    if (err) setError(err)
    else setBody('')
  }
  return (
    <div className="space-y-2">
      <textarea
        value={body}
        maxLength={4000}
        onChange={(e) => setBody(e.target.value)}
        placeholder={placeholder}
        aria-label="Votre réponse"
        className="min-h-24 w-full rounded-xl border border-border bg-background p-3 text-sm text-foreground focus-visible:outline-2 focus-visible:outline-offset-2"
      />
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <button
        type="button"
        disabled={busy || !body.trim()}
        onClick={() => void send()}
        className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
      >
        {busy ? 'Envoi…' : 'Envoyer la réponse'}
      </button>
    </div>
  )
}

/** Envoie une réponse et rend le message d'erreur (ou null si c'est parti). */
export async function postReply(url: string, body: string): Promise<string | null> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(url.includes('/support/threads/') ? { action: 'reply', body } : { body }),
  }).catch(() => null)
  if (res?.ok) return null
  const data: { error?: string } = res ? await res.json().catch(() => ({})) : {}
  return data.error ?? 'Connexion interrompue : la réponse n’est pas partie, réessayez.'
}
