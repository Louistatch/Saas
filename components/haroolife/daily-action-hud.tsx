'use client'
import { MEAL_SECONDS, mealName } from '@/lib/haroolife/city/dining'
import type { CityLife } from '@/lib/haroolife/city/life'

export default function DailyActionHud({
  state,
  onStand,
  onCancel,
  onBag,
}: {
  state: CityLife
  onStand: () => void
  onCancel: () => void
  onBag: () => void
}) {
  const meal = state.meal
  const seated = ['sit', 'eat-seated'].includes(state.activity?.anim ?? '')
  if (!meal && !seated) return null
  return (
    <section
      aria-label="Mon activité"
      data-testid="daily-action"
      className="pointer-events-auto absolute inset-x-4 top-[180px] z-40 mx-auto max-w-sm rounded-3xl border border-white/80 bg-white/95 p-3 shadow-xl backdrop-blur"
    >
      <div className="flex items-center gap-3">
        <span aria-hidden className="text-2xl">
          {meal ? '🍛' : '🪑'}
        </span>
        <output className="min-w-0 flex-1">
          <span className="block truncate text-sm font-black text-emerald-950">
            {meal ? mealName(meal.item) : 'Bien installé·e'}
          </span>
          <span className="block text-xs text-slate-600">
            {meal
              ? meal.phase === 'approach'
                ? 'Je vais m’installer…'
                : meal.committed
                  ? 'Bon appétit ! La portion est entamée.'
                  : 'Première bouchée…'
              : 'Prends ton temps. Tu peux aussi manger ici.'}
          </span>
        </output>
      </div>
      {meal && (
        <progress
          aria-label="Progression du repas"
          value={meal.elapsed}
          max={MEAL_SECONDS}
          className="mt-2 h-1.5 w-full accent-emerald-600"
        />
      )}
      <div className="mt-2 flex gap-2">
        {meal ? (
          <button
            type="button"
            onClick={onCancel}
            className="min-h-11 flex-1 rounded-2xl bg-slate-100 text-sm font-bold text-slate-800"
          >
            Interrompre le repas
          </button>
        ) : (
          <>
            <button
              type="button"
              onClick={onBag}
              className="min-h-11 flex-1 rounded-2xl bg-emerald-700 text-sm font-bold text-white"
            >
              Mon sac · Manger
            </button>
            <button
              type="button"
              onClick={onStand}
              className="min-h-11 flex-1 rounded-2xl bg-slate-100 text-sm font-bold text-slate-800"
            >
              Se lever
            </button>
          </>
        )}
      </div>
    </section>
  )
}
