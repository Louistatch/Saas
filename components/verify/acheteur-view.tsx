'use client'

import { useState } from 'react'
import {
  ArrowLeft, User, ShoppingCart, TrendingUp, Bot,
  MapPin, Package, Building2, ExternalLink, Phone, MessageCircle, RefreshCw,
} from 'lucide-react'
import { MarketPricesDashboard } from '@/components/verify/market-prices-dashboard'
import { AiChat } from '@/components/verify/ai-chat'

interface AcheteurViewProps {
  cardNumber: string
  acheteur: {
    first_name: string | null
    last_name: string | null
    phone: string | null
    photo_url: string | null
    type_acheteur: string
    nom_organisation: string | null
    produits_interesses: string[]
    cantons_intervention: string[]
  }
  preventes: Array<{
    id: string
    culture: string
    quantite_estimee: number
    prix_par_kg: number
    date_recolte_prevue: string
    canton: string
    description: string | null
  }>
  card: {
    card_number: string
    status: string
    expiry_date: string | null
    created_at: string
  }
}

type ActiveView = 'menu' | 'profil' | 'preventes' | 'prices' | 'ai'

const TYPE_LABELS: Record<string, string> = {
  PARTICULIER: 'Particulier',
  ENTREPRISE: 'Entreprise',
  COOPERATIVE: 'Coopérative',
  EXPORTATEUR: 'Exportateur',
}

export function AcheteurView({ cardNumber, acheteur, preventes, card }: AcheteurViewProps) {
  const [activeView, setActiveView] = useState<ActiveView>('menu')
  const [preventesKey, setPreventesKey] = useState(0)

  const rawFirst = (acheteur.first_name ?? '').trim()
  const firstName = rawFirst
    ? rawFirst.charAt(0).toUpperCase() + rawFirst.slice(1).toLowerCase()
    : 'Acheteur'

  const greetHour = new Date().getHours()
  const greeting = greetHour < 12 ? 'Bonjour' : greetHour < 18 ? 'Bon après-midi' : 'Bonsoir'

  const typeLabel = TYPE_LABELS[acheteur.type_acheteur] ?? acheteur.type_acheteur

  const phoneDigits = acheteur.phone ? acheteur.phone.replace(/\D/g, '') : null
  const waPhone = phoneDigits ? (phoneDigits.startsWith('228') ? phoneDigits : `228${phoneDigits}`) : null

  if (activeView === 'prices') {
    return (
      <div className="acheteur-wrap space-y-4 vfp-enter">
        <style>{acheteurStyles}</style>
        <button onClick={() => setActiveView('menu')} className="flex items-center gap-2 text-[var(--vfp-accent)] text-sm font-medium active:opacity-70">
          <ArrowLeft className="h-4 w-4" /> Retour
        </button>
        <MarketPricesDashboard />
      </div>
    )
  }

  if (activeView === 'ai') {
    return (
      <div className="acheteur-wrap">
        <style>{acheteurStyles}</style>
        <AiChat cardNumber={cardNumber} memberName={firstName} onBack={() => setActiveView('menu')} />
      </div>
    )
  }

  return (
    <div className="acheteur-wrap space-y-4">
      <style>{acheteurStyles}</style>

      {/* Hero */}
      <section className="vfp-enter">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-white/60 text-sm mb-1">{greeting}, {firstName} ! 🤝</p>
            <h1 className="text-[24px] font-bold text-white leading-tight">
              Votre espace<br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-[var(--vfp-accent)] to-[var(--vfp-accent-dim)]">Acheteur &amp; Trader</span>
            </h1>
            <p className="text-white/40 text-sm mt-2">Trouvez des préventes et fournisseurs certifiés.</p>
          </div>
          <div className="vfp-glass-subtle rounded-2xl px-4 py-3 text-center shrink-0">
            <div className="w-10 h-10 rounded-full bg-[var(--vfp-accent)]/15 flex items-center justify-center mx-auto mb-1.5">
              <Building2 className="h-5 w-5 text-[var(--vfp-accent)] vfp-pop" />
            </div>
            <p className="text-white text-xs font-semibold">{typeLabel}</p>
            <div className="flex items-center gap-1 justify-center mt-0.5">
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--vfp-accent)] animate-pulse" />
              <span className="text-[var(--vfp-accent-dim)] text-[10px]">Carte vérifiée</span>
            </div>
          </div>
        </div>
      </section>

      {/* Card info strip */}
      <div className="vfp-card rounded-xl px-4 py-3 flex items-center gap-3 vfp-enter">
        <div className="w-9 h-9 rounded-full bg-[var(--vfp-accent)]/15 flex items-center justify-center shrink-0">
          {acheteur.photo_url
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={acheteur.photo_url} alt="" className="w-9 h-9 rounded-full object-cover" />
            : <User className="h-4 w-4 text-[var(--vfp-accent)]" />}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-white text-sm font-semibold truncate">
            {acheteur.first_name ?? ''} <span className="uppercase">{acheteur.last_name ?? ''}</span>
          </p>
          <p className="text-white/40 text-[11px] font-mono">{card.card_number}</p>
        </div>
        {acheteur.nom_organisation && (
          <div className="text-right">
            <p className="text-[var(--vfp-accent-dim)] text-xs truncate max-w-[100px]">{acheteur.nom_organisation}</p>
          </div>
        )}
      </div>

      {/* Services grid */}
      <section className="vfp-enter" style={{ transitionDelay: '100ms' }}>
        <div className="flex items-center justify-between mb-3 px-1">
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-[var(--vfp-accent)]" />
            <h3 className="text-white font-semibold text-[15px]">Mes services</h3>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2.5">

          {/* Mon Profil */}
          <button onClick={() => setActiveView(activeView === 'profil' ? 'menu' : 'profil')} className="vfp-card rounded-2xl p-4 flex flex-col items-center justify-center text-center min-h-[110px]">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-[var(--vfp-accent)]/20 to-[var(--vfp-accent)]/5 flex items-center justify-center mb-2.5">
              <User className="h-5 w-5 text-[var(--vfp-accent-bright)]" />
            </div>
            <p className="font-semibold text-sm text-white mb-0.5">Mon Profil</p>
            <p className="text-xs text-white/30">Type &amp; produits</p>
          </button>

          {/* Préventes */}
          <button onClick={() => setActiveView(activeView === 'preventes' ? 'menu' : 'preventes')} className="vfp-card rounded-2xl p-4 flex flex-col items-center justify-center text-center min-h-[110px]">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-emerald-500/20 to-emerald-700/5 flex items-center justify-center mb-2.5 relative">
              <Package className="h-5 w-5 text-emerald-300" />
              {preventes.length > 0 && (
                <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-[var(--vfp-accent)] text-[var(--vfp-cta-fg)] text-[10px] font-bold flex items-center justify-center">{preventes.length}</span>
              )}
            </div>
            <p className="font-semibold text-sm text-white mb-0.5">Préventes</p>
            <p className="text-xs text-white/30">{preventes.length} disponible{preventes.length > 1 ? 's' : ''}</p>
          </button>

          {/* Fournisseurs — external link with noopener */}
          <a
            href="/fournisseurs"
            target="_blank"
            rel="noopener noreferrer"
            className="vfp-card rounded-2xl p-4 flex flex-col items-center justify-center text-center min-h-[110px]"
          >
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-teal-500/20 to-teal-700/5 flex items-center justify-center mb-2.5">
              <ExternalLink className="h-5 w-5 text-teal-300" />
            </div>
            <p className="font-semibold text-sm text-white mb-0.5">Fournisseurs</p>
            <p className="text-xs text-white/30">Certifiés &amp; vérifiés</p>
          </a>

          {/* Prix du Marché */}
          <button onClick={() => setActiveView('prices')} className="vfp-card rounded-2xl p-4 flex flex-col items-center justify-center text-center min-h-[110px]">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-violet-500/20 to-violet-700/5 flex items-center justify-center mb-2.5">
              <TrendingUp className="h-5 w-5 text-violet-300" />
            </div>
            <p className="font-semibold text-sm text-white mb-0.5">Prix du Marché</p>
            <p className="text-xs text-white/30">Cours en temps réel</p>
          </button>

          {/* Mes Engagements */}
          <button className="vfp-card rounded-2xl p-4 flex flex-col items-center justify-center text-center min-h-[110px] opacity-60" disabled>
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-slate-500/10 to-slate-700/5 flex items-center justify-center mb-2.5">
              <ShoppingCart className="h-5 w-5 text-white/30" />
            </div>
            <p className="font-semibold text-sm text-white/40 mb-0.5">Mes Engagements</p>
            <span className="mt-1 px-2 py-0.5 rounded-full bg-white/5 text-white/25 text-[10px] font-bold uppercase">Bientôt</span>
          </button>

          {/* Assistant IA */}
          <button onClick={() => setActiveView('ai')} className="vfp-card rounded-2xl p-4 flex flex-col items-center justify-center text-center min-h-[110px]">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-amber-400/20 to-amber-600/5 flex items-center justify-center mb-2.5">
              <Bot className="h-5 w-5 text-amber-300" />
            </div>
            <p className="font-semibold text-sm text-white mb-0.5">Assistant IA</p>
            <p className="text-xs text-amber-300/50">Conseils &amp; prévisions</p>
          </button>

          {/* Alerte Prix */}
          <button className="vfp-card rounded-2xl p-4 flex flex-col items-center justify-center text-center min-h-[110px] opacity-60" disabled>
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-slate-500/10 to-slate-700/5 flex items-center justify-center mb-2.5">
              <TrendingUp className="h-5 w-5 text-white/30" />
            </div>
            <p className="font-semibold text-sm text-white/40 mb-0.5">Alerte Prix</p>
            <span className="mt-1 px-2 py-0.5 rounded-full bg-white/5 text-white/25 text-[10px] font-bold uppercase">Bientôt</span>
          </button>

          {/* Marketplace — external link with noopener */}
          <a
            href="/marketplace"
            target="_blank"
            rel="noopener noreferrer"
            className="vfp-card rounded-2xl p-4 flex flex-col items-center justify-center text-center min-h-[110px]"
          >
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-cyan-500/20 to-cyan-700/5 flex items-center justify-center mb-2.5">
              <ExternalLink className="h-5 w-5 text-cyan-300" />
            </div>
            <p className="font-semibold text-sm text-white mb-0.5">Marketplace</p>
            <p className="text-xs text-white/30">Offres &amp; demandes</p>
          </a>

        </div>
      </section>

      {/* ─── Profil expanded ─── */}
      {activeView === 'profil' && (
        <div className="vfp-card rounded-2xl p-5 space-y-4 vfp-enter">
          <div className="flex items-center justify-between">
            <h3 className="text-white font-bold text-base">Mon Profil</h3>
            <button onClick={() => setActiveView('menu')} className="text-[var(--vfp-accent)] text-sm font-medium">
              <ArrowLeft className="h-4 w-4 inline mr-1" />Réduire
            </button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-3">
              <span className="text-[11px] text-white/40 uppercase font-semibold tracking-wider">Type</span>
              <p className="text-white text-sm font-semibold mt-0.5">{typeLabel}</p>
            </div>
            {acheteur.nom_organisation && (
              <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-3">
                <span className="text-[11px] text-white/40 uppercase font-semibold tracking-wider">Organisation</span>
                <p className="text-white text-sm font-semibold mt-0.5 truncate">{acheteur.nom_organisation}</p>
              </div>
            )}
          </div>
          {acheteur.produits_interesses.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Package className="h-3.5 w-3.5 text-[var(--vfp-accent)]" />
                <span className="text-xs text-[var(--vfp-accent)] font-semibold uppercase tracking-wider">Produits d&apos;intérêt</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {acheteur.produits_interesses.map((p, i) => (
                  <span key={i} className="px-2.5 py-1 rounded-full bg-[var(--vfp-accent)]/10 border border-[var(--vfp-accent)]/20 text-[var(--vfp-accent-bright)] text-xs font-medium">{p}</span>
                ))}
              </div>
            </div>
          )}
          {acheteur.cantons_intervention.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <MapPin className="h-3.5 w-3.5 text-[var(--vfp-accent)]" />
                <span className="text-xs text-[var(--vfp-accent)] font-semibold uppercase tracking-wider">Zones d&apos;intervention</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {acheteur.cantons_intervention.map((c, i) => (
                  <span key={i} className="px-2.5 py-1 rounded-full bg-white/[0.06] border border-white/[0.08] text-white/70 text-xs">{c}</span>
                ))}
              </div>
            </div>
          )}
          {/* Phone contact */}
          {acheteur.phone && (
            <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-3">
              <div className="flex items-center gap-2 mb-2">
                <Phone className="h-3.5 w-3.5 text-[var(--vfp-accent)]" />
                <span className="text-xs text-[var(--vfp-accent)] font-semibold uppercase tracking-wider">Contact</span>
              </div>
              <div className="flex items-center gap-2">
                <a
                  href={`tel:${acheteur.phone}`}
                  className="flex-1 flex items-center gap-2 px-3 py-2 rounded-xl bg-[var(--vfp-accent)]/10 border border-[var(--vfp-accent)]/20 text-[var(--vfp-accent-bright)] text-sm font-medium active:opacity-70"
                >
                  <Phone className="h-4 w-4" />
                  {acheteur.phone}
                </a>
                {waPhone && (
                  <a
                    href={`https://wa.me/${waPhone}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-green-500/10 border border-green-500/20 text-green-300 text-sm font-medium active:opacity-70"
                  >
                    <MessageCircle className="h-4 w-4" />
                    WhatsApp
                  </a>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ─── Préventes expanded ─── */}
      {activeView === 'preventes' && (
        <div key={preventesKey} className="space-y-3 vfp-enter">
          <div className="flex items-center justify-between px-1">
            <h3 className="text-white font-bold text-base">Préventes disponibles</h3>
            <button onClick={() => setActiveView('menu')} className="text-[var(--vfp-accent)] text-sm font-medium">
              <ArrowLeft className="h-4 w-4 inline mr-1" />Réduire
            </button>
          </div>
          {preventes.length === 0 && (
            <div className="vfp-card rounded-2xl p-6 text-center space-y-3">
              <Package className="h-8 w-8 text-white/20 mx-auto" />
              <p className="text-white/50 text-sm">Aucune prévente disponible pour l&apos;instant.</p>
              <button
                onClick={() => setPreventesKey(k => k + 1)}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[var(--vfp-accent)]/10 border border-[var(--vfp-accent)]/20 text-[var(--vfp-accent-bright)] text-sm font-medium active:opacity-70"
              >
                <RefreshCw className="h-4 w-4" />
                Actualiser
              </button>
            </div>
          )}
          {preventes.map((p) => (
            <div key={p.id} className="vfp-card rounded-2xl p-4 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-white font-semibold text-sm">{p.culture}</p>
                  <p className="text-[var(--vfp-accent-dim)] text-xs mt-0.5">
                    {p.quantite_estimee.toLocaleString('fr-FR')} kg estimés
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-[var(--vfp-accent)] font-bold text-sm">{p.prix_par_kg.toLocaleString('fr-FR')} FCFA/kg</p>
                  <p className="text-white/30 text-[10px]">Prix indicatif</p>
                </div>
              </div>
              <div className="flex items-center gap-3 text-xs text-white/40">
                <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{p.canton}</span>
                <span>Récolte : {new Date(p.date_recolte_prevue).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
              </div>
              {p.description && <p className="text-white/40 text-xs leading-relaxed">{p.description}</p>}
            </div>
          ))}
        </div>
      )}

    </div>
  )
}

const acheteurStyles = `
  .acheteur-wrap {
    --vfp-accent: oklch(0.72 0.18 280);
    --vfp-accent-dim: oklch(0.58 0.14 280);
    --vfp-accent-bright: oklch(0.84 0.16 280);
    --vfp-cta: oklch(0.72 0.18 280);
    --vfp-cta-fg: oklch(0.10 0.03 280);
  }
  .acheteur-wrap .vfp-glass-subtle {
    background: rgba(255,255,255,.04);
    border: 1px solid rgba(255,255,255,.06);
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
  }
  .acheteur-wrap .vfp-card {
    background: linear-gradient(160deg, rgba(255,255,255,.055), rgba(255,255,255,.015));
    border: 1px solid rgba(255,255,255,.07);
    backdrop-filter: blur(12px) saturate(1.05);
    -webkit-backdrop-filter: blur(12px) saturate(1.05);
    box-shadow: 0 4px 24px -8px rgba(0,0,0,.4), inset 0 1px 0 rgba(255,255,255,.06);
    transition: transform .2s cubic-bezier(.2,.7,.2,1), border-color .2s, box-shadow .2s;
  }
  .acheteur-wrap .vfp-card:active:not(:disabled) { transform: scale(.97); }
  .acheteur-wrap .vfp-card:hover:not(:disabled) { border-color: oklch(0.72 0.18 280 / 0.25); }
  .vfp-enter { animation: vfpIn .5s cubic-bezier(.2,.7,.2,1) both; }
  @keyframes vfpIn { from { opacity:0; transform: translateY(12px); } to { opacity:1; transform: none; } }
  .vfp-pop { animation: vfpPop .5s cubic-bezier(.2,1.4,.4,1) .3s both; }
  @keyframes vfpPop { 0% { transform: scale(0); } 60% { transform: scale(1.2); } 100% { transform: scale(1); } }
`
