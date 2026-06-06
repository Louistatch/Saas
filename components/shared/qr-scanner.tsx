'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

type ScanState =
  | 'idle'        // waiting for the user to tap "Activer la caméra"
  | 'starting'    // permission prompt / camera warming up
  | 'scanning'    // live, looking for a QR
  | 'detected'    // QR found
  | 'denied'      // permission refused
  | 'insecure'    // not HTTPS → camera impossible
  | 'error'       // other failure

interface QrScannerProps {
  onResult: (value: string) => void
  onError?: (message: string) => void
  className?: string
}

interface BarcodeDetectorLike {
  detect: (source: CanvasImageSource) => Promise<{ rawValue: string }[]>
}
interface BarcodeDetectorCtor {
  new (opts?: { formats?: string[] }): BarcodeDetectorLike
  getSupportedFormats?: () => Promise<string[]>
}

/**
 * Live camera QR scanner.
 *
 * KEY FIX: the camera is started by an explicit user tap, NOT automatically on
 * mount. Mobile browsers block auto-requested camera access; a user gesture is
 * required for the permission prompt to appear. We also detect insecure (HTTP)
 * contexts up front, where getUserMedia is unavailable by design.
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
      if ('vibrate' in navigator) navigator.vibrate(60)
      stop()
      onResult(value)
    },
    [onResult, stop],
  )

  // Started ONLY by a user tap.
  const startCamera = useCallback(async () => {
    detectedRef.current = false
    setErrorMsg('')

    // Secure-context guard: camera APIs require HTTPS (or localhost).
    const secure =
      typeof window !== 'undefined' &&
      (window.isSecureContext ||
        window.location.hostname === 'localhost' ||
        window.location.hostname === '127.0.0.1')

    if (!secure || !navigator.mediaDevices?.getUserMedia) {
      setState('insecure')
      onError?.('camera-insecure')
      return
    }

    setState('starting')

    // Try the rear camera first, then fall back to ANY camera. Some Android
    // builds reject the object form of facingMode and throw immediately, which
    // we don't want to misread as a permission denial.
    let stream: MediaStream | null = null
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
        audio: false,
      })
    } catch (err1) {
      if (err1 instanceof DOMException && err1.name === 'NotAllowedError') {
        setState('denied')
        onError?.('camera-denied')
        return
      }
      // Constraint/overconstrained/other → retry with the most permissive request.
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false })
      } catch (err2) {
        if (err2 instanceof DOMException && err2.name === 'NotAllowedError') {
          setState('denied')
          onError?.('camera-denied')
        } else {
          const name = err2 instanceof DOMException ? err2.name : 'Erreur'
          setState('error')
          setErrorMsg(
            name === 'NotFoundError'
              ? "Aucune caméra détectée sur cet appareil."
              : `Caméra inaccessible (${name}).`,
          )
          onError?.('camera-error')
        }
        return
      }
    }

    try {
      streamRef.current = stream
      const video = videoRef.current
      if (!video) {
        // Should not happen (video is always mounted), but guard anyway.
        stream.getTracks().forEach((t) => t.stop())
        setState('error')
        setErrorMsg('Lecteur vidéo indisponible. Rechargez la page.')
        return
      }
      video.srcObject = stream
      await video.play()
      setState('scanning')

      // Native BarcodeDetector first (fast); jsQR fallback otherwise.
      const Ctor = (window as unknown as { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector
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
      const jsQR = detector ? null : (await import('jsqr')).default

      const canvas = canvasRef.current!
      const ctx = canvas.getContext('2d', { willReadFrequently: true })!

      const tick = async () => {
        if (detectedRef.current) return
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
              const scale = Math.min(1, 480 / Math.max(w, h))
              const sw = Math.round(w * scale)
              const sh = Math.round(h * scale)
              canvas.width = sw
              canvas.height = sh
              ctx.drawImage(video, 0, 0, sw, sh)
              const img = ctx.getImageData(0, 0, sw, sh)
              const code = jsQR(img.data, sw, sh, { inversionAttempts: 'dontInvert' })
              if (code?.data) return handleHit(code.data)
            }
          }
        }
        rafRef.current = requestAnimationFrame(tick)
      }
      rafRef.current = requestAnimationFrame(tick)
    } catch {
      // Failure after the stream was obtained (e.g. video.play()) — non-fatal
      // for permissions, but we surface a generic error and stop the stream.
      streamRef.current?.getTracks().forEach((t) => t.stop())
      setState('error')
      setErrorMsg('Le flux vidéo n\'a pas pu démarrer. Réessayez.')
      onError?.('camera-error')
    }
  }, [handleHit, onError])

  useEffect(() => () => stop(), [stop])

  const showStartButton = state === 'idle' || state === 'denied' || state === 'error'

  return (
    <div className={`qr-scanner ${className}`}>
      <div className="qr-stage">
        <video ref={videoRef} playsInline muted className="qr-video" />
        <canvas ref={canvasRef} className="qr-hidden" />

        {/* Camera framing overlay (only while live) */}
        {(state === 'starting' || state === 'scanning' || state === 'detected') && (
          <div className="qr-overlay" aria-hidden>
            <div className={`qr-window ${state === 'detected' ? 'is-hit' : ''}`}>
              <span className="qr-corner tl" />
              <span className="qr-corner tr" />
              <span className="qr-corner bl" />
              <span className="qr-corner br" />
              {state === 'scanning' && <span className="qr-laser" />}
            </div>
          </div>
        )}

        {/* Idle / denied / error / insecure → call to action */}
        {(showStartButton || state === 'insecure') && (
          <div className="qr-cta">
            <div className="qr-cta-icon" aria-hidden>
              <svg viewBox="0 0 24 24" width="34" height="34" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 9V7a2 2 0 0 1 2-2h2" /><path d="M17 5h2a2 2 0 0 1 2 2v2" />
                <path d="M21 15v2a2 2 0 0 1-2 2h-2" /><path d="M7 19H5a2 2 0 0 1-2-2v-2" />
                <circle cx="12" cy="12" r="3.2" />
              </svg>
            </div>

            {state === 'insecure' ? (
              <>
                <p className="qr-cta-title">Caméra indisponible</p>
                <p className="qr-cta-text">
                  Le scan nécessite une connexion sécurisée (https). Ouvrez le site
                  en <strong>https://</strong> pour activer la caméra.
                </p>
              </>
            ) : state === 'denied' ? (
              <>
                <p className="qr-cta-title">Caméra bloquée</p>
                <p className="qr-cta-text">
                  La caméra a été bloquée pour ce site. Pour la débloquer :
                  touchez le <strong>cadenas 🔒</strong> à gauche de l'adresse en
                  haut → <strong>Autorisations</strong> →{' '}
                  <strong>Caméra</strong> → <strong>Autoriser</strong>, puis
                  rechargez la page.
                </p>
                <button className="qr-cta-btn" onClick={startCamera}>Réessayer</button>
              </>
            ) : state === 'error' ? (
              <>
                <p className="qr-cta-title">Une erreur est survenue</p>
                <p className="qr-cta-text">{errorMsg}</p>
                <button className="qr-cta-btn" onClick={startCamera}>Réessayer</button>
              </>
            ) : (
              <>
                <p className="qr-cta-title">Prêt à scanner</p>
                <p className="qr-cta-text">Touchez le bouton pour activer la caméra.</p>
                <button className="qr-cta-btn" onClick={startCamera}>Activer la caméra</button>
              </>
            )}
          </div>
        )}

        {/* Live status line */}
        {(state === 'starting' || state === 'scanning' || state === 'detected') && (
          <div className="qr-status">
            {state === 'starting' && 'Activation de la caméra…'}
            {state === 'scanning' && 'Pointez vers le QR code de la carte'}
            {state === 'detected' && 'Carte détectée ✓'}
          </div>
        )}
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
          background: radial-gradient(circle at center, transparent 38%, rgba(4,16,11,.72) 72%);
        }
        .qr-window { position: relative; width: 64%; aspect-ratio: 1/1; border-radius: 22px;
          transition: box-shadow .3s ease, transform .3s ease; }
        .qr-window.is-hit { box-shadow: 0 0 0 3px #1ed760, 0 0 40px 6px rgba(30,215,96,.55); transform: scale(1.02); }
        .qr-corner { position: absolute; width: 34px; height: 34px; border: 4px solid #1ed760; border-radius: 4px; }
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
        @keyframes qrsweep { 0% { top: 6%; opacity:.2 } 50% { top: 92%; opacity:1 } 100% { top: 6%; opacity:.2 } }
        .qr-status {
          position: absolute; left: 0; right: 0; bottom: 18px; text-align: center;
          color: #eafff2; font-size: 14px; font-weight: 600;
          text-shadow: 0 1px 6px rgba(0,0,0,.7); padding: 0 20px;
        }
        .qr-cta {
          position: absolute; inset: 0; display: flex; flex-direction: column;
          align-items: center; justify-content: center; text-align: center;
          gap: 12px; padding: 28px; color: #eafff2;
          background: radial-gradient(120% 100% at 50% 0%, #0f5130, #07120c);
        }
        .qr-cta-icon {
          width: 72px; height: 72px; border-radius: 50%; display: grid; place-items: center;
          color: #4dffa0; background: rgba(30,215,96,.12); border: 1px solid rgba(77,255,160,.3);
        }
        .qr-cta-title { font-size: 18px; font-weight: 700; margin: 0; }
        .qr-cta-text { font-size: 14px; color: #aedcbf; margin: 0; max-width: 300px; line-height: 1.45; }
        .qr-cta-btn {
          margin-top: 6px; border: none; cursor: pointer;
          background: linear-gradient(90deg, #1ed760, #15a34a); color: #04140b;
          font-weight: 700; font-size: 15px; padding: 13px 26px; border-radius: 999px;
          box-shadow: 0 8px 24px -6px rgba(30,215,96,.6); transition: transform .15s ease;
        }
        .qr-cta-btn:active { transform: scale(.96); }
        @media (prefers-reduced-motion: reduce){ .qr-laser{ animation:none; top:50% } }
      `}</style>
    </div>
  )
}
