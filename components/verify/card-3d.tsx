'use client'

import { useRef, useState, useCallback, useEffect } from 'react'
import { CheckCircle, MapPin, User } from 'lucide-react'
import {
  type VerifyMember,
  type VerifyCard,
  type VerifyCooperative,
  memberFullName,
  memberLocality,
  formatFrDate,
} from './types'

const CARD_TYPE_LABELS: Record<string, string> = {
  FAITIERE: 'Carte Producteur',
  OUVRIER:  'Carte Ouvrier',
  ACHETEUR: 'Carte Acheteur',
  AGRONOME: 'Carte Agronome',
}

interface Card3DProps {
  member: VerifyMember
  card: VerifyCard & { card_type?: string }
  cooperative?: VerifyCooperative
}

/**
 * A realistic, tactile membership card rendered as a 3D object.
 *
 * - Reacts to pointer / device tilt (parallax + dynamic light).
 * - Holographic sheen sweeps across the surface following the light source.
 * - Layered shadows and an embossed chip give real material depth.
 *
 * Self-contained: owns its own interaction state and styles.
 */
export function Card3D({ member, card, cooperative }: Card3DProps) {
  const ref = useRef<HTMLDivElement>(null)
  const rafRef = useRef<number | null>(null)
  const [tilt, setTilt] = useState({ rx: 0, ry: 0, mx: 50, my: 50 })

  const handlePointer = useCallback((clientX: number, clientY: number) => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    rafRef.current = requestAnimationFrame(() => {
      const el = ref.current
      if (!el) return
      const r = el.getBoundingClientRect()
      const px = (clientX - r.left) / r.width // 0..1
      const py = (clientY - r.top) / r.height
      // Map to a gentle tilt range; invert Y so it feels physical.
      const ry = (px - 0.5) * 22
      const rx = (0.5 - py) * 16
      setTilt({ rx, ry, mx: px * 100, my: py * 100 })
    })
  }, [])

  const reset = useCallback(() => setTilt({ rx: 0, ry: 0, mx: 50, my: 50 }), [])

  // Device orientation tilt (mobile) — subtle, gyroscope-driven.
  useEffect(() => {
    const onOrient = (e: DeviceOrientationEvent) => {
      if (e.gamma == null || e.beta == null) return
      const ry = Math.max(-18, Math.min(18, e.gamma * 0.5))
      const rx = Math.max(-14, Math.min(14, (e.beta - 45) * 0.3))
      setTilt((t) => ({ ...t, rx, ry, mx: 50 + ry * 1.5, my: 50 - rx * 1.5 }))
    }
    window.addEventListener('deviceorientation', onOrient)
    return () => {
      window.removeEventListener('deviceorientation', onOrient)
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    }
  }, [])

  const fullName = memberFullName(member)
  const nameLen = fullName.length
  const nameSize = nameLen > 28 ? '1.1rem' : nameLen > 22 ? '1.35rem' : nameLen > 16 ? '1.75rem' : '2.1rem'

  return (
    <div className="card3d-scene">
      <div
        ref={ref}
        className="card3d"
        style={{
          transform: `rotateX(${tilt.rx}deg) rotateY(${tilt.ry}deg)`,
          ['--mx' as string]: `${tilt.mx}%`,
          ['--my' as string]: `${tilt.my}%`,
        }}
        onMouseMove={(e) => handlePointer(e.clientX, e.clientY)}
        onMouseLeave={reset}
        onTouchMove={(e) => {
          const t = e.touches[0]
          if (t) handlePointer(t.clientX, t.clientY)
        }}
      >
        {/* Base metal/plastic layer */}
        <div className="card3d-base" />
        {/* Woven guilloché texture */}
        <div className="card3d-guilloche" />
        {/* Holographic sheen that follows the light */}
        <div className="card3d-holo" />
        {/* Glare highlight */}
        <div className="card3d-glare" />

        {/* ─── CONTENT (raised layer) ─── */}
        <div className="card3d-content">
          <header className="card3d-top">
            <div>
              <div className="card3d-brand">
                <span className="card3d-brand-main">Faîtière</span>
                <span className="card3d-brand-accent">Hub</span>
              </div>
              <div className="card3d-type-label">
                {CARD_TYPE_LABELS[card.card_type ?? 'FAITIERE'] ?? 'Carte Membre'}
              </div>
            </div>
            <div className="card3d-verified">
              <CheckCircle size={16} />
              <span>VÉRIFIÉ</span>
            </div>
          </header>

          <div className="card3d-body">
            {/* Photo format passeport — portrait rectangulaire */}
            <div className="card3d-photo">
              <span className="card3d-photo-ring" />
              <div className="card3d-photo-inner">
                {member.photo_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={member.photo_url} alt="" loading="lazy" decoding="async" />
                ) : (
                  <div className="card3d-photo-empty">
                    <User size={40} />
                  </div>
                )}
              </div>
            </div>

            <div className="card3d-identity">
              <h2 className="card3d-name" style={{ fontSize: nameSize }}>
                {fullName}
              </h2>
              <div className="card3d-coop">
                <span className="card3d-coop-label">COOPÉRATIVE</span>
                <span className="card3d-coop-value">{cooperative?.name ?? '—'}</span>
              </div>
              {memberLocality(member) && (
                <div className="card3d-loc">
                  <MapPin size={15} />
                  <span>{memberLocality(member)}</span>
                </div>
              )}
            </div>
          </div>

          {/* Embossed chip + card meta */}
          <footer className="card3d-bottom">
            <div className="card3d-chip" aria-hidden>
              <span /><span /><span /><span />
            </div>
            <div className="card3d-meta">
              <div>
                <span className="card3d-meta-label">N° MEMBRE</span>
                <span className="card3d-meta-value">{card.card_number}</span>
              </div>
              <div>
                <span className="card3d-meta-label">VALABLE</span>
                <span className="card3d-meta-value">{formatFrDate(card.expiry_date)}</span>
              </div>
            </div>
          </footer>
        </div>
      </div>

      {/* Cast shadow on the "desk" */}
      <div className="card3d-shadow" />

      <style>{`
        .card3d-scene {
          perspective: 1400px;
          width: 100%;
          max-width: 480px;
          margin: 0 auto;
          padding: 10px 0 30px;
        }
        .card3d {
          position: relative;
          width: 100%;
          aspect-ratio: 1.586 / 1;
          border-radius: 22px;
          transform-style: preserve-3d;
          transition: transform .15s cubic-bezier(.2,.7,.2,1);
          will-change: transform;
          box-shadow:
            0 1px 1px rgba(0,0,0,.4),
            0 12px 24px -8px rgba(0,0,0,.55),
            0 30px 60px -20px rgba(0,0,0,.65);
          overflow: hidden;
          isolation: isolate;
        }
        .card3d-base {
          position: absolute; inset: 0; border-radius: 22px;
          background:
            radial-gradient(130% 110% at var(--mx) var(--my), #1c7a47 0%, #0f5130 32%, #0a3d24 60%, #062a18 100%);
        }
        .card3d-guilloche {
          position: absolute; inset: 0; border-radius: 22px; opacity: .12;
          background-image:
            repeating-linear-gradient(45deg, #6affb0 0 1px, transparent 1px 9px),
            repeating-linear-gradient(-45deg, #6affb0 0 1px, transparent 1px 9px);
          mix-blend-mode: overlay;
        }
        .card3d-holo {
          position: absolute; inset: 0; border-radius: 22px; pointer-events: none;
          background: linear-gradient(115deg,
            transparent 18%,
            rgba(120,255,190,.18) 32%,
            rgba(180,140,255,.28) 42%,
            rgba(120,200,255,.20) 52%,
            transparent 66%);
          background-size: 220% 220%;
          background-position: calc(var(--mx) * 1.4) calc(var(--my) * 1.4);
          mix-blend-mode: screen; opacity: .9;
        }
        .card3d-glare {
          position: absolute; inset: 0; border-radius: 22px; pointer-events: none;
          background: radial-gradient(45% 35% at var(--mx) var(--my),
            rgba(255,255,255,.35), rgba(255,255,255,0) 70%);
          mix-blend-mode: soft-light;
        }

        /* ── Content layer ─────────────────────────────────── */
        .card3d-content {
          position: absolute; inset: 0;
          padding: clamp(10px, 3.5vw, 16px) clamp(12px, 4vw, 18px) clamp(10px, 3vw, 14px);
          display: flex; flex-direction: column; justify-content: space-between;
          transform: translateZ(28px);
          color: #eafff2;
          font-family: 'Barlow', system-ui, sans-serif;
          /* Prevent any direct child from escaping */
          overflow: hidden;
        }

        /* ── Header ────────────────────────────────────────── */
        .card3d-top {
          display: flex; align-items: flex-start; justify-content: space-between;
          gap: 8px; min-width: 0;
        }
        /* Left side of header must not overflow into badge */
        .card3d-top > div:first-child { min-width: 0; overflow: hidden; }
        .card3d-brand {
          font-family: 'Barlow Condensed','Barlow',sans-serif;
          font-weight: 800;
          font-size: clamp(1.2rem, 3.5vw, 1.65rem);
          line-height: 1;
          letter-spacing: .3px; text-shadow: 0 1px 2px rgba(0,0,0,.4);
          white-space: nowrap;
        }
        .card3d-brand-accent { color: #4dffa0; }
        .card3d-type-label {
          font-size: clamp(0.6rem, 1.6vw, .78rem);
          letter-spacing: 1.2px; color: #7fd9a5; font-weight: 700;
          text-transform: uppercase; margin-top: 2px;
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }
        .card3d-verified {
          display: inline-flex; align-items: center; gap: 5px;
          background: rgba(77,255,160,.16); border: 1px solid rgba(77,255,160,.4);
          color: #9bffc8; border-radius: 999px;
          padding: clamp(3px, 1vw, 5px) clamp(8px, 2.5vw, 12px);
          font-size: clamp(0.7rem, 2vw, .88rem); font-weight: 800; letter-spacing: 1.2px;
          backdrop-filter: blur(4px);
          flex-shrink: 0; white-space: nowrap;
        }

        /* ── Body ──────────────────────────────────────────── */
        .card3d-body {
          display: flex;
          gap: clamp(10px, 2.5vw, 16px);
          align-items: flex-start;
          min-width: 0;
        }

        /* ── Photo ─────────────────────────────────────────── */
        .card3d-photo {
          position: relative;
          width: clamp(62px, 17vw, 82px);
          height: clamp(62px, 17vw, 82px);
          flex-shrink: 0;
        }
        .card3d-photo-ring {
          position: absolute; inset: -3px; border-radius: 50%;
          background: conic-gradient(from 0deg, #4dffa0, #1c7a47, #b48cff, #4dffa0);
          filter: blur(.5px);
        }
        .card3d-photo-inner {
          position: absolute; inset: 0; border-radius: 50%; overflow: hidden;
          box-shadow: inset 0 2px 6px rgba(0,0,0,.4), 0 2px 8px rgba(0,0,0,.5);
        }
        .card3d-photo-inner img {
          width: 100%; height: 100%;
          object-fit: cover; object-position: center top;
        }
        .card3d-photo-empty {
          width: 100%; height: 100%; border-radius: 50%;
          background: #0c3d24;
          display: grid; place-items: center; color: rgba(255,255,255,.4);
        }

        /* ── Identity block ────────────────────────────────── */
        /*
         * min-width: 0 is the critical fix: without it, a flex child
         * refuses to shrink below its content's intrinsic width and
         * overflows the card.
         */
        .card3d-identity {
          flex: 1;
          min-width: 0;
          display: flex; flex-direction: column; justify-content: center;
          gap: 4px;
          overflow: hidden;
        }
        .card3d-name {
          font-family: 'Barlow Condensed','Barlow',sans-serif;
          font-weight: 800; line-height: 1.1; margin: 0;
          text-shadow: 0 1px 3px rgba(0,0,0,.5);
          text-transform: uppercase; letter-spacing: .5px;
          /* Allow long words to wrap, cap at 2 lines */
          word-break: break-word;
          overflow-wrap: break-word;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }
        .card3d-coop {
          display: flex; flex-direction: column; line-height: 1.2;
          min-width: 0; overflow: hidden;
        }
        .card3d-coop-label {
          font-size: clamp(0.62rem, 1.7vw, .9rem);
          letter-spacing: 1.4px; color: #7fd9a5; font-weight: 700;
          text-transform: uppercase; white-space: nowrap;
        }
        .card3d-coop-value {
          font-size: clamp(0.82rem, 2.6vw, 1.18rem);
          font-weight: 700; line-height: 1.25;
          /* 2-line max for long cooperative names */
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
          word-break: break-word;
        }
        .card3d-loc {
          display: flex; align-items: center; gap: 5px;
          margin-top: 2px;
          font-size: clamp(0.68rem, 1.9vw, .9rem);
          color: #b7e8cb;
          min-width: 0; overflow: hidden;
        }
        /* Icon stays visible, text truncates */
        .card3d-loc svg { flex-shrink: 0; }
        .card3d-loc span {
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
          min-width: 0;
        }

        /* ── Footer ────────────────────────────────────────── */
        .card3d-bottom {
          display: flex; align-items: flex-end;
          justify-content: space-between;
          gap: clamp(8px, 2vw, 14px);
        }
        .card3d-chip {
          width: clamp(38px, 10vw, 48px);
          height: clamp(29px, 7.5vw, 37px);
          border-radius: 7px;
          background: linear-gradient(135deg, #f5d271, #d9a93b 55%, #b07f1e);
          display: grid; grid-template-columns: 1fr 1fr; gap: 2px; padding: 5px;
          box-shadow: inset 0 1px 1px rgba(255,255,255,.6), 0 1px 2px rgba(0,0,0,.4);
          flex-shrink: 0;
        }
        .card3d-chip span { background: rgba(120,80,10,.35); border-radius: 1px; }
        .card3d-meta {
          display: flex; gap: clamp(10px, 2.5vw, 18px);
          text-align: right; flex: 1; justify-content: flex-end;
          min-width: 0;
        }
        .card3d-meta > div { min-width: 0; overflow: hidden; }
        .card3d-meta-label {
          display: block;
          font-size: clamp(0.6rem, 1.6vw, .85rem);
          letter-spacing: 1.2px; color: #7fd9a5; font-weight: 700;
          text-transform: uppercase; white-space: nowrap;
        }
        .card3d-meta-value {
          display: block;
          font-size: clamp(0.82rem, 2.4vw, 1.18rem);
          font-weight: 800; font-variant-numeric: tabular-nums;
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }

        /* ── Shadow ────────────────────────────────────────── */
        .card3d-shadow {
          width: 78%; height: 26px; margin: -10px auto 0;
          background: radial-gradient(ellipse at center, rgba(0,0,0,.5), transparent 72%);
          filter: blur(7px);
        }

        @media (prefers-reduced-motion: reduce) {
          .card3d { transition: none; }
        }
      `}</style>
    </div>
  )
}
