'use client'

import { CardLoginPanel } from '@/components/verify/card-login-panel'
import { AtsBadge, type AtsBreakdown } from '@/components/shared/ats-badge'
import { Logo } from '@/components/shared/logo'
import { AcheteurView } from '@/components/verify/acheteur-view'
import { AgriSmartWater } from '@/components/verify/agrismart-water'
import { vfpStyles } from '@/components/verify/vfp-styles'
import { AgriSmartReport } from '@/components/agrismart/agrismart-report'
import { AgronomeView } from '@/components/verify/agronome-view'
import { MarketAdvisor } from '@/components/verify/market-advisor'
import { Card3D } from '@/components/verify/card-3d'
import { CotisationView } from '@/components/verify/cotisation-view'
import { ExploitationInlineView } from '@/components/verify/exploitation-inline-view'
import { IntrantsInlineView } from '@/components/verify/intrants-inline-view'
import { MarketPricesDashboard } from '@/components/verify/market-prices-dashboard'
import { MeteoInlineView } from '@/components/verify/meteo-inline-view'
import { OuvrierView } from '@/components/verify/ouvrier-view'
import { ParcellesInlineView } from '@/components/verify/parcelles-inline-view'
import { PrivateCardSection } from '@/components/verify/private-card-section'
import { memberFullName, waNumber } from '@/components/verify/types'
import {
  ArrowLeft,
  Bell,
  Bot,
  Building2,
  CheckCircle,
  CloudRain,
  Coins,
  Droplets,
  FileText,
  Lock,
  Map as MapIcon,
  MapPin,
  PhoneCall,
  ScanLine,
  Share2,
  Shield,
  ShoppingCart,
  Timer,
  TrendingUp,
  User,
  XCircle,
} from 'lucide-react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'

interface VerifyResult {
  valid: boolean
  card_type?: 'FAITIERE' | 'OUVRIER' | 'ACHETEUR' | 'AGRONOME'
  source?: 'faitierehub' | 'haroo'
  card?: { card_number: string; status: string; expiry_date: string | null; created_at: string }
  member?: {
    first_name: string | null
    last_name: string | null
    photo_url: string | null
    village: string | null
    canton: string | null
    prefecture: string | null
    region: string | null
    status: string
    member_since: string | null
  }
  cooperative?: { name: string | null; faitiere_name: string | null }
  member_id?: string | null
  ouvrier?: {
    first_name: string | null
    last_name: string | null
    phone: string | null
    photo_url: string | null
    competences: string[]
    cantons_disponibles: string[]
    disponible: boolean
    disponible_jusqu_au: string | null
    tarif_journalier: number | null
    note_moyenne: number
    nombre_avis: number
  }
  offres?: Array<{
    id: string
    titre: string
    culture: string | null
    description: string | null
    canton: string
    date_debut: string | null
    date_fin: string | null
    tarif_journalier: number | null
    nombre_ouvriers: number
  }>
  acheteur?: {
    first_name: string | null
    last_name: string | null
    phone: string | null
    photo_url: string | null
    type_acheteur: string
    nom_organisation: string | null
    produits_interesses: string[]
    cantons_intervention: string[]
  }
  preventes?: Array<{
    id: string
    culture: string
    quantite_estimee: number
    prix_par_kg: number
    date_recolte_prevue: string
    canton: string
    description: string | null
  }>
  agronome?: {
    first_name: string | null
    last_name: string | null
    phone: string | null
    photo_url: string | null
    specialisations: string[]
    canton: string | null
    prefecture: string | null
    region: string | null
    badge_valide: boolean
    statut_validation: string
    disponible_missions: boolean
    note_moyenne: number
    nombre_missions: number
  }
  missions?: Array<{
    id: string
    titre: string
    culture: string | null
    description: string | null
    canton: string
    budget: number | null
    date_souhaitee: string | null
  }>
  error?: string
}

export default function VerifyCardPage() {
  const params = useParams()
  const cardNumber = params.card_number as string
  const [result, setResult] = useState<VerifyResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [showContent, setShowContent] = useState(false)
  const [timeLeft, setTimeLeft] = useState(600)
  const [expired, setExpired] = useState(false)
  const [activeView, setActiveView] = useState<
    | 'menu'
    | 'identity'
    | 'prices'
    | 'technicien'
    | 'ai'
    | 'agrismart'
    | 'parcelles'
    | 'intrants'
    | 'cotisation'
    | 'exploitation'
    | 'meteo'
  >('menu')
  const [contacts, setContacts] = useState<
    { role: 'technicien' | 'coordo'; name: string; phone: string; canton?: string | null }[] | null
  >(null)
  // Le coordinateur sert au lien WhatsApp et à la carte de contact : on le
  // cherche une fois, plutôt que de rebalayer la liste à chaque usage.
  const coordo = contacts?.find((c) => c.role === 'coordo') ?? null
  const [contactsLoading, setContactsLoading] = useState(false)
  const [atsData, setAtsData] = useState<{
    score: number
    level: string
    breakdown: AtsBreakdown
  } | null>(null)
  // `null` inside means UNKNOWN (the private endpoint refused us), which is not
  // the same as zero. Conflating the two made a perfectly good member look like
  // he had no land, no inputs and no dues paid to anyone who scanned his card
  // without being logged in.
  const [quickStats, setQuickStats] = useState<{
    totalHa: number | null
    cotisationStatus: string | null
    intrantCount: number | null
  } | null>(null)
  /** True once we know the private endpoints refused us (visitor not signed in). */
  const [privateLocked, setPrivateLocked] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)
  const [viaCard, setViaCard] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [notifOpen, setNotifOpen] = useState(false)

  // Fermer le panneau de notifications à l'échappement. L'arrière-plan qui le
  // ferme au clic n'est jamais lui-même une cible clavier légitime — mais
  // Escape reste l'attente standard pour un panneau qui se superpose au reste.
  useEffect(() => {
    if (!notifOpen) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setNotifOpen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [notifOpen])

  // Scan d'une autre carte : tout remettre à zéro. `cardNumber` est le
  // déclencheur ; sans lui, la carte précédente resterait affichée le temps
  // du chargement — sur une page de vérification, c'est inacceptable.
  // biome-ignore lint/correctness/useExhaustiveDependencies: cardNumber est le déclencheur voulu
  useEffect(() => {
    setResult(null)
    setLoading(true)
    setShowContent(false)
    setTimeLeft(600)
    setExpired(false)
    setActiveView('menu')
    setAtsData(null)
  }, [cardNumber])

  useEffect(() => {
    const meta = document.createElement('meta')
    meta.httpEquiv = 'Cache-Control'
    meta.content = 'no-store, no-cache, must-revalidate'
    document.head.appendChild(meta)
    return () => {
      document.head.removeChild(meta)
    }
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
            .then((r) => (r.ok ? r.json() : null))
            .then((ats) => {
              if (ats && typeof ats.score === 'number') {
                setAtsData({ score: ats.score, level: ats.level, breakdown: ats.breakdown })
              }
            })
            .catch(() => null)
        }
      } catch {
        setResult({ valid: false, error: 'Erreur réseau.' })
      } finally {
        setLoading(false)
        setTimeout(() => setShowContent(true), 120)
      }
    }
    fetchCard()
  }, [cardNumber])

  useEffect(() => {
    if (!result?.valid || expired) return
    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          setExpired(true)
          clearInterval(timer)
          return 0
        }
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
      if (res.ok) {
        const d = await res.json()
        setContacts(d.contacts ?? [])
      } else setContacts([])
    } catch {
      setContacts([])
    } finally {
      setContactsLoading(false)
    }
  }, [cardNumber, contacts, contactsLoading])

  useEffect(() => {
    if (activeView === 'technicien') loadContacts()
  }, [activeView, loadContacts])

  useEffect(() => {
    if (!result?.valid || !cardNumber) return
    void reloadKey // relance le chargement après connexion / déconnexion
    const cn = encodeURIComponent(cardNumber)
    // A 401 means "not signed in", never "this member has nothing". Track it
    // separately so the UI can say so instead of printing zeros.
    const get = (path: string) =>
      fetch(`/api/verify/${cn}/${path}`)
        .then(async (r) => ({ ok: r.ok, status: r.status, data: r.ok ? await r.json() : null }))
        .catch(() => ({ ok: false, status: 0, data: null }))

    Promise.all([get('parcelles'), get('cotisation'), get('intrants')]).then(([parc, cot, int]) => {
      const locked = [parc, cot, int].some((r) => r.status === 401)
      setPrivateLocked(locked)
      if (locked) setViaCard(false)
      else
        fetch(`/api/verify/${cn}/private-access`)
          .then((r) => (r.ok ? r.json() : null))
          .then((d) => setViaCard(d?.via === 'card'))
          .catch(() => setViaCard(false))
      setQuickStats({
        totalHa: parc.ok ? (parc.data?.total_ha ?? 0) : null,
        cotisationStatus: cot.ok ? (cot.data?.summary?.last_status ?? null) : null,
        intrantCount: int.ok ? (int.data?.intrants?.length ?? 0) : null,
      })
    })
  }, [result?.valid, cardNumber, reloadKey])

  if (loading) {
    return (
      <div className="min-h-screen vfp-bg flex items-center justify-center">
        <style>{vfpStyles}</style>
        <div className="text-center">
          <div className="vfp-loader mx-auto mb-4" />
          <p className="text-[var(--vfp-accent-dim)] text-sm font-medium tracking-wide">
            Vérification en cours...
          </p>
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
          <p className="text-white/50 text-sm mb-6">
            Scannez à nouveau la carte pour accéder aux services.
          </p>
          <a
            href={`/verify/${cardNumber}`}
            className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-[var(--vfp-cta)] text-[var(--vfp-cta-fg)] font-bold text-sm"
          >
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
      <div
        className="min-h-screen vfp-bg relative overflow-hidden"
        style={{ isolation: 'isolate' }}
      >
        <style>{vfpStyles}</style>
        <div
          className="absolute inset-0 pointer-events-none"
          style={{ transform: 'translateZ(0)', zIndex: 0 }}
        >
          <div
            className="absolute top-[-20%] right-[-15%] w-[500px] h-[500px] rounded-full"
            style={{ background: 'oklch(0.75 0.20 50 / 0.08)', filter: 'blur(100px)' }}
          />
          <div
            className="absolute bottom-[-15%] left-[-10%] w-[400px] h-[400px] rounded-full"
            style={{ background: 'oklch(0.75 0.20 50 / 0.12)', filter: 'blur(80px)' }}
          />
        </div>
        <div className="relative z-10 max-w-md mx-auto px-4 pt-4 pb-8 space-y-5">
          <header className="flex items-center justify-between vfp-enter">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setMobileMenuOpen((v) => !v)}
                className="w-10 h-10 rounded-xl vfp-glass-subtle flex items-center justify-center"
                aria-label="Menu"
              >
                <svg aria-hidden="true" width="18" height="14" viewBox="0 0 18 14" fill="none">
                  <path
                    d="M1 1h16M1 7h10M1 13h14"
                    stroke="oklch(0.75 0.20 50)"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
              <Link href="/">
                <Logo size="sm" textClassName="text-white" />
              </Link>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setNotifOpen((v) => !v)}
                  className="w-10 h-10 rounded-xl vfp-glass-subtle flex items-center justify-center"
                  aria-label="Notifications"
                >
                  <Bell className="h-4 w-4 text-white/60" />
                </button>
                {notifOpen && (
                  <>
                    {/* biome-ignore lint/a11y/useKeyWithClickEvents: arrière-plan de panneau — jamais une cible clavier, la fermeture au clavier passe par Escape (cf. le useEffect plus haut) */}
                    <div className="fixed inset-0 z-40" onClick={() => setNotifOpen(false)} />
                    <div className="absolute top-12 right-0 z-50 w-60 rounded-2xl border border-white/10 bg-[#040f0a]/95 backdrop-blur-xl p-4 shadow-xl">
                      <p className="text-white text-sm font-semibold mb-2">Notifications</p>
                      <p className="text-white/40 text-xs">Aucune notification pour le moment.</p>
                    </div>
                  </>
                )}
              </div>
              <div
                className="w-10 h-10 rounded-full vfp-glass-subtle flex items-center justify-center border-2"
                style={{ borderColor: 'oklch(0.75 0.20 50 / 0.30)' }}
              >
                {result.ouvrier.photo_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={result.ouvrier.photo_url}
                    alt=""
                    className="w-full h-full rounded-full object-cover"
                  />
                ) : (
                  <User className="h-4 w-4 text-white/60" />
                )}
              </div>
            </div>
          </header>
          <OuvrierView
            cardNumber={cardNumber}
            ouvrier={result.ouvrier}
            offres={result.offres ?? []}
            card={result.card}
          />
          <div
            className={`vfp-card rounded-2xl p-3 transition-all duration-700 ${showContent ? 'opacity-100' : 'opacity-0'}`}
            style={{ transitionDelay: '600ms' }}
          >
            <div className="flex items-center gap-3">
              <Timer className="h-4 w-4 text-white/30 shrink-0" />
              <div className="flex-1">
                <div className="h-1 rounded-full bg-white/[0.06] overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-1000"
                    style={{
                      width: `${(timeLeft / 600) * 100}%`,
                      background:
                        'linear-gradient(to right, oklch(0.75 0.20 50), oklch(0.60 0.16 50))',
                    }}
                  />
                </div>
              </div>
              <span className="text-white/30 text-[11px] font-mono shrink-0">
                {Math.floor(timeLeft / 60)}:{(timeLeft % 60).toString().padStart(2, '0')}
              </span>
            </div>
          </div>
        </div>
        {mobileMenuOpen && <VerifyMobileMenu onClose={() => setMobileMenuOpen(false)} />}
      </div>
    )
  }

  if (result.valid && result.card && cardType === 'ACHETEUR' && result.acheteur) {
    return (
      <div
        className="min-h-screen vfp-bg relative overflow-hidden"
        style={{ isolation: 'isolate' }}
      >
        <style>{vfpStyles}</style>
        <div
          className="absolute inset-0 pointer-events-none"
          style={{ transform: 'translateZ(0)', zIndex: 0 }}
        >
          <div
            className="absolute top-[-20%] right-[-15%] w-[500px] h-[500px] rounded-full"
            style={{ background: 'oklch(0.72 0.18 280 / 0.08)', filter: 'blur(100px)' }}
          />
          <div
            className="absolute bottom-[-15%] left-[-10%] w-[400px] h-[400px] rounded-full"
            style={{ background: 'oklch(0.72 0.18 280 / 0.12)', filter: 'blur(80px)' }}
          />
        </div>
        <div className="relative z-10 max-w-md mx-auto px-4 pt-4 pb-8 space-y-5">
          <header className="flex items-center justify-between vfp-enter">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setMobileMenuOpen((v) => !v)}
                className="w-10 h-10 rounded-xl vfp-glass-subtle flex items-center justify-center"
                aria-label="Menu"
              >
                <svg aria-hidden="true" width="18" height="14" viewBox="0 0 18 14" fill="none">
                  <path
                    d="M1 1h16M1 7h10M1 13h14"
                    stroke="oklch(0.72 0.18 280)"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
              <Link href="/">
                <Logo size="sm" textClassName="text-white" />
              </Link>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setNotifOpen((v) => !v)}
                  className="w-10 h-10 rounded-xl vfp-glass-subtle flex items-center justify-center"
                  aria-label="Notifications"
                >
                  <Bell className="h-4 w-4 text-white/60" />
                </button>
                {notifOpen && (
                  <>
                    {/* biome-ignore lint/a11y/useKeyWithClickEvents: arrière-plan de panneau — jamais une cible clavier, la fermeture au clavier passe par Escape (cf. le useEffect plus haut) */}
                    <div className="fixed inset-0 z-40" onClick={() => setNotifOpen(false)} />
                    <div className="absolute top-12 right-0 z-50 w-60 rounded-2xl border border-white/10 bg-[#040f0a]/95 backdrop-blur-xl p-4 shadow-xl">
                      <p className="text-white text-sm font-semibold mb-2">Notifications</p>
                      <p className="text-white/40 text-xs">Aucune notification pour le moment.</p>
                    </div>
                  </>
                )}
              </div>
              <div
                className="w-10 h-10 rounded-full vfp-glass-subtle flex items-center justify-center border-2"
                style={{ borderColor: 'oklch(0.72 0.18 280 / 0.30)' }}
              >
                {result.acheteur.photo_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={result.acheteur.photo_url}
                    alt=""
                    className="w-full h-full rounded-full object-cover"
                  />
                ) : (
                  <User className="h-4 w-4 text-white/60" />
                )}
              </div>
            </div>
          </header>
          <AcheteurView
            cardNumber={cardNumber}
            acheteur={result.acheteur}
            preventes={result.preventes ?? []}
            card={result.card}
          />
          <div
            className={`vfp-card rounded-2xl p-3 transition-all duration-700 ${showContent ? 'opacity-100' : 'opacity-0'}`}
            style={{ transitionDelay: '600ms' }}
          >
            <div className="flex items-center gap-3">
              <Timer className="h-4 w-4 text-white/30 shrink-0" />
              <div className="flex-1">
                <div className="h-1 rounded-full bg-white/[0.06] overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-1000"
                    style={{
                      width: `${(timeLeft / 600) * 100}%`,
                      background:
                        'linear-gradient(to right, oklch(0.72 0.18 280), oklch(0.58 0.14 280))',
                    }}
                  />
                </div>
              </div>
              <span className="text-white/30 text-[11px] font-mono shrink-0">
                {Math.floor(timeLeft / 60)}:{(timeLeft % 60).toString().padStart(2, '0')}
              </span>
            </div>
          </div>
        </div>
        {mobileMenuOpen && <VerifyMobileMenu onClose={() => setMobileMenuOpen(false)} />}
      </div>
    )
  }

  if (result.valid && result.card && cardType === 'AGRONOME' && result.agronome) {
    return (
      <div
        className="min-h-screen vfp-bg relative overflow-hidden"
        style={{ isolation: 'isolate' }}
      >
        <style>{vfpStyles}</style>
        <div
          className="absolute inset-0 pointer-events-none"
          style={{ transform: 'translateZ(0)', zIndex: 0 }}
        >
          <div
            className="absolute top-[-20%] right-[-15%] w-[500px] h-[500px] rounded-full"
            style={{ background: 'oklch(0.72 0.18 230 / 0.08)', filter: 'blur(100px)' }}
          />
          <div
            className="absolute bottom-[-15%] left-[-10%] w-[400px] h-[400px] rounded-full"
            style={{ background: 'oklch(0.72 0.18 230 / 0.12)', filter: 'blur(80px)' }}
          />
        </div>
        <div className="relative z-10 max-w-md mx-auto px-4 pt-4 pb-8 space-y-5">
          <header className="flex items-center justify-between vfp-enter">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setMobileMenuOpen((v) => !v)}
                className="w-10 h-10 rounded-xl vfp-glass-subtle flex items-center justify-center"
                aria-label="Menu"
              >
                <svg aria-hidden="true" width="18" height="14" viewBox="0 0 18 14" fill="none">
                  <path
                    d="M1 1h16M1 7h10M1 13h14"
                    stroke="oklch(0.72 0.18 230)"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
              <Link href="/">
                <Logo size="sm" textClassName="text-white" />
              </Link>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setNotifOpen((v) => !v)}
                  className="w-10 h-10 rounded-xl vfp-glass-subtle flex items-center justify-center"
                  aria-label="Notifications"
                >
                  <Bell className="h-4 w-4 text-white/60" />
                </button>
                {notifOpen && (
                  <>
                    {/* biome-ignore lint/a11y/useKeyWithClickEvents: arrière-plan de panneau — jamais une cible clavier, la fermeture au clavier passe par Escape (cf. le useEffect plus haut) */}
                    <div className="fixed inset-0 z-40" onClick={() => setNotifOpen(false)} />
                    <div className="absolute top-12 right-0 z-50 w-60 rounded-2xl border border-white/10 bg-[#040f0a]/95 backdrop-blur-xl p-4 shadow-xl">
                      <p className="text-white text-sm font-semibold mb-2">Notifications</p>
                      <p className="text-white/40 text-xs">Aucune notification pour le moment.</p>
                    </div>
                  </>
                )}
              </div>
              <div
                className="w-10 h-10 rounded-full vfp-glass-subtle flex items-center justify-center border-2"
                style={{ borderColor: 'oklch(0.72 0.18 230 / 0.30)' }}
              >
                {result.agronome.photo_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={result.agronome.photo_url}
                    alt=""
                    className="w-full h-full rounded-full object-cover"
                  />
                ) : (
                  <User className="h-4 w-4 text-white/60" />
                )}
              </div>
            </div>
          </header>
          <AgronomeView
            cardNumber={cardNumber}
            agronome={result.agronome}
            missions={result.missions ?? []}
            card={result.card}
          />
          <div
            className={`vfp-card rounded-2xl p-3 transition-all duration-700 ${showContent ? 'opacity-100' : 'opacity-0'}`}
            style={{ transitionDelay: '600ms' }}
          >
            <div className="flex items-center gap-3">
              <Timer className="h-4 w-4 text-white/30 shrink-0" />
              <div className="flex-1">
                <div className="h-1 rounded-full bg-white/[0.06] overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-1000"
                    style={{
                      width: `${(timeLeft / 600) * 100}%`,
                      background:
                        'linear-gradient(to right, oklch(0.72 0.18 230), oklch(0.58 0.14 230))',
                    }}
                  />
                </div>
              </div>
              <span className="text-white/30 text-[11px] font-mono shrink-0">
                {Math.floor(timeLeft / 60)}:{(timeLeft % 60).toString().padStart(2, '0')}
              </span>
            </div>
          </div>
        </div>
        {mobileMenuOpen && <VerifyMobileMenu onClose={() => setMobileMenuOpen(false)} />}
      </div>
    )
  }

  const isValid = result.valid && result.card?.status === 'active'
  const fullName = result.member
    ? memberFullName(result.member as Parameters<typeof memberFullName>[0])
    : ''
  const rawFirst = (result.member?.first_name ?? '').trim()
  // Capitalise EVERY word, not just the first: two-part given names are the
  // norm here ("ISSODO LOUIS", "Podoma Aklesso"), and lowercasing everything
  // after the first letter turned them into "Issodo louis". Hyphens count as
  // word boundaries too ("Kossi-Ama").
  const firstName = rawFirst
    ? rawFirst
        .toLowerCase()
        .replace(/(^|[\s'’-])([\p{L}])/gu, (_m, sep, ch) => sep + ch.toUpperCase())
    : fullName?.split(' ')[0] || 'Producteur'
  // Le salut horaire a disparu avec le bloc marketing : la bande d'identité
  // affiche déjà le nom en gros, et « Bonsoir » ne veut rien dire pour
  // l'acheteur qui scanne la carte de quelqu'un d'autre.

  const handleAttestation = () => {
    if (!result.member_id) return
    const path = `/reports/attestation/${result.member_id}`
    if (typeof navigator !== 'undefined' && navigator.share) {
      navigator
        .share({
          title: 'Mon Attestation Agricole — FaîtiereHub',
          url: window.location.origin + path,
        })
        .catch(() => window.open(path, '_blank'))
    } else {
      window.open(path, '_blank')
    }
  }

  return (
    <div className="min-h-screen vfp-bg relative overflow-hidden" style={{ isolation: 'isolate' }}>
      <style>{vfpStyles}</style>

      {/* Ambient glow */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ transform: 'translateZ(0)', zIndex: 0 }}
      >
        <div className="absolute top-[-20%] right-[-15%] w-[500px] h-[500px] rounded-full bg-[var(--vfp-accent)]/[0.08] blur-[100px]" />
        <div className="absolute bottom-[-15%] left-[-10%] w-[400px] h-[400px] rounded-full bg-[var(--vfp-accent)]/[0.12] blur-[80px]" />
      </div>

      <div className="relative z-10 max-w-md mx-auto px-4 pt-4 pb-5 space-y-3.5">
        {/* ─── Premium Header ─── */}
        <header className="flex items-center justify-between vfp-enter">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() =>
                activeView !== 'menu' ? setActiveView('menu') : setMobileMenuOpen((v) => !v)
              }
              className="w-10 h-10 rounded-xl vfp-glass-subtle flex items-center justify-center"
              aria-label={activeView !== 'menu' ? 'Retour' : 'Menu'}
            >
              {activeView !== 'menu' ? (
                <ArrowLeft className="h-4 w-4" style={{ color: 'var(--vfp-accent)' }} />
              ) : (
                <svg aria-hidden="true" width="18" height="14" viewBox="0 0 18 14" fill="none">
                  <path
                    d="M1 1h16M1 7h10M1 13h14"
                    stroke="var(--vfp-accent)"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                  />
                </svg>
              )}
            </button>
            <Link href="/">
              <Logo size="sm" textClassName="text-white" />
            </Link>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <button
                type="button"
                onClick={() => setNotifOpen((v) => !v)}
                className="w-10 h-10 rounded-xl vfp-glass-subtle flex items-center justify-center"
                aria-label="Notifications"
              >
                <Bell className="h-4 w-4 text-white/60" />
              </button>
              {notifOpen && (
                <>
                  {/* biome-ignore lint/a11y/useKeyWithClickEvents: arrière-plan de panneau — jamais une cible clavier, la fermeture au clavier passe par Escape (cf. le useEffect plus haut) */}
                  <div className="fixed inset-0 z-40" onClick={() => setNotifOpen(false)} />
                  <div className="absolute top-12 right-0 z-50 w-64 rounded-2xl border border-white/10 bg-[#040f0a]/95 backdrop-blur-xl p-4 shadow-xl">
                    <p className="text-white text-sm font-semibold mb-3">Notifications</p>
                    <button
                      type="button"
                      onClick={() => {
                        setActiveView('meteo')
                        setNotifOpen(false)
                      }}
                      className="w-full flex items-center gap-3 rounded-xl p-3 bg-white/5 active:bg-white/10 text-left transition-colors"
                    >
                      <CloudRain className="h-4 w-4 text-sky-400 shrink-0" />
                      <div>
                        <p className="text-white text-xs font-semibold">Alertes météo</p>
                        <p className="text-white/40 text-[10px] mt-0.5">
                          Pluie, sécheresse, traitement
                        </p>
                      </div>
                    </button>
                  </div>
                </>
              )}
            </div>
            <div className="w-10 h-10 rounded-full vfp-glass-subtle flex items-center justify-center border-2 border-[var(--vfp-accent)]/30">
              {result.member?.photo_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={result.member.photo_url}
                  alt=""
                  className="w-full h-full rounded-full object-cover"
                />
              ) : (
                <User className="h-4.5 w-4.5 text-white/60" />
              )}
            </div>
          </div>
        </header>

        {/* ─── Hero Section ─── */}
        {isValid && activeView === 'menu' && (
          <section
            className={`vfp-enter transition-all duration-700 ${showContent ? 'opacity-100' : 'opacity-0'}`}
            style={{ transitionDelay: '100ms' }}
          >
            {/* Compact identity band.
                This replaced a 200px marketing hero ("Votre espace, votre
                succès — Gérez, développez et prospérez") that told a scanner
                nothing. What someone wants in the first second after scanning
                is: is this card valid, and whose is it. That now fits in ~80px,
                leaving the fold for the things people came to use. */}
            <div className="flex items-center gap-3">
              <div className="h-[58px] w-[46px] shrink-0 rounded-xl overflow-hidden bg-white/[0.06] ring-1 ring-white/10">
                {result.member?.photo_url ? (
                  // Plain <img>: arbitrary Supabase Storage URL.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={result.member.photo_url}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="h-full w-full grid place-items-center">
                    <User className="h-6 w-6 text-white/25" />
                  </div>
                )}
              </div>

              <div className="min-w-0 flex-1">
                {/* Deux lignes plutôt qu'une troncature : « ISSODO LOUIS
                    TATCHI… » ne permet pas de vérifier une identité, ce qui est
                    pourtant la seule raison d'être de cette bande. */}
                <p className="text-white text-[15.5px] font-bold leading-[1.15] line-clamp-2">
                  {fullName || firstName}
                </p>
                <p className="text-white/45 text-[12.5px] leading-snug truncate">
                  {result.cooperative?.name ?? '—'}
                </p>
                <p className="text-white/30 text-[11.5px] font-mono">{cardNumber}</p>
              </div>

              <div className="shrink-0 flex flex-col items-end gap-1">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--vfp-accent)]/15 px-2.5 py-1.5 ring-1 ring-[var(--vfp-accent)]/30">
                  <CheckCircle className="h-4 w-4 text-[var(--vfp-accent)] vfp-pop" />
                  <span className="text-[var(--vfp-accent)] text-[12px] font-bold">VALIDE</span>
                </span>
                {atsData && <AtsBadge score={atsData.score} level={atsData.level} size="sm" />}
              </div>
            </div>
          </section>
        )}

        {/* La carte 3D n'est plus dans le menu : elle y prenait ~230 px alors
            que la bande d'identité ci-dessus porte déjà la preuve. Elle s'ouvre
            depuis la tuile « Ma carte » (vue `identity`). */}

        {/* ─── Status instrument strip ───
            Replaces the 3 flat stat squares with a single glass panel:
            a circular gauge visualizing the real cotisation status (not
            decorative — derived from quickStats.cotisationStatus) beside
            the hectares/intrants metrics. */}
        {/* Not signed in: the instrument strip would read as an empty gauge and
            a row of zeros — a factual-looking claim that this member has
            nothing. Say plainly that the data is private instead. */}
        {isValid && activeView === 'menu' && privateLocked && (
          <CardLoginPanel cardNumber={cardNumber} onConnected={() => setReloadKey((k) => k + 1)} />
        )}

        {/* Bandeau compact : trois chiffres sur une ligne.
            L'ancienne version faisait ~110px pour un anneau décoratif de 68px
            et beaucoup de vide — au prix du seul écran disponible. Le statut de
            cotisation reste porté par la couleur, qui se lit plus vite qu'un
            pourcentage dont personne n'a l'usage. */}
        {isValid &&
          activeView === 'menu' &&
          !privateLocked &&
          quickStats &&
          (() => {
            const paid =
              quickStats.cotisationStatus === 'paid' || quickStats.cotisationStatus === 'waived'
            const overdue = quickStats.cotisationStatus === 'overdue'
            const cotisationColor = paid ? '#34d399' : overdue ? '#f87171' : 'var(--vfp-accent)'
            const cotisationLabel = paid
              ? 'À jour'
              : overdue
                ? 'En retard'
                : quickStats.cotisationStatus === 'pending'
                  ? 'En cours'
                  : '—'
            const cell = (label: string, value: string, color?: string) => (
              <div key={label} className="flex-1 min-w-0 text-center">
                <p className="text-white/40 text-[10.5px] uppercase tracking-wide">{label}</p>
                <p
                  className="text-[15px] font-bold leading-tight truncate"
                  style={{ color: color ?? '#fff' }}
                >
                  {value}
                </p>
              </div>
            )
            return (
              <div
                className={`vfp-card rounded-2xl px-3 py-2.5 flex items-center gap-2 vfp-enter transition-all duration-700 ${showContent ? 'opacity-100' : 'opacity-0'}`}
                style={{ transitionDelay: '200ms' }}
              >
                {cell('Cotisation', cotisationLabel, cotisationColor)}
                <span className="w-px self-stretch bg-white/10" />
                {cell(
                  'Hectares',
                  quickStats.totalHa === null
                    ? '—'
                    : quickStats.totalHa > 0
                      ? quickStats.totalHa.toFixed(1)
                      : '0',
                )}
                <span className="w-px self-stretch bg-white/10" />
                {cell(
                  'Intrants',
                  quickStats.intrantCount === null ? '—' : String(quickStats.intrantCount),
                )}
              </div>
            )
          })()}

        {/* ─── Invalid / Not Found states ─── */}
        {!isValid && (result.member || result.card?.status === 'expired') && (
          <div className="rounded-2xl bg-red-950/20 border border-red-500/15 p-6 text-center vfp-enter">
            <XCircle className="h-12 w-12 text-red-400/60 mx-auto mb-3" />
            <h2 className="text-lg font-bold text-white">
              {result.card?.status === 'expired' ? 'Carte Expirée' : 'Carte Invalide'}
            </h2>
            <p className="text-white/50 text-sm mt-1">
              Contactez votre coopérative pour renouveler.
            </p>
          </div>
        )}
        {!result.member && result.card?.status !== 'expired' && (
          <div className="rounded-2xl bg-red-950/20 border border-red-500/15 p-6 text-center vfp-enter">
            <XCircle className="h-12 w-12 text-red-400/60 mx-auto mb-3" />
            <h2 className="text-lg font-bold text-white">Carte Non Trouvée</h2>
            <p className="text-white/50 text-sm mt-1">{result.error}</p>
            <p className="text-white/20 text-xs font-mono mt-2">{decodeURIComponent(cardNumber)}</p>
          </div>
        )}

        {/* ─── Grille de lancement ───
            Une seule grille de tuiles, comme l'écran d'accueil d'un téléphone.
            Remplace quatre blocs empilés (un encart Assistant IA de 200px, une
            rangée de 3, deux rangées de 2, un bandeau attestation) séparés par
            trois en-têtes de section décoratifs. L'ensemble faisait 3,8 écrans
            de haut pour 390px de large : personne ne fait défiler pour trouver
            la météo. Les entrées privées ne sont présentes que pour le
            titulaire — sinon une seule tuile « Se connecter » les remplace. */}
        {isValid && activeView === 'menu' && (
          <section
            className={`transition-all duration-700 ${showContent ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'}`}
            style={{ transitionDelay: '300ms' }}
          >
            <div className="grid grid-cols-3 gap-1.5">
              {[
                {
                  icon: Bot,
                  label: 'Conseiller',
                  view: 'ai',
                  tint: 'text-amber-300',
                  ring: 'ring-amber-400/20',
                  bg: 'bg-amber-500/10',
                },
                {
                  icon: TrendingUp,
                  label: 'Marchés',
                  view: 'prices',
                  tint: 'text-violet-300',
                  ring: 'ring-violet-400/20',
                  bg: 'bg-violet-500/10',
                },
                {
                  icon: CloudRain,
                  label: 'Météo',
                  view: 'meteo',
                  tint: 'text-sky-300',
                  ring: 'ring-sky-400/20',
                  bg: 'bg-sky-500/10',
                },
                {
                  icon: Droplets,
                  label: 'Irrigation',
                  view: 'agrismart',
                  tint: 'text-cyan-300',
                  ring: 'ring-cyan-400/20',
                  bg: 'bg-cyan-500/10',
                },
                ...(privateLocked
                  ? []
                  : [
                      {
                        icon: MapIcon,
                        label: 'Parcelles',
                        view: 'parcelles',
                        tint: 'text-emerald-300',
                        ring: 'ring-emerald-400/20',
                        bg: 'bg-emerald-500/10',
                      },
                      {
                        icon: ShoppingCart,
                        label: 'Intrants',
                        view: 'intrants',
                        tint: 'text-orange-300',
                        ring: 'ring-orange-400/20',
                        bg: 'bg-orange-500/10',
                      },
                      {
                        icon: FileText,
                        label: 'Exploitation',
                        view: 'exploitation',
                        tint: 'text-teal-300',
                        ring: 'ring-teal-400/20',
                        bg: 'bg-teal-500/10',
                      },
                      {
                        icon: Coins,
                        label: 'Cotisation',
                        view: 'cotisation',
                        tint: 'text-yellow-300',
                        ring: 'ring-yellow-400/20',
                        bg: 'bg-yellow-500/10',
                      },
                    ]),
                {
                  icon: Shield,
                  label: 'Ma carte',
                  view: 'identity',
                  tint: 'text-[var(--vfp-accent)]',
                  ring: 'ring-[var(--vfp-accent)]/25',
                  bg: 'bg-[var(--vfp-accent)]/10',
                },
                {
                  icon: PhoneCall,
                  label: 'Technicien',
                  view: 'technicien',
                  tint: 'text-teal-300',
                  ring: 'ring-teal-400/20',
                  bg: 'bg-teal-500/10',
                },
              ].map(({ icon: Icon, label, view, tint, ring, bg }) => (
                <button
                  type="button"
                  key={view}
                  onClick={() => setActiveView(view as typeof activeView)}
                  className="vfp-card rounded-2xl py-3 px-1.5 min-h-[78px] flex flex-col items-center justify-center gap-1 active:scale-95 transition-transform"
                >
                  <span
                    className={`w-11 h-11 rounded-2xl ${bg} ring-1 ${ring} grid place-items-center`}
                  >
                    <Icon className={`h-[22px] w-[22px] ${tint}`} />
                  </span>
                  <span className="text-white text-[12px] font-semibold leading-tight text-center">
                    {label}
                  </span>
                </button>
              ))}

              <button
                type="button"
                onClick={handleAttestation}
                className="vfp-card rounded-2xl py-3 px-1.5 min-h-[78px] flex flex-col items-center justify-center gap-1 active:scale-95 transition-transform"
              >
                <span className="w-11 h-11 rounded-2xl bg-violet-500/10 ring-1 ring-violet-400/20 grid place-items-center">
                  <Share2 className="h-[22px] w-[22px] text-violet-300" />
                </span>
                <span className="text-white text-[12px] font-semibold leading-tight text-center">
                  Attestation
                </span>
              </button>

              {privateLocked && (
                <button
                  type="button"
                  onClick={() =>
                    document.getElementById('card-login')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
                  }
                  className="vfp-card rounded-2xl py-3 px-1.5 min-h-[78px] flex flex-col items-center justify-center gap-1 active:scale-95 transition-transform"
                >
                  <span className="w-11 h-11 rounded-2xl bg-white/[0.06] ring-1 ring-white/10 grid place-items-center">
                    <Lock className="h-[22px] w-[22px] text-white/45" />
                  </span>
                  <span className="text-white/70 text-[12px] font-semibold leading-tight text-center">
                    Se connecter
                  </span>
                </button>
              )}

              {!privateLocked && viaCard && (
                <button
                  type="button"
                  onClick={async () => {
                    await fetch('/api/auth/card/logout', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ card_number: cardNumber }),
                    }).catch(() => undefined)
                    setViaCard(false)
                    setReloadKey((k) => k + 1)
                  }}
                  className="vfp-card rounded-2xl py-3 px-1.5 min-h-[78px] flex flex-col items-center justify-center gap-1 active:scale-95 transition-transform"
                >
                  <span className="w-11 h-11 rounded-2xl bg-white/[0.06] ring-1 ring-white/10 grid place-items-center">
                    <Lock className="h-[22px] w-[22px] text-white/45" />
                  </span>
                  <span className="text-white/70 text-[12px] font-semibold leading-tight text-center">
                    Se déconnecter
                  </span>
                </button>
              )}
            </div>
          </section>
        )}

        {/* Market prices and AI accessible via the service grid above — no duplication */}

        {/* ─── Prices Full View ─── */}
        {isValid && activeView === 'prices' && (
          <div className="space-y-4 vfp-enter">
            <button
              type="button"
              onClick={() => setActiveView('menu')}
              className="flex items-center gap-2 text-[var(--vfp-accent)] text-sm font-medium active:opacity-70"
            >
              <ArrowLeft className="h-4 w-4" /> Retour
            </button>
            <MarketPricesDashboard
              cardNumber={cardNumber}
              cooperativeName={result.cooperative?.name ?? ''}
              memberLocality={
                result.member
                  ? {
                      village: result.member.village ?? null,
                      canton: result.member.canton ?? null,
                      prefecture: result.member.prefecture ?? null,
                      region: result.member.region ?? null,
                    }
                  : undefined
              }
            />
          </div>
        )}

        {/* ─── Identity View ─── */}
        {isValid && activeView === 'identity' && result.member && (
          <div className="space-y-4 vfp-enter">
            <button
              type="button"
              onClick={() => setActiveView('menu')}
              className="flex items-center gap-2 text-[var(--vfp-accent)] text-sm font-medium active:opacity-70"
            >
              <ArrowLeft className="h-4 w-4" /> Retour
            </button>
            <h3 className="text-white text-lg font-bold">Vérification d&apos;Identité</h3>
            {result.card && (
              <Card3D member={result.member} card={result.card} cooperative={result.cooperative} />
            )}
            <div className="vfp-card rounded-2xl p-5 space-y-4">
              <div className="flex items-center gap-4">
                <div className="w-20 h-20 rounded-full overflow-hidden border-[3px] border-[var(--vfp-accent)]/40">
                  {result.member.photo_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={result.member.photo_url}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full bg-[var(--vfp-accent)]/10 flex items-center justify-center">
                      <User className="h-9 w-9 text-[var(--vfp-accent)]/60" />
                    </div>
                  )}
                </div>
                <div>
                  <h2 className="text-xl font-bold text-white">
                    {result.member.first_name ?? ''}{' '}
                    <span className="uppercase">{result.member.last_name ?? ''}</span>
                  </h2>
                  <p className="text-[var(--vfp-accent)]/70 text-xs font-mono">
                    {result.card?.card_number}
                  </p>
                  <div className="flex items-center gap-2 flex-wrap mt-1.5">
                    <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[var(--vfp-accent)]/10 border border-[var(--vfp-accent)]/20">
                      <CheckCircle className="h-3 w-3 text-[var(--vfp-accent)]" />
                      <span className="text-[10px] font-bold text-[var(--vfp-accent)] uppercase">
                        Membre vérifié
                      </span>
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
                  <span className="text-xs text-[var(--vfp-accent)] font-semibold uppercase tracking-wider">
                    Localisation
                  </span>
                </div>
                <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-3">
                  <span className="text-[11px] text-white/40 uppercase font-semibold tracking-wider">
                    Région
                  </span>
                  <p className="text-white text-sm font-semibold mt-0.5">
                    {result.member.region ?? '—'}
                  </p>
                </div>
                <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-3">
                  <span className="text-[11px] text-white/40 uppercase font-semibold tracking-wider">
                    Préfecture
                  </span>
                  <p className="text-white text-sm font-medium mt-0.5">
                    {result.member.prefecture ?? '—'}
                  </p>
                </div>
                <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-3">
                  <span className="text-[11px] text-white/40 uppercase font-semibold tracking-wider">
                    Canton
                  </span>
                  <p className="text-white text-sm font-medium mt-0.5">
                    {result.member.canton ?? '—'}
                  </p>
                </div>
                <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-3">
                  <span className="text-[11px] text-white/40 uppercase font-semibold tracking-wider">
                    Village
                  </span>
                  <p className="text-white text-sm font-medium mt-0.5">
                    {result.member.village ?? '—'}
                  </p>
                </div>
                {/* ── Organisation ── */}
                <div className="col-span-2 flex items-center gap-2 mt-2">
                  <Building2 className="h-3.5 w-3.5 text-[var(--vfp-accent)]" />
                  <span className="text-xs text-[var(--vfp-accent)] font-semibold uppercase tracking-wider">
                    Organisation
                  </span>
                </div>
                <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-3">
                  <span className="text-[11px] text-white/40 uppercase font-semibold tracking-wider">
                    Coopérative
                  </span>
                  <p className="text-white text-sm font-semibold mt-0.5">
                    {result.cooperative?.name ?? 'Coopérative inconnue'}
                  </p>
                </div>
                <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-3">
                  <span className="text-[11px] text-white/40 uppercase font-semibold tracking-wider">
                    Faîtière
                  </span>
                  <p className="text-white text-sm font-semibold mt-0.5">
                    {result.cooperative?.faitiere_name ?? '—'}
                  </p>
                </div>
                {result.member.member_since && (
                  <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-3">
                    <span className="text-[11px] text-white/40 uppercase font-semibold tracking-wider">
                      Membre depuis
                    </span>
                    <p className="text-white text-sm font-semibold mt-0.5">
                      {new Date(result.member.member_since).toLocaleDateString('fr-FR', {
                        day: '2-digit',
                        month: 'long',
                        year: 'numeric',
                      })}
                    </p>
                  </div>
                )}
                <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-3">
                  <span className="text-[11px] text-white/40 uppercase font-semibold tracking-wider">
                    Type de carte
                  </span>
                  <p className="text-white text-sm font-semibold mt-0.5">
                    {result.card_type === 'FAITIERE' || !result.card_type
                      ? 'Producteur'
                      : result.card_type}
                  </p>
                </div>
              </div>

              {/* ATS Score breakdown */}
              {atsData && (
                <div className="pt-2 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-[var(--vfp-accent)] font-semibold uppercase tracking-wider">
                      Score Agricole (ATS)
                    </span>
                  </div>
                  <AtsBadge
                    score={atsData.score}
                    level={atsData.level}
                    breakdown={atsData.breakdown}
                    size="md"
                  />

                  {/* Haroo ATS Tier Ladder */}
                  <div className="vfp-card rounded-2xl p-4 space-y-3">
                    <p className="text-white/60 text-[11px] font-semibold uppercase tracking-wider">
                      Paliers Haroo — Avantages agricoles
                    </p>
                    <div className="space-y-2">
                      {(
                        [
                          {
                            min: 0,
                            max: 199,
                            label: 'Starter',
                            color: 'text-white/40',
                            bg: 'bg-white/5',
                            icon: '🌱',
                            perks: 'Accès Haroo, vérification carte',
                          },
                          {
                            min: 200,
                            max: 399,
                            label: 'Bronze',
                            color: 'text-amber-600',
                            bg: 'bg-amber-900/20',
                            icon: '🥉',
                            perks: "Crédit intrants jusqu'à 50 000 XOF",
                          },
                          {
                            min: 400,
                            max: 599,
                            label: 'Argent',
                            color: 'text-slate-300',
                            bg: 'bg-slate-700/20',
                            icon: '🥈',
                            perks: 'Crédit 150 000 XOF · Assurance récolte de base',
                          },
                          {
                            min: 600,
                            max: 799,
                            label: 'Or',
                            color: 'text-yellow-400',
                            bg: 'bg-yellow-900/20',
                            icon: '🥇',
                            perks:
                              'Crédit 500 000 XOF · Assurance complète · Formation certifiante',
                          },
                          {
                            min: 800,
                            max: 1000,
                            label: 'Platine',
                            color: 'text-cyan-300',
                            bg: 'bg-cyan-900/20',
                            icon: '💎',
                            perks: 'Crédit 2 000 000 XOF · Export UEMOA · Priorité acheteurs',
                          },
                        ] as const
                      ).map((tier) => {
                        const active = atsData.score >= tier.min && atsData.score <= tier.max
                        const unlocked = atsData.score >= tier.min
                        return (
                          <div
                            key={tier.label}
                            className={`flex items-start gap-3 p-2.5 rounded-xl border transition-all ${active ? `${tier.bg} border-white/15` : unlocked ? 'border-white/5 opacity-60' : 'border-white/[0.03] opacity-30'}`}
                          >
                            <span className="text-base shrink-0 mt-0.5">{tier.icon}</span>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span
                                  className={`text-xs font-bold ${active ? tier.color : 'text-white/50'}`}
                                >
                                  {tier.label}
                                </span>
                                <span className="text-[10px] text-white/25">
                                  {tier.min}–{tier.max === 1000 ? '1000' : tier.max} pts
                                </span>
                                {active && (
                                  <span className="ml-auto text-[10px] font-semibold text-[var(--vfp-accent)] shrink-0">
                                    ← Votre niveau
                                  </span>
                                )}
                              </div>
                              <p className="text-[11px] text-white/40 mt-0.5 leading-tight">
                                {tier.perks}
                              </p>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                    {/* How to improve */}
                    {atsData.breakdown &&
                      atsData.score < 800 &&
                      (() => {
                        const b = atsData.breakdown
                        const tips: string[] = []
                        if (b.cotisation < 270)
                          tips.push('Payer vos cotisations à temps (+pts cotisation)')
                        if (b.production < 270)
                          tips.push('Déclarer vos récoltes dans Haroo (+pts production)')
                        if (b.engagement < 180)
                          tips.push('Participer aux formations coopératives (+pts engagement)')
                        if (tips.length === 0 && atsData.score < 800)
                          tips.push('Enregistrer plus de parcelles pour progresser')
                        return tips.length > 0 ? (
                          <div className="border-t border-white/[0.06] pt-2.5">
                            <p className="text-[10px] font-semibold text-white/35 uppercase tracking-wider mb-1.5">
                              Comment progresser
                            </p>
                            <ul className="space-y-1">
                              {tips.slice(0, 3).map((t) => (
                                <li
                                  key={t}
                                  className="flex items-start gap-1.5 text-[11px] text-white/45"
                                >
                                  <span className="text-[var(--vfp-accent)] mt-0.5 shrink-0">
                                    ›
                                  </span>
                                  {t}
                                </li>
                              ))}
                            </ul>
                          </div>
                        ) : null
                      })()}
                  </div>
                </div>
              )}
            </div>

            {/* Share + Coordo buttons */}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  const url = window.location.href
                  if (navigator.share) {
                    navigator
                      .share({ title: `${fullName} — Carte Verte FaîtiereHub`, url })
                      .catch(() => {})
                  } else {
                    navigator.clipboard?.writeText(url).catch(() => {})
                  }
                }}
                className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl border border-[var(--vfp-accent)]/20 bg-[var(--vfp-accent)]/8 text-[var(--vfp-accent)] text-sm font-semibold active:scale-[0.98] transition-transform"
              >
                <Share2 className="h-4 w-4" />
                Partager ma carte
              </button>
              {coordo?.phone && (
                <a
                  href={`https://wa.me/${waNumber(coordo.phone)}?text=${encodeURIComponent(`Bonjour ${coordo.name}, je suis ${firstName}. J'ai une question concernant ma carte membre.`)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 px-4 py-3 rounded-2xl border border-[#25D366]/20 bg-[#25D366]/10 text-[#25D366] text-sm font-semibold active:scale-[0.98] transition-transform"
                >
                  💬
                </a>
              )}
            </div>
          </div>
        )}

        {/* ─── Technicien View ─── */}
        {isValid && activeView === 'technicien' && (
          <div className="space-y-4 vfp-enter">
            <button
              type="button"
              onClick={() => setActiveView('menu')}
              className="flex items-center gap-2 text-[var(--vfp-accent)] text-sm font-medium active:opacity-70"
            >
              <ArrowLeft className="h-4 w-4" /> Retour
            </button>
            <h3 className="text-white text-lg font-bold">Contacter Mon Technicien</h3>
            {contactsLoading && (
              <div className="vfp-card rounded-2xl p-8 text-center">
                <div className="vfp-loader mx-auto" />
                <p className="text-white/40 text-sm mt-3">Recherche...</p>
              </div>
            )}
            {contacts && contacts.length === 0 && (
              <div className="vfp-card rounded-2xl p-6 text-center">
                <PhoneCall className="h-8 w-8 text-white/20 mx-auto mb-2" />
                <p className="text-white/50 text-sm">Aucun technicien trouvé pour votre zone.</p>
              </div>
            )}
            {contacts &&
              contacts.length > 0 &&
              contacts.map((c) => (
                <div key={`${c.role}-${c.phone}`} className="vfp-card rounded-2xl p-4 space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-[var(--vfp-accent)]/15 flex items-center justify-center">
                      <User className="h-5 w-5 text-[var(--vfp-accent)]" />
                    </div>
                    <div>
                      <p className="text-white font-semibold text-sm">{c.name}</p>
                      <p className="text-white/40 text-[10px] uppercase tracking-wider">
                        {c.role === 'technicien'
                          ? `Technicien${c.canton ? ` — ${c.canton}` : ''}`
                          : 'Coordonnateur Faîtière'}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <a
                      href={`tel:${c.phone}`}
                      className="flex-1 py-2.5 rounded-xl bg-[var(--vfp-cta)] text-[var(--vfp-cta-fg)] text-xs font-bold text-center active:scale-95 transition-transform"
                    >
                      📞 Appeler
                    </a>
                    <a
                      href={`https://wa.me/${waNumber(c.phone)}?text=${encodeURIComponent(`Bonjour ${c.name}, je suis ${firstName} (carte ${cardNumber})${c.canton ? `, canton ${c.canton}` : ''}. J'ai besoin d'une assistance agricole.`)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1 py-2.5 rounded-xl bg-[#25D366]/15 text-[#25D366] text-xs font-bold text-center border border-[#25D366]/20 active:scale-95 transition-transform"
                    >
                      💬 WhatsApp
                    </a>
                  </div>
                </div>
              ))}
          </div>
        )}

        {/* ─── AI Chat View ─── */}
        {isValid && activeView === 'ai' && result.member && (
          <div className="space-y-4 vfp-enter">
            <button
              type="button"
              onClick={() => setActiveView('menu')}
              className="flex items-center gap-2 text-[var(--vfp-accent)] text-sm font-medium active:opacity-70"
            >
              <ArrowLeft className="h-4 w-4" /> Retour
            </button>
            <MarketAdvisor
              cardNumber={cardNumber}
              memberName={firstName}
              regionName={result.member.region ?? null}
              onOpenPrices={() => setActiveView('prices')}
            />
          </div>
        )}

        {/* ─── AgriSmart Water View ─── */}
        {isValid && activeView === 'agrismart' && (
          <AgriSmartWater
            onBack={() => setActiveView('menu')}
            initialRegion={result.member?.region ?? undefined}
            cardNumber={cardNumber}
            renderReport={(r, { region }) => <AgriSmartReport result={r} region={region} />}
          />
        )}

        {/* ─── Parcelles View ─── */}
        {isValid && activeView === 'parcelles' && (
          <PrivateCardSection cardNumber={cardNumber}>
            <ParcellesInlineView
              cardNumber={cardNumber}
              onBack={() => setActiveView('menu')}
              onOpenAgriSmart={() => setActiveView('agrismart')}
            />
          </PrivateCardSection>
        )}

        {/* ─── Intrants View ─── */}
        {isValid && activeView === 'intrants' && (
          <PrivateCardSection cardNumber={cardNumber}>
            <IntrantsInlineView cardNumber={cardNumber} onBack={() => setActiveView('menu')} />
          </PrivateCardSection>
        )}

        {/* ─── Cotisation View ─── */}
        {isValid && activeView === 'cotisation' && (
          <PrivateCardSection cardNumber={cardNumber}>
            <CotisationView
              cardNumber={cardNumber}
              onBack={() => setActiveView('menu')}
              coordoPhone={coordo?.phone ?? null}
              coordoName={coordo?.name ?? null}
              memberName={firstName}
              memberCanton={result.member?.canton ?? null}
            />
          </PrivateCardSection>
        )}

        {/* ─── Exploitation View ─── */}
        {isValid && activeView === 'exploitation' && (
          <PrivateCardSection cardNumber={cardNumber}>
            <ExploitationInlineView
              cardNumber={cardNumber}
              onBack={() => setActiveView('menu')}
            />
          </PrivateCardSection>
        )}

        {/* ─── Météo View ─── */}
        {isValid && activeView === 'meteo' && (
          <MeteoInlineView
            cardNumber={cardNumber}
            onBack={() => setActiveView('menu')}
            onOpenAgriSmart={() => setActiveView('agrismart')}
          />
        )}

        {/* ─── Security Timer ─── */}
        {isValid && activeView === 'menu' && (
          <div
            className={`vfp-card rounded-2xl p-3 transition-all duration-700 ${showContent ? 'opacity-100' : 'opacity-0'}`}
            style={{ transitionDelay: '600ms' }}
          >
            <div className="flex items-center gap-3">
              <Timer className="h-4 w-4 text-white/30 shrink-0" />
              <div className="flex-1">
                <div className="h-1 rounded-full bg-white/[0.06] overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-1000"
                    style={{
                      width: `${(timeLeft / 600) * 100}%`,
                      background:
                        'linear-gradient(to right, var(--vfp-accent), var(--vfp-accent-dim))',
                    }}
                  />
                </div>
              </div>
              <span className="text-white/30 text-[11px] font-mono shrink-0">
                {Math.floor(timeLeft / 60)}:{(timeLeft % 60).toString().padStart(2, '0')}
              </span>
            </div>
          </div>
        )}
      </div>
      {mobileMenuOpen && <VerifyMobileMenu onClose={() => setMobileMenuOpen(false)} />}
    </div>
  )
}

function VerifyMobileMenu({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: arrière-plan — jamais une cible clavier, la fermeture au clavier passe par Escape (cf. le useEffect ci-dessus)
    <div className="fixed inset-0 z-50" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: pure plomberie anti-bubbling (stopPropagation), aucune action à apparier à un événement clavier */}
      <div
        className="absolute bottom-0 left-0 right-0 max-w-md mx-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bg-[#040f0a]/95 backdrop-blur-xl rounded-t-3xl p-5 space-y-2 border-t border-white/10">
          <div className="w-8 h-1 rounded-full bg-white/20 mx-auto mb-4" />
          <button
            type="button"
            onClick={() => {
              if (typeof navigator !== 'undefined' && navigator.share) {
                navigator.share({ title: 'FaîtiereHub', url: window.location.href }).catch(() => {})
              }
              onClose()
            }}
            className="w-full flex items-center gap-4 rounded-2xl p-4 bg-white/5 active:bg-white/10 text-left transition-colors"
          >
            <Share2 className="h-5 w-5 text-[var(--vfp-accent)] shrink-0" />
            <p className="text-white text-sm font-semibold">Partager cette page</p>
          </button>
          <Link
            href="/scan"
            onClick={onClose}
            className="flex items-center gap-4 rounded-2xl p-4 bg-white/5 active:bg-white/10 transition-colors"
          >
            <ScanLine className="h-5 w-5 text-[var(--vfp-accent)] shrink-0" />
            <p className="text-white text-sm font-semibold">Scanner une carte</p>
          </Link>
          <Link
            href="/"
            onClick={onClose}
            className="flex items-center gap-4 rounded-2xl p-4 bg-white/5 active:bg-white/10 transition-colors"
          >
            <ArrowLeft className="h-5 w-5 text-white/40 shrink-0" />
            <p className="text-white text-sm font-semibold">Accueil FaîtiereHub</p>
          </Link>
        </div>
      </div>
    </div>
  )
}
