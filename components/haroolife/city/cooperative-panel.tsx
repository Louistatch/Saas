'use client'

import type { Actor, OrgRef } from '@/lib/haroolife/domain/actor'
import type { CooperativeDashboard, MembersPage } from '@/lib/haroolife/domain/cooperative'
import { HttpOrganizationService } from '@/lib/haroolife/domain/http'
import { STATE_LABELS } from '@/lib/haroolife/domain/worker-group'
/**
 * Inside a house of cooperatives: the spatial dashboard of one real organisation. Every
 * figure comes from the API (true counts), the member list is paginated server-side and
 * only shown to administrators, and online presence is the real visible residents who
 * are members, never a fake crowd.
 */
import { useCallback, useEffect, useState } from 'react'

const service = new HttpOrganizationService()
const LEVEL: Record<string, string> = {
  faitiere: 'Faîtière',
  union: 'Union',
  cooperative: 'Coopérative',
}
const STATUS: Record<string, string> = {
  active: 'Actifs',
  pending: 'En attente',
  suspended: 'Suspendus',
  inactive: 'Inactifs',
}
const ha = (n: number) =>
  `${new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 }).format(n)} ha`

export default function CooperativePanel({
  org,
  actor,
  onPickOrg,
  onRecruit,
  onPool,
}: {
  org: OrgRef
  actor: Actor | null
  /** Navigate the hierarchy (unions, cooperatives) without leaving the building. */
  onPickOrg: (o: OrgRef) => void
  onRecruit?: () => void
  onPool?: () => void
}) {
  const [dash, setDash] = useState<CooperativeDashboard | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [members, setMembers] = useState<MembersPage | null>(null)
  const [page, setPage] = useState(1)
  const [q, setQ] = useState('')
  const [listOpen, setListOpen] = useState(false)

  useEffect(() => {
    let alive = true
    setDash(null)
    setError(null)
    setMembers(null)
    setListOpen(false)
    setPage(1)
    service
      .dashboard(org.id)
      .then((d) => alive && setDash(d))
      .catch((e: Error) => alive && setError(e.message))
    return () => {
      alive = false
    }
  }, [org.id])
  const loadMembers = useCallback(
    async (p: number, query: string) => {
      try {
        setMembers(await service.members(org.id, { page: p, q: query }))
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Erreur')
      }
    },
    [org.id],
  )
  useEffect(() => {
    if (listOpen) void loadMembers(page, q)
  }, [listOpen, page, q, loadMembers])

  if (error)
    return (
      <div className="rounded-2xl bg-rose-50 p-4 text-sm text-rose-800" role="alert">
        {error}
      </div>
    )
  if (!dash)
    return <p className="text-sm text-slate-500">Chargement des données de l’organisation…</p>
  const pages = members ? Math.max(1, Math.ceil(members.total / members.pageSize)) : 1
  return (
    <div className="space-y-3" data-testid="cooperative-dashboard">
      <div className="flex items-center gap-3">
        {dash.logoUrl ? (
          <img src={dash.logoUrl} alt="" className="h-14 w-14 rounded-2xl object-cover" />
        ) : (
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-emerald-100 text-3xl">
            🤝
          </span>
        )}
        <div className="min-w-0">
          <p className="truncate text-xl font-black">{dash.name}</p>
          <p className="text-xs text-slate-500">
            {LEVEL[dash.level ?? ''] ?? 'Organisation'}
            {dash.lineage.length > 0 && ` · ${dash.lineage.map((o) => o.name).join(' · ')}`}
          </p>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-2xl bg-slate-50 p-3">
          <p className="text-2xl font-black">{dash.membersTotal}</p>
          <p className="text-[11px] text-slate-500">membres enregistrés</p>
        </div>
        <div className="rounded-2xl bg-slate-50 p-3">
          <p className="text-2xl font-black">{ha(dash.areaHa)}</p>
          <p className="text-[11px] text-slate-500">
            déclarés sur {dash.crops.reduce((s, c) => s + c.parcels, 0)} parcelles
          </p>
        </div>
        <div className="rounded-2xl bg-slate-50 p-3">
          <p className="text-2xl font-black">{dash.online}</p>
          <p className="text-[11px] text-slate-500">membres présents dans le jeu</p>
        </div>
      </div>
      {dash.membersByStatus.length > 0 && (
        <div className="flex flex-wrap gap-1.5" aria-label="Catégories de membres">
          {dash.membersByStatus.map((s) => (
            <span
              key={s.status}
              className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold"
            >
              {STATUS[s.status] ?? s.status} · {s.count}
            </span>
          ))}
        </div>
      )}
      {dash.crops.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs font-bold text-slate-700">Principales cultures</p>
          {dash.crops.slice(0, 4).map((c) => (
            <div key={c.name} className="flex items-center gap-2 text-sm">
              <span className="w-24 truncate">{c.name}</span>
              <span className="h-2 flex-1 rounded-full bg-slate-100">
                <span
                  className="block h-2 rounded-full bg-emerald-600"
                  style={{ width: `${Math.round((c.areaHa / Math.max(1, dash.areaHa)) * 100)}%` }}
                />
              </span>
              <span className="w-16 text-right text-xs text-slate-500">{ha(c.areaHa)}</span>
            </div>
          ))}
        </div>
      )}
      <div className="space-y-1">
        <p className="text-xs font-bold text-slate-700">Besoins en main-d’œuvre</p>
        {dash.workerNeeds.length === 0 && (
          <p className="text-xs text-slate-500">Aucune équipe en constitution.</p>
        )}
        {dash.workerNeeds.map((g) => (
          <div
            key={g.id}
            className="flex items-center justify-between rounded-xl bg-white px-3 py-2 text-sm ring-1 ring-slate-200"
          >
            <span className="truncate font-semibold">{g.title}</span>
            <span className="text-xs text-slate-500">
              {g.engaged}/{g.target} · {STATE_LABELS[g.state]}
            </span>
          </div>
        ))}
        {onRecruit && (
          <button
            type="button"
            onClick={onRecruit}
            className="w-full rounded-xl bg-emerald-700 px-3 py-2 text-sm font-bold text-white"
          >
            Recruter une équipe
          </button>
        )}
      </div>
      <div className="space-y-1">
        <p className="text-xs font-bold text-slate-700">Regroupements de superficies</p>
        {dash.landGroups.length === 0 && (
          <p className="text-xs text-slate-500">Aucun regroupement en cours.</p>
        )}
        {dash.landGroups.map((g) => (
          <div key={g.id} className="rounded-xl bg-white px-3 py-2 text-sm ring-1 ring-slate-200">
            <div className="flex items-center justify-between">
              <span className="truncate font-semibold">{g.title}</span>
              <span className="text-xs text-slate-500">
                {ha(g.committedHa)} / {ha(g.targetHa)} · {STATE_LABELS[g.state]}
              </span>
            </div>
            <span className="mt-1 block h-2 rounded-full bg-slate-100">
              <span
                className="block h-2 rounded-full bg-amber-500"
                style={{
                  width: `${Math.round(Math.min(1, g.committedHa / Math.max(0.0001, g.targetHa)) * 100)}%`,
                }}
              />
            </span>
          </div>
        ))}
        {onPool && (
          <button
            type="button"
            onClick={onPool}
            className="w-full rounded-xl border border-emerald-700 px-3 py-2 text-sm font-bold text-emerald-800"
          >
            Regrouper nos superficies
          </button>
        )}
      </div>
      <p className="text-xs text-slate-500">
        {dash.announcements} annonce(s) de producteurs en cours.
      </p>
      {dash.canListMembers ? (
        <div className="space-y-2">
          {!listOpen ? (
            <button
              type="button"
              onClick={() => setListOpen(true)}
              className="w-full rounded-xl bg-slate-900 px-3 py-2 text-sm font-bold text-white"
            >
              Voir les membres ({dash.membersTotal})
            </button>
          ) : (
            <>
              <input
                type="search"
                value={q}
                onChange={(e) => {
                  setQ(e.target.value)
                  setPage(1)
                }}
                placeholder="Rechercher un membre"
                aria-label="Rechercher un membre"
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
              />
              <ul
                className="divide-y divide-slate-100 rounded-xl bg-white ring-1 ring-slate-200"
                aria-label="Membres"
              >
                {(members?.items ?? []).map((m) => (
                  <li key={m.id} className="flex items-center justify-between px-3 py-2 text-sm">
                    <span className="font-semibold">{m.name}</span>
                    <span className="text-xs text-slate-500">
                      {m.canton ?? ''} · {(STATUS[m.status] ?? m.status).toLowerCase()} · carte{' '}
                      {m.cardStatus === 'NONE' ? '—' : m.cardStatus.toLowerCase()}
                    </span>
                  </li>
                ))}
                {members && members.items.length === 0 && (
                  <li className="px-3 py-2 text-xs text-slate-500">Aucun membre ne correspond.</li>
                )}
              </ul>
              <div className="flex items-center justify-between text-xs">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                  className="rounded-lg bg-slate-100 px-3 py-1.5 font-semibold disabled:opacity-40"
                >
                  Précédent
                </button>
                <span aria-live="polite">
                  Page {members?.page ?? page} / {pages} · {members?.total ?? 0} membres
                </span>
                <button
                  type="button"
                  disabled={page >= pages}
                  onClick={() => setPage((p) => p + 1)}
                  className="rounded-lg bg-slate-100 px-3 py-1.5 font-semibold disabled:opacity-40"
                >
                  Suivant
                </button>
              </div>
            </>
          )}
        </div>
      ) : (
        <p className="text-xs text-slate-500">
          La liste nominative des membres est réservée aux administrateurs de l’organisation.
        </p>
      )}
      {(dash.children.length > 0 || dash.lineage.length > 0) && (
        <div className="space-y-1">
          <p className="text-xs font-bold text-slate-700">Organisations liées</p>
          <div className="flex flex-wrap gap-1.5">
            {[...dash.lineage, ...dash.children].map((o) => (
              <button
                type="button"
                key={o.id}
                onClick={() => onPickOrg(o)}
                className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold"
              >
                {LEVEL[o.level ?? ''] ?? ''} {o.name}
              </button>
            ))}
          </div>
        </div>
      )}
      {actor && actor.administers.length === 0 && (
        <p className="text-[11px] text-slate-400">
          Vous voyez ici ce que votre rattachement autorise.
        </p>
      )}
    </div>
  )
}
