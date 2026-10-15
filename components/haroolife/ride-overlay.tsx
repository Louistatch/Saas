'use client'

/**
 * What a trip across town shows over the street (the street itself draws the ride with the
 * HarooLife engine): the boulevard sign, the transport and destination, rain, the map and
 * « Passer ». Plain HTML: no 3D engine is loaded for it.
 */
import type { Transport } from '@/lib/haroolife/lome-life-engine'

export default function RideOverlay({
  transport,
  rain,
  destination,
  boulevard = 'Boulevard du Mono',
  onSkip,
  onMap,
}: {
  transport: Transport
  rain: boolean
  destination: string
  boulevard?: string
  onSkip: () => void
  onMap: () => void
}) {
  const label = transport === 'moto' ? 'En zémidjan' : transport === 'taxi' ? 'En taxi' : 'À pied'
  return (
    <div className="pointer-events-none absolute inset-0 z-30" aria-label="Trajet en cours">
      {rain && (
        <div
          aria-hidden="true"
          className="absolute inset-0 opacity-50"
          style={{
            backgroundImage:
              'repeating-linear-gradient(100deg, transparent 0 14px, rgba(255,255,255,0.35) 14px 15px)',
            animation: 'haroolife-rain 0.5s linear infinite',
          }}
        />
      )}
      <style>
        {
          '@keyframes haroolife-rain { to { background-position: -40px 120px } } @media (prefers-reduced-motion: reduce) { [style*="haroolife-rain"] { animation: none } }'
        }
      </style>
      <div className="absolute inset-x-0 top-[calc(70px+env(safe-area-inset-top))] flex flex-col items-center gap-2 px-3">
        <div className="rounded-2xl border-4 border-white bg-emerald-700 px-5 py-2 text-center text-lg font-black uppercase tracking-wide text-white shadow-lg">
          {boulevard}
        </div>
        <div className="pointer-events-auto flex items-center gap-2 rounded-full bg-white/95 px-3 py-2 text-xs font-bold shadow">
          <span>
            {transport === 'moto' ? '🏍️' : '🚕'} {label} vers {destination}…
            {rain ? ' Il pleut.' : ''}
          </span>
          <button type="button" onClick={onMap} className="rounded-full bg-slate-100 px-3 py-1">
            Carte
          </button>
          <button
            type="button"
            onClick={onSkip}
            className="rounded-full bg-slate-900 px-3 py-1 text-white"
          >
            Passer ⏭
          </button>
        </div>
      </div>
    </div>
  )
}
