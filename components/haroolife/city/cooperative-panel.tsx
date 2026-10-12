'use client'

import { type Actor, type OrgRef, can } from '@/lib/haroolife/domain/actor'
import type { CooperativeDashboard, MembersPage } from '@/lib/haroolife/domain/cooperative'
import type { InteractionEngine } from '@/lib/haroolife/domain/engine'
import { HttpOrganizationService } from '@/lib/haroolife/domain/http'
import type { LandAggregation } from '@/lib/haroolife/domain/land-aggregation'
import { STATE_LABELS, canJoin, canRecruit } from '@/lib/haroolife/domain/worker-group'
/**
 * Inside a house of cooperatives: the spatial dashboard of one real organisation. Every
 * figure comes from the API (true counts), the member list is paginated server-side and
 * only shown to administrators, and online presence is the real visible residents who
 * are members, never a fake crowd.
 */
import { useCallback, useEffect, useState } from 'react'
import { OpenPoolForm, PledgeForm, RecruitForm } from './aggregation'

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
  engine,
}: {
  org: OrgRef
  actor: Actor | null
  /** Navigate the hierarchy (unions, cooperatives) without leaving the building. */
  onPickOrg: (o: OrgRef) => void
  /** The interaction engine (commands + events); null when signed out. */
  engine?: InteractionEngine | null
}) {
  const [dash, setDash] = useState<CooperativeDashboard | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [members, setMembers] = useState<MembersPage | null>(null)
  const [page, setPage] = useState(1)
  const [q, setQ] = useState('')
  const [listOpen, setListOpen] = useState(false)
  const [form, setForm] = useState<
    { kind: 'recruit' } | { kind: 'pool' } | { kind: 'pledge'; pool: LandAggregation } | null
  >(null)
  const [done, setDone] = useState<string | null>(null)
  const [version, setVersion] = useState(0)
  const [busyId, setBusyId] = useState<string | null>(null)
  // Business actions are only offered inside the actor's own organisation; the server
  // re-checks membership and every rule on each command.
  const member = Boolean(actor?.organizations.some((o) => o.id === org.id))
  const canAct = Boolean(engine && actor && member)
  const refresh = (message: string) => {
    setForm(null)
    setDone(message)
    setVersion((v) => v + 1)
  }

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
  }, [org.id, version])
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
      {done && (
        <p
          role="status"
          className="rounded-2xl bg-emerald-50 p-3 text-sm font-semibold text-emerald-900"
        >
          {done}
        </p>
      )}
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
        {dash.workerNeeds.map((g) => {
          const join = actor ? canJoin(g, actor) : { ok: false as const }
          return (
            <div key={g.id} className="rounded-xl bg-white px-3 py-2 text-sm ring-1 ring-slate-200">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate font-semibold">{g.title}</span>
                <span className="shrink-0 text-xs text-slate-500">
                  {g.engaged}/{g.target} · {STATE_LABELS[g.state]}
                </span>
              </div>
              {canAct && engine && actor && (g.joined || join.ok) && (
                <button
                  type="button"
                  disabled={busyId === g.id}
                  onClick={async () => {
                    setBusyId(g.id)
                    const r = await engine.bus.dispatch(
                      { type: g.joined ? 'LeaveTeam' : 'JoinTeam', payload: { groupId: g.id } },
                      actor,
                    )
                    setBusyId(null)
                    if (r.ok)
                      refresh(
                        g.joined ? 'Vous avez quitté l’équipe.' : 'Vous avez rejoint l’équipe.',
                      )
                    else setError(r.error)
                  }}
                  className="mt-1 rounded-lg bg-slate-900 px-3 py-1 text-xs font-bold text-white disabled:opacity-50"
                >
                  {g.joined ? 'Quitter l’équipe' : 'Rejoindre l’équipe'}
                </button>
              )}
              {canAct &&
                actor &&
                !g.joined &&
                !join.ok &&
                'reason' in join &&
                can(actor, 'view-open-groups') && (
                  <p className="mt-1 text-[11px] text-slate-500">{join.reason}</p>
                )}
            </div>
          )
        })}
        {canAct && actor && canRecruit(actor) && form?.kind !== 'recruit' && (
          <button
            type="button"
            onClick={() => setForm({ kind: 'recruit' })}
            className="w-full rounded-xl bg-emerald-700 px-3 py-2 text-sm font-bold text-white"
          >
            Recruter une équipe
          </button>
        )}
        {form?.kind === 'recruit' && engine && actor && (
          <RecruitForm
            engine={engine}
            actor={actor}
            onDone={refresh}
            onCancel={() => setForm(null)}
          />
        )}
      </div>
      <div className="space-y-1">
        <p className="text-xs font-bold text-slate-700">Regroupements de superficies</p>
        {dash.landGroups.length === 0 && (
          <p className="text-xs text-slate-500">Aucun regroupement en cours.</p>
        )}
        {dash.landGroups.map((g) => (
          <div key={g.id} className="rounded-xl bg-white px-3 py-2 text-sm ring-1 ring-slate-200">
            <div className="flex items-center justify-between gap-2">
              <span className="truncate font-semibold">{g.title}</span>
              <span className="shrink-0 text-xs text-slate-500">
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
            <p className="mt-1 text-[11px] text-slate-500">
              {g.participants} participant(s) · du {g.startsOn} au {g.endsOn}
              {g.joined ? ' · vous participez' : ''}
            </p>
            {canAct &&
              actor &&
              can(actor, 'join-land-group') &&
              g.state === 'OPEN' &&
              !g.joined &&
              !(form?.kind === 'pledge' && form.pool.id === g.id) && (
                <button
                  type="button"
                  onClick={() => setForm({ kind: 'pledge', pool: g })}
                  className="mt-1 rounded-lg bg-amber-600 px-3 py-1 text-xs font-bold text-white"
                >
                  Engager une parcelle
                </button>
              )}
            {form?.kind === 'pledge' && form.pool.id === g.id && engine && actor && (
              <div className="mt-2">
                <PledgeForm
                  engine={engine}
                  actor={actor}
                  pool={g}
                  onDone={refresh}
                  onCancel={() => setForm(null)}
                />
              </div>
            )}
          </div>
        ))}
        {canAct && actor && can(actor, 'join-land-group') && form?.kind !== 'pool' && (
          <button
            type="button"
            onClick={() => setForm({ kind: 'pool' })}
            className="w-full rounded-xl border border-emerald-700 px-3 py-2 text-sm font-bold text-emerald-800"
          >
            Regrouper nos superficies
          </button>
        )}
        {form?.kind === 'pool' && engine && actor && (
          <OpenPoolForm
            engine={engine}
            actor={actor}
            onDone={refresh}
            onCancel={() => setForm(null)}
          />
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
