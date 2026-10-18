'use client'

/** « Aménager », onglet Véhicules : acheter sa moto ou sa voiture, la sortir, la ranger, la revendre. */
import {
  OWN_VEHICLES,
  VEHICLE_RESALE,
  buyOwnVehicle,
  garageOf,
  ownVehicle,
  resellOwnVehicle,
} from '@/lib/haroolife/city/garage'
import type { CityLife } from '@/lib/haroolife/city/life'

const money = (n: number) => `${n.toLocaleString('fr-FR')} FCFA`

export default function VehicleShop({
  state,
  onChange,
  onTakeOut,
  onPutAway,
  driving,
}: {
  state: CityLife
  onChange: (reduce: (s: CityLife) => CityLife) => void
  /** Parks the vehicle in the street beside the player. */
  onTakeOut: (id: string) => void
  onPutAway: () => void
  driving: boolean
}) {
  const wallet = state.life.wallet
  const garage = garageOf(state)
  const out = state.duty ? null : garage.out
  return (
    <div className="space-y-4" data-testid="vehicle-shop">
      <div className="rounded-2xl bg-amber-50 p-4">
        <h3 className="font-black">🏍️ Ma moto, ma voiture</h3>
        <p className="mt-1 text-sm text-slate-600">
          À toi, sans patron ni client : tu la conduis où tu veux avec le joystick. Prix indicatifs
          d’annonces à Lomé (2025-2026), pas des devis.
        </p>
        <p className="mt-2 text-sm font-bold">{money(wallet)} disponibles</p>
      </div>
      {garage.owned.length > 0 && (
        <section aria-label="Mon garage" className="space-y-2">
          <h4 className="text-sm font-black">Mon garage</h4>
          {garage.owned.map((id) => {
            const v = ownVehicle(id)
            if (!v) return null
            const isOut = out === id
            return (
              <article
                key={id}
                data-testid={`own-${id}`}
                className="rounded-2xl border border-slate-100 bg-white p-3"
              >
                <p className="text-sm font-bold">{v.name}</p>
                <p className="text-xs text-slate-500">
                  {isOut ? 'Garée dans la rue' : 'Au garage'}
                </p>
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    disabled={driving}
                    onClick={() => (isOut ? onPutAway() : onTakeOut(id))}
                    className="min-h-10 flex-1 rounded-xl bg-emerald-700 px-3 text-xs font-bold text-white disabled:bg-slate-100 disabled:text-slate-400"
                  >
                    {isOut
                      ? 'Ranger au garage'
                      : v.kind === 'moto'
                        ? 'Sortir ma moto'
                        : 'Sortir ma voiture'}
                  </button>
                  <button
                    type="button"
                    disabled={driving && isOut}
                    onClick={() => onChange((s) => resellOwnVehicle(s, id))}
                    className="min-h-10 flex-1 rounded-xl border border-slate-200 px-3 text-xs font-bold disabled:text-slate-300"
                  >
                    Revendre · {money(Math.round((v.price * VEHICLE_RESALE) / 5000) * 5000)}
                  </button>
                </div>
              </article>
            )
          })}
        </section>
      )}
      <section aria-label="Concessionnaires et occasions" className="space-y-2">
        <h4 className="text-sm font-black">Concessionnaires et occasions</h4>
        {OWN_VEHICLES.map((v) => {
          const owned = garage.owned.includes(v.id)
          return (
            <article
              key={v.id}
              data-testid={`vehicle-${v.id}`}
              className="flex items-center gap-3 rounded-2xl border border-slate-100 bg-white p-3"
            >
              <span aria-hidden className="text-2xl">
                {v.kind === 'moto' ? '🏍️' : '🚗'}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold">{v.name}</p>
                <p className="text-xs text-slate-500">{v.hint}</p>
              </div>
              <button
                type="button"
                disabled={owned || wallet < v.price}
                onClick={() => onChange((s) => buyOwnVehicle(s, v.id))}
                className="min-h-11 shrink-0 rounded-xl bg-emerald-700 px-3 text-xs font-bold text-white disabled:bg-slate-100 disabled:text-slate-400"
              >
                {owned ? 'À toi' : `Acheter · ${money(v.price)}`}
              </button>
            </article>
          )
        })}
      </section>
      <output
        aria-live="polite"
        className="block rounded-2xl bg-emerald-50 p-3 text-sm text-emerald-900"
      >
        {state.life.lastEvent}
      </output>
    </div>
  )
}
