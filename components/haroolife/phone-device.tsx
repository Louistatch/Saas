'use client'

/**
 * The player's phone, drawn as a device over the world (V3, after the Lagos Life reference):
 * dark frame, status bar, clock, a grid of apps and a close button. Every app opens an existing
 * module of the game (jobs, messages, wallet…); nothing here holds game rules. Developer tools
 * (frame rate and network overlay, graphics quality) live in Réglages → Avancé, never in front
 * of the apps.
 */
import { ChevronLeft, X } from 'lucide-react'
import Link from 'next/link'
import { useState } from 'react'

export type PhoneApp =
  | 'jobs'
  | 'messages'
  | 'debates'
  | 'wallet'
  | 'missions'
  | 'journal'
  | 'build'
  | 'map'
  | 'avatar'

const APPS: { id: PhoneApp | 'settings'; icon: string; name: string; tone: string }[] = [
  { id: 'jobs', icon: '💼', name: 'Métiers', tone: '#8a5a2b' },
  { id: 'messages', icon: '💬', name: 'Messages', tone: '#2563eb' },
  { id: 'debates', icon: '🎤', name: 'Débats', tone: '#be123c' },
  { id: 'wallet', icon: '💵', name: 'Argent', tone: '#15803d' },
  { id: 'missions', icon: '🎯', name: 'Missions', tone: '#c2410c' },
  { id: 'journal', icon: '📰', name: 'Journal', tone: '#475569' },
  { id: 'build', icon: '🏗️', name: 'Construire', tone: '#b45309' },
  { id: 'map', icon: '🗺️', name: 'Carte', tone: '#0f766e' },
  { id: 'avatar', icon: '👕', name: 'Apparence', tone: '#7c3aed' },
  { id: 'settings', icon: '⚙️', name: 'Réglages', tone: '#334155' },
]

export interface PhonePartner {
  id: string
  icon: string
  name: string
  href: string
  note?: string
}

export function PhoneDevice({
  hour,
  day,
  place,
  wallet,
  partners,
  diag,
  onDiag,
  quality,
  qualities,
  onQuality,
  onOpen,
  onClose,
}: {
  hour: number
  day: number
  place: string
  wallet: string
  partners: PhonePartner[]
  diag: boolean
  onDiag: (on: boolean) => void
  quality: string
  qualities: { id: string; label: string; hint: string }[]
  onQuality: (id: string) => void
  onOpen: (app: PhoneApp) => void
  onClose: () => void
}) {
  const [screen, setScreen] = useState<'home' | 'settings'>('home')
  const time = `${String(hour).padStart(2, '0')}:00`
  const current = qualities.find((q) => q.id === quality)
  return (
    <div className="absolute inset-0 z-40">
      <button
        type="button"
        aria-label="Ranger le téléphone"
        className="absolute inset-0 bg-slate-950/45"
        onClick={onClose}
      />
      <section
        aria-label="Mon téléphone"
        className="absolute inset-x-0 top-[max(12px,env(safe-area-inset-top))] bottom-[calc(88px+env(safe-area-inset-bottom))] mx-auto flex w-[min(360px,calc(100%-24px))] max-h-[760px] flex-col rounded-[44px] bg-[#101214] p-2.5 shadow-2xl ring-1 ring-white/10"
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute -right-1 -top-1 z-10 flex items-center gap-1 rounded-full bg-white px-3 py-1.5 text-xs font-bold text-slate-900 shadow-lg"
        >
          <X size={14} /> Fermer
        </button>
        <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-[36px] bg-gradient-to-b from-[#0f3d33] via-[#145446] to-[#1d6b55] text-white">
          {/* Status bar and camera notch. */}
          <div className="flex shrink-0 items-center justify-between px-6 pb-1 pt-3 text-[11px] font-semibold">
            <span>{time}</span>
            <span className="h-5 w-24 rounded-full bg-black" aria-hidden="true" />
            <span aria-label="Réseau et batterie">4G ▮▮▮</span>
          </div>
          {screen === 'home' ? (
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-6">
              <p className="mt-3 text-5xl font-light tracking-tight">{time}</p>
              <p className="text-xs text-emerald-100">
                Jour {day} · {place}
              </p>
              <p className="mt-1 text-xs text-emerald-100">Solde de jeu : {wallet}</p>
              <div className="mt-6 grid grid-cols-3 gap-x-3 gap-y-5 text-center">
                {APPS.map((app) => (
                  <button
                    key={app.id}
                    type="button"
                    onClick={() => (app.id === 'settings' ? setScreen('settings') : onOpen(app.id))}
                    className="group flex flex-col items-center gap-1.5"
                  >
                    <span
                      className="flex h-14 w-14 items-center justify-center rounded-[18px] text-2xl shadow-md ring-1 ring-white/15 transition group-active:scale-95"
                      style={{ background: app.tone }}
                      aria-hidden="true"
                    >
                      {app.icon}
                    </span>
                    <span className="text-[11px] font-medium">{app.name}</span>
                  </button>
                ))}
              </div>
              {partners.length > 0 && (
                <div className="mt-7 rounded-3xl bg-white/10 p-3">
                  <p className="text-[11px] font-semibold text-emerald-100">
                    Services et partenaires
                  </p>
                  <div className="mt-2 grid grid-cols-3 gap-2 text-center">
                    {partners.map((app) => (
                      <Link
                        key={app.id}
                        href={app.href}
                        className="rounded-2xl bg-white/10 p-2 text-[10px] font-semibold"
                      >
                        <span className="block text-xl">{app.icon}</span>
                        {app.name}
                        {app.note && (
                          <span className="block font-normal opacity-80">{app.note}</span>
                        )}
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-[#f4f6f3] px-4 pb-6 text-slate-900">
              <button
                type="button"
                onClick={() => setScreen('home')}
                className="mt-2 flex items-center gap-1 text-sm font-semibold text-emerald-800"
              >
                <ChevronLeft size={18} /> Accueil
              </button>
              <h2 className="mt-2 text-2xl font-black">Réglages</h2>
              <h3 className="mt-5 text-xs font-bold text-slate-500">Avancé</h3>
              <div className="mt-2 space-y-2 rounded-2xl bg-white p-3 ring-1 ring-slate-200">
                <label className="flex items-center justify-between gap-3 text-sm font-semibold">
                  Diagnostic images/s et réseau
                  <input
                    type="checkbox"
                    checked={diag}
                    onChange={(e) => onDiag(e.target.checked)}
                    className="h-5 w-5"
                  />
                </label>
                <p className="text-[11px] text-slate-500">
                  Pour les développeurs : affiche la fluidité et l’état du réseau sur le jeu.
                </p>
              </div>
              <div className="mt-3 rounded-2xl bg-white p-3 ring-1 ring-slate-200">
                <p className="text-sm font-semibold">Qualité graphique</p>
                {current && <p className="text-[11px] text-slate-500">{current.hint}</p>}
                <div className="mt-2 flex gap-1" role="group" aria-label="Qualité graphique">
                  {qualities.map((q) => (
                    <button
                      type="button"
                      key={q.id}
                      aria-pressed={quality === q.id}
                      onClick={() => onQuality(q.id)}
                      className={`flex-1 rounded-xl px-2 py-2 text-xs font-bold ${
                        quality === q.id
                          ? 'bg-slate-900 text-white'
                          : 'bg-slate-50 text-slate-800 ring-1 ring-slate-200'
                      }`}
                    >
                      {q.label}
                    </button>
                  ))}
                </div>
              </div>
              <p className="mt-4 text-[11px] text-slate-500">
                Les services de ce téléphone utilisent la monnaie du jeu. Aucun paiement réel.
              </p>
            </div>
          )}
          <div className="mx-auto mb-2 mt-1 h-1 w-28 shrink-0 rounded-full bg-white/60" />
        </div>
      </section>
    </div>
  )
}
