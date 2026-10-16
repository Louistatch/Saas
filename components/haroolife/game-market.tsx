'use client'
import { GOODS, canShop, consume, purchase } from '@/lib/haroolife/city/commerce'
import type { CityLife } from '@/lib/haroolife/city/life'
export default function GameMarket({
  state,
  onChange,
  onGoMarket,
  onRealOffers,
}: {
  state: CityLife
  onChange: (reduce: (s: CityLife) => CityLife) => void
  onGoMarket: () => void
  onRealOffers: () => void
}) {
  const here = canShop(state)
  return (
    <div className="space-y-4" data-testid="game-market">
      <div className="rounded-2xl bg-amber-50 p-4">
        <h3 className="font-black">🧺 Les étals du quartier</h3>
        <p className="mt-1 text-sm text-slate-600">
          Achète chez les vendeurs, puis mange ou utilise tes provisions dans Mon sac. Prix
          indicatifs en argent du jeu.
        </p>
        {!here && (
          <button
            type="button"
            onClick={onGoMarket}
            className="mt-3 rounded-xl bg-emerald-700 px-4 py-3 text-sm font-bold text-white"
          >
            Rejoindre le marché de ma ville
          </button>
        )}
      </div>
      <div className="flex justify-between text-sm">
        <strong>Mon sac</strong>
        <span>{state.life.wallet.toLocaleString('fr-FR')} FCFA disponibles</span>
      </div>
      <div className="space-y-2">
        {GOODS.map((item) => {
          const qty = state.commerce?.inventory[item.id] ?? 0
          return (
            <article
              key={item.id}
              className="rounded-2xl border border-slate-100 bg-white p-3"
              data-testid={`goods-${item.id}`}
            >
              <div className="flex gap-3">
                <span aria-hidden className="text-2xl">
                  {item.icon}
                </span>
                <div className="flex-1">
                  <h4 className="text-sm font-black">{item.name}</h4>
                  <p className="text-xs text-slate-500">{item.description}</p>
                  <p className="mt-1 text-xs font-bold">
                    {item.price} FCFA · Dans mon sac : {qty}
                  </p>
                </div>
              </div>
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  disabled={!here || state.life.wallet < item.price || qty >= 20}
                  onClick={() => onChange((s) => purchase(s, item.id))}
                  className="min-h-10 flex-1 rounded-xl bg-emerald-700 px-3 text-xs font-bold text-white disabled:bg-slate-100 disabled:text-slate-400"
                >
                  Acheter · {item.price}
                </button>
                <button
                  type="button"
                  disabled={!qty}
                  onClick={() => onChange((s) => consume(s, item.id))}
                  className="min-h-10 flex-1 rounded-xl border border-slate-200 px-3 text-xs font-bold disabled:text-slate-300"
                >
                  {item.id === 'soap' ? 'Se laver' : item.id === 'water' ? 'Boire' : 'Manger'}
                </button>
              </div>
            </article>
          )
        })}
      </div>
      <output
        aria-live="polite"
        className="block rounded-2xl bg-emerald-50 p-3 text-sm text-emerald-900"
      >
        {state.life.lastEvent}
      </output>
      <button
        type="button"
        onClick={onRealOffers}
        className="w-full rounded-2xl border border-slate-200 p-3 text-sm font-bold"
      >
        Offres réelles de producteurs Haroo ↗
      </button>
    </div>
  )
}
