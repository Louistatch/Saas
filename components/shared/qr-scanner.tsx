'use client'

import { useEffect, useRef, useState, useCallback } from 'react'

type ScanState = 'idle' | 'starting' | 'scanning' | 'detected' | 'error'

interface QrScannerProps {
  /** Called with the decoded raw string the moment a QR is read. */
  onResult: (value: string) => void
  /** Optional error surface. */
  onError?: (message: string) => void
  className?: string
}

// Minimal typing for the experimental BarcodeDetector (Chrome/Android/Edge).
interface BarcodeDetectorLike {
  detect: (source: CanvasImageSource) => Promise<{ rawValue: string }[]>
}
interface BarcodeDetectorCtor {
  new (opts?: { formats?: string[] }): BarcodeDetectorLike
  getSupportedFormats?: () => Promise<string[]>
}

/**
 * Live camera QR scanner, WhatsApp-Web style.
 *
 * Strategy:
 *  1. Prefer the native BarcodeDetector API (fast, hardware-accelerated).
 *  2. Fall back to jsQR (pure JS) on browsers without it (Safari/Firefox).
 *
 * On a successful read it fires onResult immediately — no button, no link tap.
 */
export function QrScanner({ onResult, onError, className = '' }: QrScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const rafRef = useRef<number | null>(null)
  const detectedRef = useRef(false)

  const [state, setState] = useState<ScanState>('idle')
  const [errorMsg, setErrorMsg] = useState('')

  const stop = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    rafRef.current = null
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
  }, [])

  const handleHit = useCallback(
    (value: string) => {
      if (detectedRef.current) return
      detectedRef.current = true
      setState('detected')
      // Haptic feedback on supported devices (mobile).
      if ('vibrate' in navigator) navigator.vibrate(60)
      stop()
      onResult(value)
    },
    [onResult, stop],
  )

  useEffect(() => {
    let cancelled = false
    detectedRef.current = false

    async function start() {
      setState('starting')
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
          audio: false,
        })
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }
        streamRef.current = stream
        const video = videoRef.current
        if (!video) return
        video.srcObject = stream
        await video.play()
        setState('scanning')

        // Try native BarcodeDetector first.
        const Ctor = (window as unknown as { BarcodeDetector?: BarcodeDetectorCtor })
          .BarcodeDetector
        let detector: BarcodeDetectorLike | null = null
        if (Ctor) {
          try {
            const formats = (await Ctor.getSupportedFormats?.()) ?? []
            if (!formats.length || formats.includes('qr_code')) {
              detector = new Ctor({ formats: ['qr_code'] })
            }
          } catch {
            detector = null
          }
        }

        // jsQR fallback (lazy-loaded so it isn't in the main bundle).
        const jsQR = detector ? null : (await import('jsqr')).default

        const canvas = canvasRef.current!
        const ctx = canvas.getContext('2d', { willReadFrequently: true })!

        const tick = async () => {
          if (cancelled || detectedRef.current) return
          if (video.readyState === video.HAVE_ENOUGH_DATA) {
            const w = video.videoWidth
            const h = video.videoHeight
            if (w && h) {
              if (detector) {
                try {
                  const codes = await detector.detect(video)
                  if (codes[0]?.rawValue) return handleHit(codes[0].rawValue)
                } catch {
                  /* keep scanning */
                }
              } else if (jsQR) {
                canvas.width = w
                canvas.height = h
                ctx.drawImage(video, 0, 0, w, h)
                const img = ctx.getImageData(0, 0, w, h)
                const code = jsQR(img.data, w, h, { inversionAttempts: 'dontInvert' })
                if (code?.data) return handleHit(code.data)
              }
            }
          }
          rafRef.current = requestAnimationFrame(tick)
        }
        rafRef.current = requestAnimationFrame(tick)
      } catch (err) {
        if (cancelled) return
        const msg =
          err instanceof DOMException && err.name === 'NotAllowedError'
            ? "Accès à la caméra refusé. Autorisez la caméra pour scanner."
            : "Impossible d'accéder à la caméra de cet appareil."
        setErrorMsg(msg)
        setState('error')
        onError?.(msg)
      }
    }

    start()
    return () => {
      cancelled = true
      stop()
    }
  }, [handleHit, onError, stop])

  return (
    <div className={`qr-scanner ${className}`}>
      <div className="qr-stage">
        <video ref={videoRef} playsInline muted className="qr-video" />
        <canvas ref={canvasRef} className="qr-hidden" />

        {/* Dim overlay with a clear central cutout */}
        <div className="qr-overlay" aria-hidden>
          <div className={`qr-window ${state === 'detected' ? 'is-hit' : ''}`}>
            <span className="qr-corner tl" />
            <span className="qr-corner tr" />
            <span className="qr-corner bl" />
            <span className="qr-corner br" />
            {state === 'scanning' && <span className="qr-laser" />}
          </div>
        </div>

        {/* Status line */}
        <div className="qr-status">
          {state === 'starting' && 'Activation de la caméra…'}
          {state === 'scanning' && 'Pointez vers le QR code de la carte'}
          {state === 'detected' && 'Carte détectée ✓'}
          {state === 'error' && errorMsg}
        </div>
      </div>

      <style>{`
        .qr-scanner { width: 100%; display: flex; flex-direction: column; align-items: center; }
        .qr-stage {
          position: relative; width: 100%; max-width: 420px; aspect-ratio: 1 / 1;
          border-radius: 28px; overflow: hidden; background: #07120c;
          box-shadow: 0 24px 60px -20px rgba(0,0,0,.6);
        }
        .qr-video { width: 100%; height: 100%; object-fit: cover; display: block; }
        .qr-hidden { display: none; }
        .qr-overlay {
          position: absolute; inset: 0; display: grid; place-items: center;
          background:
            radial-gradient(circle at center, transparent 38%, rgba(4,16,11,.72) 72%);
        }
        .qr-window {
          position: relative; width: 64%; aspect-ratio: 1/1; border-radius: 22px;
          transition: box-shadow .3s ease, transform .3s ease;
        }
        .qr-window.is-hit {
          box-shadow: 0 0 0 3px #1ed760, 0 0 40px 6px rgba(30,215,96,.55);
          transform: scale(1.02);
        }
        .qr-corner {
          position: absolute; width: 34px; height: 34px;
          border: 4px solid #1ed760; border-radius: 4px;
        }
        .qr-corner.tl { top:0; left:0; border-right:0; border-bottom:0; border-top-left-radius:22px; }
        .qr-corner.tr { top:0; right:0; border-left:0; border-bottom:0; border-top-right-radius:22px; }
        .qr-corner.bl { bottom:0; left:0; border-right:0; border-top:0; border-bottom-left-radius:22px; }
        .qr-corner.br { bottom:0; right:0; border-left:0; border-top:0; border-bottom-right-radius:22px; }
        .qr-laser {
          position: absolute; left: 6%; right: 6%; height: 3px; top: 0;
          background: linear-gradient(90deg, transparent, #4dffa0, transparent);
          border-radius: 4px; filter: drop-shadow(0 0 8px #1ed760);
          animation: qrsweep 2.1s ease-in-out infinite;
        }
        @keyframes qrsweep {
          0% { top: 6%; opacity: .2; }
          50% { top: 92%; opacity: 1; }
          100% { top: 6%; opacity: .2; }
        }
        .qr-status {
          position: absolute; left: 0; right: 0; bottom: 18px; text-align: center;
          color: #eafff2; font-size: 14px; font-weight: 600; letter-spacing: .2px;
          text-shadow: 0 1px 6px rgba(0,0,0,.7); padding: 0 20px;
        }
        @media (prefers-reduced-motion: reduce) { .qr-laser { animation: none; top: 50%; } }
      `}</style>
    </div>
  )
}
