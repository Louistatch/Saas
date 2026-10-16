'use client'

/**
 * Forms of the aggregation features inside a house of cooperatives. Each submit dispatches
 * a command on the interaction engine; the server (haroolife_command) validates, the
 * client mirrors the rules for an immediate, honest message.
 */
import { ACTIVITIES } from '@/lib/haroolife/core'
import type { Actor } from '@/lib/haroolife/domain/actor'
import type { InteractionEngine } from '@/lib/haroolife/domain/engine'
import { ACCOUNT_REQUIRED, HttpAggregationService } from '@/lib/haroolife/domain/http'
import {
  type AreaUnit,
  type LandAggregation,
  type Parcel,
  toHectares,
} from '@/lib/haroolife/domain/land-aggregation'
import { useEffect, useState } from 'react'
import { AccountPrompt } from '../visitor'

const parcels = new HttpAggregationService()
const input = 'w-full rounded-xl border border-slate-300 px-3 py-2 text-sm'
const label = 'block text-xs font-bold text-slate-700'
const today = () => new Date().toISOString().slice(0, 10)
const plusDays = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10)
const ha = (n: number) =>
  `${new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 }).format(n)} ha`

function SubmitRow({ busy, onCancel, cta }: { busy: boolean; onCancel: () => void; cta: string }) {
  return (
    <div className="flex gap-2">
      <button
        type="button"
        onClick={onCancel}
        className="rounded-xl bg-slate-100 px-3 py-2 text-sm font-semibold"
      >
        Annuler
      </button>
      <button
        type="submit"
        disabled={busy}
        className="flex-1 rounded-xl bg-emerald-700 px-3 py-2 text-sm font-bold text-white disabled:opacity-50"
      >
        {busy ? 'Envoi…' : cta}
      </button>
    </div>
  )
}

export function RecruitForm({
  engine,
  actor,
  onDone,
  onCancel,
}: {
  engine: InteractionEngine
  actor: Actor
  onDone: (message: string) => void
  onCancel: () => void
}) {
  const [title, setTitle] = useState('')
  const [activity, setActivity] = useState<keyof typeof ACTIVITIES>('recolte')
  const [startsOn, setStartsOn] = useState(plusDays(7))
  const [endsOn, setEndsOn] = useState(plusDays(9))
  const [beneficiary, setBeneficiary] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  return (
    <form
      className="space-y-2 rounded-2xl bg-emerald-50 p-3"
      aria-label="Recruter une équipe"
      onSubmit={async (e) => {
        e.preventDefault()
        setBusy(true)
        setError(null)
        const r = await engine.bus.dispatch(
          { type: 'RecruitTeam', payload: { title, activity, startsOn, endsOn, beneficiary } },
          actor,
        )
        setBusy(false)
        if (!r.ok) return setError(r.error)
        onDone(
          `Équipe « ${title} » ouverte : les ouvriers disponibles du canton peuvent la rejoindre.`,
        )
      }}
    >
      <p className="text-sm font-bold">Recruter une équipe</p>
      <label className={label}>
        Titre
        <input
          className={input}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          minLength={3}
          maxLength={100}
          required
          placeholder="Ex. Désherbage parcelles Sud"
        />
      </label>
      <label className={label}>
        Activité
        <select
          className={input}
          value={activity}
          onChange={(e) => setActivity(e.target.value as keyof typeof ACTIVITIES)}
        >
          {Object.entries(ACTIVITIES).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </label>
      <div className="grid grid-cols-2 gap-2">
        <label className={label}>
          Début
          <input
            type="date"
            className={input}
            value={startsOn}
            min={today()}
            onChange={(e) => setStartsOn(e.target.value)}
            required
          />
        </label>
        <label className={label}>
          Fin
          <input
            type="date"
            className={input}
            value={endsOn}
            min={startsOn}
            onChange={(e) => setEndsOn(e.target.value)}
            required
          />
        </label>
      </div>
      <label className={label}>
        Pour le compte de (facultatif)
        <input
          className={input}
          value={beneficiary}
          onChange={(e) => setBeneficiary(e.target.value)}
          maxLength={120}
          placeholder="Nom du producteur bénéficiaire"
        />
      </label>
      {error === ACCOUNT_REQUIRED ? (
        <AccountPrompt reason={error} compact />
      ) : (
        error && (
          <p role="alert" className="rounded-xl bg-rose-50 p-2 text-xs font-semibold text-rose-800">
            {error}
          </p>
        )
      )}
      <SubmitRow busy={busy} onCancel={onCancel} cta="Ouvrir le recrutement" />
    </form>
  )
}

function useMyParcels() {
  const [mine, setMine] = useState<Parcel[] | null>(null)
  useEffect(() => {
    let alive = true
    parcels
      .mine()
      .then((p) => alive && setMine(p))
      .catch(() => alive && setMine([]))
    return () => {
      alive = false
    }
  }, [])
  return mine
}

function ParcelFields({
  mine,
  parcelId,
  setParcelId,
  amount,
  setAmount,
  unit,
  setUnit,
}: {
  mine: Parcel[] | null
  parcelId: string
  setParcelId: (v: string) => void
  amount: string
  setAmount: (v: string) => void
  unit: AreaUnit
  setUnit: (v: AreaUnit) => void
}) {
  const chosen = mine?.find((p) => p.id === parcelId)
  const amountHa = toHectares(Number(amount) || 0, unit)
  return (
    <>
      <label className={label}>
        Parcelle
        <select
          className={input}
          value={parcelId}
          onChange={(e) => setParcelId(e.target.value)}
          required
        >
          <option value="">
            {mine === null
              ? 'Chargement…'
              : mine.length === 0
                ? 'Aucune parcelle enregistrée à votre nom'
                : 'Choisir une parcelle'}
          </option>
          {(mine ?? []).map((p) => (
            <option key={p.id} value={p.id}>
              {p.cultureName ?? 'Culture non renseignée'} · {ha(p.areaHa)}
            </option>
          ))}
        </select>
      </label>
      <div className="grid grid-cols-[1fr_auto] gap-2">
        <label className={label}>
          Surface engagée
          <input
            type="number"
            inputMode="decimal"
            step="any"
            min="0"
            className={input}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
            aria-describedby="pledge-ha"
          />
        </label>
        <label className={label}>
          Unité
          <select
            className={input}
            value={unit}
            onChange={(e) => setUnit(e.target.value as AreaUnit)}
          >
            <option value="ha">ha</option>
            <option value="are">are</option>
            <option value="m2">m²</option>
          </select>
        </label>
      </div>
      <p id="pledge-ha" className="text-xs text-slate-500">
        Soit {ha(amountHa)}
        {chosen ? ` sur une parcelle de ${ha(chosen.areaHa)}` : ''}. Une parcelle ne s’engage qu’une
        fois par période.
      </p>
    </>
  )
}

export function PledgeForm({
  engine,
  actor,
  pool,
  onDone,
  onCancel,
}: {
  engine: InteractionEngine
  actor: Actor
  pool: LandAggregation
  onDone: (message: string) => void
  onCancel: () => void
}) {
  const mine = useMyParcels()
  const [parcelId, setParcelId] = useState('')
  const [amount, setAmount] = useState('')
  const [unit, setUnit] = useState<AreaUnit>('ha')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  return (
    <form
      className="space-y-2 rounded-2xl bg-amber-50 p-3"
      aria-label={`Engager une parcelle dans ${pool.title}`}
      onSubmit={async (e) => {
        e.preventDefault()
        setBusy(true)
        setError(null)
        const r = await engine.bus.dispatch(
          {
            type: 'PledgeLand',
            payload: { groupId: pool.id, parcelId, amount: Number(amount), unit },
          },
          actor,
        )
        setBusy(false)
        if (!r.ok) return setError(r.error)
        const v = r.value as LandAggregation
        onDone(
          `${ha(toHectares(Number(amount), unit))} engagés : ${ha(v.committedHa)} sur ${ha(v.targetHa)} réunis.`,
        )
      }}
    >
      <p className="text-sm font-bold">{pool.title}</p>
      <p className="text-xs text-slate-600">
        {ha(pool.committedHa)} réunis sur {ha(pool.targetHa)} visés (maximum {ha(pool.maxHa)}) ·{' '}
        {pool.participants} participant(s) · du {pool.startsOn} au {pool.endsOn}.
      </p>
      <ParcelFields
        mine={mine}
        parcelId={parcelId}
        setParcelId={setParcelId}
        amount={amount}
        setAmount={setAmount}
        unit={unit}
        setUnit={setUnit}
      />
      {error === ACCOUNT_REQUIRED ? (
        <AccountPrompt reason={error} compact />
      ) : (
        error && (
          <p role="alert" className="rounded-xl bg-rose-50 p-2 text-xs font-semibold text-rose-800">
            {error}
          </p>
        )
      )}
      <SubmitRow busy={busy} onCancel={onCancel} cta="Engager cette surface" />
    </form>
  )
}

export function OpenPoolForm({
  engine,
  actor,
  onDone,
  onCancel,
}: {
  engine: InteractionEngine
  actor: Actor
  onDone: (message: string) => void
  onCancel: () => void
}) {
  const mine = useMyParcels()
  const [title, setTitle] = useState('')
  const [crop, setCrop] = useState<keyof typeof ACTIVITIES>('semis')
  const [startsOn, setStartsOn] = useState(plusDays(14))
  const [endsOn, setEndsOn] = useState(plusDays(20))
  const [parcelId, setParcelId] = useState('')
  const [amount, setAmount] = useState('')
  const [unit, setUnit] = useState<AreaUnit>('ha')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  return (
    <form
      className="space-y-2 rounded-2xl bg-amber-50 p-3"
      aria-label="Regrouper nos superficies"
      onSubmit={async (e) => {
        e.preventDefault()
        setBusy(true)
        setError(null)
        const r = await engine.bus.dispatch(
          {
            type: 'OpenLandPool',
            payload: { title, crop, startsOn, endsOn, parcelId, amount: Number(amount), unit },
          },
          actor,
        )
        setBusy(false)
        if (!r.ok) return setError(r.error)
        const v = r.value as LandAggregation
        onDone(
          `Regroupement « ${title} » ouvert avec ${ha(v.committedHa)} ; objectif ${ha(v.targetHa)}.`,
        )
      }}
    >
      <p className="text-sm font-bold">Regrouper nos superficies</p>
      <label className={label}>
        Titre
        <input
          className={input}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          minLength={3}
          maxLength={100}
          required
          placeholder="Ex. Semis de maïs 15 ha"
        />
      </label>
      <label className={label}>
        Opération
        <select
          className={input}
          value={crop}
          onChange={(e) => setCrop(e.target.value as keyof typeof ACTIVITIES)}
        >
          {Object.entries(ACTIVITIES).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </label>
      <div className="grid grid-cols-2 gap-2">
        <label className={label}>
          Début
          <input
            type="date"
            className={input}
            value={startsOn}
            min={today()}
            onChange={(e) => setStartsOn(e.target.value)}
            required
          />
        </label>
        <label className={label}>
          Fin
          <input
            type="date"
            className={input}
            value={endsOn}
            min={startsOn}
            onChange={(e) => setEndsOn(e.target.value)}
            required
          />
        </label>
      </div>
      <ParcelFields
        mine={mine}
        parcelId={parcelId}
        setParcelId={setParcelId}
        amount={amount}
        setAmount={setAmount}
        unit={unit}
        setUnit={setUnit}
      />
      {error === ACCOUNT_REQUIRED ? (
        <AccountPrompt reason={error} compact />
      ) : (
        error && (
          <p role="alert" className="rounded-xl bg-rose-50 p-2 text-xs font-semibold text-rose-800">
            {error}
          </p>
        )
      )}
      <SubmitRow busy={busy} onCancel={onCancel} cta="Ouvrir le regroupement" />
    </form>
  )
}
