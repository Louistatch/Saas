'use client'

/**
 * Messages et demandes d'accès (contact_messages) : jusqu'ici reçus en base sans écran pour les
 * lire. Les plus anciens d'abord ; « Marquer comme traité » les sort de la file.
 */

import { isPlaceholderEmail, parseAccessRequest } from '@/lib/admin/access-request-parse'
import { TOGO_FAITIERES, faitiereLabel } from '@/lib/faitieres-togo'
import { messageCategoryLabel } from '@/lib/support'
import { createClient } from '@/lib/supabase/client'
import { Building2, Mail, Phone } from 'lucide-react'
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

const LEVEL_FROM_TYPE: Record<string, 'faitiere' | 'union' | 'cooperative'> = {
  Faîtière: 'faitiere',
  Union: 'union',
  Coopérative: 'cooperative',
}
const field =
  'w-full rounded-md border border-border bg-background p-2 text-sm text-foreground focus-visible:outline-2 focus-visible:outline-offset-2'

type Parent = { id: string; name: string; level: string }

function ApproveForm({
  message,
  parents,
  onDone,
}: {
  message: Message
  parents: Parent[]
  onDone: (text: string) => void
}) {
  const req = parseAccessRequest(message.message)
  const [first, ...rest] = (req.contact ?? message.name ?? '').split(' ')
  const [form, setForm] = useState({
    name: req.organization ?? '',
    level: LEVEL_FROM_TYPE[req.type ?? ''] ?? 'cooperative',
    parent_id: '',
    email: isPlaceholderEmail(message.email) ? '' : (message.email ?? ''),
    first_name: first ?? '',
    last_name: rest.join(' '),
    faitiere_name: '',
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const options = parents.filter((p) =>
    form.level === 'union' ? p.level === 'faitiere' : p.level === 'faitiere' || p.level === 'union',
  )
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [k]: e.target.value }))

  async function submit() {
    setBusy(true)
    setError('')
    const res = await fetch(`/api/admin/messages/${message.id}/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        organisation: {
          name: form.name,
          description: '',
          primary_color: '#16a34a',
          level: form.level,
          parent_id: form.level === 'faitiere' ? null : form.parent_id || null,
        },
        email: form.email,
        first_name: form.first_name,
        last_name: form.last_name,
        faitiere_name: form.faitiere_name || undefined,
      }),
    }).catch(() => null)
    const data: { error?: string; account_created?: boolean; emailed?: boolean } = res
      ? await res.json().catch(() => ({}))
      : {}
    setBusy(false)
    if (!res?.ok) {
      setError(data.error ?? 'Connexion interrompue : réessayez.')
      return
    }
    onDone(
      data.account_created
        ? data.emailed
          ? `Organisation créée. ${form.email} a reçu un e-mail pour définir son mot de passe.`
          : 'Organisation et compte créés, mais l’e-mail n’est pas parti : demandez à la personne d’utiliser « Mot de passe oublié ».'
        : 'Organisation créée et rattachée au compte existant, désormais administrateur.',
    )
  }

  return (
    <div className="space-y-3 rounded-lg bg-muted/50 p-4">
      <p className="text-sm font-medium text-foreground">
        Créer l’organisation et son administrateur
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1 text-sm sm:col-span-2">
          Nom de l’organisation
          <input className={field} value={form.name} onChange={set('name')} />
        </label>
        <label className="space-y-1 text-sm">
          Niveau
          <select className={field} value={form.level} onChange={set('level')}>
            <option value="cooperative">Coopérative</option>
            <option value="union">Union</option>
            <option value="faitiere">Faîtière</option>
          </select>
        </label>
        {form.level !== 'faitiere' && (
          <label className="space-y-1 text-sm">
            Rattachée à
            <select className={field} value={form.parent_id} onChange={set('parent_id')}>
              <option value="">Aucune pour l’instant (indépendante)</option>
              {options.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
        )}
        {form.level !== 'faitiere' && !form.parent_id && (
          <label className="space-y-1 text-sm sm:col-span-2">
            Faîtière de la coopérative (choisir ou écrire)
            <input
              className={field}
              list={`faitieres-${message.id}`}
              value={form.faitiere_name}
              onChange={(e) => {
                const typed = e.target.value
                // Faîtière déjà inscrite : on la rattache directement.
                const known = parents.find(
                  (p) =>
                    p.level === 'faitiere' &&
                    p.name.trim().toLowerCase() === typed.trim().toLowerCase(),
                )
                setForm((f) => ({ ...f, faitiere_name: typed, parent_id: known ? known.id : '' }))
              }}
              placeholder="Ex. : REJEPPAT"
            />
            <datalist id={`faitieres-${message.id}`}>
              {parents
                .filter((p) => p.level === 'faitiere')
                .map((p) => (
                  <option key={p.id} value={p.name}>
                    Déjà sur FaîtiereHub
                  </option>
                ))}
              {TOGO_FAITIERES.filter(
                (f) => !parents.some((p) => p.name.toLowerCase() === f.acronym.toLowerCase()),
              ).map((f) => (
                <option key={f.acronym} value={f.acronym}>
                  {faitiereLabel(f)}, {f.sector}
                </option>
              ))}
            </datalist>
            <span className="block text-xs text-muted-foreground">
              Pas encore inscrite : la coopérative fonctionne seule en attendant, et l’e-mail de
              bienvenue l’invitera à parler de FaîtiereHub à sa faîtière. Rattachez-la depuis
              Coopératives dès que la faîtière sera inscrite.
            </span>
          </label>
        )}
        {form.parent_id && form.faitiere_name && (
          <p className="text-xs text-primary sm:col-span-2">
            {form.faitiere_name} est déjà sur FaîtiereHub : la coopérative y sera rattachée.
          </p>
        )}
        <label className="space-y-1 text-sm">
          Prénom
          <input className={field} value={form.first_name} onChange={set('first_name')} />
        </label>
        <label className="space-y-1 text-sm">
          Nom
          <input className={field} value={form.last_name} onChange={set('last_name')} />
        </label>
        <label className="space-y-1 text-sm sm:col-span-2">
          E-mail de l’administrateur
          <input type="email" className={field} value={form.email} onChange={set('email')} />
          {isPlaceholderEmail(message.email) && (
            <span className="block text-xs text-amber-800">
              La demande ne contient qu’un téléphone : appelez la personne pour obtenir son e-mail.
            </span>
          )}
        </label>
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <button
        type="button"
        disabled={busy || !form.name || !form.email}
        onClick={() => void submit()}
        className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
      >
        {busy ? 'Création…' : 'Créer et envoyer l’invitation'}
      </button>
    </div>
  )
}

export default function AdminMessagesPage() {
  const [tab, setTab] = useState<'nouveau' | 'traite'>('nouveau')
  const [messages, setMessages] = useState<Message[] | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [approving, setApproving] = useState<string | null>(null)
  const [done, setDone] = useState('')
  const [parents, setParents] = useState<Parent[]>([])

  useEffect(() => {
    createClient()
      .from('cooperatives')
      .select('id, name, level')
      .in('level', ['faitiere', 'union'])
      .is('deleted_at', null)
      .order('name')
      .then(({ data }) => setParents((data ?? []) as Parent[]))
  }, [])

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

      <output aria-live="polite" className="block text-sm text-primary">
        {done}
      </output>
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
                {m.category ? ` (${messageCategoryLabel(m.category)})` : ''}
              </p>
              {m.message && (
                <p className="whitespace-pre-line text-sm text-foreground">{m.message}</p>
              )}
              <div className="flex flex-wrap gap-2">
                {m.category === 'cooperative' && tab === 'nouveau' && (
                  <button
                    type="button"
                    onClick={() => setApproving((cur) => (cur === m.id ? null : m.id))}
                    className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
                  >
                    <Building2 aria-hidden="true" className="h-4 w-4" /> Créer le compte
                  </button>
                )}
                {parseAccessRequest(m.message).phone && (
                  <a
                    href={`tel:${parseAccessRequest(m.message).phone?.replace(/\s/g, '')}`}
                    className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm"
                  >
                    <Phone aria-hidden="true" className="h-4 w-4" /> Appeler
                  </a>
                )}
                {m.email && !isPlaceholderEmail(m.email) && (
                  <a
                    href={`mailto:${m.email}?subject=${encodeURIComponent(`Re : ${m.subject ?? 'FaîtiereHub'}`)}`}
                    className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm"
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
              {approving === m.id && (
                <ApproveForm
                  message={m}
                  parents={parents}
                  onDone={(text) => {
                    setApproving(null)
                    setDone(text)
                    setMessages((list) => (list ?? []).filter((x) => x.id !== m.id))
                  }}
                />
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
