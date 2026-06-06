'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import {
  CheckCircle, XCircle, Shield, MapPin, Building2,
  FileText, TrendingUp, PhoneCall, Map, CloudRain,
  ShoppingCart, Coins, Timer, User, ArrowLeft, Bot,
  Bell, Droplets,
} from 'lucide-react'
import { Logo } from '@/components/shared/logo'
import { MarketPricesDashboard } from '@/components/verify/market-prices-dashboard'
import { Card3D } from '@/components/verify/card-3d'
import { AiChat } from '@/components/verify/ai-chat'
import { AgriSmartWater } from '@/components/verify/agrismart-water'
import { ParcellesInlineView } from '@/components/verify/parcelles-inline-view'
import { IntrantsInlineView } from '@/components/verify/intrants-inline-view'
import { CotisationView } from '@/components/verify/cotisation-view'
import { ExploitationInlineView } from '@/components/verify/exploitation-inline-view'
import { OuvrierView } from '@/components/verify/ouvrier-view'
import { AcheteurView } from '@/components/verify/acheteur-view'
import { AgronomeView } from '@/components/verify/agronome-view'
import { memberFullName, memberLocality as getMemberLocality, waNumber } from '@/components/verify/types'
import { AtsBadge, type AtsBreakdown } from '@/components/shared/ats-badge'

interface VerifyResult {
  valid: boolean
  card_type?: 'FAITIERE' | 'OUVRIER' | 'ACHETEUR' | 'AGRONOME'
  source?: 'faitierehub' | 'haroo'
  card?: { card_number: string; status: string; expiry_date: string | null; created_at: string }
  member?: {
    first_name: string | null; last_name: string | null; photo_url: string | null
    village: string | null; canton: string | null; prefecture: string | null; region: string | null
    status: string; member_since: string | null
  }
  cooperative?: { name: string; faitiere_name: string | null }
  member_id?: string | null
  ouvrier?: {
    first_name: string | null; last_name: string | null; phone: string | null; photo_url: string | null
    competences: string[]; cantons_disponibles: string[]; disponible: boolean
    disponible_jusqu_au: string | null; tarif_journalier: number | null
    note_moyenne: number; nombre_avis: number
  }
  offres?: Array<{
    id: string; titre: string; culture: string | null; description: string | null
    canton: string; date_debut: string | null; date_fin: string | null
    tarif_journalier: number | null; nombre_ouvriers: number
  }>
  acheteur?: {
    first_name: string | null; last_name: string | null; phone: string | null; photo_url: string | null
    type_acheteur: string; nom_organisation: string | null
    produits_interesses: string[]; cantons_intervention: string[]
  }
  preventes?: Array<{
    id: string; culture: string; quantite_estimee: number; prix_par_kg: number
    date_recolte_prevue: string; canton: string; description: string | null
  }>
  agronome?: {
    first_name: string | null; last_name: string | null; phone: string | null; photo_url: string | null
    specialisations: string[]; canton: string | null; prefecture: string | null; region: string | null
    badge_valide: boolean; statut_validation: string; disponible_missions: boolean
    note_moyenne: number; nombre_missions: number
  }
  missions?: Array<{
    id: string; titre: string; culture: string | null; description: string | null
    canton: string; budget: number | null; date_souhaitee: string | null
  }>
  error?: string
}

interface ServiceItem {
  icon: typeof CheckCircle; title: string; description: string
  available: boolean; action?: () => void; highlight?: boolean; gradient: string
}

export default function VerifyCardPage() {
  const params = useParams()
  const cardNumber = params.card_number as string
  const [result, setResult] = useState<VerifyResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [showContent, setShowContent] = useState(false)
  const [timeLeft, setTimeLeft] = useState(600)
  const [expired, setExpired] = useState(false)
  const [activeView, setActiveView] = useState<'menu' | 'identity' | 'prices' | 'technicien' | 'ai' | 'agrismart' | 'parcelles' | 'intrants' | 'cotisation' | 'exploitation'>('menu')
  const [contacts, setContacts] = useState<{ role: 'technicien' | 'coordo'; name: string; phone: string; canton?: string | null }[] | null>(null)
  const [contactsLoading, setContactsLoading] = useState(false)
  const [atsData, setAtsData] = useState<{ score: number; level: string; breakdown: AtsBreakdown } | null>(null)

  useEffect(() => {
    setResult(null); setLoading(true); setShowContent(false)
    setTimeLeft(600); setExpired(false); setActiveView('menu'); setAtsData(null)
  }, [cardNumber])

  useEffect(() => {
    const meta = document.createElement('meta')
    meta.httpEquiv = 'Cache-Control'
    meta.content = 'no-store, no-cache, must-revalidate'
    document.head.appendChild(meta)
    return () => { document.head.removeChild(meta) }
  }, [])

  useEffect(() => {
    async function fetchCard() {
      try {
        const res = await fetch(`/api/verify/${encodeURIComponent(cardNumber)}`)
        const data: VerifyResult = await res.json()
        setResult(data)
        // Fetch ATS in background if card is valid and we have a member_id
        if (data.valid && data.member_id) {
          fetch(`/api/members/${data.member_id}/ats`)
            .then(r => r.ok ? r.json() : null)
            .then(ats => {
              if (ats && typeof ats.score === 'number') {
                setAtsData({ score: ats.score, level: ats.level, breakdown: ats.breakdown })
              }
            })
            .catch(() => null)
        }
      } catch { setResult({ valid: false, error: 'Erreur réseau.' }) }
      finally { setLoading(false); setTimeout(() => setShowContent(true), 120) }
    }
    fetchCard()
  }, [cardNumber])

  useEffect(() => {
    if (!result?.valid || expired) return
    const timer = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) { setExpired(true); clearInterval(timer); return 0 }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(timer)
  }, [result?.valid, expired])

  const loadContacts = useCallback(async () => {
    if (contacts || contactsLoading) return
    setContactsLoading(true)
    try {
      const res = await fetch(`/api/technicien/${encodeURIComponent(cardNumber)}`)
      if (res.ok) { const d = await res.json(); setContacts(d.contacts ?? []) }
      else setContacts([])
    } catch { setContacts([]) }
    finally { setContactsLoading(false) }
  }, [cardNumber, contacts, contactsLoading])

  useEffect(() => {
    if (activeView === 'technicien') loadContacts()
  }, [activeView, loadContacts])

  if (loading) {
    return (
      <div className="min-h-screen vfp-bg flex items-center justify-center">
        <style>{vfpStyles}</style>
        <div className="text-center">
          <div className="vfp-loader mx-auto mb-4" />
          <p className="text-[var(--vfp-accent-dim)] text-sm font-medium tracking-wide">Vérification en cours...</p>
        </div>
      </div>
    )
  }

  if (expired) {
    return (
      <div className="min-h-screen vfp-bg flex items-center justify-center px-6">
        <style>{vfpStyles}</style>
        <div className="text-center max-w-xs">
          <div className="w-16 h-16 rounded-2xl bg-destructive/10 border border-destructive/20 flex items-center justify-center mx-auto mb-4">
            <Timer className="h-7 w-7 text-destructive" />
          </div>
          <h2 className="text-xl font-bold text-white mb-2">Session expirée</h2>
          <p className="text-white/50 text-sm mb-6">Scannez à nouveau la carte pour accéder aux services.</p>
          <a href={`/verify/${cardNumber}`} className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-[var(--vfp-cta)] text-[var(--vfp-cta-fg)] font-bold text-sm">
            Rescanner la carte
          </a>
        </div>
      </div>
    )
  }

  if (!result) return null

  const cardType = result.card_type ?? 'FAITIERE'

  // ── Non-FAITIERE card types: delegate to their own view component ────────
  if (result.valid && result.card && cardType === 'OUVRIER' && result.ouvrier) {
    return (
      <div className="min-h-screen vfp-bg relative overflow-hidden" style={{ isolation: 'isolate' }}>
        <style>{vfpStyles}</style>
        <div className="absolute inset-0 pointer-events-none" style={{ transform: 'translateZ(0)', zIndex: 0 }}>
          <div className="absolute top-[-20%] right-[-15%] w-[500px] h-[500px] rounded-full" style={{ background: 'oklch(0.75 0.20 50 / 0.08)', filter: 'blur(100px)' }} />
          <div className="absolute bottom-[-15%] left-[-10%] w-[400px] h-[400px] rounded-full" style={{ background: 'oklch(0.75 0.20 50 / 0.12)', filter: 'blur(80px)' }} />
        </div>
        <div className="relative z-10 max-w-md mx-auto px-4 pt-4 pb-8 space-y-5">
          <header className="flex items-center justify-between vfp-enter">
            <div className="flex items-center gap-3">
              <Link href="/" className="w-10 h-10 rounded-xl vfp-glass-subtle flex items-center justify-center" aria-label="Accueil">
                <svg width="18" height="14" viewBox="0 0 18 14" fill="none"><path d="M1 1h16M1 7h10M1 13h14" stroke="oklch(0.75 0.20 50)" strokeWidth="1.6" strokeLinecap="round"/></svg>
              </Link>
              <Link href="/"><Logo size="sm" textClassName="text-white" /></Link>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-10 h-10 rounded-xl vfp-glass-subtle flex items-center justify-center"><Bell className="h-4 w-4 text-white/60" /></div>
              <div className="w-10 h-10 rounded-full vfp-glass-subtle flex items-center justify-center border-2" style={{ borderColor: 'oklch(0.75 0.20 50 / 0.30)' }}>
                {result.ouvrier.photo_url
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={result.ouvrier.photo_url} alt="" className="w-full h-full rounded-full object-cover" />
                  : <User className="h-4 w-4 text-white/60" />}
              </div>
            </div>
          </header>
          <OuvrierView
            cardNumber={cardNumber}
            ouvrier={result.ouvrier}
            offres={result.offres ?? []}
            card={result.card}
          />
          <div className={`vfp-card rounded-2xl p-3 transition-all duration-700 ${showContent ? 'opacity-100' : 'opacity-0'}`} style={{ transitionDelay: '600ms' }}>
            <div className="flex items-center gap-3">
              <Timer className="h-4 w-4 text-white/30 shrink-0" />
              <div className="flex-1">
                <div className="h-1 rounded-full bg-white/[0.06] overflow-hidden">
                  <div className="h-full rounded-full transition-all duration-1000" style={{ width: `${(timeLeft / 600) * 100}%`, background: 'linear-gradient(to right, oklch(0.75 0.20 50), oklch(0.60 0.16 50))' }} />
                </div>
              </div>
              <span className="text-white/30 text-[11px] font-mono shrink-0">{Math.floor(timeLeft / 60)}:{(timeLeft % 60).toString().padStart(2, '0')}</span>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (result.valid && result.card && cardType === 'ACHETEUR' && result.acheteur) {
    return (
      <div className="min-h-screen vfp-bg relative overflow-hidden" style={{ isolation: 'isolate' }}>
        <style>{vfpStyles}</style>
        <div className="absolute inset-0 pointer-events-none" style={{ transform: 'translateZ(0)', zIndex: 0 }}>
          <div className="absolute top-[-20%] right-[-15%] w-[500px] h-[500px] rounded-full" style={{ background: 'oklch(0.72 0.18 280 / 0.08)', filter: 'blur(100px)' }} />
          <div className="absolute bottom-[-15%] left-[-10%] w-[400px] h-[400px] rounded-full" style={{ background: 'oklch(0.72 0.18 280 / 0.12)', filter: 'blur(80px)' }} />
        </div>
        <div className="relative z-10 max-w-md mx-auto px-4 pt-4 pb-8 space-y-5">
          <header className="flex items-center justify-between vfp-enter">
            <div className="flex items-center gap-3">
              <Link href="/" className="w-10 h-10 rounded-xl vfp-glass-subtle flex items-center justify-center" aria-label="Accueil">
                <svg width="18" height="14" viewBox="0 0 18 14" fill="none"><path d="M1 1h16M1 7h10M1 13h14" stroke="oklch(0.72 0.18 280)" strokeWidth="1.6" strokeLinecap="round"/></svg>
              </Link>
              <Link href="/"><Logo size="sm" textClassName="text-white" /></Link>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-10 h-10 rounded-xl vfp-glass-subtle flex items-center justify-center"><Bell className="h-4 w-4 text-white/60" /></div>
              <div className="w-10 h-10 rounded-full vfp-glass-subtle flex items-center justify-center border-2" style={{ borderColor: 'oklch(0.72 0.18 280 / 0.30)' }}>
                {result.acheteur.photo_url
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={result.acheteur.photo_url} alt="" className="w-full h-full rounded-full object-cover" />
                  : <User className="h-4 w-4 text-white/60" />}
              </div>
            </div>
          </header>
          <AcheteurView
            cardNumber={cardNumber}
            acheteur={result.acheteur}
            preventes={result.preventes ?? []}
            card={result.card}
          />
          <div className={`vfp-card rounded-2xl p-3 transition-all duration-700 ${showContent ? 'opacity-100' : 'opacity-0'}`} style={{ transitionDelay: '600ms' }}>
            <div className="flex items-center gap-3">
              <Timer className="h-4 w-4 text-white/30 shrink-0" />
              <div className="flex-1">
                <div className="h-1 rounded-full bg-white/[0.06] overflow-hidden">
                  <div className="h-full rounded-full transition-all duration-1000" style={{ width: `${(timeLeft / 600) * 100}%`, background: 'linear-gradient(to right, oklch(0.72 0.18 280), oklch(0.58 0.14 280))' }} />
                </div>
              </div>
              <span className="text-white/30 text-[11px] font-mono shrink-0">{Math.floor(timeLeft / 60)}:{(timeLeft % 60).toString().padStart(2, '0')}</span>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (result.valid && result.card && cardType === 'AGRONOME' && result.agronome) {
    return (
      <div className="min-h-screen vfp-bg relative overflow-hidden" style={{ isolation: 'isolate' }}>
        <style>{vfpStyles}</style>
        <div className="absolute inset-0 pointer-events-none" style={{ transform: 'translateZ(0)', zIndex: 0 }}>
          <div className="absolute top-[-20%] right-[-15%] w-[500px] h-[500px] rounded-full" style={{ background: 'oklch(0.72 0.18 230 / 0.08)', filter: 'blur(100px)' }} />
          <div className="absolute bottom-[-15%] left-[-10%] w-[400px] h-[400px] rounded-full" style={{ background: 'oklch(0.72 0.18 230 / 0.12)', filter: 'blur(80px)' }} />
        </div>
        <div className="relative z-10 max-w-md mx-auto px-4 pt-4 pb-8 space-y-5">
          <header className="flex items-center justify-between vfp-enter">
            <div className="flex items-center gap-3">
              <Link href="/" className="w-10 h-10 rounded-xl vfp-glass-subtle flex items-center justify-center" aria-label="Accueil">
                <svg width="18" height="14" viewBox="0 0 18 14" fill="none"><path d="M1 1h16M1 7h10M1 13h14" stroke="oklch(0.72 0.18 230)" strokeWidth="1.6" strokeLinecap="round"/></svg>
              </Link>
              <Link href="/"><Logo size="sm" textClassName="text-white" /></Link>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-10 h-10 rounded-xl vfp-glass-subtle flex items-center justify-center"><Bell className="h-4 w-4 text-white/60" /></div>
              <div className="w-10 h-10 rounded-full vfp-glass-subtle flex items-center justify-center border-2" style={{ borderColor: 'oklch(0.72 0.18 230 / 0.30)' }}>
                {result.agronome.photo_url
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={result.agronome.photo_url} alt="" className="w-full h-full rounded-full object-cover" />
                  : <User className="h-4 w-4 text-white/60" />}
              </div>
            </div>
          </header>
          <AgronomeView
            cardNumber={cardNumber}
            agronome={result.agronome}
            missions={result.missions ?? []}
            card={result.card}
          />
          <div className={`vfp-card rounded-2xl p-3 transition-all duration-700 ${showContent ? 'opacity-100' : 'opacity-0'}`} style={{ transitionDelay: '600ms' }}>
            <div className="flex items-center gap-3">
              <Timer className="h-4 w-4 text-white/30 shrink-0" />
              <div className="flex-1">
                <div className="h-1 rounded-full bg-white/[0.06] overflow-hidden">
                  <div className="h-full rounded-full transition-all duration-1000" style={{ width: `${(timeLeft / 600) * 100}%`, background: 'linear-gradient(to right, oklch(0.72 0.18 230), oklch(0.58 0.14 230))' }} />
                </div>
              </div>
              <span className="text-white/30 text-[11px] font-mono shrink-0">{Math.floor(timeLeft / 60)}:{(timeLeft % 60).toString().padStart(2, '0')}</span>
            </div>
          </div>
        </div>
      </div>
    )
  }

  const isValid = result.valid && result.card?.status === 'active'
  const fullName = memberFullName(result.member as Parameters<typeof memberFullName>[0])
  const rawFirst = (result.member?.first_name ?? '').trim()
  const firstName = rawFirst ? rawFirst.charAt(0).toUpperCase() + rawFirst.slice(1).toLowerCase() : fullName?.split(' ')[0] || 'Producteur'
  const greetHour = new Date().getHours()
  const greeting = greetHour < 12 ? 'Bonjour' : greetHour < 18 ? 'Bon après-midi' : 'Bonsoir'

  const services: ServiceItem[] = [
    { icon: Shield, title: 'Vérification', description: 'Détails de ma carte', available: true, action: () => setActiveView('identity'), gradient: 'from-[var(--vfp-accent)]/20 to-[var(--vfp-accent)]/5' },
    { icon: FileText, title: 'Mon Exploitation', description: 'Fiches techniques', available: true, action: () => setActiveView('exploitation'), gradient: 'from-cyan-500/20 to-cyan-700/5' },
    { icon: TrendingUp, title: 'Prix du Marché', description: 'Cours en temps réel', available: true, action: () => setActiveView('prices'), gradient: 'from-violet-500/20 to-violet-700/5' },
    { icon: Bot, title: 'Assistant IA', description: 'Conseils & prévisions', available: true, highlight: true, action: () => setActiveView('ai'), gradient: 'from-amber-400/20 to-amber-600/5' },
    { icon: PhoneCall, title: 'Mon Technicien', description: 'Appel & WhatsApp', available: true, action: () => setActiveView('technicien'), gradient: 'from-teal-500/20 to-teal-700/5' },
    { icon: Droplets, title: 'AgriSmart', description: 'Besoins en eau', available: true, action: () => setActiveView('agrismart'), gradient: 'from-blue-400/20 to-cyan-600/5' },
    { icon: Map, title: 'Parcelles GPS', description: 'Mes parcelles agricoles', available: true, action: () => setActiveView('parcelles'), gradient: 'from-emerald-500/20 to-emerald-700/5' },
    { icon: FileText, title: 'Mon Attestation', description: 'Télécharger PDF officiel', available: true, action: () => result.member_id && window.open(`/reports/attestation/${result.member_id}`, '_blank'), gradient: 'from-violet-500/20 to-violet-700/5' },
    { icon: ShoppingCart, title: 'Intrants', description: 'Semences & engrais', available: true, action: () => setActiveView('intrants'), gradient: 'from-orange-500/20 to-orange-700/5' },
    { icon: Coins, title: 'Cotisation', description: 'Statut & campagne', available: true, action: () => setActiveView('cotisation'), gradient: 'from-yellow-500/20 to-yellow-700/5' },
  ]

  return (
    <div className="min-h-screen vfp-bg relative overflow-hidden" style={{ isolation: 'isolate' }}>
      <style>{vfpStyles}</style>

      {/* Ambient glow */}
      <div className="absolute inset-0 pointer-events-none" style={{ transform: 'translateZ(0)', zIndex: 0 }}>
        <div className="absolute top-[-20%] right-[-15%] w-[500px] h-[500px] rounded-full bg-[var(--vfp-accent)]/[0.08] blur-[100px]" />
        <div className="absolute bottom-[-15%] left-[-10%] w-[400px] h-[400px] rounded-full bg-[var(--vfp-accent)]/[0.12] blur-[80px]" />
      </div>

      <div className="relative z-10 max-w-md mx-auto px-4 pt-4 pb-8 space-y-5">

        {/* ─── Premium Header ─── */}
        <header className="flex items-center justify-between vfp-enter">
          <div className="flex items-center gap-3">
            <Link href="/" className="w-10 h-10 rounded-xl vfp-glass-subtle flex items-center justify-center" aria-label="Accueil">
              <svg width="18" height="14" viewBox="0 0 18 14" fill="none"><path d="M1 1h16M1 7h10M1 13h14" stroke="var(--vfp-accent)" strokeWidth="1.6" strokeLinecap="round"/></svg>
            </Link>
            <Link href="/">
              <Logo size="sm" textClassName="text-white" />
            </Link>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-xl vfp-glass-subtle flex items-center justify-center relative">
              <Bell className="h-4.5 w-4.5 text-white/60" />
            </div>
            <div className="w-10 h-10 rounded-full vfp-glass-subtle flex items-center justify-center border-2 border-[var(--vfp-accent)]/30">
              {result.member?.photo_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={result.member.photo_url} alt="" className="w-full h-full rounded-full object-cover" />
              ) : (
                <User className="h-4.5 w-4.5 text-white/60" />
              )}
            </div>
          </div>
        </header>

        {/* ─── Hero Section ─── */}
        {isValid && activeView === 'menu' && (
          <section className={`vfp-enter transition-all duration-700 ${showContent ? 'opacity-100' : 'opacity-0'}`} style={{ transitionDelay: '100ms' }}>
            <div className="flex items-start justify-between">
              <div>
                <p className="text-white/60 text-sm mb-1">{greeting}, {firstName} ! 👋</p>
                <h1 className="text-[26px] font-bold text-white leading-tight">
                  Votre espace,<br/>
                  <span className="text-transparent bg-clip-text bg-gradient-to-r from-[var(--vfp-accent)] to-[var(--vfp-accent-dim)]">votre succès.</span>
                </h1>
                <p className="text-white/40 text-sm mt-2">Gérez, développez et prospérez avec FaîtiereHub.</p>
                {atsData && (
                  <div className="mt-3 max-w-[200px]">
                    <AtsBadge score={atsData.score} level={atsData.level} size="sm" />
                  </div>
                )}
              </div>
              <div className="vfp-glass-subtle rounded-2xl px-4 py-3 text-center shrink-0">
                <div className="w-10 h-10 rounded-full bg-[var(--vfp-accent)]/15 flex items-center justify-center mx-auto mb-1.5">
                  <CheckCircle className="h-5 w-5 text-[var(--vfp-accent)] vfp-pop" />
                </div>
                <p className="text-white text-sm font-semibold">Compte vérifié</p>
                <div className="flex items-center gap-1 justify-center mt-0.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-[var(--vfp-accent)] animate-pulse" />
                  <span className="text-[var(--vfp-accent-dim)] text-xs">Membre actif</span>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* ─── 3D Member Card ─── */}
        {result.member && result.card && isValid && activeView === 'menu' && (
          <div className={`transition-all duration-600 ${showContent ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'}`} style={{ transitionDelay: '200ms' }}>
            <Card3D member={result.member} card={result.card} cooperative={result.cooperative} />
          </div>
        )}

        {/* ─── Invalid / Not Found states ─── */}
        {!isValid && result.member && (
          <div className="rounded-2xl bg-red-950/20 border border-red-500/15 p-6 text-center vfp-enter">
            <XCircle className="h-12 w-12 text-red-400/60 mx-auto mb-3" />
            <h2 className="text-lg font-bold text-white">{result.card?.status === 'expired' ? 'Carte Expirée' : 'Carte Invalide'}</h2>
            <p className="text-white/50 text-sm mt-1">Contactez votre coopérative pour renouveler.</p>
          </div>
        )}
        {!result.member && (
          <div className="rounded-2xl bg-red-950/20 border border-red-500/15 p-6 text-center vfp-enter">
            <XCircle className="h-12 w-12 text-red-400/60 mx-auto mb-3" />
            <h2 className="text-lg font-bold text-white">Carte Non Trouvée</h2>
            <p className="text-white/50 text-sm mt-1">{result.error}</p>
            <p className="text-white/20 text-xs font-mono mt-2">{decodeURIComponent(cardNumber)}</p>
          </div>
        )}

        {/* ─── Services Grid (2 cols) ─── */}
        {isValid && activeView === 'menu' && (
          <section className={`transition-all duration-700 ${showContent ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'}`} style={{ transitionDelay: '300ms' }}>
            <div className="flex items-center justify-between mb-3 px-1">
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--vfp-accent)]" />
                <h3 className="text-white font-semibold text-[15px]">Mes services</h3>
              </div>
              <span className="text-white/40 text-sm">Tout ce dont vous avez besoin.</span>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              {services.map((s, i) => {
                const Icon = s.icon
                return (
                  <button key={i} onClick={s.action} className={`vfp-card group text-left rounded-2xl p-4 flex flex-col items-center justify-center text-center min-h-[110px] ${!s.available ? 'opacity-40' : ''}`} disabled={!s.available}>
                    <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${s.gradient} flex items-center justify-center mb-2.5 group-active:scale-90 transition-transform`}>
                      <Icon className={`h-5 w-5 ${s.highlight ? 'text-amber-300' : s.available ? 'text-[var(--vfp-accent-bright)]' : 'text-white/30'}`} />
                    </div>
                    <p className={`font-semibold text-sm leading-tight mb-0.5 ${s.available ? 'text-white' : 'text-white/40'}`}>{s.title}</p>
                    <p className={`text-xs leading-snug ${s.highlight ? 'text-amber-300/50' : 'text-white/30'}`}>{s.description}</p>
                    {!s.available && (
                      <span className="mt-1.5 px-2 py-0.5 rounded-full bg-white/5 text-white/25 text-[10px] font-bold uppercase">Bientôt</span>
                    )}
                  </button>
                )
              })}
            </div>
          </section>
        )}

        {/* Market prices and AI accessible via the service grid above — no duplication */}

        {/* ─── Prices Full View ─── */}
        {isValid && activeView === 'prices' && (
          <div className="space-y-4 vfp-enter">
            <button onClick={() => setActiveView('menu')} className="flex items-center gap-2 text-[var(--vfp-accent)] text-sm font-medium active:opacity-70">
              <ArrowLeft className="h-4 w-4" /> Retour
            </button>
            <MarketPricesDashboard />
          </div>
        )}

        {/* ─── Identity View ─── */}
        {isValid && activeView === 'identity' && result.member && (
          <div className="space-y-4 vfp-enter">
            <button onClick={() => setActiveView('menu')} className="flex items-center gap-2 text-[var(--vfp-accent)] text-sm font-medium active:opacity-70">
              <ArrowLeft className="h-4 w-4" /> Retour
            </button>
            <h3 className="text-white text-lg font-bold">Vérification d&apos;Identité</h3>
            <div className="vfp-card rounded-2xl p-5 space-y-4">
              <div className="flex items-center gap-4">
                <div className="w-20 h-20 rounded-full overflow-hidden border-[3px] border-[var(--vfp-accent)]/40">
                  {result.member.photo_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={result.member.photo_url} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full bg-[var(--vfp-accent)]/10 flex items-center justify-center"><User className="h-9 w-9 text-[var(--vfp-accent)]/60" /></div>
                  )}
                </div>
                <div>
                  <h2 className="text-xl font-bold text-white">{result.member.first_name ?? ''} <span className="uppercase">{result.member.last_name ?? ''}</span></h2>
                  <p className="text-[var(--vfp-accent)]/70 text-xs font-mono">{result.card?.card_number}</p>
                  <div className="flex items-center gap-2 flex-wrap mt-1.5">
                    <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[var(--vfp-accent)]/10 border border-[var(--vfp-accent)]/20">
                      <CheckCircle className="h-3 w-3 text-[var(--vfp-accent)]" />
                      <span className="text-[10px] font-bold text-[var(--vfp-accent)] uppercase">Membre vérifié</span>
                    </div>
                    {result.card_type && result.card_type !== 'FAITIERE' && (
                      <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-white/8 border border-white/15 text-white/60 uppercase tracking-wider">
                        {result.card_type}
                      </span>
                    )}
                    {(!result.card_type || result.card_type === 'FAITIERE') && (
                      <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-white/8 border border-white/15 text-white/60 uppercase tracking-wider">
                        Producteur
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 pt-2">
                {/* ── Localisation ── */}
                <div className="col-span-2 flex items-center gap-2 mt-1">
                  <MapPin className="h-3.5 w-3.5 text-[var(--vfp-accent)]" />
                  <span className="text-xs text-[var(--vfp-accent)] font-semibold uppercase tracking-wider">Localisation</span>
                </div>
                <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-3">
                  <span className="text-[11px] text-white/40 uppercase font-semibold tracking-wider">Région</span>
                  <p className="text-white text-sm font-semibold mt-0.5">{result.member.region ?? '—'}</p>
                </div>
                <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-3">
                  <span className="text-[11px] text-white/40 uppercase font-semibold tracking-wider">Préfecture</span>
                  <p className="text-white text-sm font-medium mt-0.5">{result.member.prefecture ?? '—'}</p>
                </div>
                <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-3">
                  <span className="text-[11px] text-white/40 uppercase font-semibold tracking-wider">Canton</span>
                  <p className="text-white text-sm font-medium mt-0.5">{result.member.canton ?? '—'}</p>
                </div>
                <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-3">
                  <span className="text-[11px] text-white/40 uppercase font-semibold tracking-wider">Village</span>
                  <p className="text-white text-sm font-medium mt-0.5">{result.member.village ?? '—'}</p>
                </div>
                {/* ── Organisation ── */}
                <div className="col-span-2 flex items-center gap-2 mt-2">
                  <Building2 className="h-3.5 w-3.5 text-[var(--vfp-accent)]" />
                  <span className="text-xs text-[var(--vfp-accent)] font-semibold uppercase tracking-wider">Organisation</span>
                </div>
                <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-3">
                  <span className="text-[11px] text-white/40 uppercase font-semibold tracking-wider">Coopérative</span>
                  <p className="text-white text-sm font-semibold mt-0.5">{result.cooperative?.name ?? '—'}</p>
                </div>
                <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-3">
                  <span className="text-[11px] text-white/40 uppercase font-semibold tracking-wider">Faîtière</span>
                  <p className="text-white text-sm font-semibold mt-0.5">{result.cooperative?.faitiere_name ?? '—'}</p>
                </div>
                {result.member.member_since && (
                  <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-3">
                    <span className="text-[11px] text-white/40 uppercase font-semibold tracking-wider">Membre depuis</span>
                    <p className="text-white text-sm font-semibold mt-0.5">
                      {new Date(result.member.member_since).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })}
                    </p>
                  </div>
                )}
                <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-3">
                  <span className="text-[11px] text-white/40 uppercase font-semibold tracking-wider">Type de carte</span>
                  <p className="text-white text-sm font-semibold mt-0.5">
                    {result.card_type === 'FAITIERE' || !result.card_type ? 'Producteur' : result.card_type}
                  </p>
                </div>
              </div>

              {/* ATS Score breakdown */}
              {atsData && (
                <div className="pt-2 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-[var(--vfp-accent)] font-semibold uppercase tracking-wider">Score Agricole (ATS)</span>
                  </div>
                  <AtsBadge
                    score={atsData.score}
                    level={atsData.level}
                    breakdown={atsData.breakdown}
                    size="md"
                  />
                </div>
              )}
            </div>
          </div>
        )}

        {/* ─── Technicien View ─── */}
        {isValid && activeView === 'technicien' && (
          <div className="space-y-4 vfp-enter">
            <button onClick={() => setActiveView('menu')} className="flex items-center gap-2 text-[var(--vfp-accent)] text-sm font-medium active:opacity-70">
              <ArrowLeft className="h-4 w-4" /> Retour
            </button>
            <h3 className="text-white text-lg font-bold">Contacter Mon Technicien</h3>
            {contactsLoading && <div className="vfp-card rounded-2xl p-8 text-center"><div className="vfp-loader mx-auto" /><p className="text-white/40 text-sm mt-3">Recherche...</p></div>}
            {contacts && contacts.length === 0 && (
              <div className="vfp-card rounded-2xl p-6 text-center">
                <PhoneCall className="h-8 w-8 text-white/20 mx-auto mb-2" />
                <p className="text-white/50 text-sm">Aucun technicien trouvé pour votre zone.</p>
              </div>
            )}
            {contacts && contacts.length > 0 && contacts.map((c, i) => (
              <div key={i} className="vfp-card rounded-2xl p-4 space-y-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-[var(--vfp-accent)]/15 flex items-center justify-center">
                    <User className="h-5 w-5 text-[var(--vfp-accent)]" />
                  </div>
                  <div>
                    <p className="text-white font-semibold text-sm">{c.name}</p>
                    <p className="text-white/40 text-[10px] uppercase tracking-wider">{c.role === 'technicien' ? `Technicien${c.canton ? ` — ${c.canton}` : ''}` : 'Coordonnateur Faîtière'}</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <a href={`tel:${c.phone}`} className="flex-1 py-2.5 rounded-xl bg-[var(--vfp-cta)] text-[var(--vfp-cta-fg)] text-xs font-bold text-center active:scale-95 transition-transform">📞 Appeler</a>
                  <a href={`https://wa.me/${waNumber(c.phone)}`} target="_blank" rel="noopener noreferrer" className="flex-1 py-2.5 rounded-xl bg-[#25D366]/15 text-[#25D366] text-xs font-bold text-center border border-[#25D366]/20 active:scale-95 transition-transform">💬 WhatsApp</a>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ─── AI Chat View ─── */}
        {isValid && activeView === 'ai' && result.member && (
          <AiChat cardNumber={cardNumber} memberName={firstName} onBack={() => setActiveView('menu')} />
        )}

        {/* ─── AgriSmart Water View ─── */}
        {isValid && activeView === 'agrismart' && (
          <AgriSmartWater onBack={() => setActiveView('menu')} />
        )}

        {/* ─── Parcelles View ─── */}
        {isValid && activeView === 'parcelles' && (
          <ParcellesInlineView cardNumber={cardNumber} onBack={() => setActiveView('menu')} />
        )}

        {/* ─── Intrants View ─── */}
        {isValid && activeView === 'intrants' && (
          <IntrantsInlineView cardNumber={cardNumber} onBack={() => setActiveView('menu')} />
        )}

        {/* ─── Cotisation View ─── */}
        {isValid && activeView === 'cotisation' && (
          <CotisationView cardNumber={cardNumber} onBack={() => setActiveView('menu')} />
        )}

        {/* ─── Exploitation View ─── */}
        {isValid && activeView === 'exploitation' && (
          <ExploitationInlineView cardNumber={cardNumber} memberId={result.member_id ?? null} onBack={() => setActiveView('menu')} />
        )}

        {/* ─── Security Timer ─── */}
        {isValid && activeView === 'menu' && (
          <div className={`vfp-card rounded-2xl p-3 transition-all duration-700 ${showContent ? 'opacity-100' : 'opacity-0'}`} style={{ transitionDelay: '600ms' }}>
            <div className="flex items-center gap-3">
              <Timer className="h-4 w-4 text-white/30 shrink-0" />
              <div className="flex-1">
                <div className="h-1 rounded-full bg-white/[0.06] overflow-hidden">
                  <div className="h-full rounded-full transition-all duration-1000" style={{ width: `${(timeLeft / 600) * 100}%`, background: 'linear-gradient(to right, var(--vfp-accent), var(--vfp-accent-dim))' }} />
                </div>
              </div>
              <span className="text-white/30 text-[11px] font-mono shrink-0">{Math.floor(timeLeft / 60)}:{(timeLeft % 60).toString().padStart(2, '0')}</span>
            </div>
          </div>
        )}

      </div>
    </div>
  )
}

/* ─── Premium Styles ─── */
const vfpStyles = `
  :root {
    --vfp-accent: oklch(0.72 0.18 142);
    --vfp-accent-dim: oklch(0.58 0.14 142);
    --vfp-accent-bright: oklch(0.84 0.16 142);
    --vfp-cta: oklch(0.75 0.20 142);
    --vfp-cta-fg: oklch(0.10 0.03 142);
  }
  .vfp-bg {
    background:
      radial-gradient(80% 55% at 18% 8%, oklch(0.45 0.18 142 / 0.10), transparent 60%),
      radial-gradient(60% 45% at 85% 90%, oklch(0.40 0.16 142 / 0.12), transparent 60%),
      linear-gradient(180deg, #040f0a 0%, #071a12 45%, #04120b 100%);
  }
  .vfp-bg::before {
    content: ''; position: absolute; inset: 0; pointer-events: none; z-index: 0;
    background-image: radial-gradient(rgba(255,255,255,.018) 1px, transparent 1px);
    background-size: 3px 3px; opacity: .4;
  }
  .vfp-glass-subtle {
    background: rgba(255,255,255,.04);
    border: 1px solid rgba(255,255,255,.06);
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
  }
  .vfp-card {
    background: linear-gradient(160deg, rgba(255,255,255,.055), rgba(255,255,255,.015));
    border: 1px solid rgba(255,255,255,.07);
    backdrop-filter: blur(12px) saturate(1.05);
    -webkit-backdrop-filter: blur(12px) saturate(1.05);
    box-shadow: 0 4px 24px -8px rgba(0,0,0,.4), inset 0 1px 0 rgba(255,255,255,.06);
    transition: transform .2s cubic-bezier(.2,.7,.2,1), border-color .2s, box-shadow .2s;
  }
  .vfp-card:active:not(:disabled) { transform: scale(.97); }
  .vfp-card:hover:not(:disabled) { border-color: oklch(0.72 0.18 142 / 0.25); box-shadow: 0 4px 24px -8px rgba(0,0,0,.4), inset 0 1px 0 rgba(255,255,255,.06), 0 0 0 1px oklch(0.72 0.18 142 / 0.08); }
  .vfp-enter { animation: vfpIn .5s cubic-bezier(.2,.7,.2,1) both; }
  @keyframes vfpIn { from { opacity:0; transform: translateY(12px); } to { opacity:1; transform: none; } }
  .vfp-pop { animation: vfpPop .5s cubic-bezier(.2,1.4,.4,1) .3s both; }
  @keyframes vfpPop { 0% { transform: scale(0); } 60% { transform: scale(1.2); } 100% { transform: scale(1); } }
  .vfp-loader {
    width: 32px; height: 32px; border: 2.5px solid oklch(0.72 0.18 142 / 0.15);
    border-top-color: var(--vfp-accent); border-radius: 50%;
    animation: vfpSpin .7s linear infinite;
  }
  @keyframes vfpSpin { to { transform: rotate(360deg); } }
  @media (prefers-reduced-motion: reduce) { .vfp-enter,.vfp-pop { animation: none; } }
`

// ── Haroo card verification page ─────────────────────────────────────────────

const HAROO_CARD_LABELS: Record<string, { label: string; color: string; emoji: string }> = {
  OUVRIER:  { label: 'Ouvrier Agricole',   color: 'oklch(0.65 0.18 55)',  emoji: '🌾' },
  ACHETEUR: { label: 'Acheteur / Commerce', color: 'oklch(0.65 0.18 240)', emoji: '🛒' },
  AGRONOME: { label: 'Ingénieur Agronome',  color: 'oklch(0.65 0.20 145)', emoji: '🌱' },
}

function HarooVerifyPage({ result, cardNumber }: { result: VerifyResult; cardNumber: string }) {
  const meta = HAROO_CARD_LABELS[result.card_type ?? ''] ?? { label: 'Professionnel', color: 'oklch(0.65 0.12 200)', emoji: '👤' }

  const profile = result.ouvrier ?? result.acheteur ?? result.agronome
  const fullName = profile ? `${profile.first_name} ${profile.last_name}`.trim() : '—'

  if (!result.valid) {
    return (
      <div className="min-h-screen vfp-bg flex items-center justify-center px-6">
        <style>{vfpStyles}</style>
        <div className="text-center max-w-xs">
          <div className="w-16 h-16 rounded-2xl bg-destructive/10 border border-destructive/20 flex items-center justify-center mx-auto mb-4">
            <XCircle className="h-8 w-8 text-destructive" />
          </div>
          <h2 className="text-xl font-bold text-white mb-2">Carte invalide</h2>
          <p className="text-white/50 text-sm">{result.error ?? 'Cette carte est expirée ou révoquée.'}</p>
          <p className="text-white/30 text-xs mt-4 font-mono">{cardNumber}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen vfp-bg relative overflow-x-hidden">
      <style>{vfpStyles}</style>

      {/* Header */}
      <header className="flex items-center justify-between px-4 pt-4 pb-2">
        <Logo className="h-7 w-auto opacity-80" />
        <span className="text-xs font-bold px-3 py-1 rounded-full border" style={{ color: meta.color, borderColor: `${meta.color}55`, background: `${meta.color}15` }}>
          {meta.emoji} {meta.label}
        </span>
      </header>

      <main className="px-4 pb-8 space-y-4 max-w-lg mx-auto vfp-enter">

        {/* Identity card */}
        <div className="vfp-card rounded-2xl p-5">
          <div className="flex gap-4 items-start">
            {/* Photo */}
            <div className="flex-shrink-0 w-20 h-20 rounded-xl overflow-hidden border border-white/10 bg-white/5">
              {profile?.photo_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={profile.photo_url} alt="" className="w-full h-full object-cover object-top" />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <User className="h-8 w-8 text-white/30" />
                </div>
              )}
            </div>

            {/* Name + card info */}
            <div className="flex-1 min-w-0">
              <h1 className="text-xl font-black text-white uppercase tracking-wide leading-tight truncate">{fullName}</h1>
              <p className="text-sm font-mono text-white/40 mt-0.5">{result.card?.card_number}</p>
              {result.card?.expiry_date && (
                <p className="text-xs text-white/40 mt-1">Valable jusqu&apos;au {new Date(result.card.expiry_date).toLocaleDateString('fr-FR')}</p>
              )}
              <div className="flex items-center gap-1.5 mt-2">
                <CheckCircle className="h-4 w-4 text-green-400" />
                <span className="text-xs font-bold text-green-400 tracking-wide">CARTE VALIDE</span>
              </div>
            </div>
          </div>
        </div>

        {/* OUVRIER: compétences + disponibilité + offres */}
        {result.card_type === 'OUVRIER' && result.ouvrier && (
          <>
            <div className="vfp-card rounded-2xl p-4 space-y-3">
              <h2 className="text-sm font-bold text-white/60 uppercase tracking-widest">Profil</h2>
              <div className="flex items-center gap-2">
                <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${result.ouvrier.disponible ? 'bg-green-500/20 text-green-400' : 'bg-red-500/15 text-red-400'}`}>
                  {result.ouvrier.disponible ? '✓ Disponible' : '✗ Non disponible'}
                </span>
                {result.ouvrier.note_moyenne > 0 && (
                  <span className="text-xs text-yellow-300/80">★ {result.ouvrier.note_moyenne.toFixed(1)} ({result.ouvrier.nombre_avis} avis)</span>
                )}
              </div>
              {result.ouvrier.competences.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {result.ouvrier.competences.map(c => (
                    <span key={c} className="text-xs px-2 py-0.5 rounded-full bg-white/8 text-white/70 border border-white/10">{c}</span>
                  ))}
                </div>
              )}
              {result.ouvrier.cantons_disponibles.length > 0 && (
                <div className="flex items-start gap-2 text-sm text-white/60">
                  <MapPin className="h-4 w-4 mt-0.5 flex-shrink-0" />
                  <span>{result.ouvrier.cantons_disponibles.join(', ')}</span>
                </div>
              )}
              {profile?.phone && (
                <a href={`tel:${profile.phone}`} className="flex items-center gap-2 text-sm font-medium text-green-400 hover:text-green-300">
                  <PhoneCall className="h-4 w-4" />{profile.phone}
                </a>
              )}
            </div>

            {result.offres && result.offres.length > 0 && (
              <div className="vfp-card rounded-2xl p-4 space-y-3">
                <h2 className="text-sm font-bold text-white/60 uppercase tracking-widest">Offres d&apos;emploi proches</h2>
                <div className="space-y-2">
                  {result.offres.map(o => (
                    <div key={o.id} className="rounded-xl bg-white/5 border border-white/8 p-3 space-y-1">
                      <p className="text-sm font-bold text-white">{o.titre}</p>
                      <p className="text-xs text-white/50">{o.canton}{o.date_debut ? ` · ${new Date(o.date_debut).toLocaleDateString('fr-FR')}` : ''}{o.date_fin ? ` → ${new Date(o.date_fin).toLocaleDateString('fr-FR')}` : ''}</p>
                      {o.tarif_journalier && <p className="text-xs text-amber-300">{o.tarif_journalier.toLocaleString('fr-FR')} FCFA/j · {o.nombre_ouvriers} poste(s)</p>}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {/* ACHETEUR: type + produits + préventes */}
        {result.card_type === 'ACHETEUR' && result.acheteur && (
          <>
            <div className="vfp-card rounded-2xl p-4 space-y-3">
              <h2 className="text-sm font-bold text-white/60 uppercase tracking-widest">Profil Acheteur</h2>
              {result.acheteur.type_acheteur && (
                <p className="text-sm text-white/70">{result.acheteur.type_acheteur}</p>
              )}
              {result.acheteur.produits_interesses.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {result.acheteur.produits_interesses.map(p => (
                    <span key={p} className="text-xs px-2 py-0.5 rounded-full bg-blue-500/15 text-blue-300 border border-blue-500/20">{p}</span>
                  ))}
                </div>
              )}
              {result.acheteur.cantons_intervention.length > 0 && (
                <div className="flex items-start gap-2 text-sm text-white/60">
                  <MapPin className="h-4 w-4 mt-0.5 flex-shrink-0" />
                  <span>{result.acheteur.cantons_intervention.join(', ')}</span>
                </div>
              )}
              {profile?.phone && (
                <a href={`tel:${profile.phone}`} className="flex items-center gap-2 text-sm font-medium text-blue-300 hover:text-blue-200">
                  <PhoneCall className="h-4 w-4" />{profile.phone}
                </a>
              )}
            </div>

            {result.preventes && result.preventes.length > 0 && (
              <div className="vfp-card rounded-2xl p-4 space-y-3">
                <h2 className="text-sm font-bold text-white/60 uppercase tracking-widest">Préventes disponibles</h2>
                <div className="space-y-2">
                  {result.preventes.map(p => (
                    <div key={p.id} className="rounded-xl bg-white/5 border border-white/8 p-3 space-y-1">
                      <p className="text-sm font-bold text-white">{p.culture} — {p.quantite_estimee.toLocaleString('fr-FR')} kg</p>
                      <p className="text-xs text-white/50">{p.canton} · Récolte {new Date(p.date_recolte_prevue).toLocaleDateString('fr-FR')}</p>
                      {p.prix_par_kg > 0 && <p className="text-xs text-amber-300">{p.prix_par_kg.toFixed(0)} FCFA/kg</p>}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {/* AGRONOME: spécialisations + badge + missions */}
        {result.card_type === 'AGRONOME' && result.agronome && (
          <>
            <div className="vfp-card rounded-2xl p-4 space-y-3">
              <h2 className="text-sm font-bold text-white/60 uppercase tracking-widest">Profil Agronome</h2>
              <div className="flex items-center gap-2">
                {result.agronome.badge_valide && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-green-500/20 text-green-400 font-bold border border-green-500/30">✓ Badge validé</span>
                )}
                {result.agronome.note_moyenne > 0 && (
                  <span className="text-xs text-yellow-300/80">★ {result.agronome.note_moyenne.toFixed(1)} ({result.agronome.nombre_missions} missions)</span>
                )}
              </div>
              {result.agronome.specialisations.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {result.agronome.specialisations.map(s => (
                    <span key={s} className="text-xs px-2 py-0.5 rounded-full bg-green-500/15 text-green-300 border border-green-500/20">{s}</span>
                  ))}
                </div>
              )}
              {(result.agronome.prefecture || result.agronome.region) && (
                <div className="flex items-start gap-2 text-sm text-white/60">
                  <MapPin className="h-4 w-4 mt-0.5 flex-shrink-0" />
                  <span>{[result.agronome.canton, result.agronome.prefecture, result.agronome.region].filter(Boolean).join(', ')}</span>
                </div>
              )}
              {profile?.phone && (
                <a href={`tel:${profile.phone}`} className="flex items-center gap-2 text-sm font-medium text-green-400 hover:text-green-300">
                  <PhoneCall className="h-4 w-4" />{profile.phone}
                </a>
              )}
            </div>

            {result.missions && result.missions.length > 0 && (
              <div className="vfp-card rounded-2xl p-4 space-y-3">
                <h2 className="text-sm font-bold text-white/60 uppercase tracking-widest">Missions en cours</h2>
                <div className="space-y-2">
                  {result.missions.map(m => (
                    <div key={m.id} className="rounded-xl bg-white/5 border border-white/8 p-3 space-y-1">
                      <p className="text-sm font-semibold text-white">{m.titre}</p>
                      <p className="text-xs text-white/80 line-clamp-2">{m.description}</p>
                      <p className="text-xs text-white/40">{m.canton}{m.date_souhaitee ? ` · ${new Date(m.date_souhaitee).toLocaleDateString('fr-FR')}` : ''}</p>
                      {m.budget && <p className="text-xs text-amber-300">{m.budget.toLocaleString('fr-FR')} FCFA</p>}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {/* Footer */}
        <div className="text-center pt-2">
          <p className="text-xs text-white/20">Vérifié via <span className="font-bold">Haroo</span> · Plateforme Agricole Togo</p>
          <Link href="/" className="inline-flex items-center gap-1.5 text-xs text-white/30 hover:text-white/60 mt-2">
            <ArrowLeft className="h-3 w-3" /> Retour à FaîtiereHub
          </Link>
        </div>

      </main>
    </div>
  )
}

