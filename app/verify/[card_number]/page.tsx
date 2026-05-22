'use client'

import { useEffect, useState, useMemo } from 'react'
import { useParams } from 'next/navigation'
import { createBrowserClient } from '@supabase/ssr'
import { CheckCircle, XCircle, Shield, MapPin, Phone, Building2, Calendar, TreePine, Coins } from 'lucide-react'
import { Logo } from '@/components/shared/logo'

/**
 * Public verification page — accessed by scanning the QR code on a member card.
 * 
 * The QR code contains a FIXED URL: /verify/[card_number]
 * This page fetches ALL data in REAL-TIME from the database.
 * 
 * This means:
 * - The QR code NEVER changes (same URL for the life of the card)
 * - New features added here are immediately visible on next scan
 * - Member data updates are reflected instantly
 * - No need to reprint the card when adding features
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

export default function VerifyCardPage() {
  const params = useParams()
  const cardNumber = params.card_number as string
  // Independent Supabase client — NOT shared with AuthProvider
  // This prevents token refresh interference
  const supabase = useMemo(() => createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  ), [])
  const [result, setResult] = useState<VerifyResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [showDetails, setShowDetails] = useState(false)

  useEffect(() => {
    // Guard: don't re-fetch if already loaded
    if (result) return

    let cancelled = false
    async function verify() {
      const decodedCardNumber = decodeURIComponent(cardNumber)

      // Fetch card + member + cooperative in one query
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
          setTimeout(() => setShowDetails(true), 400)
        }
        return
      }

      const isExpired = card.expiry_date && new Date(card.expiry_date) < new Date()
      const isActive = card.status === 'active' && !isExpired

      // Fetch cotisations for this member
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
      if (!cancelled) {
        setLoading(false)
        setTimeout(() => setShowDetails(true), 600)
      }
    }
    verify()
    return () => { cancelled = true }
  }, [cardNumber]) // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) {
    return (
      <div className="min-h-screen bg-[#061a0f] flex items-center justify-center">
        <div className="text-center space-y-6">
          <div className="relative">
            <div className="w-20 h-20 border-4 border-[#1ed760]/30 border-t-[#1ed760] rounded-full animate-spin mx-auto" />
            <Shield className="h-8 w-8 text-[#1ed760] absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
          </div>
          <p className="text-white/60 text-sm animate-pulse">Vérification en cours...</p>
        </div>
      </div>
    )
  }

  if (!result) return null

  const isValid = result.valid
  const locality = [result.member?.village, result.member?.canton, result.member?.prefecture, result.member?.region].filter(Boolean).join(', ')

  return (
    <div className="min-h-screen bg-[#061a0f] relative overflow-hidden">
      {/* Animated background */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-20%] right-[-10%] w-[600px] h-[600px] rounded-full bg-[#1ed760]/5 blur-3xl animate-pulse" />
        <div className="absolute bottom-[-20%] left-[-10%] w-[500px] h-[500px] rounded-full bg-[#0B6B3A]/10 blur-3xl" />
        {isValid && (
          <>
            <div className="absolute top-[20%] left-[10%] w-2 h-2 bg-[#1ed760]/40 rounded-full animate-bounce" style={{ animationDelay: '0s', animationDuration: '3s' }} />
            <div className="absolute top-[40%] right-[15%] w-1.5 h-1.5 bg-[#1ed760]/30 rounded-full animate-bounce" style={{ animationDelay: '1s', animationDuration: '4s' }} />
            <div className="absolute top-[60%] left-[20%] w-1 h-1 bg-[#1ed760]/50 rounded-full animate-bounce" style={{ animationDelay: '2s', animationDuration: '2.5s' }} />
          </>
        )}
      </div>

      <div className="relative z-10 max-w-md mx-auto px-4 py-8 space-y-6">
        {/* Header */}
        <div className="text-center">
          <Logo size="md" textClassName="text-white" />
        </div>

        {/* Main verification card */}
        <div className={`rounded-3xl border overflow-hidden transition-all duration-700 ${
          isValid 
            ? 'border-[#1ed760]/30 bg-gradient-to-b from-[#0d3d22] to-[#0a2e1a] shadow-[0_0_60px_rgba(30,215,96,0.15)]' 
            : 'border-red-500/30 bg-gradient-to-b from-[#3d0d0d] to-[#1a0a0a] shadow-[0_0_60px_rgba(239,68,68,0.15)]'
        }`}>
          
          {/* Status header */}
          <div className={`px-6 py-5 text-center border-b ${isValid ? 'border-[#1ed760]/10' : 'border-red-500/10'}`}>
            <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold ${
              isValid 
                ? 'bg-[#1ed760]/10 text-[#1ed760] border border-[#1ed760]/20' 
                : 'bg-red-500/10 text-red-400 border border-red-500/20'
            }`}>
              {isValid ? <CheckCircle className="h-5 w-5" /> : <XCircle className="h-5 w-5" />}
              {isValid ? 'MEMBRE VÉRIFIÉ ✓' : result.card?.status === 'expired' ? 'CARTE EXPIRÉE' : result.card?.status === 'revoked' ? 'CARTE RÉVOQUÉE' : 'CARTE INVALIDE'}
            </div>
          </div>

          {/* Member info */}
          {result.member && (
            <div className={`px-6 py-6 space-y-5 transition-all duration-700 ${showDetails ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
              
              {/* Photo + Name */}
              <div className="flex items-center gap-4">
                <div className={`relative w-20 h-20 rounded-full overflow-hidden border-3 ${isValid ? 'border-[#1ed760]/40' : 'border-red-500/40'}`}>
                  {result.member.photo_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={result.member.photo_url} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full bg-white/10 flex items-center justify-center">
                      <span className="text-2xl">👤</span>
                    </div>
                  )}
                  {isValid && (
                    <div className="absolute -bottom-1 -right-1 w-6 h-6 bg-[#1ed760] rounded-full flex items-center justify-center">
                      <CheckCircle className="h-4 w-4 text-white" />
                    </div>
                  )}
                </div>
                <div>
                  <h2 className="text-xl font-bold text-white">
                    {result.member.first_name} <span className="uppercase">{result.member.last_name}</span>
                  </h2>
                  <p className="text-white/50 text-sm font-mono">{result.card?.card_number}</p>
                  {result.memberSince && (
                    <p className="text-white/30 text-xs mt-0.5">
                      Membre depuis {new Date(result.memberSince).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}
                    </p>
                  )}
                </div>
              </div>

              {/* Info grid */}
              <div className="grid grid-cols-2 gap-3">
                {[
                  { icon: MapPin, label: 'Localité', value: locality || '—' },
                  { icon: Phone, label: 'Téléphone', value: result.member.phone ?? '—' },
                  { icon: Building2, label: 'Coopérative', value: result.cooperative?.name ?? '—' },
                  { icon: TreePine, label: 'Faîtière', value: result.cooperative?.faitiere_name ?? '—' },
                ].map((item, i) => (
                  <div
                    key={i}
                    className={`p-3 rounded-xl bg-white/[0.03] border border-white/[0.06] transition-all duration-500 ${showDetails ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}
                    style={{ transitionDelay: `${300 + i * 100}ms` }}
                  >
                    <item.icon className="h-4 w-4 text-[#1ed760] mb-1.5" />
                    <p className="text-[10px] text-white/40 uppercase tracking-wider">{item.label}</p>
                    <p className="text-xs text-white font-medium mt-0.5 truncate">{item.value}</p>
                  </div>
                ))}
              </div>

              {/* Cotisations section */}
              {result.cotisations && (
                <div className={`p-4 rounded-xl bg-white/[0.03] border border-white/[0.06] transition-all duration-500 ${showDetails ? 'opacity-100' : 'opacity-0'}`} style={{ transitionDelay: '700ms' }}>
                  <div className="flex items-center gap-2 mb-3">
                    <Coins className="h-4 w-4 text-[#1ed760]" />
                    <p className="text-xs text-white/60 uppercase tracking-wider font-semibold">Cotisations</p>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="text-center">
                      <p className="text-lg font-bold text-[#1ed760]">{result.cotisations.paid}</p>
                      <p className="text-[9px] text-white/40">Payées</p>
                    </div>
                    <div className="text-center">
                      <p className="text-lg font-bold text-yellow-400">{result.cotisations.pending}</p>
                      <p className="text-[9px] text-white/40">En attente</p>
                    </div>
                    <div className="text-center">
                      <p className="text-lg font-bold text-white/60">{result.cotisations.total}</p>
                      <p className="text-[9px] text-white/40">Total</p>
                    </div>
                  </div>
                  {result.cotisations.lastPaidDate && (
                    <p className="text-[10px] text-white/30 mt-2 text-center">
                      Dernière cotisation : {new Date(result.cotisations.lastPaidDate).toLocaleDateString('fr-FR')}
                    </p>
                  )}
                  {result.cotisations.total === 0 && (
                    <p className="text-[10px] text-white/30 mt-1 text-center">Aucune cotisation enregistrée</p>
                  )}
                </div>
              )}

              {/* Validity */}
              {result.card && (
                <div className={`flex items-center justify-between p-3 rounded-xl bg-white/[0.03] border border-white/[0.06] transition-all duration-500 ${showDetails ? 'opacity-100' : 'opacity-0'}`} style={{ transitionDelay: '800ms' }}>
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-white/40" />
                    <div>
                      <p className="text-[10px] text-white/40 uppercase">Valide jusqu&apos;au</p>
                      <p className="text-sm text-white font-semibold">
                        {result.card.expiry_date 
                          ? new Date(result.card.expiry_date).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })
                          : '—'}
                      </p>
                    </div>
                  </div>
                  <div className={`px-3 py-1 rounded-full text-xs font-bold ${
                    isValid ? 'bg-[#1ed760]/10 text-[#1ed760]' : 'bg-red-500/10 text-red-400'
                  }`}>
                    {isValid ? '● ACTIVE' : '● INACTIVE'}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Error state */}
          {!result.member && (
            <div className="px-6 py-12 text-center">
              <XCircle className="h-16 w-16 text-red-400/50 mx-auto mb-4" />
              <p className="text-white/60 text-sm">
                {result.error ?? 'Cette carte n\'existe pas dans notre système.'}
              </p>
              <p className="text-white/30 text-xs mt-2 font-mono">{decodeURIComponent(cardNumber)}</p>
            </div>
          )}

          {/* Footer */}
          <div className={`px-6 py-4 border-t ${isValid ? 'border-[#1ed760]/10' : 'border-red-500/10'} text-center`}>
            <div className="flex items-center justify-center gap-2">
              <Shield className={`h-3.5 w-3.5 ${isValid ? 'text-[#1ed760]/60' : 'text-red-400/60'}`} />
              <p className="text-[10px] text-white/30 uppercase tracking-widest">
                Sécurisé • Vérifié • FaîtiereHub
              </p>
            </div>
          </div>
        </div>

        {/* Bottom info */}
        <div className="text-center space-y-2">
          <p className="text-white/30 text-xs">
            Vérification en temps réel — les données sont toujours à jour.
          </p>
          <p className="text-white/20 text-[10px]">
            © {new Date().getFullYear()} FaîtiereHub — Plateforme des faîtières agricoles
          </p>
        </div>
      </div>
    </div>
  )
}
