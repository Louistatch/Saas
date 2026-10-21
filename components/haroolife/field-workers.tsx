'use client'

/**
 * « Mon champ » → recruit a worker (game money only). The real Haroo workers who are available
 * come first; the player proposes 1 to 3 days at the game's daily wage and the worker answers in
 * the game or on their Haroo dashboard. With no real worker around, the village's neighbours are
 * asked instead: they always say no, and the player is invited to bring real workers onto Haroo.
 * A player who is an ouvrier also sees here what other players propose to them.
 * The rules live in lib/haroolife/city/workers.ts, the calls in lib/haroolife/field-work.ts.
 */
import { CROPS, type CropId, type FieldStatus } from '@/lib/haroolife/city/farm'
import type { CityLife } from '@/lib/haroolife/city/life'
import { LOCALITIES, type LocalityId } from '@/lib/haroolife/city/locality'
import {
  type FieldOffer,
  type FieldWorker,
  MAX_HIRE_DAYS,
  WORKER_SIGNUP,
  answered,
  applyAnswer,
  excuseOf,
  helperSaid,
  neighboursOf,
  regionOf,
  wageFor,
} from '@/lib/haroolife/city/workers'
import {
  type MyOffers,
  answerOffer,
  cancelOffer,
  fieldWorkers,
  isError,
  markSeen,
  myOffers,
  offerWork,
} from '@/lib/haroolife/field-work'
import { useCallback, useEffect, useRef, useState } from 'react'

const money = (n: number) => `${Math.round(n).toLocaleString('fr-FR')} FCFA`
const daysSaid = (n: number) => (n > 1 ? `${n} jours` : 'une journée')
const cropSaid = (crop: string) => CROPS[crop as CropId]?.name.toLowerCase() ?? crop
const townSaid = (locality: string) => LOCALITIES[locality as LocalityId]?.name ?? locality
const hour = (iso: string) =>
  new Date(iso).toLocaleString('fr-FR', { weekday: 'long', hour: '2-digit', minute: '2-digit' })

const INVITE = `Sur HarooLife, des joueurs cherchent des ouvriers pour leurs champs (argent du jeu). Inscris-toi comme ouvrier sur Haroo pour recevoir leurs propositions : ${WORKER_SIGNUP}`

type Growing = Extract<FieldStatus, { kind: 'growing' }>

export default function FieldWorkers({
  cityLife,
  status,
  update,
}: {
  cityLife: CityLife
  status: FieldStatus
  update: (change: (s: CityLife) => CityLife) => void
}) {
  const [offers, setOffers] = useState<MyOffers | null>(null)
  const [said, setSaid] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const life = useRef(cityLife)
  life.current = cityLife

  // Proposals and answers: when the farm opens, then every half minute while it stays open.
  const load = useCallback(async () => {
    const got = await myOffers()
    if (isError(got)) return
    setOffers(got)
    for (const o of got.hired) {
      if (o.status === 'pending' || o.seen) continue
      if (!answered(life.current, o.id)) update((s) => applyAnswer(s, o))
      void markSeen(o.id)
    }
  }, [update])
  useEffect(() => {
    void load()
    const id = window.setInterval(() => {
      if (document.visibilityState === 'visible') void load()
    }, 30_000)
    return () => window.clearInterval(id)
  }, [load])

  const answer = async (o: FieldOffer, accept: boolean) => {
    setBusy(o.id)
    const r = await answerOffer(o.id, accept)
    setBusy(null)
    if (isError(r)) setSaid(r.error)
    else if (r.status === 'accepted')
      setSaid(
        `Accepté : ${money(r.pay)} du jeu arrivent dans ton portefeuille. Réponse envoyée à ${r.employer}.`,
      )
    else if (r.status === 'declined') setSaid(`Refusé. Réponse envoyée à ${r.employer}.`)
    else setSaid(r.reason ?? 'Cette proposition n’attend plus de réponse.')
    void load()
  }

  const asked = offers?.asked ?? []
  return (
    <>
      {status.kind === 'growing' && (
        <Recruit
          cityLife={cityLife}
          status={status}
          update={update}
          offers={offers}
          reload={load}
        />
      )}
      {asked.length > 0 && (
        <section
          aria-label="Propositions de travail"
          data-testid="field-asked"
          className="space-y-2 rounded-2xl border border-emerald-200 bg-emerald-50 p-3"
        >
          <p className="text-sm font-black text-emerald-950">On te propose du travail au champ</p>
          {asked.map((o) => (
            <div key={o.id} className="rounded-xl bg-white p-3">
              <p className="text-sm text-slate-800">
                <span className="font-bold">{o.employer}</span> te propose {daysSaid(o.days)} au
                champ de {cropSaid(o.crop)} à {townSaid(o.locality)} · {money(o.pay)} du jeu.
              </p>
              <p className="mt-0.5 text-[11px] text-slate-500">
                Réponse avant {hour(o.expires_at)}.
              </p>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  disabled={busy === o.id}
                  onClick={() => void answer(o, true)}
                  className="rounded-xl bg-emerald-700 px-3 py-2.5 text-sm font-black text-white disabled:opacity-50"
                >
                  Accepter
                </button>
                <button
                  type="button"
                  disabled={busy === o.id}
                  onClick={() => void answer(o, false)}
                  className="rounded-xl border border-emerald-300 bg-white px-3 py-2.5 text-sm font-bold text-emerald-900 disabled:opacity-50"
                >
                  Refuser
                </button>
              </div>
            </div>
          ))}
          <p className="text-[11px] text-slate-500">
            Travail dans le jeu, payé en argent du jeu. Aucun engagement réel.
          </p>
        </section>
      )}
      {said && (
        <output className="block rounded-xl bg-emerald-50 p-3 text-sm font-semibold text-emerald-900">
          {said}
        </output>
      )}
    </>
  )
}

function Recruit({
  cityLife,
  status,
  update,
  offers,
  reload,
}: {
  cityLife: CityLife
  status: Growing
  update: (change: (s: CityLife) => CityLife) => void
  offers: MyOffers | null
  reload: () => Promise<void>
}) {
  const [open, setOpen] = useState(false)
  const [workers, setWorkers] = useState<FieldWorker[] | null>(null)
  const [unreachable, setUnreachable] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const maxDays = Math.max(1, Math.min(MAX_HIRE_DAYS, status.daysLeft))
  const [chosen, setDays] = useState(1)
  const days = Math.min(chosen, maxDays)
  const field = status.field
  const day = cityLife.life.day
  const wage = wageFor(days)
  const short = cityLife.life.wallet < wage
  const pending = offers?.hired.find((o) => o.status === 'pending')
  const helper = field.helper
  const helping = !!helper && day < helper.from + helper.days

  useEffect(() => {
    if (!open || workers) return
    let alive = true
    void fieldWorkers(regionOf(field.locality)).then((r) => {
      if (!alive) return
      if (isError(r)) {
        setUnreachable(true)
        setWorkers([])
      } else setWorkers(r)
    })
    return () => {
      alive = false
    }
  }, [open, workers, field.locality])

  const propose = async (w: FieldWorker) => {
    setBusy(true)
    setError(null)
    const r = await offerWork(w.ref, days, field.crop, field.locality)
    setBusy(false)
    if (isError(r)) {
      setError(r.error)
      if (/plus disponible/.test(r.error)) setWorkers(null)
      return
    }
    setOpen(false)
    await reload()
  }

  const withdraw = async (o: FieldOffer) => {
    setBusy(true)
    const r = await cancelOffer(o.id)
    setBusy(false)
    if (isError(r)) setError(r.error)
    else {
      update((s) => applyAnswer(s, r))
      void markSeen(r.id)
    }
    await reload()
  }

  if (helping)
    return (
      <p
        data-testid="field-helper"
        className="rounded-2xl bg-lime-100 p-3 text-sm font-semibold text-lime-950"
      >
        🧑🏾‍🌾 {helperSaid(cityLife)}
      </p>
    )

  return (
    <section
      aria-label="Recruter un ouvrier"
      data-testid="field-workers"
      className="space-y-2 rounded-2xl border border-lime-200 bg-lime-50 p-3"
    >
      {pending ? (
        <div data-testid="field-pending">
          <p className="text-sm text-slate-800">
            Proposition envoyée à <span className="font-bold">{pending.worker}</span> :{' '}
            {daysSaid(pending.days)} au champ, {money(pending.pay)}.
          </p>
          <p className="mt-0.5 text-[11px] text-slate-500">
            Réponse attendue avant {hour(pending.expires_at)}. Rien n’est payé tant que ce n’est pas
            accepté.
          </p>
          <button
            type="button"
            disabled={busy}
            onClick={() => void withdraw(pending)}
            className="mt-2 w-full rounded-xl border border-lime-300 bg-white px-3 py-2.5 text-sm font-bold text-lime-900 disabled:opacity-50"
          >
            Retirer la proposition
          </button>
        </div>
      ) : !open ? (
        <>
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="w-full rounded-xl bg-white px-3 py-3 text-sm font-black text-lime-900 ring-1 ring-lime-300"
          >
            Recruter un ouvrier · {money(wageFor(1))} par jour
          </button>
          <p className="text-[11px] text-slate-500">
            Un ouvrier passe au champ à ta place, un jour après l’autre.
          </p>
        </>
      ) : (
        <>
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-black text-slate-900">Combien de jours ?</p>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-xs font-semibold text-lime-800 underline"
            >
              Fermer
            </button>
          </div>
          <fieldset className="grid grid-cols-3 gap-2" aria-label="Jours de travail">
            {Array.from({ length: maxDays }, (_, i) => i + 1).map((n) => (
              <button
                key={n}
                type="button"
                aria-pressed={days === n}
                onClick={() => setDays(n)}
                className={`rounded-xl px-2 py-2 text-sm font-bold ${
                  days === n
                    ? 'bg-lime-700 text-white'
                    : 'bg-white text-lime-900 ring-1 ring-lime-300'
                }`}
              >
                {n} j · {money(wageFor(n))}
              </button>
            ))}
          </fieldset>
          {short && (
            <p className="text-xs font-semibold text-amber-800">
              Il te manque {money(wage - cityLife.life.wallet)} pour payer {daysSaid(days)}.
            </p>
          )}
          {error && (
            <p role="alert" className="text-xs font-semibold text-red-700">
              {error}
            </p>
          )}
          {workers === null ? (
            <p className="text-sm text-slate-600">Recherche des ouvriers disponibles…</p>
          ) : workers.length ? (
            <ul className="space-y-2" aria-label="Ouvriers disponibles">
              {workers.map((w) => (
                <li key={w.ref} className="rounded-xl bg-white p-3" data-testid="field-worker">
                  <div className="flex items-start gap-3">
                    <span
                      aria-hidden
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-lime-200 text-base font-black text-lime-900"
                    >
                      {w.name.slice(0, 1)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="font-black text-slate-900">
                        {w.name}
                        {w.nearby && (
                          <span className="ml-2 rounded-full bg-lime-100 px-2 py-0.5 text-[11px] font-bold text-lime-900">
                            Dans ta région
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-slate-600">
                        {w.reviews > 0
                          ? `★ ${w.note.toLocaleString('fr-FR')} · ${w.reviews} avis`
                          : 'Nouveau sur Haroo'}
                        {w.skills.length ? ` · ${w.skills.join(', ')}` : ''}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={busy || short}
                    onClick={() => void propose(w)}
                    className="mt-2 w-full rounded-xl bg-lime-700 px-3 py-2.5 text-sm font-black text-white disabled:opacity-50"
                  >
                    Proposer {daysSaid(days)} à {w.name} · {money(wage)}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <Neighbours day={day} unreachable={unreachable} />
          )}
          <p className="text-[11px] text-slate-500">
            De vrais ouvriers inscrits sur Haroo. Ils répondent dans le jeu ou sur leur tableau de
            bord ; payés en argent du jeu s’ils acceptent. Aucun engagement réel, aucun numéro
            échangé.
          </p>
        </>
      )}
    </section>
  )
}

/** No real worker: the neighbours are asked, and always find an excuse. */
function Neighbours({ day, unreachable }: { day: number; unreachable: boolean }) {
  const [asked, setAsked] = useState<Record<string, number>>({})
  const [bubble, setBubble] = useState<{ name: string; text: string } | null>(null)
  const ask = (name: string) => {
    const attempt = asked[name] ?? 0
    setAsked({ ...asked, [name]: attempt + 1 })
    setBubble({ name, text: excuseOf(name, day, attempt) })
  }
  const refused = Object.keys(asked).length > 0
  return (
    <div className="space-y-2" data-testid="field-neighbours">
      <p className="text-sm text-slate-700">
        {unreachable
          ? 'La liste des ouvriers de Haroo ne répond pas pour l’instant. Les voisins, eux, sont là… en principe.'
          : 'Aucun ouvrier de Haroo n’est disponible pour l’instant. Les voisins, eux, sont là… en principe.'}
      </p>
      <ul className="space-y-2">
        {neighboursOf(day).map((n) => (
          <li key={n.name} className="flex items-center gap-3 rounded-xl bg-white p-3">
            <span
              aria-hidden
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-stone-200 text-base font-black text-stone-700"
            >
              {n.name.slice(0, 1)}
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-black text-slate-900">{n.name}</p>
              <p className="text-xs text-slate-600">{n.trade}</p>
            </div>
            <button
              type="button"
              onClick={() => ask(n.name)}
              className="shrink-0 rounded-xl bg-stone-700 px-3 py-2 text-xs font-black text-white"
            >
              Lui demander
            </button>
          </li>
        ))}
      </ul>
      {bubble && (
        <output
          data-testid="neighbour-excuse"
          className="relative block rounded-2xl bg-white p-3 text-sm text-slate-800 ring-1 ring-stone-300"
        >
          <span className="font-black">{bubble.name} :</span> « {bubble.text} »
        </output>
      )}
      {refused && (
        <div className="rounded-xl bg-lime-100 p-3 text-sm text-lime-950">
          <p>
            Personne au quartier ne veut venir. Les vrais ouvriers inscrits sur Haroo, eux,
            reçoivent tes propositions.
          </p>
          <a
            href={`https://wa.me/?text=${encodeURIComponent(INVITE)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 block rounded-xl bg-lime-700 px-3 py-2.5 text-center text-sm font-black text-white"
          >
            Inviter un ouvrier sur WhatsApp
          </a>
        </div>
      )}
    </div>
  )
}
