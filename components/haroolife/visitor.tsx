'use client'

/**
 * The HarooLife visitor: someone without a FaîtiereHub account who opens the game with one tap
 * (a Supabase anonymous account, no e-mail, no password). A visitor is not a FaîtiereHub account:
 * the rest of FaîtiereHub sees them signed out (auth context, middleware, getAccessContext). In the
 * game they play and read the rooms; the real features (writing, private messages, game money,
 * cooperatives, the market) lead to creating a FaîtiereHub account, and their game follows it
 * (lib/haroolife/cloud-save.ts). Server rules: supabase/migrations/20261016_140000_haroolife_visitors.sql.
 */
import { rememberGameReturn, withGameReturn } from '@/lib/haroolife/entry'
import Link from 'next/link'

async function supabase() {
  const { createClient } = await import('@/lib/supabase/client')
  return createClient()
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

/** In place of a real feature, for a visitor: create a FaîtiereHub account (the game follows). */
export function AccountPrompt({ reason, compact = false }: { reason?: string; compact?: boolean }) {
  const back = '/haroolife'
  return (
    <div
      data-testid="account-prompt"
      className={`space-y-2 rounded-2xl bg-amber-50 text-left ${compact ? 'p-3' : 'p-4'}`}
    >
      <p className="text-xs text-amber-900">
        {reason ?? 'Tu joues en visiteur.'} Crée ton compte FaîtiereHub : ta partie te suit.
      </p>
      <div className="flex flex-wrap gap-2">
        <Link
          href={withGameReturn('/auth/signup', back)}
          onClick={() => rememberGameReturn(back)}
          className="inline-flex min-h-11 flex-1 items-center justify-center rounded-xl bg-amber-500 px-3 py-2 text-sm font-black text-white"
        >
          Créer mon compte FaîtiereHub
        </Link>
        <Link
          href={withGameReturn('/auth/login', back)}
          onClick={() => rememberGameReturn(back)}
          className="inline-flex min-h-11 items-center justify-center rounded-xl px-3 py-2 text-sm font-semibold text-amber-900 underline"
        >
          J’ai déjà un compte
        </Link>
      </div>
    </div>
  )
}
