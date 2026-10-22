'use client'

/**
 * Centre de pilotage, section Haroo : qui est inscrit (comptes de démo à part), qui a une carte,
 * où en est la validation des agronomes et ce qui bouge (missions, offres, préventes, annonces).
 * Lecture seule ; les actions restent dans /admin/haroo.
 */

import type { HarooKind, HarooOverview as Overview, Person } from '@/lib/admin/haroo-overview'
import type { CardPublicStatus } from '@/lib/professionals/core'
import Link from 'next/link'
import { useEffect, useState } from 'react'

const fmt = new Intl.NumberFormat('fr-FR')
const day = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString('fr-FR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      })
    : '—'

const KIND: Record<HarooKind, string> = {
  ouvrier: 'Ouvrier',
  acheteur: 'Acheteur',
  agronome: 'Agronome',
}

const CARD: Record<CardPublicStatus, { label: string; tone: string }> = {
  ACTIVE: { label: 'Active', tone: 'bg-primary/10 text-primary' },
  SUSPENDED: { label: 'Suspendue', tone: 'bg-amber-100 text-amber-900' },
  REVOKED: { label: 'Révoquée', tone: 'bg-red-100 text-red-800' },
  EXPIRED: { label: 'Expirée', tone: 'bg-muted text-muted-foreground' },
}

function demoNote(demo: number) {
  return demo === 0 ? 'aucun compte de démo' : `dont ${fmt.format(demo)} de démo`
}

function DemoTag({ person }: { person: Person }) {
  if (!person.demo) return null
  return (
    <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">
      démo
    </span>
  )
}

function CardBadge({ status }: { status: CardPublicStatus }) {
  const card = CARD[status]
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${card.tone}`}>
      {card.label}
    </span>
  )
}

export function HarooOverview() {
  const [data, setData] = useState<Overview | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let alive = true
    fetch('/api/admin/haroo-overview', { cache: 'no-store' })
      .then(async (res) => {
        if (!res.ok) throw new Error()
        const body = (await res.json()) as Overview
        if (alive) setData(body)
      })
      .catch(() => {
        if (alive) setError('La section Haroo n’a pas pu se charger. Actualisez dans un instant.')
      })
    return () => {
      alive = false
    }
  }, [])

  const { agronomes, activity } = data ?? {}
  const validation = agronomes
    ? [
        agronomes.validated &&
          `${fmt.format(agronomes.validated)} validé${agronomes.validated > 1 ? 's' : ''}`,
        agronomes.pending && `${fmt.format(agronomes.pending)} en attente`,
        agronomes.rejected &&
          `${fmt.format(agronomes.rejected)} rejeté${agronomes.rejected > 1 ? 's' : ''}`,
      ]
        .filter(Boolean)
        .join(' · ') || 'aucun dossier'
    : ''
  const cardNote = data
    ? (Object.keys(CARD) as CardPublicStatus[])
        .filter((s) => data.cards[s] > 0)
        .map(
          (s) =>
            `${fmt.format(data.cards[s])} ${CARD[s].label.toLowerCase()}${data.cards[s] > 1 ? 's' : ''}`,
        )
        .join(' · ') || 'aucune carte'
    : ''

  return (
    <section aria-labelledby="haroo-title" className="space-y-3" data-testid="admin-haroo">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 id="haroo-title" className="text-xl font-semibold text-foreground">
            Haroo
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Ouvriers, acheteurs et agronomes inscrits, leurs cartes et leur activité.
          </p>
        </div>
        <Link
          href="/admin/haroo"
          className="shrink-0 text-sm font-medium text-primary hover:underline"
        >
          Gérer les professionnels
        </Link>
      </div>

      {error && (
        <p
          role="alert"
          className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950"
        >
          {error}
        </p>
      )}

      {!data && !error && (
        <div className="h-28 rounded-xl border border-border bg-card motion-safe:animate-pulse" />
      )}

      {data && (
        <>
          <ul className="grid grid-cols-2 overflow-hidden rounded-xl border border-border bg-card shadow-sm sm:grid-cols-4 sm:divide-x sm:divide-border">
            {(
              [
                ['Ouvriers', data.totals.ouvrier.all, demoNote(data.totals.ouvrier.demo)],
                ['Acheteurs', data.totals.acheteur.all, demoNote(data.totals.acheteur.demo)],
                ['Agronomes', data.totals.agronome.all, validation],
                ['Cartes émises', data.cards.issued, cardNote],
              ] as const
            ).map(([label, value, note]) => (
              <li key={label} className="border-b border-border p-4 sm:border-b-0 sm:p-5">
                <span className="block text-2xl font-bold tabular-nums text-foreground">
                  {fmt.format(value)}
                </span>
                <span className="block text-xs font-medium text-foreground">{label}</span>
                <span className="block text-xs text-muted-foreground">{note}</span>
              </li>
            ))}
          </ul>

          {data.alerts.length > 0 && (
            <ul className="space-y-2">
              {data.alerts.map((alert) => (
                <li key={alert.key}>
                  <Link
                    href={alert.href}
                    className="block rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950 hover:bg-amber-100"
                  >
                    {alert.text}
                  </Link>
                </li>
              ))}
            </ul>
          )}

          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
              <h3 className="font-semibold text-foreground">Titulaires d’une carte</h3>
              {data.holders.length === 0 ? (
                <p className="mt-2 text-sm text-muted-foreground">
                  Aucune carte Haroo émise pour l’instant.
                </p>
              ) : (
                <ul className="mt-3 divide-y divide-border" data-testid="haroo-holders">
                  {data.holders.map((p) =>
                    p.card ? (
                      <li key={p.card.number} className="py-3 first:pt-0 last:pb-0">
                        <p className="font-medium text-foreground">
                          {p.name}
                          <DemoTag person={p} />
                        </p>
                        <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
                          <span>{KIND[p.kind]}</span>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono text-foreground">{p.card.number}</span>
                          <CardBadge status={p.card.status} />
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Émise le {day(p.card.issuedAt)}
                          {p.faitiere ? ` · ${p.faitiere}` : ''}
                        </p>
                      </li>
                    ) : null,
                  )}
                </ul>
              )}
            </div>

            {activity && (
              <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
                <h3 className="font-semibold text-foreground">Activité</h3>
                <dl className="mt-3 space-y-2 text-sm">
                  {(
                    [
                      ['Missions demandées', activity.missions.requested],
                      [
                        'Missions en cours',
                        activity.missions.inProgress,
                        activity.missions.stalled
                          ? `dont ${fmt.format(activity.missions.stalled)} bloquée${activity.missions.stalled > 1 ? 's' : ''}`
                          : '',
                      ],
                      ['Missions terminées', activity.missions.done],
                      ['Offres d’emploi ouvertes', activity.jobsOpen],
                      ['Préventes disponibles', activity.presalesOpen],
                      [
                        'Annonces actives',
                        activity.announcements.job +
                          activity.announcements.prevente +
                          activity.announcements.mission +
                          activity.announcements.other,
                        [
                          activity.announcements.job && `${activity.announcements.job} emploi`,
                          activity.announcements.prevente &&
                            `${activity.announcements.prevente} prévente`,
                          activity.announcements.mission &&
                            `${activity.announcements.mission} mission`,
                          activity.announcements.other && `${activity.announcements.other} autre`,
                        ]
                          .filter(Boolean)
                          .join(' · '),
                      ],
                    ] as [string, number, string?][]
                  ).map(([label, value, note]) => (
                    <div key={label} className="flex items-baseline justify-between gap-3">
                      <dt className="text-muted-foreground">
                        {label}
                        {note ? <span className="block text-xs">{note}</span> : null}
                      </dt>
                      <dd className="font-semibold tabular-nums text-foreground">
                        {fmt.format(value)}
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
            )}
          </div>

          <div className="rounded-xl border border-border bg-card shadow-sm">
            <h3 className="px-5 pt-5 font-semibold text-foreground">
              Inscrits{' '}
              <span className="font-normal text-muted-foreground">
                ({fmt.format(data.people.length)})
              </span>
            </h3>
            {data.people.length === 0 ? (
              <p className="px-5 pb-5 pt-2 text-sm text-muted-foreground">
                Aucun professionnel Haroo inscrit.
              </p>
            ) : (
              <div className="mt-3">
                <div className="hidden grid-cols-[2fr_1fr_1.5fr_1.5fr_1fr] gap-3 border-b border-border px-5 pb-2 text-xs font-medium text-muted-foreground sm:grid">
                  <span>Nom</span>
                  <span>Profil</span>
                  <span>Statut</span>
                  <span>Carte</span>
                  <span>Inscrit le</span>
                </div>
                <ul className="divide-y divide-border" data-testid="haroo-people">
                  {data.people.map((p, i) => (
                    <li
                      key={`${p.kind}-${p.name}-${p.signedUpAt ?? i}`}
                      className="grid gap-1 px-5 py-3 text-sm sm:grid-cols-[2fr_1fr_1.5fr_1.5fr_1fr] sm:items-center sm:gap-3"
                    >
                      <span className="font-medium text-foreground">
                        {p.name}
                        <DemoTag person={p} />
                      </span>
                      {/* Au téléphone : profil · statut sur une ligne, carte · date sur la
                          suivante ; à partir de sm, chaque valeur a sa colonne. */}
                      <span className="text-muted-foreground sm:contents">
                        <span>{KIND[p.kind]}</span>
                        <span className="sm:hidden"> · </span>
                        <span>{p.status}</span>
                      </span>
                      <span className="flex flex-wrap items-center gap-x-2 sm:contents">
                        <span>
                          {p.card ? (
                            <span className="inline-flex items-center gap-2">
                              <span className="font-mono text-foreground">{p.card.number}</span>
                              <CardBadge status={p.card.status} />
                            </span>
                          ) : (
                            <span className="text-muted-foreground">Pas de carte</span>
                          )}
                        </span>
                        <span className="text-muted-foreground">
                          <span className="sm:hidden">· inscrit le </span>
                          {day(p.signedUpAt)}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </>
      )}
    </section>
  )
}
