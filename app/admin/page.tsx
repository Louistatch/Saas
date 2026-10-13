'use client'

/**
 * Centre de pilotage super_admin (Admin 5.0).
 *
 * Une seule question : qu'est-ce qui attend une action maintenant ? Chaque file de la
 * plateforme (dossiers, messages, paiements, cartes, notifications, HarooLife) est comptée par
 * /api/admin/inbox, classée par urgence et reliée à l'écran où on la traite. Les vues de
 * détail (coopératives, AgriTogo, Agrismat, suivi du site) restent dans le menu.
 */

import { useAuth } from '@/app/context/auth-context'
import { ViewAsPanel } from '@/components/admin/view-as'
import { ChevronRight, RefreshCw } from 'lucide-react'
import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'

type Level = 'urgent' | 'attention' | 'info'
interface InboxItem {
  key: string
  count: number
  level: Level
  title: string
  detail: string
  href: string
}
interface Inbox {
  items: InboxItem[]
  vitals: { coops: number; members: number; activeCards: number; users: number; pros: number }
  haroolife: {
    cooperative: string | null
    canton: string | null
    workers_available: number
    producers_with_account: number
    groups_open: number
    groups_ready: number
  } | null
}

const LEVEL: Record<Level, { number: string; rule: string; label: string }> = {
  urgent: { number: 'text-red-700', rule: 'bg-red-600', label: 'Urgent' },
  attention: { number: 'text-amber-700', rule: 'bg-amber-500', label: 'À surveiller' },
  info: { number: 'text-primary', rule: 'bg-primary', label: 'À suivre' },
}

const fmt = new Intl.NumberFormat('fr-FR')

export default function AdminHome() {
  const { user } = useAuth()
  const [inbox, setInbox] = useState<Inbox | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/inbox', { cache: 'no-store' })
      if (!res.ok) throw new Error()
      setInbox((await res.json()) as Inbox)
      setError('')
    } catch {
      setError('Le centre de pilotage n’a pas pu se charger. Actualisez dans un instant.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
    const timer = window.setInterval(() => void load(), 120_000)
    return () => window.clearInterval(timer)
  }, [load])

  const today = new Date().toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })
  const total = inbox?.items.reduce((n, i) => n + i.count, 0) ?? 0
  const urgent = inbox?.items.filter((i) => i.level === 'urgent').length ?? 0

  return (
    <div className="mx-auto max-w-3xl space-y-10">
      <header className="space-y-3">
        <p className="text-sm text-muted-foreground first-letter:uppercase">{today}</p>
        <h1 className="text-3xl font-bold leading-tight text-foreground sm:text-4xl">
          {inbox === null
            ? 'Ce qui vous attend aujourd’hui'
            : total === 0
              ? `Tout est à jour${user?.firstName ? `, ${user.firstName}` : ''}.`
              : urgent > 0
                ? `${urgent} point${urgent > 1 ? 's' : ''} urgent${urgent > 1 ? 's' : ''} à traiter en premier.`
                : `${total} demande${total > 1 ? 's' : ''} attend${total > 1 ? 'ent' : ''} votre action.`}
        </h1>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground disabled:opacity-50"
        >
          <RefreshCw
            aria-hidden="true"
            className={`h-4 w-4 ${loading ? 'motion-safe:animate-spin' : ''}`}
          />
          Actualiser
        </button>
      </header>

      {error && (
        <p
          role="alert"
          className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950"
        >
          {error}
        </p>
      )}

      <section aria-labelledby="todo-title">
        <h2 id="todo-title" className="mb-3 text-lg font-semibold text-foreground">
          À traiter
        </h2>
        {inbox && inbox.items.length === 0 ? (
          <p className="rounded-xl bg-primary/5 px-5 py-4 text-sm text-foreground">
            Aucune file n’attend : dossiers, messages, paiements, cartes et notifications sont à
            jour.
          </p>
        ) : (
          <ol className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
            {(inbox?.items ?? []).map((item) => {
              const tone = LEVEL[item.level]
              return (
                <li key={item.key} className="relative">
                  <span
                    aria-hidden="true"
                    className={`absolute inset-y-0 left-0 w-1 ${tone.rule}`}
                  />
                  <Link
                    href={item.href}
                    className="flex items-center gap-4 py-4 pl-5 pr-4 hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none"
                  >
                    <span
                      className={`w-14 shrink-0 text-right text-3xl font-bold tabular-nums leading-none ${tone.number}`}
                    >
                      {fmt.format(item.count)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium text-foreground">{item.title}</span>
                      <span className="block text-sm text-muted-foreground">
                        <span className="sr-only">{tone.label}. </span>
                        {item.detail}
                      </span>
                    </span>
                    <ChevronRight
                      aria-hidden="true"
                      className="h-5 w-5 shrink-0 text-muted-foreground"
                    />
                  </Link>
                </li>
              )
            })}
            {inbox === null &&
              [0, 1, 2].map((n) => (
                <li key={n} className="flex items-center gap-4 py-5 pl-5 pr-4">
                  <span className="h-7 w-14 rounded bg-muted motion-safe:animate-pulse" />
                  <span className="h-4 flex-1 rounded bg-muted motion-safe:animate-pulse" />
                </li>
              ))}
          </ol>
        )}
      </section>

      <ViewAsPanel />

      {inbox && (
        <section aria-labelledby="pulse-title">
          <h2 id="pulse-title" className="mb-3 text-lg font-semibold text-foreground">
            Pouls de la plateforme
          </h2>
          <ul className="grid grid-cols-2 gap-y-5 border-y border-border py-5 sm:grid-cols-5 sm:divide-x sm:divide-border">
            {(
              [
                ['Organisations', inbox.vitals.coops, '/admin/cooperatives'],
                ['Membres', inbox.vitals.members, '/admin/cooperatives'],
                ['Cartes actives', inbox.vitals.activeCards, '/admin/cartes'],
                ['Comptes', inbox.vitals.users, '/admin/users'],
                ['Professionnels validés', inbox.vitals.pros, '/admin/haroo'],
              ] as const
            ).map(([label, value, href]) => (
              <li key={label} className="sm:px-4 sm:first:pl-0">
                <Link href={href} className="block hover:text-primary">
                  <span className="block text-2xl font-bold tabular-nums text-foreground">
                    {fmt.format(value)}
                  </span>
                  <span className="block text-xs text-muted-foreground">{label}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {inbox?.haroolife && (
        <section aria-labelledby="hl-title" className="space-y-2">
          <h2 id="hl-title" className="text-lg font-semibold text-foreground">
            Pilote HarooLife
          </h2>
          <p className="text-sm text-foreground">
            {inbox.haroolife.cooperative}, canton de {inbox.haroolife.canton} :{' '}
            {inbox.haroolife.groups_open} groupe(s) ouvert(s), {inbox.haroolife.groups_ready}{' '}
            complet(s), {inbox.haroolife.workers_available} ouvrier(s) disponible(s),{' '}
            {inbox.haroolife.producers_with_account} producteur(s) avec un compte.
          </p>
          {(inbox.haroolife.workers_available === 0 ||
            inbox.haroolife.producers_with_account === 0) && (
            <p className="text-sm text-amber-800">
              {inbox.haroolife.workers_available === 0
                ? 'Sans ouvrier disponible dans ce canton, aucune équipe ne peut se remplir.'
                : 'Aucun producteur n’a de compte : personne ne peut regrouper ses surfaces.'}
            </p>
          )}
          <Link
            href="/haroolife"
            prefetch={false}
            className="inline-block text-sm font-medium text-primary hover:underline"
          >
            Ouvrir HarooLife
          </Link>
        </section>
      )}
    </div>
  )
}
