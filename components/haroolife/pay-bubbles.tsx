'use client'

/**
 * Payment bubbles: each change of the wallet during a driving shift rises for a moment under the
 * balance, just after the money moved: a fare with its breakdown (fuel and maintenance taken),
 * a paid stop, a fine. Nothing to tap, nothing left on screen afterwards.
 */
import type { VehicleReceipt } from '@/lib/haroolife/city/vehicle-economy'
import { useEffect, useRef, useState } from 'react'

export interface PayBubble {
  id: number
  delta: number
  detail: string | null
}

const fmt = (n: number) => Math.abs(Math.round(n)).toLocaleString('fr-FR')
const LIFETIME = 4200

/** The breakdown of a fare, as the bubble says it. */
export const receiptDetail = (r: VehicleReceipt) =>
  `course ${fmt(r.gross)} · ⛽ −${fmt(r.fuel)} · 🔧 −${fmt(r.maintenance)}`

/**
 * Watches the wallet while `active`: each change becomes a bubble. A new receipt explains the
 * change it caused; any other change shows the game's last message (the stop that was paid).
 */
export function usePayBubbles(
  wallet: number,
  active: boolean,
  receipt: VehicleReceipt | undefined,
  lastEvent: string,
): PayBubble[] {
  const [bubbles, setBubbles] = useState<PayBubble[]>([])
  const seen = useRef({ wallet, receipt })
  const next = useRef(1)
  const timers = useRef<number[]>([])
  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), [])
  useEffect(() => {
    const before = seen.current
    seen.current = { wallet, receipt }
    if (!active || wallet === before.wallet) return
    const delta = wallet - before.wallet
    const detail =
      receipt && receipt !== before.receipt && receipt.net === delta
        ? receiptDetail(receipt)
        : lastEvent.length > 60
          ? `${lastEvent.slice(0, 58)}…`
          : lastEvent || null
    const id = next.current++
    setBubbles((b) => [...b.slice(-2), { id, delta, detail }])
    timers.current.push(
      window.setTimeout(() => setBubbles((b) => b.filter((x) => x.id !== id)), LIFETIME),
    )
  }, [wallet, active, receipt, lastEvent])
  useEffect(() => {
    if (!active) setBubbles([])
  }, [active])
  return bubbles
}

export default function PayBubbles({ bubbles }: { bubbles: PayBubble[] }) {
  if (!bubbles.length) return null
  return (
    <div
      aria-live="polite"
      data-testid="pay-bubbles"
      className="pointer-events-none flex flex-col items-end gap-1"
    >
      {bubbles.map((b) => (
        <output
          key={b.id}
          data-testid="pay-bubble"
          className={`haroolife-pay-bubble block max-w-[15rem] rounded-2xl px-3 py-1.5 text-right shadow-lg ${
            b.delta > 0 ? 'bg-emerald-600 text-white' : 'bg-rose-600 text-white'
          }`}
        >
          <strong className="block text-sm leading-tight">
            {b.delta > 0 ? '+' : '−'}
            {fmt(b.delta)} FCFA
          </strong>
          {b.detail && (
            <span className="block truncate text-[10px] font-semibold opacity-90">{b.detail}</span>
          )}
        </output>
      ))}
      <style>{`
        .haroolife-pay-bubble { animation: haroolife-pay-rise ${LIFETIME}ms ease-out forwards; }
        @keyframes haroolife-pay-rise {
          0% { opacity: 0; transform: translateY(10px) scale(.92); }
          8% { opacity: 1; transform: translateY(0) scale(1); }
          80% { opacity: 1; transform: translateY(-4px); }
          100% { opacity: 0; transform: translateY(-14px); }
        }
        @media (prefers-reduced-motion: reduce) {
          .haroolife-pay-bubble { animation: none; }
        }
      `}</style>
    </div>
  )
}
