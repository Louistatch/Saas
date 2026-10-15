'use client'

import type { PerfSnapshot } from '@/lib/haroolife/city/perf'
/**
 * In-game diagnostic panel for testing on a real phone: frame rate and frame-time p95 from the
 * PlayCanvas probe (window.__LOME_PERF), render load, graphics preset, and the network as the
 * browser and the realtime relay see it. Opened with ?diag=1 or from the phone settings; it
 * reads the shared counters once a second and never touches the canvas.
 */
import type { RealtimeClient, RealtimeSnapshot } from '@/lib/haroolife/realtime/client'
import { useEffect, useState } from 'react'

const KEY = 'haroolife:diag'

/** Whether the panel should start open: ?diag=1 turns it on (and remembers), ?diag=0 off. */
export function initialDiag(): boolean {
  if (typeof window === 'undefined') return false
  const q = new URLSearchParams(window.location.search).get('diag')
  // A diagnostic flag remembered during phone testing must never leak into the public build.
  // Keep an explicit query switch for support sessions, while normal production visits stay clean.
  if (q === '1') return true
  try {
    if (q === '0') window.localStorage.removeItem(KEY)
    if (process.env.NODE_ENV === 'production') return false
    return window.localStorage.getItem(KEY) === '1'
  } catch {
    return q === '1'
  }
}

export function rememberDiag(on: boolean) {
  try {
    if (on) window.localStorage.setItem(KEY, '1')
    else window.localStorage.removeItem(KEY)
  } catch {}
}

interface NetInfo {
  effectiveType?: string
  rtt?: number
  downlink?: number
  saveData?: boolean
}

interface Reading {
  perf: PerfSnapshot | null
  quality: string
  online: boolean
  net: NetInfo | null
  /** Round trip of a tiny same-origin request, ms (null until measured, -1 when it failed). */
  httpMs: number | null
}

const STATUS: Record<RealtimeSnapshot['status'], string> = {
  disabled: 'désactivée',
  idle: 'arrêtée',
  'signed-out': 'non connecté',
  connecting: 'connexion…',
  online: 'en ligne',
  offline: 'hors ligne',
  denied: 'refusée',
}

function read(): Omit<Reading, 'httpMs'> {
  const w = window as unknown as { __LOME_PERF?: PerfSnapshot; __LOME_CITY?: { quality?: string } }
  const c = (navigator as unknown as { connection?: NetInfo }).connection
  return {
    perf: w.__LOME_PERF ?? null,
    quality: w.__LOME_CITY?.quality ?? '?',
    online: navigator.onLine,
    net: c
      ? { effectiveType: c.effectiveType, rtt: c.rtt, downlink: c.downlink, saveData: c.saveData }
      : null,
  }
}

export default function DiagOverlay({
  client,
  state,
  onClose,
}: {
  client: RealtimeClient | null
  state: RealtimeSnapshot
  onClose: () => void
}) {
  const [r, setR] = useState<Reading>(() => ({ ...read(), httpMs: null }))
  const [open, setOpen] = useState(false)
  useEffect(() => {
    const tick = window.setInterval(
      () => setR((prev) => ({ ...read(), httpMs: prev.httpMs })),
      1000,
    )
    // A HEAD request every 5 s: the latency the game's own API calls will see.
    const ping = async () => {
      const t0 = performance.now()
      try {
        await fetch(`/icon.svg?diag=${Date.now()}`, { method: 'HEAD', cache: 'no-store' })
        const ms = Math.round(performance.now() - t0)
        setR((prev) => ({ ...prev, httpMs: ms }))
      } catch {
        setR((prev) => ({ ...prev, httpMs: -1 }))
      }
    }
    void ping()
    const pinger = window.setInterval(() => void ping(), 5000)
    return () => {
      window.clearInterval(tick)
      window.clearInterval(pinger)
    }
  }, [])
  const f = r.perf?.frame
  const rt = client?.diagnostics()
  const fpsTone = !f?.fps
    ? 'text-white'
    : f.fps >= 45
      ? 'text-emerald-300'
      : f.fps >= 25
        ? 'text-amber-300'
        : 'text-rose-300'
  const fps = f?.fps ? `${Math.round(f.fps)}` : '…'
  const p95 = f?.p95 ? `${Math.round(f.p95)} ms` : '…'
  const http = r.httpMs == null ? '…' : r.httpMs < 0 ? 'échec' : `${r.httpMs} ms`
  const net = r.online ? (r.net?.effectiveType ?? 'en ligne') : 'hors ligne'
  const rows: [string, string][] = [
    ['Image p95', p95],
    ['Rendu', r.perf ? `${r.perf.drawCalls} appels` : '…'],
    ['Triangles', r.perf ? `${Math.round(r.perf.triangles / 1000)} k` : '…'],
    ['Qualité', r.quality],
    ['Pixels', r.perf ? `${r.perf.resolution[0]}×${r.perf.resolution[1]}` : '…'],
    ['Mémoire', r.perf?.heapMB != null ? `${r.perf.heapMB} Mo` : 'n/d'],
    ['Tâches >50ms', r.perf ? `${r.perf.longTasks}` : '…'],
    ['Réseau', net],
    ['Débit', r.net?.downlink != null ? `${r.net.downlink} Mb/s` : 'n/d'],
    ['RTT estimé', r.net?.rtt != null ? `${r.net.rtt} ms` : 'n/d'],
    ['Requête', http],
    ['Messagerie', STATUS[state.status]],
    ['Reconnexions', rt ? `${rt.reconnects}${rt.attempts ? ` (essai ${rt.attempts})` : ''}` : '—'],
    ['En attente', `${state.outbox.length}`],
  ]
  // Compact by default: one line that leaves the HUD buttons free; a tap shows the details.
  return (
    <section
      aria-label="Diagnostic"
      data-testid="diag-overlay"
      className="pointer-events-auto absolute left-3 top-[calc(146px+env(safe-area-inset-top))] z-40 max-w-[200px] rounded-xl bg-slate-950/80 font-mono text-[10px] leading-[14px] text-white shadow-lg backdrop-blur sm:top-[156px]"
    >
      <div className="flex items-center">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="flex items-center gap-2 px-2 py-1 text-left"
        >
          <span className={`font-bold ${fpsTone}`}>{fps} i/s</span>
          <span>{p95}</span>
          <span className="text-white/70">
            {net} · {state.status === 'online' ? 'msg ok' : STATUS[state.status]}
          </span>
        </button>
        <button
          type="button"
          onClick={onClose}
          aria-label="Fermer le diagnostic"
          className="px-1.5 py-1 text-white/70"
        >
          ✕
        </button>
      </div>
      {open && (
        <div className="border-t border-white/10 px-2 pb-1.5 pt-1">
          <dl className="grid grid-cols-[auto_1fr] gap-x-3">
            {rows.map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="text-white/60">{k}</dt>
                <dd className="truncate text-right">{v}</dd>
              </div>
            ))}
          </dl>
          {rt?.lastDrop && (
            <p className="mt-1 truncate text-white/50" title={rt.lastDrop}>
              Coupure : {rt.lastDrop}
            </p>
          )}
        </div>
      )}
    </section>
  )
}
