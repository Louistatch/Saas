'use client'

import { emergencyOf } from '@/lib/haroolife/city/emergency'
import type { CityLife } from '@/lib/haroolife/city/life'
import {
  gameHour,
  municipalPending,
  municipalRepairDone,
  municipalStatus,
} from '@/lib/haroolife/city/street-civic'
import { lotById } from '@/lib/haroolife/city/world'
import { useEffect, useRef } from 'react'

export function PublicServices({
  state,
  onCall,
  onMayor,
  onInspect,
}: {
  state: CityLife
  onCall: () => void
  onMayor: () => void
  onInspect: () => void
}) {
  const emergency = emergencyOf(state)
  const report = state.civic?.reports[state.locality]
  const project = state.civic?.projects?.[state.locality]
  const done = municipalRepairDone(state)
  const inTownhall = !!state.insideLot && lotById(state.insideLot)?.type === 'townhall'
  return (
    <div className="space-y-4" data-testid="public-services">
      <section
        className="rounded-2xl border border-rose-100 bg-rose-50/60 p-4"
        aria-label="Ambulance du jeu"
      >
        <h3 className="text-lg font-black text-rose-950">🚑 Ambulance</h3>
        <p className="mt-2 text-sm text-slate-700">
          L’équipe vient te chercher dans la rue, te conduit à l’hôpital et te remet au médecin.
          Transport automatique et premiers soins gratuits : énergie +30, hygiène +20, une fois par
          jour.
        </p>
        <p className="mt-2 text-xs text-slate-600">
          Attends au point d’appel. Le gyrophare est visible ; le véhicule suit les routes du
          quartier. Tu peux interrompre la prise en charge sans frais.
        </p>
        <button
          type="button"
          onClick={onCall}
          disabled={emergency.treatedDay === state.life.day}
          className="mt-3 min-h-12 w-full rounded-xl bg-rose-700 px-4 py-3 text-sm font-bold text-white disabled:opacity-50"
        >
          {emergency.treatedDay === state.life.day
            ? 'Premiers soins reçus aujourd’hui'
            : state.insideLot || state.life.inside
              ? 'Sortir et appeler l’ambulance'
              : 'Appeler l’ambulance du jeu'}
        </button>
        <p className="mt-2 text-xs text-slate-500">
          {emergency.completed} intervention(s) terminée(s). Aucun appel vers de vrais secours.
        </p>
      </section>
      <section
        className="rounded-2xl border border-emerald-100 bg-emerald-50/60 p-4"
        aria-label="Interventions du maire"
      >
        <h3 className="text-lg font-black text-emerald-950">🏛️ Le maire au travail</h3>
        <p className="mt-2 text-sm text-slate-700">{municipalStatus(state)}</p>
        <ol className="mt-3 space-y-2 text-sm" aria-label="Suivi des travaux communaux">
          {[
            ['Signalement enregistré', report !== undefined],
            ['Ordre signé et équipe financée par le maire', !!project],
            ['Équipe sur le chantier', report !== undefined && gameHour(state) >= report + 1],
            ['Feux réparés et passages piétons sécurisés', done],
          ].map(([label, complete]) => (
            <li key={String(label)} className="flex items-start gap-2">
              <span aria-hidden className={complete ? 'text-emerald-700' : 'text-slate-400'}>
                {complete ? '✓' : '○'}
              </span>
              <span className={complete ? 'text-emerald-950' : 'text-slate-500'}>{label}</span>
            </li>
          ))}
        </ol>
        {project && (
          <p className="mt-3 rounded-xl bg-white p-3 text-xs text-slate-700">
            Budget des travaux : <strong>{project.budget} FCFA du jeu</strong>, dont{' '}
            {project.subsidy} de dotation de secours. Aucun prélèvement sur ton portefeuille.
          </p>
        )}
        {report === undefined && (
          <button
            type="button"
            onClick={onMayor}
            className="mt-3 min-h-12 w-full rounded-xl bg-emerald-800 px-4 py-3 text-sm font-bold text-white"
          >
            {inTownhall
              ? 'Signaler les feux au maire · gratuit'
              : 'Aller à la mairie pour signaler les feux'}
          </button>
        )}
        {municipalPending(state) && (
          <button
            type="button"
            onClick={onInspect}
            className="mt-3 min-h-12 w-full rounded-xl border border-emerald-700 bg-white px-4 py-3 text-sm font-bold text-emerald-950"
          >
            Rejoindre le chantier
          </button>
        )}
        <p className="mt-2 text-xs text-slate-600">
          Le temps avance pendant ces travaux, même si tu n’as pas activé l’horloge. « Le ruban et
          les discours après les boulons ! » — maire Agbavi, personnage fictif.
        </p>
      </section>
    </div>
  )
}

export function EmergencyOverlay({ state, onCancel }: { state: CityLife; onCancel: () => void }) {
  const order = emergencyOf(state).active
  const cancel = useRef<HTMLButtonElement>(null)
  const missionId = order?.id
  useEffect(() => {
    if (missionId) cancel.current?.focus({ preventScroll: true })
  }, [missionId])
  if (!order) return null
  return (
    <dialog
      open
      aria-modal="true"
      aria-label="Intervention de l’ambulance"
      className="absolute inset-0 z-40 m-0 flex h-full w-full max-h-none max-w-none items-end justify-center border-0 bg-transparent px-4 pb-[calc(24px+env(safe-area-inset-bottom,0px))]"
      data-testid="ambulance-mission"
    >
      <div className="w-full max-w-md rounded-3xl border border-rose-100 bg-[#fffdf7] p-5 shadow-xl">
        <p className="text-xs font-bold uppercase tracking-wide text-rose-700">
          🚑 Secours HarooLife · monnaie du jeu
        </p>
        <h2 className="mt-2 text-xl font-black text-slate-900">
          {order.phase === 'dispatch'
            ? 'L’ambulance vient te chercher'
            : order.phase === 'boarding'
              ? 'L’équipe te prend en charge'
              : 'En route vers l’hôpital'}
        </h2>
        <p className="mt-2 text-sm text-slate-600">
          {order.phase === 'dispatch'
            ? 'Attends ici. Le véhicule arrive par la route ; aucun besoin de conduire.'
            : order.phase === 'boarding'
              ? 'Les soignants préparent ton transport. Départ automatique.'
              : `Destination : ${lotById(order.hospital)?.name ?? 'hôpital'}. Les premiers soins seront donnés à l’arrivée.`}
        </p>
        <button
          ref={cancel}
          type="button"
          onClick={onCancel}
          className="mt-4 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-bold text-slate-700"
        >
          Arrêter la prise en charge sans frais
        </button>
      </div>
    </dialog>
  )
}
