'use client'

// [SECURITY FIX - FORGE-001 - Sous-étape C]
// Suppression de l'accès Supabase direct — utilisation de /api/verify/[card_number]
// Les données sensibles (phone, email, id, cotisations, parcelles) ne sont plus exposées.

import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'next/navigation'
import {
  CheckCircle, XCircle, Shield, MapPin, Building2,
  FileText, TrendingUp, PhoneCall, Map, CloudRain,
  ShoppingCart, Coins, QrCode, Timer, User, ArrowLeft,
} from 'lucide-react'
import { Logo } from '@/components/shared/logo'
import { MarketPricesDashboard } from '@/components/verify/market-prices-dashboard'
import { Card3D } from '@/components/verify/card-3d'

/**
 * Public verification page — accessed by scanning the QR code on a member card.
 * 
 * The QR code contains a FIXED URL: /verify/[card_number]
 * This page fetches data via the secure /api/verify route (vue restrictive).
 * 
 * Features:
 * - Identity verification (real-time via API serveur)
 * - Service menu (exploitation accounts, market prices, technician, etc.)
 * - 60-second security timer with auto-expiry
 * - Premium mobile-first agricultural design
 * - Ne jamais exposer phone, email, id interne, cotisations détaillées
 */

interface VerifyResult {
  valid: boolean
  card?: {
    card_number: string
    status: string
    expiry_date: string | null
    created_at: string
  }
  member?: {
    first_name: string
    last_name: string
    photo_url: string | null
    village: string | null
    canton: string | null
    prefecture: string | null
    region: string | null
    status: string
    member_since: string | null
  }
  cooperative?: {
    name: string
    faitiere_name: string | null
  }
  error?: string
}

interface ServiceItem {
  icon: typeof CheckCircle
  title: string
  description: string
  available: boolean
  action?: () => void
  highlight?: boolean
}

/**
 * Normalize a phone number for a wa.me link. Togo numbers are 8 digits;
 * we prefix the country code 228 when no international prefix is present.
 */
function waNumber(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  if (digits.startsWith('228')) return digits
  if (digits.length === 8) return `228${digits}`
  return digits
}

export default function VerifyCardPage() {
  const params = useParams()
  const cardNumber = params.card_number as string
  const [result, setResult] = useState<VerifyResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [showContent, setShowContent] = useState(false)
  const [timeLeft, setTimeLeft] = useState(600)
  const [expired, setExpired] = useState(false)
  const [activeView, setActiveView] = useState<'menu' | 'identity' | 'prices' | 'technicien'>('menu')
  const [contacts, setContacts] = useState<{ role: 'technicien' | 'coordo'; name: string; phone: string; canton?: string | null }[] | null>(null)
  const [contactsLoading, setContactsLoading] = useState(false)

  // Reset ALL state when card_number changes (navigating between cards)
  useEffect(() => {
    setResult(null)
    setLoading(true)
    setShowContent(false)
    setTimeLeft(600)
    setExpired(false)
    setActiveView('menu')
  }, [cardNumber])

  // Prevent browser caching of this page (security: stale card data)
  useEffect(() => {
    const metaCache = document.createElement('meta')
    metaCache.httpEquiv = 'Cache-Control'
    metaCache.content = 'no-store, no-cache, must-revalidate'
    document.head.appendChild(metaCache)

    return () => {
      document.head.removeChild(metaCache)
    }
  }, [])

  // Security timer — 10 minutes (600 seconds)
  useEffect(() => {
    if (loading || !result?.valid) return
    const interval = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(interval)
          setExpired(true)
          return 0
        }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(interval)
  }, [loading, result?.valid])

  // Fetch verification data via secure API route (with AbortController to prevent race conditions)
  useEffect(() => {
    const controller = new AbortController()

    async function verify() {
      try {
        const res = await fetch(`/api/verify/${encodeURIComponent(cardNumber)}`, {
          signal: controller.signal,
        })
        const data = await res.json()

        if (controller.signal.aborted) return

        if (!res.ok || !data.valid) {
          setResult({ valid: false, error: data.error ?? 'Carte non trouvée dans le système' })
        } else {
          setResult(data)
        }
      } catch (e: unknown) {
        if (e instanceof Error && e.name === 'AbortError') return
        if (!controller.signal.aborted) {
          setResult({ valid: false, error: 'Erreur de connexion au serveur' })
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false)
          setTimeout(() => setShowContent(true), 300)
        }
      }
    }
    verify()
    return () => { controller.abort() }
  }, [cardNumber])

  const handleRescan = useCallback(() => {
    // Force redirect to scanner — no simple page reload (security: must physically scan)
    window.location.href = '/scan'
  }, [])

  // Load technician + coordo contacts when the producer opens that view.
  useEffect(() => {
    if (activeView !== 'technicien' || contacts !== null) return
    let cancelled = false
    setContactsLoading(true)
    fetch(`/api/technicien/${encodeURIComponent(cardNumber)}`)
      .then((r) => r.json())
      .then((d: { contacts?: typeof contacts }) => {
        if (!cancelled) setContacts(d.contacts ?? [])
      })
      .catch(() => {
        if (!cancelled) setContacts([])
      })
      .finally(() => {
        if (!cancelled) setContactsLoading(false)
      })
    return () => { cancelled = true }
  }, [activeView, contacts, cardNumber])

  // Loading state
  if (loading) {
    return (
      <div className="vfy-loading">
        <div className="vfy-loading-orb">
          <span className="vfy-ring r1" />
          <span className="vfy-ring r2" />
          <span className="vfy-ring r3" />
          <Shield className="vfy-shield" />
        </div>
        <p className="vfy-loading-text">
          Vérification de la carte
          <span className="vfy-dots"><i>.</i><i>.</i><i>.</i></span>
        </p>
        <p className="vfy-loading-sub">Connexion sécurisée au registre FaîtiereHub</p>

        <style>{`
          .vfy-loading {
            min-height: 100dvh; display: flex; flex-direction: column;
            align-items: center; justify-content: center; gap: 14px; padding: 24px;
            background: radial-gradient(120% 100% at 50% -10%, #0f5130 0%, #0a2616 50%, #04120a 100%);
            font-family: 'Barlow', system-ui, sans-serif;
          }
          .vfy-loading-orb { position: relative; width: 132px; height: 132px; display: grid; place-items: center; transform: translateZ(0); }
          .vfy-ring {
            position: absolute; inset: 0; border-radius: 50%;
            border: 2px solid rgba(77,255,160,.25); animation: vfyPulse 2.4s ease-out infinite;
            will-change: transform, opacity; backface-visibility: hidden;
          }
          .vfy-ring.r2 { animation-delay: .8s; } .vfy-ring.r3 { animation-delay: 1.6s; }
          @keyframes vfyPulse { 0% { transform: scale(.4); opacity: .9; } 100% { transform: scale(1.15); opacity: 0; } }
          .vfy-shield {
            width: 44px; height: 44px; color: #4dffa0;
            filter: drop-shadow(0 0 14px rgba(77,255,160,.6)); animation: vfyFloat 2.6s ease-in-out infinite;
            will-change: transform; transform: translateZ(0);
          }
          @keyframes vfyFloat { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-6px); } }
          .vfy-loading-text { color: #fff; font-weight: 700; font-size: 18px; letter-spacing:.2px; display:inline-flex; }
          .vfy-dots i { animation: vfyBlink 1.4s infinite; opacity: 0; }
          .vfy-dots i:nth-child(2){ animation-delay:.2s } .vfy-dots i:nth-child(3){ animation-delay:.4s }
          @keyframes vfyBlink { 0%,100%{opacity:0} 50%{opacity:1} }
          .vfy-loading-sub { color: #8fc6a4; font-size: 13px; }
          @media (prefers-reduced-motion: reduce){ .vfy-ring,.vfy-shield,.vfy-dots i{ animation: none } }
        `}</style>
      </div>
    )
  }

  const isValid = result?.valid ?? false

  if (!result) return null

  // Expired session
  if (expired) {
    return (
      <div className="min-h-screen bg-[#0A2E1A] flex items-center justify-center px-4">
        <div className="text-center space-y-6 max-w-sm">
          <div className="w-20 h-20 mx-auto rounded-full bg-[#0A5C36]/50 flex items-center justify-center">
            <Timer className="h-10 w-10 text-[#4ADE80]/60" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white">Session expirée</h2>
            <p className="text-white/50 text-sm mt-2">
              Pour votre sécurité, cette session a expiré après 10 minutes.
            </p>
          </div>
          <button
            onClick={handleRescan}
            className="w-full py-4 rounded-2xl bg-gradient-to-r from-[#0A5C36] to-[#0d7a4a] text-white font-semibold text-base flex items-center justify-center gap-3 active:scale-[0.98] transition-transform"
          >
            <QrCode className="h-5 w-5" />
            Rescanner le QR Code
          </button>
          <p className="text-white/30 text-xs">
            Scannez à nouveau le QR code de votre carte pour un nouvel accès.
          </p>
        </div>
      </div>
    )
  }

  // Service menu items
  const services: ServiceItem[] = [
    {
      icon: CheckCircle,
      title: 'Vérification d\'Identité',
      description: 'Voir les détails complets de ma carte',
      available: true,
      action: () => setActiveView('identity'),
    },
    {
      icon: FileText,
      title: 'Mon Compte d\'Exploitation',
      description: 'Fiches techniques par culture',
      available: true,
      action: () => window.open('/marketplace', '_blank'),
    },
    {
      icon: TrendingUp,
      title: 'Prix du Marché en Temps Réel',
      description: 'Cours actuels : Lomé, Kara, Sokodé...',
      available: true,
      action: () => setActiveView('prices'),
    },
    {
      icon: PhoneCall,
      title: 'Contacter Mon Technicien',
      description: 'Technicien de mon canton + Coordonnateur',
      available: true,
      action: () => setActiveView('technicien'),
    },
    {
      icon: Map,
      title: 'Mes Parcelles & GPS',
      description: 'Localisation et suivi de mes parcelles',
      available: false,
    },
    {
      icon: CloudRain,
      title: 'Alertes Météo & Maladies',
      description: 'Prévisions et alertes phytosanitaires',
      available: false,
    },
    {
      icon: ShoppingCart,
      title: 'Commander des Intrants',
      description: 'Semences, engrais, produits phyto',
      available: false,
    },
    {
      icon: Coins,
      title: 'Adhérer / Renouveler ma Cotisation',
      description: 'Gérer ma cotisation',
      available: false,
    },
  ]

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#0A2E1A] via-[#0A3D22] to-[#061a0f] relative overflow-hidden" style={{ isolation: 'isolate' }}>
      <style>{`
        .vfy-hero { animation: vfyHeroIn .55s cubic-bezier(.2,.7,.2,1) both; will-change: transform, opacity; }
        @keyframes vfyHeroIn { from { opacity:0; transform: translateY(16px) scale(.98); } to { opacity:1; transform: translateZ(0); } }
        .vfy-check { animation: vfyPop .5s cubic-bezier(.2,1.4,.4,1) .35s both; will-change: transform; }
        @keyframes vfyPop { 0% { transform: scale(0); } 60% { transform: scale(1.25); } 100% { transform: scale(1) translateZ(0); } }
        .vfy-gpu-layer { transform: translateZ(0); backface-visibility: hidden; -webkit-backface-visibility: hidden; }
        @media (prefers-reduced-motion: reduce){ .vfy-hero,.vfy-check{ animation:none } }
      `}</style>
      {/* Background effects — GPU-isolated to prevent rendering artifacts */}
      <div className="absolute inset-0 pointer-events-none" style={{ transform: 'translateZ(0)', willChange: 'transform' }}>
        <div className="absolute top-[-15%] right-[-15%] w-[400px] h-[400px] rounded-full bg-[#4ADE80]/5 blur-3xl" style={{ transform: 'translateZ(0)', backfaceVisibility: 'hidden' }} />
        <div className="absolute bottom-[-10%] left-[-10%] w-[350px] h-[350px] rounded-full bg-[#0A5C36]/20 blur-3xl" style={{ transform: 'translateZ(0)', backfaceVisibility: 'hidden' }} />
      </div>

      <div className="relative z-10 max-w-md mx-auto px-4 py-6 space-y-5">

        {/* Header */}
        <div className="flex items-center justify-between">
          <Logo size="sm" textClassName="text-white" />
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#4ADE80]/10 border border-[#4ADE80]/20">
            <CheckCircle className="h-3.5 w-3.5 text-[#4ADE80]" />
            <span className="text-[11px] font-semibold text-[#4ADE80] uppercase tracking-wide">Vérifié</span>
          </div>
        </div>

        {/* 3D Membership Card — realistic, tactile, tilts with pointer/device */}
        {result.member && result.card && isValid && activeView === 'menu' && (
          <div className={`transition-all duration-500 ${showContent ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
            <Card3D
              member={result.member}
              card={result.card}
              cooperative={result.cooperative}
            />
          </div>
        )}

        {/* Invalid card state */}
        {!isValid && result.member && (
          <div className="rounded-2xl bg-red-950/30 border border-red-500/20 p-6 text-center">
            <XCircle className="h-12 w-12 text-red-400/60 mx-auto mb-3" />
            <h2 className="text-lg font-bold text-white">
              {result.card?.status === 'expired' ? 'Carte Expirée' : 'Carte Invalide'}
            </h2>
            <p className="text-white/50 text-sm mt-1">
              Contactez votre coopérative pour renouveler votre carte.
            </p>
          </div>
        )}

        {!result.member && (
          <div className="rounded-2xl bg-red-950/30 border border-red-500/20 p-6 text-center">
            <XCircle className="h-12 w-12 text-red-400/60 mx-auto mb-3" />
            <h2 className="text-lg font-bold text-white">Carte Non Trouvée</h2>
            <p className="text-white/50 text-sm mt-1">{result.error}</p>
            <p className="text-white/30 text-xs font-mono mt-2">{decodeURIComponent(cardNumber)}</p>
          </div>
        )}

        {/* Services Menu */}
        {isValid && activeView === 'menu' && (
          <div className={`space-y-3 transition-all duration-700 ${showContent ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'}`} style={{ transitionDelay: '200ms' }}>
            <h3 className="text-white/60 text-xs font-semibold uppercase tracking-wider px-1">
              Mes Services
            </h3>

            {services.map((service, i) => {
              const Icon = service.icon
              return (
                <button
                  key={i}
                  onClick={service.action}
                  className={`w-full rounded-2xl p-4 flex items-center gap-4 text-left transition-all duration-300 active:scale-[0.98] ${
                    service.highlight
                      ? 'bg-gradient-to-r from-yellow-900/30 to-yellow-800/20 border border-yellow-500/20'
                      : service.available
                        ? 'bg-white/[0.04] border border-white/[0.08] hover:bg-white/[0.06]'
                        : 'bg-white/[0.02] border border-white/[0.05]'
                  }`}
                  style={{ animationDelay: `${i * 50}ms` }}
                  disabled={!service.available}
                >
                  {/* Icon */}
                  <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${
                    service.highlight
                      ? 'bg-yellow-500/15'
                      : service.available
                        ? 'bg-[#4ADE80]/10'
                        : 'bg-white/[0.05]'
                  }`}>
                    <Icon className={`h-5 w-5 ${
                      service.highlight
                        ? 'text-yellow-400'
                        : service.available
                          ? 'text-[#4ADE80]'
                          : 'text-white/30'
                    }`} />
                  </div>

                  {/* Text */}
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-semibold ${service.available ? 'text-white' : 'text-white/50'}`}>
                      {service.title}
                    </p>
                    <p className={`text-[11px] mt-0.5 ${service.highlight ? 'text-yellow-400/70' : 'text-white/40'}`}>
                      {service.description}
                    </p>
                  </div>

                  {/* Status badge */}
                  <div className="shrink-0">
                    {service.available ? (
                      <span className="px-2 py-1 rounded-full bg-[#4ADE80]/10 text-[#4ADE80] text-[9px] font-bold uppercase">
                        Actif
                      </span>
                    ) : (
                      <span className="px-2 py-1 rounded-full bg-orange-500/10 text-orange-400 text-[9px] font-bold uppercase">
                        Bientôt
                      </span>
                    )}
                  </div>
                </button>
              )
            })}
          </div>
        )}

        {/* Identity Detail View */}
        {isValid && activeView === 'identity' && result.member && (
          <div className="space-y-4">
            {/* Back button */}
            <button
              onClick={() => setActiveView('menu')}
              className="flex items-center gap-2 text-[#4ADE80] text-sm font-medium active:opacity-70"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M19 12H5M12 19l-7-7 7-7" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Retour au menu
            </button>

            <h3 className="text-white text-lg font-bold">Vérification d&apos;Identité</h3>

            {/* Full identity card */}
            <div className="rounded-2xl bg-white/[0.04] border border-white/[0.08] p-5 space-y-4">
              {/* Photo + status */}
              <div className="flex items-center gap-4">
                <div className="w-20 h-20 rounded-full overflow-hidden border-[3px] border-[#4ADE80]/40">
                  {result.member.photo_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={result.member.photo_url} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full bg-[#4ADE80]/10 flex items-center justify-center">
                      <User className="h-9 w-9 text-[#4ADE80]/60" />
                    </div>
                  )}
                </div>
                <div>
                  <h2 className="text-xl font-bold text-white">
                    {result.member.first_name} <span className="uppercase">{result.member.last_name}</span>
                  </h2>
                  <p className="text-[#4ADE80]/70 text-xs font-mono">{result.card?.card_number}</p>
                  <div className="mt-1.5 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#4ADE80]/10 border border-[#4ADE80]/20">
                    <CheckCircle className="h-3 w-3 text-[#4ADE80]" />
                    <span className="text-[10px] font-bold text-[#4ADE80] uppercase">Membre vérifié</span>
                  </div>
                </div>
              </div>

              {/* Details grid — [SECURITY FIX - FORGE-001] Ne plus exposer phone/email */}
              <div className="grid grid-cols-2 gap-3 pt-2">
                {[
                  { icon: MapPin, label: 'Village', value: result.member.village ?? '—' },
                  { icon: MapPin, label: 'Canton', value: result.member.canton ?? '—' },
                  { icon: MapPin, label: 'Préfecture', value: result.member.prefecture ?? '—' },
                  { icon: MapPin, label: 'Région', value: result.member.region ?? '—' },
                  { icon: Building2, label: 'Coopérative', value: result.cooperative?.name ?? '—' },
                  { icon: Building2, label: 'Faîtière', value: result.cooperative?.faitiere_name ?? '—' },
                ].map((item, i) => (
                  <div key={i} className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.05]">
                    <div className="flex items-center gap-1.5 mb-1">
                      <item.icon className="h-3 w-3 text-[#4ADE80]/60" />
                      <p className="text-[9px] text-white/40 uppercase tracking-wider">{item.label}</p>
                    </div>
                    <p className="text-xs text-white font-medium truncate">{item.value}</p>
                  </div>
                ))}
              </div>

              {/* Validity */}
              <div className="flex items-center justify-between p-3 rounded-xl bg-white/[0.03] border border-white/[0.05]">
                <div>
                  <p className="text-[9px] text-white/40 uppercase">Valide jusqu&apos;au</p>
                  <p className="text-sm text-white font-semibold">
                    {result.card?.expiry_date
                      ? new Date(result.card.expiry_date).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })
                      : '—'}
                  </p>
                </div>
                <div className="px-3 py-1 rounded-full bg-[#4ADE80]/10 text-[#4ADE80] text-xs font-bold">
                  ● ACTIVE
                </div>
              </div>

              {/* Member since */}
              {result.member.member_since && (
                <p className="text-[10px] text-white/30 text-center">
                  Membre depuis {new Date(result.member.member_since).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}
                </p>
              )}
            </div>
          </div>
        )}

        {/* Market Prices Dashboard */}
        {isValid && activeView === 'prices' && (
          <MarketPricesDashboard
            onBack={() => setActiveView('menu')}
            cooperativeName={result.cooperative?.name}
            cardNumber={cardNumber}
            memberLocality={{
              village: result.member?.village ?? null,
              canton: result.member?.canton ?? null,
              prefecture: result.member?.prefecture ?? null,
              region: result.member?.region ?? null,
            }}
          />
        )}

        {isValid && activeView === 'technicien' && (
          <div className="space-y-4">
            <button
              onClick={() => setActiveView('menu')}
              className="flex items-center gap-2 text-white/60 hover:text-white text-sm transition-colors"
            >
              <ArrowLeft className="h-4 w-4" /> Retour
            </button>

            <div className="text-center space-y-1 mb-2">
              <h2 className="text-white text-xl font-bold">Contacter un technicien</h2>
              <p className="text-white/50 text-sm">Appelez le technicien de votre canton ou votre coordonnateur</p>
            </div>

            {contactsLoading && (
              <div className="flex justify-center py-8">
                <div className="h-7 w-7 border-3 border-[#4ADE80]/30 border-t-[#4ADE80] rounded-full animate-spin" />
              </div>
            )}

            {!contactsLoading && contacts && contacts.length === 0 && (
              <div className="rounded-2xl bg-white/5 border border-white/10 p-6 text-center">
                <PhoneCall className="h-8 w-8 text-white/30 mx-auto mb-3" />
                <p className="text-white/70 text-sm">
                  Aucun technicien n&apos;est encore enregistré pour votre canton.
                  Contactez l&apos;administration de votre faîtière.
                </p>
              </div>
            )}

            {!contactsLoading && contacts && contacts.map((c, i) => (
              <div
                key={i}
                className="rounded-2xl bg-gradient-to-br from-[#0A5C36] to-[#0d4a2e] border border-[#4ADE80]/15 p-5 shadow-xl"
              >
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-12 h-12 rounded-full bg-[#4ADE80]/15 flex items-center justify-center shrink-0">
                    <PhoneCall className="h-6 w-6 text-[#4ADE80]" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[11px] uppercase tracking-wide text-[#4ADE80] font-semibold">
                      {c.role === 'coordo' ? 'SE / Coordonnateur' : `Technicien${c.canton ? ` · ${c.canton}` : ''}`}
                    </p>
                    <p className="text-white font-bold truncate">{c.name}</p>
                    <p className="text-white/60 text-sm font-mono">{c.phone}</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <a
                    href={`tel:${c.phone.replace(/\s/g, '')}`}
                    className="flex items-center justify-center gap-2 rounded-xl bg-[#4ADE80] text-[#04140b] font-semibold py-3 active:scale-95 transition-transform"
                  >
                    <PhoneCall className="h-4 w-4" /> Appeler
                  </a>
                  <a
                    href={`https://wa.me/${waNumber(c.phone)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-2 rounded-xl bg-[#25D366] text-white font-semibold py-3 active:scale-95 transition-transform"
                  >
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M.057 24l1.687-6.163a11.867 11.867 0 01-1.587-5.946C.16 5.335 5.495 0 12.05 0a11.82 11.82 0 018.413 3.488 11.82 11.82 0 013.48 8.414c-.003 6.557-5.338 11.892-11.893 11.892a11.9 11.9 0 01-5.688-1.448L.057 24zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884a9.86 9.86 0 001.51 5.26l-.999 3.648 3.978-1.607z"/></svg>
                    WhatsApp
                  </a>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Security Timer */}
        {isValid && (
          <div className={`rounded-2xl bg-white/[0.03] border border-white/[0.06] p-4 space-y-3 transition-all duration-700 ${showContent ? 'opacity-100' : 'opacity-0'}`} style={{ transitionDelay: '600ms' }}>
            {/* Timer bar */}
            <div className="flex items-center gap-3">
              <Timer className={`h-4 w-4 shrink-0 ${timeLeft <= 60 ? 'text-red-400 animate-pulse' : 'text-white/40'}`} />
              <div className="flex-1">
                <div className="h-1.5 rounded-full bg-white/[0.08] overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-1000 ease-linear ${
                      timeLeft <= 60 ? 'bg-red-400' : timeLeft <= 180 ? 'bg-yellow-400' : 'bg-[#4ADE80]'
                    }`}
                    style={{ width: `${(timeLeft / 600) * 100}%` }}
                  />
                </div>
              </div>
              <span className={`text-xs font-mono font-bold min-w-[32px] text-right ${
                timeLeft <= 60 ? 'text-red-400' : 'text-white/50'
              }`}>
                {Math.floor(timeLeft / 60)}:{String(timeLeft % 60).padStart(2, '0')}
              </span>
            </div>

            <p className="text-[10px] text-white/30 text-center leading-relaxed">
              Session active — {Math.floor(timeLeft / 60)} min restantes.
              Après expiration, rescannez votre carte.
            </p>

            <button
              onClick={handleRescan}
              className="w-full py-2.5 rounded-xl bg-white/[0.05] border border-white/[0.08] text-white/50 text-xs font-medium flex items-center justify-center gap-2 active:bg-white/[0.08] transition-colors"
            >
              <QrCode className="h-3.5 w-3.5" />
              Rescanner
            </button>
          </div>
        )}

        {/* Footer — [SECURITY FIX - PHANTOM-001] Indicateurs visuels anti-phishing */}
        <div className="text-center pt-2 pb-4">
          <div className="flex items-center justify-center gap-2 mb-2">
            <Shield className="h-3 w-3 text-[#4ADE80]/40" />
            <p className="text-[10px] text-white/25 uppercase tracking-widest">
              Vérification officielle FENOMAT · www.faitierehub.com
            </p>
          </div>
          <p className="text-white/20 text-[9px] mb-1">
            Ne partagez jamais votre code PIN ou mot de passe sur cette page
          </p>
          <p className="text-white/15 text-[9px]">
            © {new Date().getFullYear()} FaîtiereHub — Plateforme des faîtières agricoles
          </p>
        </div>
      </div>
    </div>
  )
}

// Market Prices Dashboard — imported from components/verify/market-prices-dashboard.tsx
