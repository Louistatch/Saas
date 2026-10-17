'use client'

/**
 * The HarooLife visitor: someone without a FaîtiereHub account who opens the game with one tap
 * (a Supabase anonymous account, no e-mail, no password). A visitor is not a FaîtiereHub account:
 * the rest of FaîtiereHub sees them signed out (auth context, middleware, getAccessContext, and
 * supabase/migrations/20261016_150000_visitors_outside_faitierehub.sql). In the game they do
 * everything a player does (chat, private messages, game money, market, the place, every town);
 * a feature tied to FaîtiereHub itself (their cooperative, worker groups, parcels) asks them to
 * sign in first, and their game follows the account (lib/haroolife/cloud-save.ts).
 */
import { rememberGameReturn, withGameReturn } from '@/lib/haroolife/entry'
import Link from 'next/link'

async function supabase() {
  const { createClient } = await import('@/lib/supabase/client')
  return createClient()
}

/** The visitor account (anonymous), named after the name typed at arrival (« Visiteur » else). */
export async function startVisit(
  captchaToken?: string | null,
  firstName?: string,
): Promise<string | null> {
  const { error } = await (await supabase()).auth.signInAnonymously({
    options: {
      data: { first_name: firstName?.trim().slice(0, 40) || 'Visiteur' },
      captchaToken: captchaToken ?? undefined,
    },
  })
  if (!error) return null
  if (/captcha/i.test(error.message)) return 'Vérification anti-robot à refaire : réessaie.'
  return /anonymous/i.test(error.message)
    ? 'Le mode visiteur n’est pas encore ouvert. Connecte-toi ou crée un compte.'
    : 'Impossible d’entrer en visiteur pour le moment. Réessaie dans un instant.'
}

/**
 * In place of a FaîtiereHub feature, for a visitor: sign in first (or create the account); the
 * game follows the account.
 */
export function AccountPrompt({ reason, compact = false }: { reason?: string; compact?: boolean }) {
  const back = '/haroolife'
  const login = withGameReturn('/auth/login', back)
  const signup = withGameReturn('/auth/signup', back)
  const remember = () => rememberGameReturn(back)
  const text =
    reason ?? 'Cette fonction est liée à FaîtiereHub : connecte-toi d’abord. Ta partie te suit.'
  return (
    <div
      data-testid="account-prompt"
      className={`rounded-2xl bg-amber-50 text-left ${compact ? 'space-y-1.5 p-3' : 'space-y-2 p-4'}`}
    >
      <p className="text-xs leading-snug text-amber-900">{text}</p>
      <div className="flex flex-wrap items-center gap-2">
        <Link
          href={login}
          onClick={remember}
          className={`inline-flex flex-1 items-center justify-center rounded-xl bg-amber-500 px-3 font-black text-white ${
            compact ? 'min-h-10 text-xs' : 'min-h-11 text-sm'
          }`}
        >
          Me connecter
        </Link>
        <Link
          href={signup}
          onClick={remember}
          className="inline-flex min-h-10 items-center px-2 text-xs font-semibold text-amber-900 underline"
        >
          Créer mon compte FaîtiereHub
        </Link>
      </div>
    </div>
  )
}
