'use client'

import { useCallback, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { QrScanner } from '@/components/shared/qr-scanner'
import { ArrowLeft, ScanLine } from 'lucide-react'

/**
 * Public scan page (WhatsApp-Web style).
 *
 * When the camera reads the member-card QR, we extract the card number and
 * navigate straight to /verify/<card> — no link tap required.
 *
 * Accepted QR payloads:
 *   - https://<host>/verify/<CARD>     (our cards)
 *   - bare card number e.g. HAR-481923
 */
export default function ScanPage() {
  const router = useRouter()
  const [error, setError] = useState('')
  const [scanKey, setScanKey] = useState(0) // Force remount of scanner on retry

  const extractCardNumber = (raw: string): string | null => {
    const value = raw.trim()
    // Full URL pointing at our verify route
    try {
      const url = new URL(value)
      const m = url.pathname.match(/\/verify\/([^/?#]+)/i)
      if (m) return decodeURIComponent(m[1])
    } catch {
      /* not a URL — fall through */
    }
    // Bare card number pattern (PREFIX-DIGITS)
    if (/^[A-Z]{2,5}-\d{4,6}$/i.test(value)) return value.toUpperCase()
    return null
  }

  const handleResult = useCallback(
    (raw: string) => {
      const card = extractCardNumber(raw)
      if (card) {
        router.push(`/verify/${encodeURIComponent(card)}`)
      } else {
        setError('QR code non reconnu. Utilisez une carte FaîtiereHub valide.')
        // Reset scanner after 2s so user can try again
        setTimeout(() => { setError(''); setScanKey(k => k + 1) }, 2000)
      }
    },
    [router],
  )

  return (
    <main className="scan-root">
      <div className="scan-glow" aria-hidden />

      <header className="scan-header">
        <Link href="/" className="scan-back">
          <ArrowLeft className="h-4 w-4" />
          Accueil
        </Link>
        <div className="scan-brand">
          <ScanLine className="h-5 w-5" />
          <span>FaîtiereHub</span>
        </div>
      </header>

      <section className="scan-body">
        <h1 className="scan-title">Vérification instantanée</h1>
        <p className="scan-sub">
          Comme un scan WhatsApp Web : placez le QR code de la carte de membre
          dans le cadre, la vérification démarre toute seule.
        </p>

        <QrScanner key={scanKey} onResult={handleResult} className="scan-cam" />

        {error && <p className="scan-error">{error}</p>}

        <p className="scan-hint">
          Pas de caméra ?{' '}
          <Link href="/verify" className="scan-link">
            Saisir le numéro manuellement
          </Link>
        </p>
      </section>

      <style>{`
        :root {
          --scan-accent: oklch(0.72 0.18 142);
          --scan-accent-dim: oklch(0.58 0.14 142);
          --scan-accent-muted: oklch(0.65 0.10 142);
        }
        .scan-root {
          min-height: 100dvh; position: relative; overflow: hidden;
          background: radial-gradient(120% 90% at 20% 0%, oklch(0.40 0.18 142) 0%, oklch(0.22 0.10 142) 45%, oklch(0.12 0.06 142) 100%);
          color: #eafff2; display: flex; flex-direction: column;
          font-family: 'Barlow', system-ui, sans-serif;
        }
        .scan-glow {
          position: absolute; width: 520px; height: 520px; top: -160px; right: -120px;
          background: radial-gradient(circle, oklch(0.72 0.18 142 / 0.22), transparent 70%);
          filter: blur(20px); pointer-events: none;
        }
        .scan-header {
          display: flex; align-items: center; justify-content: space-between;
          padding: 20px 28px; position: relative; z-index: 2;
        }
        .scan-back {
          display: inline-flex; align-items: center; gap: 6px; font-size: 15px;
          color: var(--scan-accent-muted); text-decoration: none; transition: color .2s;
        }
        .scan-back:hover { color: #fff; }
        .scan-brand {
          display: inline-flex; align-items: center; gap: 8px; font-weight: 700;
          letter-spacing: .3px; color: var(--scan-accent);
        }
        .scan-body {
          flex: 1; display: flex; flex-direction: column; align-items: center;
          justify-content: center; text-align: center; padding: 16px 32px 48px;
          gap: 16px; position: relative; z-index: 2;
          animation: rise .6s cubic-bezier(.2,.7,.2,1) both;
        }
        @keyframes rise { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: none; } }
        .scan-title {
          font-family: 'Barlow Condensed', sans-serif; font-weight: 800;
          font-size: clamp(28px, 6vw, 40px); margin: 0; line-height: 1.05;
        }
        .scan-sub { max-width: 440px; color: var(--scan-accent-muted); font-size: 16px; margin: 0 0 6px; }
        .scan-cam { margin-top: 6px; }
        .scan-error {
          background: rgba(220,60,60,.14); border: 1px solid rgba(255,120,120,.4);
          color: #ffd2d2; padding: 10px 14px; border-radius: 12px; font-size: 14px;
          max-width: 440px;
        }
        .scan-hint { color: var(--scan-accent-dim); font-size: 15px; margin-top: 4px; }
        .scan-link { color: var(--scan-accent); text-decoration: underline; text-underline-offset: 3px; }
      `}</style>
    </main>
  )
}
