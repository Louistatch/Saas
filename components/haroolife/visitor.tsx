'use client'

/**
 * The HarooLife visitor: someone who entered the game with one tap, without e-mail or password (a
 * Supabase anonymous account: a real account, no identity). A visitor plays everything and reads
 * the rooms; to write, send a private message or game money, they keep their game by adding their
 * e-mail: the same account (same id, same game), confirmed by a link. Server rules:
 * supabase/migrations/20261016_140000_haroolife_visitors.sql.
 */
import { rememberGameReturn } from '@/lib/haroolife/entry'
import { useEffect, useState } from 'react'

async function supabase() {
  const { createClient } = await import('@/lib/supabase/client')
  return createClient()
}

/** True while the signed-in account is a visitor (anonymous); false otherwise or signed out. */
export function useVisitor(): boolean {
  const [visitor, setVisitor] = useState(false)
  useEffect(() => {
    let stop = false
    let unsubscribe: (() => void) | undefined
    void supabase().then((sb) => {
      if (stop) return
      void sb.auth.getSession().then(({ data }) => {
        if (!stop) setVisitor(Boolean(data.session?.user.is_anonymous))
      })
      const { data } = sb.auth.onAuthStateChange((_event, session) => {
        setVisitor(Boolean(session?.user.is_anonymous))
      })
      unsubscribe = () => data.subscription.unsubscribe()
    })
    return () => {
      stop = true
      unsubscribe?.()
    }
  }, [])
  return visitor
}

/** One tap: an anonymous account, named « Visiteur » until the player picks a name in the game. */
export async function startVisit(): Promise<string | null> {
  const { error } = await (await supabase()).auth.signInAnonymously({
    options: { data: { first_name: 'Visiteur' } },
  })
  if (!error) return null
  return /anonymous/i.test(error.message)
    ? 'Le mode visiteur n’est pas encore ouvert. Connecte-toi ou crée un compte.'
    : 'Impossible d’entrer en visiteur pour le moment. Réessaie dans un instant.'
}

/** Keep the game: the visitor's account gets their e-mail (confirmed by a link), nothing else. */
export function KeepGameForm({ reason, compact = false }: { reason?: string; compact?: boolean }) {
  const [email, setEmail] = useState('')
  const [state, setState] = useState<'idle' | 'busy' | 'sent' | 'error'>('idle')
  const [message, setMessage] = useState('')
  const submit = async () => {
    const value = email.trim()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      setState('error')
      setMessage('Écris une adresse e-mail valide.')
      return
    }
    setState('busy')
    rememberGameReturn('/haroolife')
    const { error } = await (await supabase()).auth.updateUser(
      { email: value },
      {
        emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent('/haroolife')}`,
      },
    )
    if (error) {
      setState('error')
      setMessage(
        /already|registered|exists/i.test(error.message)
          ? 'Cette adresse a déjà un compte FaîtiereHub : connecte-toi avec elle.'
          : 'L’e-mail n’a pas pu être envoyé. Réessaie dans un instant.',
      )
      return
    }
    setState('sent')
    setMessage(`Un lien a été envoyé à ${value}. Ouvre-le pour garder ta partie.`)
  }
  return (
    <form
      aria-label="Garder ma partie"
      data-testid="keep-game"
      className={`space-y-2 rounded-2xl bg-amber-50 text-left ${compact ? 'p-3' : 'p-4'}`}
      onSubmit={(e) => {
        e.preventDefault()
        void submit()
      }}
    >
      <p className="text-sm font-black text-amber-950">Garder ma partie</p>
      <p className="text-xs text-amber-900">
        {reason ?? 'Tu joues en visiteur.'} Ajoute ton e-mail : ta partie reste la même, sur tous
        tes appareils.
      </p>
      {state === 'sent' ? (
        <output className="block text-xs font-semibold text-emerald-800">{message}</output>
      ) : (
        <>
          <div className="flex gap-2">
            <input
              type="email"
              inputMode="email"
              autoComplete="email"
              aria-label="Ton e-mail"
              placeholder="ton@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="min-w-0 flex-1 rounded-xl border border-amber-200 bg-white px-3 py-2 text-sm text-slate-900"
            />
            <button
              type="submit"
              disabled={state === 'busy'}
              className="shrink-0 rounded-xl bg-amber-500 px-3 py-2 text-sm font-black text-white disabled:opacity-50"
            >
              {state === 'busy' ? '…' : 'Garder'}
            </button>
          </div>
          {state === 'error' && (
            <p role="alert" className="text-xs font-semibold text-red-700">
              {message}
            </p>
          )}
        </>
      )}
    </form>
  )
}
