'use client'

import { useEffect, useState } from 'react'
import { Download, X } from 'lucide-react'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault()
      setDeferredPrompt(e as BeforeInstallPromptEvent)
      // Show the banner after a short delay so it doesn't feel intrusive
      setTimeout(() => setVisible(true), 3000)
    }
    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  async function install() {
    if (!deferredPrompt) return
    await deferredPrompt.prompt()
    const { outcome } = await deferredPrompt.userChoice
    if (outcome === 'accepted') setVisible(false)
    setDeferredPrompt(null)
  }

  if (!visible) return null

  return (
    <div className="install-banner" role="banner" aria-live="polite">
      <div className="install-inner">
        <div className="install-icon" aria-hidden>
          <svg width="36" height="36" viewBox="0 0 32 32" fill="none">
            <rect width="32" height="32" rx="8" fill="#16a34a"/>
            <path d="M16 6c-1.5 0-2.8.6-3.8 1.6C11.2 8.6 10.5 10 10.5 11.5c0 2 1 3.7 2.5 4.7v1.3c0 .3.1.5.3.7l2.5 2.5c.2.2.5.3.7.3s.5-.1.7-.3l2.5-2.5c.2-.2.3-.4.3-.7v-1.3c1.5-1 2.5-2.7 2.5-4.7 0-1.5-.7-2.9-1.7-3.9C19.3 6.6 17.5 6 16 6z" fill="white" opacity="0.9"/>
            <path d="M10 22c0-.5.4-1 1-1h10c.6 0 1 .5 1 1v2c0 .5-.4 1-1 1H11c-.6 0-1-.5-1-1v-2z" fill="white" opacity="0.7"/>
          </svg>
        </div>
        <div className="install-text">
          <strong>Installer l&apos;app Scanner</strong>
          <span>Accès rapide depuis votre écran d&apos;accueil</span>
        </div>
        <button className="install-btn" onClick={install} aria-label="Installer l'application">
          <Download size={16} />
          Installer
        </button>
        <button className="install-close" onClick={() => setVisible(false)} aria-label="Fermer">
          <X size={16} />
        </button>
      </div>

      <style>{`
        .install-banner {
          position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%);
          z-index: 9999; width: min(440px, calc(100vw - 32px));
          animation: slide-up .4s cubic-bezier(.2,.7,.2,1) both;
        }
        @keyframes slide-up { from { opacity:0; transform: translateX(-50%) translateY(20px); } to { opacity:1; transform: translateX(-50%) translateY(0); } }
        .install-inner {
          display: flex; align-items: center; gap: 12px;
          background: #0f1f14; border: 1px solid rgba(77,255,160,.25);
          border-radius: 18px; padding: 14px 16px;
          box-shadow: 0 8px 32px rgba(0,0,0,.55), 0 0 0 1px rgba(77,255,160,.08);
        }
        .install-icon { flex-shrink: 0; }
        .install-text {
          flex: 1; display: flex; flex-direction: column; gap: 2px;
          font-family: system-ui, sans-serif;
        }
        .install-text strong { color: #eafff2; font-size: 15px; }
        .install-text span { color: #7fd9a5; font-size: 13px; }
        .install-btn {
          display: inline-flex; align-items: center; gap: 6px; flex-shrink: 0;
          background: #4dffa0; color: #0a3d24; border: none; border-radius: 10px;
          padding: 9px 16px; font-weight: 700; font-size: 14px; cursor: pointer;
          transition: background .15s;
        }
        .install-btn:hover { background: #6fffb4; }
        .install-close {
          background: none; border: none; color: #7fd9a5; cursor: pointer;
          padding: 4px; flex-shrink: 0; opacity: .7; transition: opacity .15s;
        }
        .install-close:hover { opacity: 1; }
      `}</style>
    </div>
  )
}
