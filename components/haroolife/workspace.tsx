'use client'

import { VillageScene } from '@/components/haroolife/village-scene'
import {
  ACTIVITIES,
  type Board,
  type Command,
  type Group,
  type Kind,
  displayState,
  progress,
} from '@/lib/haroolife/core'
import { ClipboardList, RefreshCw, Sprout, Users } from 'lucide-react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { type FormEvent, useCallback, useEffect, useRef, useState } from 'react'

const Village3D = dynamic(() => import('./village-3d'), { ssr: false })

// 3D optionnelle : drapeau explicite, WebGL2, et aucune préférence de sobriété (animations, données, mémoire).
function useRich3d() {
  const [ok, setOk] = useState(false)
  useEffect(() => {
    if (process.env.NEXT_PUBLIC_HAROOLIFE_3D !== 'true') return
    try {
      const nav = navigator as Navigator & {
        deviceMemory?: number
        connection?: { saveData?: boolean }
      }
      const sober =
        window.matchMedia('(prefers-reduced-motion: reduce)').matches ||
        nav.connection?.saveData === true ||
        (nav.deviceMemory !== undefined && nav.deviceMemory < 4)
      const gl = document.createElement('canvas').getContext('webgl2')
      setOk(!sober && gl !== null)
    } catch {
      setOk(false)
    }
  }, [])
  return ok
}

const actionClass =
  'rounded-xl bg-emerald-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50'
const inputClass =
  'mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900'
const stateLabels = {
  open: 'En constitution',
  ready: 'Objectif atteint',
  expired: 'Délai terminé',
  cancelled: 'Annulé',
}
const dateLabel = (value: string) =>
  new Date(`${value}T00:00:00Z`).toLocaleDateString('fr-FR', { timeZone: 'UTC' })

function ParcelFields({ board }: { board: Board }) {
  return (
    <>
      <label className="block text-sm font-medium">
        Ma parcelle
        <select name="parcel_id" required className={inputClass} defaultValue="">
          <option value="" disabled>
            Choisir ma parcelle
          </option>
          {board.parcels.map((p, index) => (
            <option key={p.id} value={p.id}>
              Parcelle {index + 1} · {p.culture || 'Culture non renseignée'} · {p.area} ha
            </option>
          ))}
        </select>
      </label>
      <label className="block text-sm font-medium">
        Surface proposée pour ces travaux (ha)
        <input
          name="amount"
          type="number"
          min="0.0001"
          step="0.0001"
          max="999999"
          required
          className={inputClass}
        />
      </label>
      <p className="text-xs text-slate-600">
        Une parcelle par participation. Seule la surface choisie est ajoutée au groupe ; une
        parcelle ne peut pas participer à deux groupes sur la même période.
      </p>
    </>
  )
}

export function HarooLifeWorkspace() {
  const [board, setBoard] = useState<Board | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [status, setStatus] = useState(0)
  const [place, setPlace] = useState<'all' | Kind>('all')
  const [view, setView] = useState<'village' | 'list'>('village')
  const [creating, setCreating] = useState<Kind | null>(null)
  const [joining, setJoining] = useState<Group | null>(null)
  const [pending, setPending] = useState<Command | null>(null)
  const [now, setNow] = useState(Date.now())
  const rich3d = useRich3d()
  const lock = useRef(false)
  const sequence = useRef(0)
  const section = useRef<HTMLElement>(null)

  const load = useCallback(async () => {
    const seq = ++sequence.current
    setLoading(true)
    try {
      const response = await fetch('/api/haroolife', { cache: 'no-store' })
      const data = await response.json()
      if (seq !== sequence.current) return
      setStatus(response.status)
      if (!response.ok) {
        setError(data.error || 'Chargement impossible.')
        setBoard(null)
        return
      }
      setBoard(data as Board)
      setError('')
      setNow(Date.now())
    } catch {
      if (seq === sequence.current)
        setError('Connexion interrompue. Actualisez avant de participer.')
    } finally {
      if (seq === sequence.current) setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
    return () => {
      sequence.current++
    }
  }, [load])
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(timer)
  }, [])

  async function send(command: Command) {
    if (lock.current) return
    lock.current = true
    setBusy(true)
    setError('')
    setMessage('')
    setPending(command)
    try {
      const response = await fetch('/api/haroolife', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(command),
      })
      const data = await response.json()
      if (!response.ok) {
        // Keep the SAME request id after an ambiguous server failure.
        if (response.status < 500) setPending(null)
        setError(data.error || 'Action impossible.')
        return
      }
      setPending(null)
      setCreating(null)
      setJoining(null)
      setMessage(
        command.action === 'cancel'
          ? 'Groupe annulé.'
          : command.action === 'leave'
            ? 'Votre participation a été retirée.'
            : 'Votre participation est enregistrée. Aucun contrat de travail n’a été signé.',
      )
      await load()
    } catch {
      setError(
        'La réponse a été interrompue. Réessayez la même demande pour vérifier son enregistrement sans doublon.',
      )
    } finally {
      lock.current = false
      setBusy(false)
    }
  }

  function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!creating) return
    const data = new FormData(event.currentTarget)
    void send({
      request_id: crypto.randomUUID(),
      action: 'create',
      payload: {
        kind: creating,
        title: String(data.get('title')),
        activity: String(data.get('activity')) as Group['activity'],
        starts_on: String(data.get('starts_on')),
        ends_on: String(data.get('ends_on')),
        ...(creating === 'work'
          ? { parcel_id: String(data.get('parcel_id')), amount: Number(data.get('amount')) }
          : {}),
      },
    })
  }
  function join(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!joining) return
    const data = new FormData(event.currentTarget)
    void send({
      request_id: crypto.randomUUID(),
      action: 'join',
      payload: {
        group_id: joining.id,
        ...(joining.kind === 'work'
          ? { parcel_id: String(data.get('parcel_id')), amount: Number(data.get('amount')) }
          : {}),
      },
    })
  }
  function choosePlace(next: typeof place) {
    setPlace(next)
    setCreating(null)
    setJoining(null)
    section.current?.scrollIntoView({ behavior: 'auto', block: 'start' })
  }

  const disabled = busy || loading || pending !== null || error !== ''
  const tomorrow = new Date(now + 86_400_000).toISOString().slice(0, 10)
  const villageCounts = {
    team:
      board?.groups.filter((g) => g.kind === 'team' && displayState(g, now) === 'open').length ?? 0,
    work:
      board?.groups.filter((g) => g.kind === 'work' && displayState(g, now) === 'open').length ?? 0,
    all: board?.groups.filter((g) => g.joined).length ?? 0,
  }
  const shown = board?.groups.filter((g) => place === 'all' || g.kind === place) ?? []
  return (
    <main className="mx-auto max-w-6xl space-y-7 px-5 py-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-emerald-700">
            HarooLife · pilote de regroupement
          </p>
          <h1 className="mt-2 text-3xl font-bold sm:text-4xl">Ensemble, préparons les travaux.</h1>
          <p className="mt-3 max-w-2xl text-slate-600">
            Votre équipe, vos parcelles et vos prochains travaux, au même endroit.
          </p>
          {board && (
            <p className="mt-2 text-sm font-medium">
              {board.pilot.cooperative} · Canton {board.pilot.canton}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={busy || loading}
          className="flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm disabled:opacity-50"
        >
          <RefreshCw aria-hidden="true" className="h-4 w-4" />
          Actualiser
        </button>
      </div>
      <output aria-live="polite">{loading ? 'Actualisation du territoire…' : message}</output>
      {error && (
        <div
          role="alert"
          className="space-y-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-950"
        >
          <p>{error}</p>
          {status === 401 && (
            <Link
              href="/auth/login?redirect=%2Fharoolife"
              className="inline-block font-semibold underline"
            >
              Se connecter
            </Link>
          )}
          {pending && (
            <button
              type="button"
              className={actionClass}
              disabled={busy}
              onClick={() => void send(pending)}
            >
              Réessayer la même demande
            </button>
          )}
        </div>
      )}
      {board && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <p className="max-w-2xl text-sm text-slate-600">
              Ce pilote prépare les groupes. Atteindre l’objectif ne réserve pas un chantier et ne
              signe aucun contrat. Les dates et engagements de travail seront confirmés séparément.
            </p>
            <div
              className="flex rounded-xl border border-slate-300 bg-white p-1"
              aria-label="Affichage du territoire"
            >
              {(['village', 'list'] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  aria-pressed={view === v}
                  onClick={() => setView(v)}
                  className={`rounded-lg px-3 py-2 text-sm ${view === v ? 'bg-emerald-900 text-white' : ''}`}
                >
                  {v === 'village' ? 'Village' : 'Liste légère'}
                </button>
              ))}
            </div>
          </div>
          {view === 'village' && (
            <section
              aria-label="Votre village interactif"
              className="relative overflow-hidden rounded-3xl border border-emerald-200 bg-gradient-to-b from-sky-100 via-emerald-50 to-emerald-200 p-6 sm:p-10"
            >
              <p className="relative mb-4 text-sm text-emerald-950">
                Choisissez un lieu pour agir · représentation stylisée du territoire
              </p>
              {rich3d ? (
                <Village3D counts={villageCounts} onChoose={choosePlace} />
              ) : (
                <VillageScene counts={villageCounts} onChoose={choosePlace} />
              )}
              <div className="relative grid gap-5 sm:grid-cols-3">
                {(
                  [
                    {
                      key: 'team',
                      icon: Users,
                      title: 'Maison des équipes',
                      text: 'Trouver ma place et réunir les compétences.',
                      count: board.groups.filter(
                        (g) => g.kind === 'team' && displayState(g, now) === 'open',
                      ).length,
                    },
                    {
                      key: 'work',
                      icon: Sprout,
                      title: 'Nos parcelles',
                      text: 'Regrouper les surfaces pour les mêmes travaux.',
                      count: board.groups.filter(
                        (g) => g.kind === 'work' && displayState(g, now) === 'open',
                      ).length,
                    },
                    {
                      key: 'all',
                      icon: ClipboardList,
                      title: 'Place du village',
                      text: 'Retrouver les groupes et suivre ma participation.',
                      count: board.groups.filter((g) => g.joined).length,
                    },
                  ] as const
                ).map(({ key, icon: Icon, title, text, count }) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => choosePlace(key)}
                    className="rounded-2xl border border-white bg-white/90 p-6 text-left shadow-sm transition-transform hover:-translate-y-1 focus-visible:outline-2 focus-visible:outline-offset-4 motion-reduce:transform-none"
                  >
                    <Icon aria-hidden="true" className="mb-5 h-10 w-10 text-emerald-800" />
                    <span className="block text-lg font-bold">{title}</span>
                    <span className="mt-2 block text-sm text-slate-600">{text}</span>
                    <span className="mt-4 inline-block rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold">
                      {count} {key === 'all' ? 'participation(s)' : 'groupe(s) ouvert(s)'}
                    </span>
                  </button>
                ))}
              </div>
            </section>
          )}
          <section
            ref={section}
            aria-label="Groupes du territoire"
            className="scroll-mt-5 space-y-5"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap gap-2" aria-label="Filtrer les groupes">
                {(
                  [
                    { value: 'all', label: 'Tout' },
                    { value: 'team', label: 'Équipes' },
                    { value: 'work', label: 'Travaux regroupés' },
                  ] as const
                ).map(({ value, label }) => (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={place === value}
                    onClick={() => choosePlace(value)}
                    className={`rounded-full border px-4 py-2 text-sm ${place === value ? 'border-emerald-900 bg-emerald-900 text-white' : 'border-slate-300 bg-white'}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap gap-2">
                {board.access.can_team && (
                  <button
                    type="button"
                    className={actionClass}
                    disabled={disabled}
                    onClick={() => {
                      setCreating('team')
                      setJoining(null)
                    }}
                  >
                    Créer une équipe
                  </button>
                )}
                {board.access.can_work && (
                  <button
                    type="button"
                    className={actionClass}
                    disabled={disabled}
                    onClick={() => {
                      setCreating('work')
                      setJoining(null)
                    }}
                  >
                    Regrouper mes travaux
                  </button>
                )}
              </div>
            </div>
            {!board.access.can_team && !board.access.can_work && (
              <p className="rounded-xl bg-white p-4 text-sm">
                Vous consultez le pilote. Chaque ouvrier et chaque titulaire de parcelle confirme sa
                propre participation ; l’administrateur ne l’engage pas à sa place.
              </p>
            )}
            {creating && (
              <form
                onSubmit={create}
                className="space-y-4 rounded-2xl border border-emerald-300 bg-white p-5"
                aria-label="Créer un groupe"
              >
                <h2 className="text-xl font-bold">
                  {creating === 'team'
                    ? 'Constituer mon équipe'
                    : 'Proposer un regroupement de travaux'}
                </h2>
                <p className="text-sm text-slate-600">
                  Objectif :{' '}
                  {creating === 'team'
                    ? `${board.pilot.team_target} personnes`
                    : `${board.pilot.area_target} ha`}
                  . Délai : {board.pilot.formation_hours} h maximum, avant le début prévu. Votre
                  participation est ajoutée dès la création.
                </p>
                <fieldset disabled={disabled} className="grid gap-4 sm:grid-cols-2">
                  <label className="text-sm font-medium">
                    Nom du groupe
                    <input
                      name="title"
                      required
                      minLength={3}
                      maxLength={100}
                      className={inputClass}
                      placeholder="Récolte de maïs — secteur nord"
                    />
                  </label>
                  <label className="text-sm font-medium">
                    Travail
                    <select name="activity" className={inputClass}>
                      {Object.entries(ACTIVITIES).map(([key, value]) => (
                        <option key={key} value={key}>
                          {value}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="text-sm font-medium">
                    Début prévu
                    <input
                      name="starts_on"
                      type="date"
                      min={tomorrow}
                      required
                      className={inputClass}
                    />
                  </label>
                  <label className="text-sm font-medium">
                    Fin prévue
                    <input
                      name="ends_on"
                      type="date"
                      min={tomorrow}
                      required
                      className={inputClass}
                    />
                  </label>
                  {creating === 'work' && <ParcelFields board={board} />}
                  <label className="flex items-start gap-2 text-sm sm:col-span-2">
                    <input type="checkbox" required className="mt-1" />
                    Je confirme ma disponibilité sur cette période et ma participation à la
                    préparation du groupe.
                  </label>
                  <button type="submit" className={actionClass}>
                    {busy ? 'Enregistrement…' : 'Confirmer la création'}
                  </button>
                </fieldset>
                <button
                  type="button"
                  disabled={busy || pending !== null}
                  onClick={() => setCreating(null)}
                  className="text-sm underline"
                >
                  Fermer
                </button>
              </form>
            )}
            {joining && (
              <form
                key={joining.id}
                onSubmit={join}
                className="space-y-4 rounded-2xl border border-emerald-300 bg-white p-5"
                aria-label="Rejoindre un groupe"
              >
                <h2 className="text-xl font-bold">Rejoindre « {joining.title} »</h2>
                <p>
                  {ACTIVITIES[joining.activity]} · {dateLabel(joining.starts_on)} au{' '}
                  {dateLabel(joining.ends_on)}
                </p>
                <fieldset disabled={disabled} className="space-y-4">
                  {joining.kind === 'work' && <ParcelFields board={board} />}
                  <label className="flex items-start gap-2 text-sm">
                    <input type="checkbox" required className="mt-1" />
                    Je confirme ma disponibilité et ma participation à ce groupe préparatoire. Aucun
                    contrat n’est signé à cette étape.
                  </label>
                  <button type="submit" className={actionClass}>
                    {busy ? 'Enregistrement…' : 'Confirmer ma participation'}
                  </button>
                </fieldset>
                <button
                  type="button"
                  disabled={busy || pending !== null}
                  onClick={() => setJoining(null)}
                  className="text-sm underline"
                >
                  Fermer
                </button>
              </form>
            )}
            {!shown.length && (
              <p className="rounded-2xl border border-dashed border-slate-300 p-10 text-center text-slate-600">
                Aucun groupe pour le moment. Créez le premier avec les personnes de votre
                territoire.
              </p>
            )}
            <div className="grid gap-4 md:grid-cols-2">
              {shown.map((g) => {
                const state = displayState(g, now)
                const open = state === 'open'
                const active = open || state === 'ready'
                const canJoin = g.kind === 'team' ? board.access.can_team : board.access.can_work
                return (
                  <article
                    key={g.id}
                    className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold uppercase text-emerald-800">
                        {g.kind === 'team' ? 'Équipe' : 'Travaux regroupés'}
                      </span>
                      <span className="rounded-full bg-slate-100 px-3 py-1 text-xs">
                        {stateLabels[state]}
                      </span>
                    </div>
                    <h2 className="text-lg font-bold">{g.title}</h2>
                    <p className="text-sm text-slate-600">
                      {ACTIVITIES[g.activity]} · {dateLabel(g.starts_on)} au {dateLabel(g.ends_on)}
                    </p>
                    <div>
                      <p className="mb-2 text-sm font-semibold">
                        {g.total} / {g.target} {g.kind === 'team' ? 'personnes' : 'ha'}
                        {g.joined ? ' · Vous participez' : ''}
                      </p>
                      <progress
                        className="h-2 w-full accent-emerald-700"
                        value={progress(g)}
                        max={100}
                        aria-label={`Progression de ${g.title}`}
                      />
                    </div>
                    <p className="text-xs text-slate-500">
                      Clôture le{' '}
                      {new Date(g.expires_at).toLocaleString('fr-FR', { timeZone: 'Africa/Lome' })}{' '}
                      (heure du Togo)
                    </p>
                    {state === 'ready' && (
                      <p className="text-sm text-emerald-800">
                        Objectif atteint. La suite du recrutement sera organisée séparément ; aucune
                        mission n’est attribuée automatiquement.
                      </p>
                    )}
                    <div className="flex flex-wrap gap-3">
                      {open && !g.joined && canJoin && (
                        <button
                          type="button"
                          disabled={disabled}
                          className={actionClass}
                          onClick={() => {
                            setJoining(g)
                            setCreating(null)
                            section.current?.scrollIntoView({ block: 'start' })
                          }}
                        >
                          Rejoindre ce groupe
                        </button>
                      )}
                      {active && g.joined && (
                        <button
                          type="button"
                          disabled={disabled}
                          className="text-sm text-slate-600 underline disabled:opacity-50"
                          onClick={() => {
                            if (
                              window.confirm(
                                g.is_owner
                                  ? 'Annuler ce groupe pour tous ses participants ?'
                                  : 'Retirer votre participation de ce groupe ?',
                              )
                            )
                              void send({
                                request_id: crypto.randomUUID(),
                                action: g.is_owner ? 'cancel' : 'leave',
                                payload: { group_id: g.id },
                              })
                          }}
                        >
                          {g.is_owner ? 'Annuler mon groupe' : 'Retirer ma participation'}
                        </button>
                      )}
                    </div>
                  </article>
                )
              })}
            </div>
            {board.groups.length === 100 && (
              <p className="text-sm text-slate-600">
                Les 100 groupes les plus récents sont affichés, avec vos participations en premier.
              </p>
            )}
          </section>
        </>
      )}
    </main>
  )
}
