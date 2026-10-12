'use client'

/**
 * The welcome path of a real account in the world: what is already in place (account,
 * organisation, canton, Haroo profile, card) and what is missing, each with the existing
 * screen that fixes it. The game never creates an account, a membership or a card itself.
 */
import type { Actor } from '@/lib/haroolife/domain/actor'
import Link from 'next/link'

const CARD_LABEL: Record<string, string> = {
  ACTIVE: 'active',
  SUSPENDED: 'suspendue',
  REVOKED: 'révoquée',
  EXPIRED: 'expirée',
  NONE: 'absente',
}

export default function OnboardingSteps({ actor }: { actor: Actor }) {
  const card = actor.cards.find((c) => c.status === 'ACTIVE') ?? actor.cards[0] ?? null
  const steps: { label: string; done: boolean; hint: string; href?: string }[] = [
    { label: 'Compte FaîtiereHub', done: true, hint: actor.displayName },
    {
      label: 'Organisation',
      done: actor.organizations.length > 0,
      hint:
        actor.organizations.length > 0
          ? actor.organizations.map((o) => o.name).join(', ')
          : 'Demandez à votre coopérative de vous enregistrer comme membre.',
    },
    {
      label: 'Canton de résidence',
      done: Boolean(actor.canton),
      hint: actor.canton?.name ?? 'Choisissez votre canton depuis la carte du Togo.',
      href: actor.canton ? undefined : '/haroolife/territoire',
    },
    {
      label: 'Profil Haroo',
      done: Boolean(actor.harooType),
      hint: actor.harooType
        ? `${actor.harooType}${actor.skills.length ? ` · ${actor.skills.slice(0, 3).join(', ')}` : ''}`
        : 'Ouvrier, acheteur ou agronome : créez votre profil sur Haroo.',
      href: actor.harooType ? undefined : '/haroo',
    },
    {
      label: 'Carte',
      done: card?.status === 'ACTIVE',
      hint: card
        ? `${card.kind === 'member' ? 'Carte de membre' : 'Carte Haroo'} ${CARD_LABEL[card.status]}${card.number ? ` · ${card.number}` : ''}`
        : 'Délivrée par votre organisation, jamais par le jeu.',
      href: card?.verifyPath ?? undefined,
    },
  ]
  const done = steps.filter((s) => s.done).length
  return (
    <div className="space-y-1" data-testid="onboarding">
      <p className="text-xs font-bold text-slate-700">
        Parcours d’accueil · {done}/{steps.length}
      </p>
      <ol className="space-y-1">
        {steps.map((s) => (
          <li
            key={s.label}
            className="flex items-start gap-2 rounded-xl bg-slate-50 px-3 py-2 text-sm"
          >
            <span aria-hidden="true" className={s.done ? 'text-emerald-700' : 'text-slate-400'}>
              {s.done ? '✓' : '○'}
            </span>
            <span className="min-w-0 flex-1">
              <span className="font-semibold">{s.label}</span>
              <span className="block truncate text-xs text-slate-500">{s.hint}</span>
            </span>
            {s.href && (
              <Link href={s.href} className="shrink-0 text-xs font-bold text-emerald-700 underline">
                {s.done ? 'Vérifier' : 'Compléter'}
              </Link>
            )}
          </li>
        ))}
      </ol>
    </div>
  )
}
