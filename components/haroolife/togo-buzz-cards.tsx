'use client'

/**
 * In the « Débats » app: the gbairai of the day (the rumour of the player's background or of the
 * neighbourhood) and the Cardinal's Sunday live, « la messe », with its revelations one by one.
 * Texts and rules: lib/haroolife/togo-buzz.ts.
 */
import {
  CARDINAL,
  FAITHFUL,
  inSaid,
  messeState,
  revelationMessage,
  rumourMessage,
  rumourOfDay,
} from '@/lib/haroolife/togo-buzz'
import { useEffect, useState } from 'react'

export default function TogoBuzzCards({
  origin,
  onShare,
}: {
  /** The player's background (city/arrival.ts), if any. */
  origin?: string
  /** Posts a line in the « Togo » room. */
  onShare: (line: string) => void
}) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 30_000)
    return () => window.clearInterval(id)
  }, [])
  const rumour = rumourOfDay(now, origin)
  const messe = messeState(now)
  const revealed = messe.phase === 'live' || messe.phase === 'done' ? messe.revealed : []
  const last = revealed[revealed.length - 1]

  return (
    <>
      <section
        aria-label="Gbairai du jour"
        data-testid="gbairai"
        className="space-y-3 rounded-3xl bg-rose-50 p-4 ring-1 ring-rose-200"
      >
        <p className="text-xs font-semibold text-rose-800">🗣️ Gbairai du jour · {rumour.where}</p>
        <p className="text-base font-semibold leading-snug text-slate-900">{rumour.text}</p>
        <button
          type="button"
          onClick={() => onShare(rumourMessage(rumour))}
          className="w-full rounded-xl bg-rose-600 px-3 py-3 text-sm font-black text-white"
        >
          Faire circuler au salon Togo
        </button>
      </section>

      <section
        aria-label="La messe du dimanche"
        data-testid="messe"
        data-phase={messe.phase}
        className="space-y-3 rounded-3xl bg-[#1d1b3a] p-4 text-white"
      >
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-semibold text-amber-200">⛪ La messe du dimanche · 20 h</p>
          {messe.phase === 'live' && (
            <span className="rounded-full bg-red-600 px-2 py-0.5 text-[11px] font-black motion-safe:animate-pulse">
              EN DIRECT
            </span>
          )}
        </div>
        <p className="text-xl font-black leading-tight">
          {messe.phase === 'live'
            ? `${CARDINAL.name} parle`
            : messe.phase === 'done'
              ? 'La messe est dite'
              : messe.phase === 'soon'
                ? `${CARDINAL.name} va parler ${inSaid(messe.startsIn)}`
                : `Prochaine messe ${inSaid(messe.startsIn)}`}
        </p>
        {messe.phase === 'week' && <p className="text-sm text-indigo-100">{messe.teaser}</p>}
        {revealed.length > 0 && (
          <ol className="space-y-2" aria-label="Révélations">
            {revealed.map((r, i) => (
              <li key={r} className="rounded-2xl bg-white/10 p-3 text-sm leading-snug">
                <span className="mr-1 font-black text-amber-300">{i + 1}.</span>
                {r}
              </li>
            ))}
          </ol>
        )}
        {messe.phase === 'live' && (
          <ul className="space-y-1 text-xs text-indigo-100" aria-label="Les fidèles">
            {FAITHFUL.slice(0, Math.min(FAITHFUL.length, revealed.length + 1)).map((f) => (
              <li key={f}>💬 {f}</li>
            ))}
          </ul>
        )}
        {last && (
          <button
            type="button"
            onClick={() => onShare(revelationMessage(last))}
            className="w-full rounded-xl bg-amber-400 px-3 py-3 text-sm font-black text-slate-900"
          >
            Partager la dernière révélation
          </button>
        )}
        <p className="text-[11px] text-indigo-200">{CARDINAL.about}</p>
      </section>
    </>
  )
}
