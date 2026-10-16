'use client'

/**
 * The journey between two towns, full screen while the arrival town loads: the sourced map of
 * Togo (the same as the « Lieux et villes » sheet), the road from one pole to the other drawn as
 * the bus covers it, and the time the trip takes in the game. It stays at least `MIN_MS` so the
 * change of map is seen, and until the street of the arrival town is drawn.
 */
import type { Stop } from '@/lib/haroolife/city/coaches'
import { LOCALITIES, type LocalityId } from '@/lib/haroolife/city/locality'
import { type ReactNode, useEffect, useState } from 'react'
import { path, H, REGION_FILL, W, data, poleOf, px, py } from './national-map'

export const MIN_MS = 2600
/** With the cabin scene, seconds seated by the window (counted once the cabin is drawn). */
export const CABIN_MS = 7000

export default function TravelSplash({
  from,
  to,
  hours,
  ready,
  onDone,
  company,
  stops,
  mode = 'road',
  cabin,
  cabinReady = false,
}: {
  from: LocalityId
  to: LocalityId
  /** Hours of road in the game. */
  hours: number
  /** The arrival town's street is drawn. */
  ready: boolean
  onDone: () => void
  /** The coach company, when one was chosen. */
  company?: string
  /** The real road, town by town (RN1), when known: drawn instead of a curve. */
  stops?: Stop[]
  mode?: 'road' | 'air'
  /** The 3D cabin (coach or plane), drawn full screen behind the route card. */
  cabin?: ReactNode
  /** The cabin is drawn: its time by the window starts now. */
  cabinReady?: boolean
}) {
  const [shown, setShown] = useState(false)
  const min = cabin ? CABIN_MS : MIN_MS
  const waiting = !!cabin && !cabinReady
  useEffect(() => {
    if (waiting) return
    const t = window.setTimeout(() => setShown(true), min)
    return () => window.clearTimeout(t)
  }, [min, waiting])
  useEffect(() => {
    if (shown && ready) onDone()
  }, [shown, ready, onDone])

  const along = stops && stops.length > 1 ? stops : null
  // The towns' own position on the road when the road is known, the prefecture otherwise.
  const a = along ? along[0] : poleOf(from)
  const b = along ? along[along.length - 1] : poleOf(to)
  const ax = a ? px(a.lon) : W / 2
  const ay = a ? py(a.lat) : H / 2
  const bx = b ? px(b.lon) : W / 2
  const by = b ? py(b.lat) : H / 2
  // A gentle curve, like a road that bends with the land.
  const mx = (ax + bx) / 2 + (by - ay) * 0.18
  const my = (ay + by) / 2 - (bx - ax) * 0.18
  const road = along
    ? along
        .map((s, i) => `${i ? 'L' : 'M'}${px(s.lon).toFixed(1)},${py(s.lat).toFixed(1)}`)
        .join(' ')
    : `M${ax.toFixed(1)},${ay.toFixed(1)} Q${mx.toFixed(1)},${my.toFixed(1)} ${bx.toFixed(1)},${by.toFixed(1)}`
  const km = along ? Math.abs(along[along.length - 1].km - along[0].km) : null
  const dest = LOCALITIES[to].name

  return (
    <output
      aria-live="polite"
      aria-label={`En route vers ${dest}`}
      data-testid="travel-splash"
      className={`fixed inset-0 z-[130] flex flex-col items-center gap-4 bg-[#123b33] px-4 text-white ${
        cabin ? 'justify-end pb-[max(16px,env(safe-area-inset-bottom,0px))]' : 'justify-center'
      }`}
    >
      {cabin}
      <style>{`
        @keyframes haroolife-road { from { stroke-dashoffset: 1 } to { stroke-dashoffset: 0 } }
        @keyframes haroolife-bus { from { offset-distance: 0% } to { offset-distance: 100% } }
        .haroolife-road { stroke-dasharray: 1; animation: haroolife-road ${min}ms ease-in-out forwards }
        .haroolife-bus { offset-rotate: 0deg; animation: haroolife-bus ${min}ms ease-in-out forwards }
        @media (prefers-reduced-motion: reduce) {
          .haroolife-road { animation: none; stroke-dashoffset: 0 }
          .haroolife-bus { animation: none; offset-distance: 100% }
        }
      `}</style>
      <div
        className={
          cabin
            ? 'relative flex w-full max-w-md flex-col items-center gap-1 rounded-3xl bg-[#123b33]/85 p-3 shadow-xl backdrop-blur'
            : 'contents'
        }
      >
        <p className="text-sm font-semibold text-emerald-200">
          {company ? `${company} · ` : ''}
          {LOCALITIES[from].name} → {dest} · {hours} h {mode === 'air' ? 'de vol' : 'de car'}
          {km ? ` · ≈ ${km} km` : ''}
        </p>
        <h2 className={`text-center font-black leading-tight ${cabin ? 'text-xl' : 'text-3xl'}`}>
          En route vers {dest}
        </h2>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          aria-hidden="true"
          className={`block w-auto max-w-full drop-shadow-xl ${cabin ? 'h-[min(14dvh,150px)]' : 'h-[min(58dvh,520px)]'}`}
        >
          {data.regions.map((r) => (
            <path
              key={r.name}
              d={path(r.rings)}
              fill={REGION_FILL[r.name] ?? '#ddd'}
              stroke="#123b33"
              strokeWidth={1.2}
              strokeLinejoin="round"
            />
          ))}
          <path d={path(data.country.rings)} fill="none" stroke="#f7f8f1" strokeWidth={1.4} />
          <path d={road} fill="none" stroke="#123b33" strokeOpacity={0.25} strokeWidth={5} />
          <path
            d={road}
            pathLength={1}
            className="haroolife-road"
            fill="none"
            stroke="#c2410c"
            strokeWidth={3}
            strokeLinecap="round"
          />
          {along?.slice(1, -1).map((s) => (
            <g key={s.name} data-stop={s.name}>
              <circle cx={px(s.lon)} cy={py(s.lat)} r={3} fill="#f7f8f1" stroke="#c2410c" />
              <text
                x={px(s.lon) - 7}
                y={py(s.lat) + 3}
                textAnchor="end"
                fontSize={9}
                fontWeight={700}
                fill="#1f2a44"
                stroke="#f7f8f1"
                strokeWidth={2.5}
                paintOrder="stroke"
              >
                {s.name}
              </text>
            </g>
          ))}
          {[
            { x: ax, y: ay, name: LOCALITIES[from].name, here: false },
            { x: bx, y: by, name: dest, here: true },
          ].map((p) => (
            <g key={p.name}>
              <circle
                cx={p.x}
                cy={p.y}
                r={p.here ? 7 : 5}
                fill={p.here ? '#047857' : '#f7f8f1'}
                stroke={p.here ? '#f7f8f1' : '#047857'}
                strokeWidth={2}
              />
              <text
                x={p.x + 10}
                y={p.y + 4}
                fontSize={12}
                fontWeight={800}
                fill="#1f2a44"
                stroke="#f7f8f1"
                strokeWidth={3}
                paintOrder="stroke"
              >
                {p.name}
              </text>
            </g>
          ))}
          <g className="haroolife-bus" style={{ offsetPath: `path('${road}')` }}>
            <circle r={9} fill="#f7f8f1" stroke="#c2410c" strokeWidth={2} />
            <text textAnchor="middle" y={4} fontSize={11}>
              {mode === 'air' ? '✈️' : '🚌'}
            </text>
          </g>
        </svg>
        <p className="text-sm text-emerald-100">
          {ready ? `Arrivée à ${dest}.` : `Chargement du quartier de ${dest}…`}
        </p>
        {cabin && ready && (
          <button
            type="button"
            onClick={onDone}
            className="mt-1 min-h-11 rounded-xl bg-white px-4 py-2 text-sm font-black text-[#123b33]"
          >
            {mode === 'air' ? 'Débarquer' : 'Descendre du car'} à {dest}
          </button>
        )}
      </div>
    </output>
  )
}
