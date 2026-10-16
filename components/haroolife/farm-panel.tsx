'use client'

/**
 * « Mon champ » in the phone: sow what the real season allows in the town the player is in, pass
 * by the field each game day, harvest, then sell at the price surveyed today on the town's market
 * (app/api/haroolife/prices). The rules live in lib/haroolife/city/farm.ts.
 */
import {
  CROPS,
  type CropId,
  MONTHS,
  fieldStatus,
  harvest,
  nextSowing,
  realMonth,
  sell,
  sow,
  sowableNow,
  tend,
} from '@/lib/haroolife/city/farm'
import type { CityLife } from '@/lib/haroolife/city/life'
import { LOCALITIES } from '@/lib/haroolife/city/locality'
import type { MarketLine } from '@/lib/haroolife/world'
import { useEffect, useMemo, useRef, useState } from 'react'

/** « le maïs et le haricot », « le maïs, le sorgho et le mil ». */
const cropList = (crops: CropId[]) => {
  const names = crops.map((c) => `le ${CROPS[c].name.toLowerCase()}`)
  return names.length > 1 ? `${names.slice(0, -1).join(', ')} et ${names.at(-1)}` : (names[0] ?? '')
}
const money = (n: number) => `${Math.round(n).toLocaleString('fr-FR')} FCFA`
const dateFr = (iso: string) =>
  new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', timeZone: 'UTC' })

/** The month the game uses: the real one in Lomé; end-to-end tests may pin it. */
function gameMonth(): number {
  try {
    if (localStorage.getItem('haroolife.e2e') === '1') {
      const m = Number(localStorage.getItem('haroolife.e2e.month'))
      if (Number.isInteger(m) && m >= 1 && m <= 12) return m
    }
  } catch {
    // Storage refused: the real month.
  }
  return realMonth()
}

export default function FarmPanel({
  cityLife,
  update,
}: {
  cityLife: CityLife
  update: (change: (s: CityLife) => CityLife) => void
}) {
  const [month] = useState(gameMonth)
  const [prices, setPrices] = useState<MarketLine[] | null>(null)
  const [priceError, setPriceError] = useState(false)
  const town = cityLife.locality
  useEffect(() => {
    let alive = true
    setPrices(null)
    setPriceError(false)
    fetch(`/api/haroolife/prices?locality=${town}`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: { prices: MarketLine[] }) => alive && setPrices(d.prices))
      .catch(() => alive && setPriceError(true))
    return () => {
      alive = false
    }
  }, [town])
  const priceOf = useMemo(() => {
    const by = new Map((prices ?? []).map((p) => [p.culture, p]))
    return (crop: CropId) => {
      const line = by.get(CROPS[crop].market)
      return line && line.unit === 'kg' ? line : null
    }
  }, [prices])

  // What the last action said (sown, refused at night, sold…): the game writes it as the event.
  const opened = useRef(cityLife.life.lastEvent)
  const [said, setSaid] = useState<string | null>(null)
  const last = cityLife.life.lastEvent
  useEffect(() => {
    if (last !== opened.current) setSaid(last)
  }, [last])

  const status = fieldStatus(cityLife)
  const sowable = sowableNow(town, month)
  const next = nextSowing(town, month)
  const stock = Object.entries(cityLife.farm?.stock ?? {}) as [CropId, number][]
  const fieldElsewhere = status.kind !== 'empty' && status.field.locality !== town

  return (
    <div className="space-y-4" data-testid="farm">
      <section className="rounded-3xl bg-[#2f4a1f] p-4 text-white">
        <p className="text-xs font-semibold text-lime-200">
          {LOCALITIES[town].name} · {MONTHS[month - 1]}
        </p>
        <p className="mt-1 text-lg font-black leading-snug">
          {sowable.length
            ? `C’est la saison : on sème ${cropList(sowable)}.`
            : `Pas de semis à ${LOCALITIES[town].name} en ${MONTHS[month - 1]}.`}
        </p>
        {!sowable.length && next && (
          <p className="mt-1 text-sm text-lime-100">
            Prochains semis en {MONTHS[next.month - 1]} : {cropList(next.crops)}.
          </p>
        )}
      </section>

      {said && (
        <output className="block rounded-xl bg-lime-50 p-3 text-sm font-semibold text-lime-900">
          {said}
        </output>
      )}

      {status.kind === 'empty' && sowable.length > 0 && (
        <section aria-label="Semer" className="space-y-2">
          {sowable.map((crop) => {
            const c = CROPS[crop]
            const p = priceOf(crop)
            return (
              <div key={crop} className="rounded-2xl border border-lime-200 bg-lime-50 p-3">
                <div className="flex items-start gap-3">
                  <span aria-hidden className="text-3xl">
                    {c.icon}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-black text-slate-900">{c.name}</p>
                    <p className="text-xs text-slate-600">
                      Récolte en {c.days} jours · jusqu’à {c.kg} kg si tu passes chaque jour
                      {p ? ` · ${p.price} FCFA/kg aujourd’hui` : ''}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => update((s) => sow(s, crop, month))}
                  className="mt-2 w-full rounded-xl bg-lime-700 px-3 py-3 text-sm font-black text-white"
                >
                  Semer le {c.name.toLowerCase()} · {money(c.cost)}
                </button>
              </div>
            )
          })}
          <p className="text-[11px] text-slate-500">
            Le prix comprend la parcelle pour la saison et les semences.
          </p>
        </section>
      )}

      {status.kind === 'growing' && (
        <section
          aria-label="Mon champ en culture"
          className="space-y-2 rounded-2xl border border-lime-200 bg-white p-3"
        >
          <p className="font-black text-slate-900">
            {CROPS[status.field.crop].icon} {CROPS[status.field.crop].name} ·{' '}
            {LOCALITIES[status.field.locality].name}
          </p>
          <p className="text-sm text-slate-600">
            Récolte dans {status.daysLeft} jour{status.daysLeft > 1 ? 's' : ''} · entretenu{' '}
            {status.field.tended} jour{status.field.tended > 1 ? 's' : ''} sur{' '}
            {CROPS[status.field.crop].days}
          </p>
          <button
            type="button"
            disabled={status.tendedToday || fieldElsewhere}
            onClick={() => update(tend)}
            className="w-full rounded-xl bg-lime-700 px-3 py-3 text-sm font-black text-white disabled:opacity-50"
          >
            {status.tendedToday
              ? 'Déjà passé au champ aujourd’hui'
              : 'Passer au champ : désherber, arroser'}
          </button>
          <p className="text-[11px] text-slate-500">
            {fieldElsewhere
              ? `Ton champ est à ${LOCALITIES[status.field.locality].name} : vas-y pour t’en occuper.`
              : 'Un passage par jour. Un champ négligé donne moins.'}
          </p>
        </section>
      )}

      {status.kind === 'ready' && (
        <section aria-label="Récolte" className="space-y-2 rounded-2xl bg-amber-50 p-3">
          <p className="font-black text-slate-900">
            {CROPS[status.field.crop].icon} C’est mûr : environ {status.kg} kg de{' '}
            {CROPS[status.field.crop].name.toLowerCase()}.
          </p>
          <button
            type="button"
            disabled={fieldElsewhere}
            onClick={() => update(harvest)}
            className="w-full rounded-xl bg-amber-500 px-3 py-3 text-sm font-black text-white disabled:opacity-50"
          >
            Récolter
          </button>
        </section>
      )}

      {stock.length > 0 && (
        <section aria-label="Ma récolte" className="space-y-2">
          <p className="text-sm font-black text-slate-900">Ma récolte à vendre</p>
          {stock.map(([crop, kg]) => {
            const p = priceOf(crop)
            return (
              <div key={crop} className="rounded-2xl border border-amber-200 bg-white p-3">
                <p className="text-sm text-slate-800">
                  {CROPS[crop].icon} {kg} kg de {CROPS[crop].name.toLowerCase()}
                </p>
                {p ? (
                  <>
                    <button
                      type="button"
                      onClick={() => update((s) => sell(s, crop, p.price))}
                      className="mt-2 w-full rounded-xl bg-amber-500 px-3 py-3 text-sm font-black text-white"
                    >
                      Vendre à {p.price} FCFA/kg · {money(kg * p.price)}
                    </button>
                    <p className="mt-1 text-[11px] text-slate-500">
                      Prix relevé le {dateFr(p.observed_at)}
                      {p.market ? `, marché de ${p.market}` : ''}.
                    </p>
                  </>
                ) : (
                  <p className="mt-1 text-xs text-slate-500">
                    {prices === null && !priceError
                      ? 'Prix du marché en cours de chargement…'
                      : 'Pas de prix relevé ici pour cette culture : garde ta récolte, ou vends-la dans une autre ville.'}
                  </p>
                )}
              </div>
            )
          })}
        </section>
      )}

      <p className="text-[11px] leading-relaxed text-slate-500">
        Les prix sont les relevés réels de FaîtiereHub pour la région (
        {town === 'lome' ? 'Maritime' : 'Kara'}). Le calendrier des semis est simplifié d’après les
        saisons des pluies : deux au sud, une au nord. Argent du jeu uniquement.
      </p>
    </div>
  )
}
