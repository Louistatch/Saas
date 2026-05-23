'use client'

import { useEffect, useState, useMemo, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createBrowserClient } from '@supabase/ssr'
import {
  CheckCircle, XCircle, Shield, MapPin, Phone, Building2,
  FileText, TrendingUp, PhoneCall, Map, CloudRain,
  ShoppingCart, Coins, QrCode, Timer, User,
} from 'lucide-react'
import { Logo } from '@/components/shared/logo'

/**
 * Public verification page — accessed by scanning the QR code on a member card.
 * 
 * The QR code contains a FIXED URL: /verify/[card_number]
 * This page fetches ALL data in REAL-TIME from the database.
 * 
 * Features:
 * - Identity verification (real-time)
 * - Service menu (exploitation accounts, market prices, technician, etc.)
 * - 60-second security timer with auto-expiry
 * - Premium mobile-first agricultural design
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
    id: string
    first_name: string
    last_name: string
    phone: string | null
    photo_url: string | null
    village: string | null
    canton: string | null
    prefecture: string | null
    region: string | null
    status: string
  }
  cooperative?: {
    name: string
    faitiere_name: string | null
  }
  cotisations?: {
    total: number
    paid: number
    pending: number
    lastPaidDate: string | null
  }
  memberSince?: string
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

export default function VerifyCardPage() {
  const params = useParams()
  const router = useRouter()
  const cardNumber = params.card_number as string
  const supabase = useMemo(() => createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  ), [])
  const [result, setResult] = useState<VerifyResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [showContent, setShowContent] = useState(false)
  const [timeLeft, setTimeLeft] = useState(60)
  const [expired, setExpired] = useState(false)
  const [activeView, setActiveView] = useState<'menu' | 'identity'>('menu')

  // Security timer — 60 seconds
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

  // Fetch verification data
  useEffect(() => {
    if (result) return
    let cancelled = false

    async function verify() {
      const decodedCardNumber = decodeURIComponent(cardNumber)

      const { data: card, error } = await supabase
        .from('member_cards')
        .select(`
          card_number, status, expiry_date, created_at,
          member:members(id, first_name, last_name, phone, photo_url, village, canton, prefecture, region, status, created_at),
          cooperative:cooperatives(name, faitiere_name)
        `)
        .eq('card_number', decodedCardNumber)
        .single()

      if (error || !card) {
        if (!cancelled) {
          setResult({ valid: false, error: 'Carte non trouvée dans le système' })
          setLoading(false)
        }
        return
      }

      const isExpired = card.expiry_date && new Date(card.expiry_date) < new Date()
      const isActive = card.status === 'active' && !isExpired

      // Fetch cotisations
      const memberId = (card.member as any)?.id
      let cotisations = { total: 0, paid: 0, pending: 0, lastPaidDate: null as string | null }

      if (memberId) {
        const { data: cotData } = await supabase
          .from('cotisations')
          .select('status, paid_date, amount')
          .eq('member_id', memberId)

        if (cotData && cotData.length > 0) {
          cotisations.total = cotData.length
          cotisations.paid = cotData.filter(c => c.status === 'paid').length
          cotisations.pending = cotData.filter(c => c.status === 'pending').length
          const lastPaid = cotData
            .filter(c => c.status === 'paid' && c.paid_date)
            .sort((a, b) => new Date(b.paid_date!).getTime() - new Date(a.paid_date!).getTime())[0]
          cotisations.lastPaidDate = lastPaid?.paid_date ?? null
        }
      }

      if (!cancelled) {
        setResult({
          valid: isActive,
          card: {
            card_number: card.card_number,
            status: isActive ? 'active' : (isExpired ? 'expired' : card.status),
            expiry_date: card.expiry_date,
            created_at: card.created_at,
          },
          member: card.member as any,
          cooperative: card.cooperative as any,
          cotisations,
          memberSince: (card.member as any)?.created_at,
        })
        setLoading(false)
        setTimeout(() => setShowContent(true), 300)
      }
    }
    verify()
    return () => { cancelled = true }
  }, [cardNumber]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleRescan = useCallback(() => {
    setExpired(false)
    setTimeLeft(60)
    setResult(null)
    setLoading(true)
    setShowContent(false)
    router.refresh()
    window.location.reload()
  }, [router])

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen bg-[#0A2E1A] flex items-center justify-center">
        <div className="text-center space-y-6">
          <div className="relative">
            <div className="w-20 h-20 border-4 border-[#4ADE80]/30 border-t-[#4ADE80] rounded-full animate-spin mx-auto" />
            <Shield className="h-8 w-8 text-[#4ADE80] absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
          </div>
          <p className="text-white/60 text-sm animate-pulse">Vérification en cours...</p>
        </div>
      </div>
    )
  }

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
              Pour votre sécurité, cette session a expiré après 60 secondes.
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

  const isValid = result.valid
  const cotisationAJour = result.cotisations && result.cotisations.pending === 0 && result.cotisations.paid > 0

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
      available: false,
    },
    {
      icon: PhoneCall,
      title: 'Contacter Mon Technicien',
      description: 'Appeler le technicien de la faîtière',
      available: false,
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
      description: cotisationAJour ? 'Cotisation à jour ✓' : 'Cotisation en attente — Régulariser',
      available: false,
      highlight: !cotisationAJour,
    },
  ]

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#0A2E1A] via-[#0A3D22] to-[#061a0f] relative overflow-hidden">
      {/* Background effects */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-[-15%] right-[-15%] w-[400px] h-[400px] rounded-full bg-[#4ADE80]/5 blur-3xl" />
        <div className="absolute bottom-[-10%] left-[-10%] w-[350px] h-[350px] rounded-full bg-[#0A5C36]/20 blur-3xl" />
      </div>

      <div className="relative z-10 max-w-md mx-auto px-4 py-6 space-y-5">

        {/* Header */}
        <div className="flex items-center justify-between">
          <Logo size="sm" textClassName="text-white" />
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#4ADE80]/10 border border-[#4ADE80]/20">
            <CheckCircle className="h-3.5 w-3.5 text-[#4ADE80]" />
            <span className="text-[11px] font-semibold text-[#4ADE80] uppercase tracking-wide">Verified</span>
          </div>
        </div>

        {/* Member Card Header */}
        {result.member && isValid && (
          <div className={`rounded-2xl bg-gradient-to-br from-[#0A5C36] to-[#0d4a2e] border border-[#4ADE80]/15 p-5 shadow-xl transition-all duration-500 ${showContent ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
            <div className="flex items-center gap-4">
              {/* Photo */}
              <div className="relative shrink-0">
                <div className="w-[72px] h-[72px] rounded-full overflow-hidden border-[3px] border-[#4ADE80]/40 shadow-lg">
                  {result.member.photo_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={result.member.photo_url} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full bg-[#4ADE80]/10 flex items-center justify-center">
                      <User className="h-8 w-8 text-[#4ADE80]/60" />
                    </div>
                  )}
                </div>
                <div className="absolute -bottom-1 -right-1 w-6 h-6 bg-[#4ADE80] rounded-full flex items-center justify-center shadow-md">
                  <CheckCircle className="h-3.5 w-3.5 text-white" />
                </div>
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <h1 className="text-lg font-bold text-white leading-tight">
                  {result.member.first_name} <span className="uppercase">{result.member.last_name}</span>
                </h1>
                <p className="text-[#4ADE80]/70 text-xs font-mono mt-0.5">
                  ID: {result.card?.card_number}
                </p>
                <div className="flex items-center gap-1.5 mt-1.5">
                  <Building2 className="h-3 w-3 text-white/40" />
                  <p className="text-white/50 text-[11px] truncate">
                    {result.cooperative?.name}
                  </p>
                </div>
                {result.member.prefecture && (
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <MapPin className="h-3 w-3 text-white/40" />
                    <p className="text-white/40 text-[11px] truncate">
                      {[result.member.canton, result.member.prefecture].filter(Boolean).join(', ')}
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Quick stats */}
            <div className="grid grid-cols-3 gap-2 mt-4 pt-4 border-t border-white/[0.06]">
              <div className="text-center">
                <p className="text-sm font-bold text-[#4ADE80]">{result.cotisations?.paid ?? 0}</p>
                <p className="text-[9px] text-white/40 uppercase">Cotisations</p>
              </div>
              <div className="text-center">
                <p className="text-sm font-bold text-white">
                  {result.memberSince ? new Date(result.memberSince).getFullYear() : '—'}
                </p>
                <p className="text-[9px] text-white/40 uppercase">Membre depuis</p>
              </div>
              <div className="text-center">
                <p className={`text-sm font-bold ${isValid ? 'text-[#4ADE80]' : 'text-red-400'}`}>
                  {isValid ? '● Active' : '● Inactive'}
                </p>
                <p className="text-[9px] text-white/40 uppercase">Carte</p>
              </div>
            </div>
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

              {/* Details grid */}
              <div className="grid grid-cols-2 gap-3 pt-2">
                {[
                  { icon: MapPin, label: 'Village', value: result.member.village ?? '—' },
                  { icon: MapPin, label: 'Canton', value: result.member.canton ?? '—' },
                  { icon: MapPin, label: 'Préfecture', value: result.member.prefecture ?? '—' },
                  { icon: MapPin, label: 'Région', value: result.member.region ?? '—' },
                  { icon: Phone, label: 'Téléphone', value: result.member.phone ?? '—' },
                  { icon: Building2, label: 'Coopérative', value: result.cooperative?.name ?? '—' },
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

              {/* Cotisations */}
              {result.cotisations && (
                <div className="pt-3 border-t border-white/[0.06]">
                  <div className="flex items-center gap-2 mb-3">
                    <Coins className="h-4 w-4 text-[#4ADE80]" />
                    <p className="text-xs text-white/60 font-semibold uppercase tracking-wider">Cotisations</p>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="text-center p-2 rounded-lg bg-white/[0.03]">
                      <p className="text-lg font-bold text-[#4ADE80]">{result.cotisations.paid}</p>
                      <p className="text-[9px] text-white/40">Payées</p>
                    </div>
                    <div className="text-center p-2 rounded-lg bg-white/[0.03]">
                      <p className="text-lg font-bold text-yellow-400">{result.cotisations.pending}</p>
                      <p className="text-[9px] text-white/40">En attente</p>
                    </div>
                    <div className="text-center p-2 rounded-lg bg-white/[0.03]">
                      <p className="text-lg font-bold text-white/60">{result.cotisations.total}</p>
                      <p className="text-[9px] text-white/40">Total</p>
                    </div>
                  </div>
                  {result.cotisations.lastPaidDate && (
                    <p className="text-[10px] text-white/30 mt-2 text-center">
                      Dernière : {new Date(result.cotisations.lastPaidDate).toLocaleDateString('fr-FR')}
                    </p>
                  )}
                </div>
              )}

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
              {result.memberSince && (
                <p className="text-[10px] text-white/30 text-center">
                  Membre depuis {new Date(result.memberSince).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}
                </p>
              )}
            </div>
          </div>
        )}

        {/* Security Timer */}
        {isValid && (
          <div className={`rounded-2xl bg-white/[0.03] border border-white/[0.06] p-4 space-y-3 transition-all duration-700 ${showContent ? 'opacity-100' : 'opacity-0'}`} style={{ transitionDelay: '600ms' }}>
            {/* Timer bar */}
            <div className="flex items-center gap-3">
              <Timer className={`h-4 w-4 shrink-0 ${timeLeft <= 15 ? 'text-red-400 animate-pulse' : 'text-white/40'}`} />
              <div className="flex-1">
                <div className="h-1.5 rounded-full bg-white/[0.08] overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-1000 ease-linear ${
                      timeLeft <= 15 ? 'bg-red-400' : timeLeft <= 30 ? 'bg-yellow-400' : 'bg-[#4ADE80]'
                    }`}
                    style={{ width: `${(timeLeft / 60) * 100}%` }}
                  />
                </div>
              </div>
              <span className={`text-xs font-mono font-bold min-w-[32px] text-right ${
                timeLeft <= 15 ? 'text-red-400' : 'text-white/50'
              }`}>
                {timeLeft}s
              </span>
            </div>

            <p className="text-[10px] text-white/30 text-center leading-relaxed">
              Cette session expire dans {timeLeft} secondes pour votre sécurité.
              Rescannez le QR code pour un nouvel accès.
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

        {/* Footer */}
        <div className="text-center pt-2 pb-4">
          <div className="flex items-center justify-center gap-2 mb-2">
            <Shield className="h-3 w-3 text-[#4ADE80]/40" />
            <p className="text-[10px] text-white/25 uppercase tracking-widest">
              Sécurisé • Vérifié • FaîtiereHub
            </p>
          </div>
          <p className="text-white/15 text-[9px]">
            © {new Date().getFullYear()} FaîtiereHub — Plateforme des faîtières agricoles
          </p>
        </div>
      </div>
    </div>
  )
}
