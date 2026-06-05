'use client'

import { useEffect, useState } from 'react'

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export function PwaRegister() {
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [installed, setInstalled] = useState(false)

  useEffect(() => {
    // Register SW
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker
        .register('/sw.js', { scope: '/' })
        .catch((err) => console.warn('SW registration failed:', err))
    }

    // Capture install prompt (fires before Chrome shows its own mini-banner)
    const handler = (e: Event) => {
      e.preventDefault()
      setInstallPrompt(e as BeforeInstallPromptEvent)
    }
    window.addEventListener('beforeinstallprompt', handler)

    // Hide button if already installed (standalone mode)
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setInstalled(true)
    }
    window.addEventListener('appinstalled', () => setInstalled(true))

    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  const handleInstall = async () => {
    if (!installPrompt) return
    await installPrompt.prompt()
    const { outcome } = await installPrompt.userChoice
    if (outcome === 'accepted') setInstalled(true)
    setInstallPrompt(null)
  }

  if (installed || !installPrompt) return null

  return (
    <button
      onClick={handleInstall}
      style={{
        position: 'fixed',
        bottom: '24px',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 100,
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '12px 22px',
        background: 'linear-gradient(90deg,#1ed760,#15a34a)',
        color: '#04140b',
        fontWeight: 700,
        fontSize: '15px',
        borderRadius: '999px',
        border: 'none',
        cursor: 'pointer',
        boxShadow: '0 8px 28px -6px rgba(30,215,96,.7)',
        whiteSpace: 'nowrap',
        animation: 'pwa-rise .4s cubic-bezier(.2,.7,.2,1) both',
      }}
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2v13M7 10l5 5 5-5"/><rect x="3" y="18" width="18" height="3" rx="1.5"/>
      </svg>
      Installer l'app
      <style>{`@keyframes pwa-rise{from{opacity:0;transform:translateX(-50%) translateY(12px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}`}</style>
    </button>
  )
}
