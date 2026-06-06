'use client'

import { useState } from 'react'
import {
  ArrowLeft, User, Briefcase, MapPin, Star, Clock,
  TrendingUp, Bot, CheckCircle, XCircle, Calendar,
  Coins, Award, BookOpen, Phone, MessageCircle, RefreshCw,
} from 'lucide-react'
import { MarketPricesDashboard } from '@/components/verify/market-prices-dashboard'
import { AiChat } from '@/components/verify/ai-chat'

interface OuvrierViewProps {
  cardNumber: string
  ouvrier: {
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
  offres: Array<{
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
  card: {
    card_number: string
    status: string
    expiry_date: string | null
    created_at: string
  }
}

type ActiveView = 'menu' | 'profil' | 'offres' | 'prices' | 'ai' | 'evaluation'

export function OuvrierView({ cardNumber, ouvrier, offres, card }: OuvrierViewProps) {
  const [activeView, setActiveView] = useState<ActiveView>('menu')
  const [offresKey, setOffresKey] = useState(0)

  const rawFirst = (ouvrier.first_name ?? '').trim()
  const firstName = rawFirst
    ? rawFirst.charAt(0).toUpperCase() + rawFirst.slice(1).toLowerCase()
    : 'Ouvrier'

  const greetHour = new Date().getHours()
  const greeting = greetHour < 12 ? 'Bonjour' : greetHour < 18 ? 'Bon après-midi' : 'Bonsoir'

  const disponibilityLabel = ouvrier.disponible
    ? 'Disponible'
    : ouvrier.disponible_jusqu_au
      ? `Occupé jusqu'au ${new Date(ouvrier.disponible_jusqu_au).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}`
      : 'Occupé'

  const phoneDigits = ouvrier.phone ? ouvrier.phone.replace(/\D/g, '') : null
  const waPhone = phoneDigits ? (phoneDigits.startsWith('228') ? phoneDigits : `228${phoneDigits}`) : null

  function renderStars(note: number) {
    return Array.from({ length: 5 }, (_, i) => (
      <span key={i} className={i < Math.round(note) ? 'text-[var(--vfp-accent)]' : 'text-white/20'}>★</span>
    ))
  }

  if (activeView === 'prices') {
    return (
      <div className="ouvrier-wrap space-y-4 vfp-enter">
        <style>{ouvrierStyles}</style>
        <button onClick={() => setActiveView('menu')} className="flex items-center gap-2 text-[var(--vfp-accent)] text-sm font-medium active:opacity-70">
          <ArrowLeft className="h-4 w-4" /> Retour
        </button>
        <MarketPricesDashboard />
      </div>
    )
  }

  if (activeView === 'ai') {
    return (
      <div className="ouvrier-wrap">
        <style>{ouvrierStyles}</style>
        <AiChat cardNumber={cardNumber} memberName={firstName} onBack={() => setActiveView('menu')} />
      </div>
    )
  }

  return (
    <div className="ouvrier-wrap space-y-4">
      <style>{ouvrierStyles}</style>

      {/* Hero */}
      <section className="vfp-enter">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-white/60 text-sm mb-1">{greeting}, {firstName} ! 👷</p>
            <h1 className="text-[24px] font-bold text-white leading-tight">
              Votre espace<br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-[var(--vfp-accent)] to-[var(--vfp-accent-dim)]">Ouvrier Agricole</span>
            </h1>
            <p className="text-white/40 text-sm mt-2">Trouvez du travail dans vos cantons.</p>
          </div>
          <div className="vfp-glass-subtle rounded-2xl px-4 py-3 text-center shrink-0">
            <div className="w-10 h-10 rounded-full bg-[var(--vfp-accent)]/15 flex items-center justify-center mx-auto mb-1.5">
              {ouvrier.disponible
                ? <CheckCircle className="h-5 w-5 text-[var(--vfp-accent)] vfp-pop" />
                : <XCircle className="h-5 w-5 text-orange-400" />}
            </div>
            <p className="text-white text-xs font-semibold leading-tight max-w-[80px]">{disponibilityLabel}</p>
            <div className="flex items-center gap-1 justify-center mt-0.5">
              <span className={`w-1.5 h-1.5 rounded-full ${ouvrier.disponible ? 'bg-[var(--vfp-accent)] animate-pulse' : 'bg-orange-400'}`} />
              <span className="text-[var(--vfp-accent-dim)] text-[10px]">Carte vérifiée</span>
            </div>
          </div>
        </div>
      </section>

      {/* Card info strip */}
      <div className="vfp-card rounded-xl px-4 py-3 flex items-center gap-3 vfp-enter">
        <div className="w-9 h-9 rounded-full bg-[var(--vfp-accent)]/15 flex items-center justify-center shrink-0">
          {ouvrier.photo_url
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={ouvrier.photo_url} alt="" className="w-9 h-9 rounded-full object-cover" />
            : <User className="h-4 w-4 text-[var(--vfp-accent)]" />}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-white text-sm font-semibold truncate">
            {ouvrier.first_name ?? ''} <span className="uppercase">{ouvrier.last_name ?? ''}</span>
          </p>
          <p className="text-white/40 text-[11px] font-mono">{card.card_number}</p>
        </div>
        {ouvrier.tarif_journalier && (
          <div className="text-right">
            <p className="text-[var(--vfp-accent)] text-sm font-bold">{ouvrier.tarif_journalier.toLocaleString('fr-FR')} FCFA</p>
            <p className="text-white/30 text-[10px]">/ jour</p>
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
            <p className="text-xs text-white/30">Compétences & zones</p>
          </button>

          {/* Offres d'emploi */}
          <button onClick={() => setActiveView(activeView === 'offres' ? 'menu' : 'offres')} className="vfp-card rounded-2xl p-4 flex flex-col items-center justify-center text-center min-h-[110px]">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-amber-500/20 to-amber-700/5 flex items-center justify-center mb-2.5 relative">
              <Briefcase className="h-5 w-5 text-amber-300" />
              {offres.length > 0 && (
                <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-[var(--vfp-accent)] text-[var(--vfp-cta-fg)] text-[10px] font-bold flex items-center justify-center">{offres.length}</span>
              )}
            </div>
            <p className="font-semibold text-sm text-white mb-0.5">Offres d&apos;emploi</p>
            <p className="text-xs text-white/30">{offres.length} dans mes cantons</p>
          </button>

          {/* Ma Disponibilité */}
          <button className="vfp-card rounded-2xl p-4 flex flex-col items-center justify-center text-center min-h-[110px] opacity-60" disabled>
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-teal-500/20 to-teal-700/5 flex items-center justify-center mb-2.5">
              <Calendar className="h-5 w-5 text-teal-300" />
            </div>
            <p className="font-semibold text-sm text-white/40 mb-0.5">Disponibilité</p>
            <span className="mt-1 px-2 py-0.5 rounded-full bg-white/5 text-white/25 text-[10px] font-bold uppercase">Bientôt</span>
          </button>

          {/* Prix du Marché */}
          <button onClick={() => setActiveView('prices')} className="vfp-card rounded-2xl p-4 flex flex-col items-center justify-center text-center min-h-[110px]">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-violet-500/20 to-violet-700/5 flex items-center justify-center mb-2.5">
              <TrendingUp className="h-5 w-5 text-violet-300" />
            </div>
            <p className="font-semibold text-sm text-white mb-0.5">Prix du Marché</p>
            <p className="text-xs text-white/30">Cours en temps réel</p>
          </button>

          {/* Formation */}
          <button className="vfp-card rounded-2xl p-4 flex flex-col items-center justify-center text-center min-h-[110px] opacity-60" disabled>
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-cyan-500/20 to-cyan-700/5 flex items-center justify-center mb-2.5">
              <BookOpen className="h-5 w-5 text-cyan-300" />
            </div>
            <p className="font-semibold text-sm text-white/40 mb-0.5">Formation</p>
            <span className="mt-1 px-2 py-0.5 rounded-full bg-white/5 text-white/25 text-[10px] font-bold uppercase">Bientôt</span>
          </button>

          {/* Assistant IA */}
          <button onClick={() => setActiveView('ai')} className="vfp-card rounded-2xl p-4 flex flex-col items-center justify-center text-center min-h-[110px]">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-amber-400/20 to-amber-600/5 flex items-center justify-center mb-2.5">
              <Bot className="h-5 w-5 text-amber-300" />
            </div>
            <p className="font-semibold text-sm text-white mb-0.5">Assistant IA</p>
            <p className="text-xs text-amber-300/50">Conseils & prévisions</p>
          </button>

          {/* Mes Contrats */}
          <button className="vfp-card rounded-2xl p-4 flex flex-col items-center justify-center text-center min-h-[110px] opacity-60" disabled>
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-slate-500/10 to-slate-700/5 flex items-center justify-center mb-2.5">
              <Coins className="h-5 w-5 text-white/30" />
            </div>
            <p className="font-semibold text-sm text-white/40 mb-0.5">Mes Contrats</p>
            <span className="mt-1 px-2 py-0.5 rounded-full bg-white/5 text-white/25 text-[10px] font-bold uppercase">Bientôt</span>
          </button>

          {/* Mon Évaluation */}
          <button onClick={() => setActiveView(activeView === 'evaluation' ? 'menu' : 'evaluation')} className="vfp-card rounded-2xl p-4 flex flex-col items-center justify-center text-center min-h-[110px]">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-yellow-400/20 to-yellow-600/5 flex items-center justify-center mb-2.5">
              <Award className="h-5 w-5 text-yellow-300" />
            </div>
            <p className="font-semibold text-sm text-white mb-0.5">Mon Évaluation</p>
            <div className="flex gap-0.5 text-xs">{renderStars(ouvrier.note_moyenne)}</div>
          </button>

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
          {ouvrier.competences.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Star className="h-3.5 w-3.5 text-[var(--vfp-accent)]" />
                <span className="text-xs text-[var(--vfp-accent)] font-semibold uppercase tracking-wider">Compétences</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {ouvrier.competences.map((c, i) => (
                  <span key={i} className="px-2.5 py-1 rounded-full bg-[var(--vfp-accent)]/10 border border-[var(--vfp-accent)]/20 text-[var(--vfp-accent-bright)] text-xs font-medium">{c}</span>
                ))}
              </div>
            </div>
          )}
          {ouvrier.cantons_disponibles.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <MapPin className="h-3.5 w-3.5 text-[var(--vfp-accent)]" />
                <span className="text-xs text-[var(--vfp-accent)] font-semibold uppercase tracking-wider">Zones de travail</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {ouvrier.cantons_disponibles.map((c, i) => (
                  <span key={i} className="px-2.5 py-1 rounded-full bg-white/[0.06] border border-white/[0.08] text-white/70 text-xs">{c}</span>
                ))}
              </div>
            </div>
          )}
          {ouvrier.tarif_journalier && (
            <div className="rounded-xl bg-[var(--vfp-accent)]/[0.08] border border-[var(--vfp-accent)]/20 p-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Coins className="h-4 w-4 text-[var(--vfp-accent)]" />
                <span className="text-white/70 text-sm">Tarif journalier</span>
              </div>
              <span className="text-[var(--vfp-accent)] font-bold text-base">{ouvrier.tarif_journalier.toLocaleString('fr-FR')} FCFA</span>
            </div>
          )}
          {/* Phone contact */}
          {ouvrier.phone && (
            <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-3">
              <div className="flex items-center gap-2 mb-2">
                <Phone className="h-3.5 w-3.5 text-[var(--vfp-accent)]" />
                <span className="text-xs text-[var(--vfp-accent)] font-semibold uppercase tracking-wider">Contact</span>
              </div>
              <div className="flex items-center gap-2">
                <a
                  href={`tel:${ouvrier.phone}`}
                  className="flex-1 flex items-center gap-2 px-3 py-2 rounded-xl bg-[var(--vfp-accent)]/10 border border-[var(--vfp-accent)]/20 text-[var(--vfp-accent-bright)] text-sm font-medium active:opacity-70"
                >
                  <Phone className="h-4 w-4" />
                  {ouvrier.phone}
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

      {/* ─── Offres expanded ─── */}
      {activeView === 'offres' && (
        <div key={offresKey} className="space-y-3 vfp-enter">
          <div className="flex items-center justify-between px-1">
            <h3 className="text-white font-bold text-base">Offres d&apos;emploi</h3>
            <button onClick={() => setActiveView('menu')} className="text-[var(--vfp-accent)] text-sm font-medium">
              <ArrowLeft className="h-4 w-4 inline mr-1" />Réduire
            </button>
          </div>
          {offres.length === 0 && (
            <div className="vfp-card rounded-2xl p-6 text-center space-y-3">
              <Briefcase className="h-8 w-8 text-white/20 mx-auto" />
              <p className="text-white/50 text-sm">Aucune offre dans vos cantons pour l&apos;instant.</p>
              <button
                onClick={() => setOffresKey(k => k + 1)}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[var(--vfp-accent)]/10 border border-[var(--vfp-accent)]/20 text-[var(--vfp-accent-bright)] text-sm font-medium active:opacity-70"
              >
                <RefreshCw className="h-4 w-4" />
                Actualiser
              </button>
            </div>
          )}
          {offres.map((o) => (
            <div key={o.id} className="vfp-card rounded-2xl p-4 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-white font-semibold text-sm leading-tight">{o.titre}</p>
                  {o.culture && <p className="text-[var(--vfp-accent-dim)] text-xs mt-0.5">{o.culture}</p>}
                </div>
                {o.tarif_journalier && (
                  <span className="shrink-0 text-[var(--vfp-accent)] font-bold text-sm">{o.tarif_journalier.toLocaleString('fr-FR')} FCFA/j</span>
                )}
              </div>
              <div className="flex items-center gap-3 text-xs text-white/40">
                <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{o.canton}</span>
                {o.date_debut && (
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {new Date(o.date_debut).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
                  </span>
                )}
                <span>{o.nombre_ouvriers} ouvrier{o.nombre_ouvriers > 1 ? 's' : ''} cherché{o.nombre_ouvriers > 1 ? 's' : ''}</span>
              </div>
              {o.description && <p className="text-white/40 text-xs leading-relaxed">{o.description}</p>}
            </div>
          ))}
        </div>
      )}

      {/* ─── Évaluation expanded ─── */}
      {activeView === 'evaluation' && (
        <div className="vfp-card rounded-2xl p-5 space-y-3 vfp-enter">
          <div className="flex items-center justify-between">
            <h3 className="text-white font-bold text-base">Mon Évaluation</h3>
            <button onClick={() => setActiveView('menu')} className="text-[var(--vfp-accent)] text-sm font-medium">
              <ArrowLeft className="h-4 w-4 inline mr-1" />Réduire
            </button>
          </div>
          <div className="text-center py-4">
            <div className="text-4xl font-bold text-[var(--vfp-accent)]">{ouvrier.note_moyenne.toFixed(1)}</div>
            <div className="flex justify-center gap-1 text-xl my-2">{renderStars(ouvrier.note_moyenne)}</div>
            <p className="text-white/50 text-sm">{ouvrier.nombre_avis} avis</p>
          </div>
        </div>
      )}

    </div>
  )
}

const ouvrierStyles = `
  .ouvrier-wrap {
    --vfp-accent: oklch(0.75 0.20 50);
    --vfp-accent-dim: oklch(0.60 0.16 50);
    --vfp-accent-bright: oklch(0.88 0.18 50);
    --vfp-cta: oklch(0.75 0.20 50);
    --vfp-cta-fg: oklch(0.10 0.03 50);
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
  .vfp-card:hover:not(:disabled) { border-color: oklch(0.75 0.20 50 / 0.25); }
  .vfp-enter { animation: vfpIn .5s cubic-bezier(.2,.7,.2,1) both; }
  @keyframes vfpIn { from { opacity:0; transform: translateY(12px); } to { opacity:1; transform: none; } }
  .vfp-pop { animation: vfpPop .5s cubic-bezier(.2,1.4,.4,1) .3s both; }
  @keyframes vfpPop { 0% { transform: scale(0); } 60% { transform: scale(1.2); } 100% { transform: scale(1); } }
`
