'use client'

/**
 * « Mon champ » in the phone: sow what the real season allows in the town the player is in, pass
 * by the field each game day, harvest into the granary, keep dry harvests in triple-layer bags,
 * and sell at the price of the town's market (app/api/haroolife/prices), always saying where the
 * price comes from. The rules live in lib/haroolife/city/farm.ts.
 */
import {
  BAG_KG,
  BAG_PRICE,
  CROPS,
  type CropId,
  type CropPrice,
  MONTHS,
  type PriceLine,
  buyBags,
  cropPrice,
  fieldStatus,
  harvest,
  nextSowing,
  protectedKg,
  realMonth,
  sell,
  sow,
  sowableNow,
  tend,
  theCrop,
} from '@/lib/haroolife/city/farm'
import type { CityLife } from '@/lib/haroolife/city/life'
import { LOCALITIES } from '@/lib/haroolife/city/locality'
import { useEffect, useMemo, useRef, useState } from 'react'

interface YearRange {
  culture: string
  months: number
  high: { month: number; price: number }
  low: { month: number; price: number }
}
interface Prices {
  region: string
  prices: PriceLine[]
  reference: PriceLine[]
  year: YearRange[]
}

/** « le maïs et le haricot », « le maïs, le sorgho et le mil ». */
const cropList = (crops: CropId[]) => {
  const names = crops.map(theCrop)
  return names.length > 1 ? `${names.slice(0, -1).join(', ')} et ${names.at(-1)}` : (names[0] ?? '')
}
const money = (n: number) => `${Math.round(n).toLocaleString('fr-FR')} FCFA`
const dateFr = (iso: string) =>
  new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', timeZone: 'UTC' })

/** Where a price comes from, in words. */
function priceSaid(p: CropPrice): string {
  if (p.source === 'releve')
    return `relevé${p.observedAt ? ` le ${dateFr(p.observedAt)}` : ''}${p.market ? `, marché de ${p.market}` : ''}`
  if (p.source === 'reference') return 'prix de référence de la région, non daté'
  return 'prix indicatif du jeu, aucun relevé dans la région'
}

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
  const [market, setMarket] = useState<Prices | null>(null)
  const [priceError, setPriceError] = useState(false)
  const town = cityLife.locality
  useEffect(() => {
    let alive = true
    setMarket(null)
    setPriceError(false)
    fetch(`/api/haroolife/prices?locality=${town}`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then(
        (d: Partial<Prices>) =>
          alive &&
          setMarket({
            region: d.region ?? '',
            prices: d.prices ?? [],
            reference: d.reference ?? [],
            year: d.year ?? [],
          }),
      )
      .catch(() => alive && setPriceError(true))
    return () => {
      alive = false
    }
  }, [town])
  // Once the market answered (or failed): the survey's price, a reference, or the game's own.
  const priceOf = useMemo(
    () =>
      (crop: CropId): CropPrice | null =>
        market || priceError
          ? cropPrice(crop, market?.prices ?? [], market?.reference ?? [])
          : null,
    [market, priceError],
  )
  const yearOf = (crop: CropId) => market?.year.find((y) => y.culture === CROPS[crop].market)

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
  const farm = cityLife.farm
  const stock = Object.entries(farm?.stock ?? {}) as [CropId, number][]
  const bags = farm?.bags ?? 0
  const safe = farm ? protectedKg(farm) : {}
  const day = cityLife.life.day
  const region = market?.region || (town === 'lome' ? 'Maritime' : 'la région')
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
                      {p
                        ? ` · ${p.source === 'releve' ? '' : '≈ '}${p.price} FCFA/kg (${priceSaid(p)})`
                        : ''}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => update((s) => sow(s, crop, month))}
                  className="mt-2 w-full rounded-xl bg-lime-700 px-3 py-3 text-sm font-black text-white"
                >
                  Semer {theCrop(crop)} · {money(c.cost)}
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
        <section aria-label="Mon grenier" className="space-y-2">
          <p className="text-sm font-black text-slate-900">Mon grenier</p>
          {stock.map(([crop, kg]) => {
            const c = CROPS[crop]
            const p = priceOf(crop)
            const year = yearOf(crop)
            const bagged = safe[crop] ?? 0
            const harvested = farm?.since?.[crop]
            const keepsFor = harvested === undefined ? null : harvested + c.shelf - day
            const keeping =
              c.keeps === 'sec'
                ? bagged >= kg
                  ? '🛡️ En sac triple fond : à l’abri des charançons.'
                  : bagged > 0
                    ? `🛡️ ${bagged} kg en sac, ${kg - bagged} kg à l’air : les charançons s’y mettent.`
                    : keepsFor !== null && keepsFor > 0
                      ? `⚠️ À l’air : les charançons s’y mettent dans ${keepsFor} jour${keepsFor > 1 ? 's' : ''}.`
                      : '⚠️ À l’air : les charançons en mangent chaque jour.'
                : keepsFor !== null && keepsFor > 0
                  ? `⏳ Se gâte dans ${keepsFor} jour${keepsFor > 1 ? 's' : ''}.`
                  : '⏳ Commence à se gâter : vends vite.'
            return (
              <div
                key={crop}
                data-crop={crop}
                className="rounded-2xl border border-amber-200 bg-white p-3"
              >
                <p className="text-sm text-slate-800">
                  {c.icon} {kg} kg de {c.name.toLowerCase()}
                </p>
                <p className="mt-0.5 text-xs text-slate-600">{keeping}</p>
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
                      {p.source === 'releve' ? 'Prix ' : 'Prix approximatif : '}
                      {priceSaid(p)}.
                    </p>
                  </>
                ) : (
                  <p className="mt-1 text-xs text-slate-500">
                    Prix du marché en cours de chargement…
                  </p>
                )}
                {year && (
                  <p className="mt-1 text-[11px] text-slate-500">
                    Relevés de {region} sur les 12 derniers mois ({year.months} mois) : jusqu’à{' '}
                    {year.high.price} FCFA/kg en {MONTHS[year.high.month - 1]}, {year.low.price}{' '}
                    FCFA/kg au plus bas en {MONTHS[year.low.month - 1]} (moyennes du mois).
                  </p>
                )}
              </div>
            )
          })}
          <div className="rounded-2xl bg-stone-100 p-3" data-testid="bags">
            <p className="text-sm font-black text-slate-900">
              Sacs triple fond : {bags} · {bags * BAG_KG} kg de grains à l’abri
            </p>
            <p className="mt-0.5 text-xs text-slate-600">
              Trois sacs l’un dans l’autre, fermés sans air : les insectes y meurent. Pour les
              grains, l’arachide, le café, le cacao et le cajou ; ils resservent chaque saison.
            </p>
            <button
              type="button"
              onClick={() => update((s) => buyBags(s, 1))}
              className="mt-2 w-full rounded-xl bg-stone-700 px-3 py-3 text-sm font-black text-white"
            >
              Acheter un sac triple fond · {money(BAG_PRICE)}
            </button>
          </div>
        </section>
      )}

      <p className="text-[11px] leading-relaxed text-slate-500">
        Les prix viennent des relevés de FaîtiereHub pour la région ({region}) : relevé récent si
        possible, sinon prix de référence ou prix du jeu, toujours indiqué. Le calendrier des semis
        est simplifié d’après les saisons des pluies : deux au sud, une au nord. Argent du jeu
        uniquement.
      </p>
    </div>
  )
}
