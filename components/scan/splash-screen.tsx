'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'

export function SplashScreen() {
  const [phase, setPhase] = useState<'in' | 'hold' | 'out' | 'done'>('in')

  useEffect(() => {
    const t1 = setTimeout(() => setPhase('hold'), 600)
    const t2 = setTimeout(() => setPhase('out'), 2000)
    const t3 = setTimeout(() => setPhase('done'), 2600)
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3) }
  }, [])

  if (phase === 'done') return null

  return (
    <div
      aria-hidden
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#060f08',
        opacity: phase === 'out' ? 0 : 1,
        transition: phase === 'out' ? 'opacity .55s cubic-bezier(.4,0,.2,1)' : 'none',
        overflow: 'hidden',
      }}
    >
      {/* Dot grid background */}
      <svg
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: .18 }}
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <pattern id="dots" x="0" y="0" width="28" height="28" patternUnits="userSpaceOnUse">
            <circle cx="1.5" cy="1.5" r="1.5" fill="#4dffa0" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#dots)" />
      </svg>

      {/* Geometric corner accents */}
      <svg style={{ position: 'absolute', top: 0, left: 0, width: 180, height: 180, opacity: .55 }} viewBox="0 0 180 180">
        <line x1="0" y1="0" x2="160" y2="0" stroke="#1ed760" strokeWidth=".8" />
        <line x1="0" y1="0" x2="0" y2="160" stroke="#1ed760" strokeWidth=".8" />
        <circle cx="0" cy="0" r="60" stroke="#1ed760" strokeWidth=".5" fill="none" opacity=".4" />
        <circle cx="0" cy="0" r="110" stroke="#1ed760" strokeWidth=".4" fill="none" opacity=".2" />
      </svg>
      <svg style={{ position: 'absolute', bottom: 0, right: 0, width: 180, height: 180, opacity: .55 }} viewBox="0 0 180 180">
        <line x1="180" y1="180" x2="20" y2="180" stroke="#1ed760" strokeWidth=".8" />
        <line x1="180" y1="180" x2="180" y2="20" stroke="#1ed760" strokeWidth=".8" />
        <circle cx="180" cy="180" r="60" stroke="#1ed760" strokeWidth=".5" fill="none" opacity=".4" />
        <circle cx="180" cy="180" r="110" stroke="#1ed760" strokeWidth=".4" fill="none" opacity=".2" />
      </svg>

      {/* Radial glow */}
      <div style={{
        position: 'absolute',
        width: 480,
        height: 480,
        borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(30,215,96,.15) 0%, transparent 70%)',
        filter: 'blur(24px)',
        animation: 'splashPulse 2.5s ease-in-out infinite',
      }} />

      {/* Rotating ring */}
      <svg
        style={{ position: 'absolute', width: 300, height: 300, animation: 'splashSpin 8s linear infinite', opacity: .25 }}
        viewBox="0 0 300 300"
      >
        <circle cx="150" cy="150" r="140" stroke="#4dffa0" strokeWidth="1" fill="none"
          strokeDasharray="18 8" />
      </svg>
      <svg
        style={{ position: 'absolute', width: 240, height: 240, animation: 'splashSpinR 12s linear infinite', opacity: .18 }}
        viewBox="0 0 240 240"
      >
        <circle cx="120" cy="120" r="112" stroke="#1ed760" strokeWidth=".8" fill="none"
          strokeDasharray="6 14" />
      </svg>

      {/* Logo card */}
      <div style={{
        position: 'relative',
        zIndex: 2,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 28,
        opacity: phase === 'in' ? 0 : 1,
        transform: phase === 'in' ? 'scale(.88) translateY(16px)' : 'scale(1) translateY(0)',
        transition: 'opacity .5s cubic-bezier(.2,.7,.2,1), transform .5s cubic-bezier(.2,.7,.2,1)',
      }}>
        {/* Glass card */}
        <div style={{
          background: 'rgba(13,61,34,.55)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          border: '1px solid rgba(77,255,160,.18)',
          borderRadius: 32,
          padding: '32px 40px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 32px 80px -20px rgba(0,0,0,.7), inset 0 1px 0 rgba(77,255,160,.12)',
        }}>
          <Image
            src="/logo.png"
            alt="FaîtiereHub"
            width={160}
            height={80}
            style={{ objectFit: 'contain', filter: 'brightness(1.05)' }}
            priority
          />
        </div>

        {/* Loading bar */}
        <div style={{
          width: 200,
          height: 3,
          background: 'rgba(77,255,160,.12)',
          borderRadius: 99,
          overflow: 'hidden',
        }}>
          <div style={{
            height: '100%',
            background: 'linear-gradient(90deg,#1ed760,#4dffa0)',
            borderRadius: 99,
            animation: 'splashBar 1.8s cubic-bezier(.4,0,.2,1) forwards',
            boxShadow: '0 0 12px rgba(30,215,96,.8)',
          }} />
        </div>
      </div>

      <style>{`
        @keyframes splashPulse {
          0%,100% { transform: scale(1); opacity:.8 }
          50% { transform: scale(1.12); opacity:1 }
        }
        @keyframes splashSpin {
          from { transform: rotate(0deg) }
          to { transform: rotate(360deg) }
        }
        @keyframes splashSpinR {
          from { transform: rotate(0deg) }
          to { transform: rotate(-360deg) }
        }
        @keyframes splashBar {
          0% { width: 0% }
          30% { width: 45% }
          70% { width: 75% }
          100% { width: 100% }
        }
      `}</style>
    </div>
  )
}
