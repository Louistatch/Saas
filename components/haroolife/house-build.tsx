'use client'

/**
 * « Bâtir ma maison » in the housing app: buy a free plot in Lomé, pay the work stage by stage as
 * the money comes (the mason works a few game days on each), then move in and stop paying rent.
 * The street draws the plot at its stage. Rules, amounts and their sources: city/homebuild.ts.
 */
import {
  BUILD_COST,
  STAGES,
  buildOutlook,
  buyPlot,
  houseReady,
  moveIntoHouse,
  plotLabel,
  plotsForSale,
  startStage,
} from '@/lib/haroolife/city/homebuild'
import { housingOf, quartierById } from '@/lib/haroolife/city/housing'
import type { CityLife } from '@/lib/haroolife/city/life'
import { worldLots } from '@/lib/haroolife/city/world'
import { useEffect, useMemo, useRef, useState } from 'react'

const money = (n: number) => `${Math.round(n).toLocaleString('fr-FR')} FCFA`

export default function HouseBuild({
  state,
  onBuild,
}: {
  state: CityLife
  onBuild: (change: (s: CityLife) => CityLife) => void
}) {
  const plot = state.plot
  const inLome = state.locality === 'lome'
  const wallet = state.life.wallet
  const day = state.life.day
  const [choosing, setChoosing] = useState(false)
  const offers = useMemo(() => (inLome && !plot ? plotsForSale(worldLots()) : []), [inLome, plot])
  const outlook = buildOutlook(state)
  const owned = housingOf(state).owned === true

  // What the last action said (bought, paid, refused…): the game writes it as the event.
  const opened = useRef(state.life.lastEvent)
  const [said, setSaid] = useState<string | null>(null)
  const last = state.life.lastEvent
  useEffect(() => {
    if (last !== opened.current) setSaid(last)
  }, [last])

  return (
    <section
      aria-label="Bâtir ma maison"
      data-testid="house-build"
      className="space-y-3 rounded-2xl bg-orange-50 p-3"
    >
      <p className="text-sm font-black text-slate-900">
        {plot
          ? `${plotLabel(plot)} · ${quartierById(plot.quartier)?.name ?? 'Lomé'}`
          : 'Bâtir ma maison'}
      </p>

      {said && (
        <output className="block rounded-xl bg-white p-3 text-sm font-semibold text-orange-950">
          {said}
        </output>
      )}

      {!plot && (
        <>
          <p className="text-xs text-slate-700">
            Achète un terrain, puis construis étape par étape, au rythme de ton argent : fondations,
            murs, toiture, portes et fenêtres, crépissage, peinture. Maison finie : plus de loyer.
            Construction complète : {money(BUILD_COST)} en {STAGES.length} étapes, plus le terrain.
          </p>
          {!inLome ? (
            <p className="text-xs font-semibold text-slate-600">
              Les terrains se visitent sur place : va à Lomé.
            </p>
          ) : (
            <>
              <button
                type="button"
                aria-expanded={choosing}
                onClick={() => setChoosing((c) => !c)}
                className="w-full rounded-xl bg-orange-700 px-3 py-3 text-sm font-black text-white"
              >
                Voir les terrains à vendre
              </button>
              {choosing && (
                <ul className="space-y-2">
                  {offers.map((o) => {
                    const name = quartierById(o.quartier)?.name ?? o.quartier
                    return (
                      <li
                        key={o.lot.id}
                        className="flex items-center justify-between gap-2 rounded-xl bg-white p-2"
                      >
                        <span className="text-xs">
                          <span className="block font-bold text-slate-900">Terrain à {name}</span>
                          <span className="text-slate-600">{money(o.price)}</span>
                        </span>
                        <button
                          type="button"
                          disabled={wallet < o.price}
                          onClick={() => onBuild((s) => buyPlot(s, o.lot))}
                          aria-label={`Acheter le terrain à ${name}, ${money(o.price)}`}
                          className="rounded-lg bg-orange-600 px-3 py-2 text-xs font-black text-white disabled:opacity-40"
                        >
                          Acheter
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}
            </>
          )}
        </>
      )}

      {plot && (
        <>
          <ol className="space-y-1" aria-label="Étapes du chantier">
            {STAGES.map((st, i) => {
              const done = i < plot.built
              const now = i === plot.built && plot.work !== null
              return (
                <li
                  key={st.id}
                  data-stage={st.id}
                  data-state={done ? 'fait' : now ? 'en-cours' : 'a-faire'}
                  className={`flex items-center justify-between rounded-lg px-2 py-1 text-xs ${done ? 'text-emerald-800' : now ? 'bg-white font-bold text-orange-900' : 'text-slate-600'}`}
                >
                  <span>
                    {done ? '✓' : now ? '🔨' : '○'} {st.name}
                  </span>
                  <span>{done ? 'fait' : money(st.cost)}</span>
                </li>
              )
            })}
          </ol>
          {plot.work && (
            <p className="text-xs font-semibold text-orange-900">
              Le maçon travaille : fin des travaux le jour {plot.work.until} (on est le jour {day}
              ).
            </p>
          )}
          {outlook.next && !plot.work && (
            <>
              <button
                type="button"
                disabled={wallet < outlook.next.cost}
                onClick={() => onBuild(startStage)}
                className="w-full rounded-xl bg-orange-700 px-3 py-3 text-sm font-black text-white disabled:opacity-40"
              >
                Payer : {outlook.next.name} · {money(outlook.next.cost)}
              </button>
              <p className="text-[11px] text-slate-600">
                Reste à payer pour finir : {money(outlook.left)}
                {outlook.monthsOfRent > 0
                  ? `, soit ${outlook.monthsOfRent} mois de ton loyer actuel`
                  : ''}
                .
              </p>
            </>
          )}
          {houseReady(plot) &&
            (owned ? (
              <p className="text-xs font-semibold text-emerald-900">
                Tu habites chez toi : pas de loyer, seulement les factures.
              </p>
            ) : (
              <button
                type="button"
                onClick={() => onBuild(moveIntoHouse)}
                className="w-full rounded-xl bg-emerald-700 px-3 py-3 text-sm font-black text-white"
              >
                Emménager chez moi
              </button>
            ))}
          <p className="text-[11px] text-slate-500">
            {houseReady(plot)
              ? 'Dans la rue, ta maison porte le nom « Ma maison ».'
              : `Dans la rue, ton terrain porte le nom « ${plotLabel(plot)} » : va voir le chantier avancer.`}
          </p>
        </>
      )}

      <p className="text-[11px] leading-relaxed text-slate-500">
        Prix du jeu, à l’échelle de ses salaires : à Lomé, un vrai terrain se vend des dizaines de
        millions de FCFA (annonces 2024-2026). L’ordre des quartiers est respecté : Agoè le moins
        cher, Baguida le plus cher.
      </p>
    </section>
  )
}
