'use client'

import { useState } from 'react'
import {
  ArrowLeft, User, MapPin, TrendingUp, Bot,
  Star, ExternalLink, CheckCircle, Clock, Coins,
  Award, FileText, Phone, MessageCircle, RefreshCw, XCircle,
} from 'lucide-react'
import { MarketPricesDashboard } from '@/components/verify/market-prices-dashboard'
import { AiChat } from '@/components/verify/ai-chat'

interface AgronomeViewProps {
  cardNumber: string
  agronome: {
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
  missions: Array<{
    id: string
    titre: string
    culture: string | null
    description: string | null
    canton: string
    budget: number | null
    date_souhaitee: string | null
  }>
  card: {
    card_number: string
    status: string
    expiry_date: string | null
    created_at: string
  }
}

type ActiveView = 'menu' | 'badge' | 'missions' | 'zone' | 'prices' | 'ai' | 'evaluations'

const VALIDATION_LABELS: Record<string, string> = {
  EN_ATTENTE: 'En attente de validation',
  VALIDE: 'Agronome Certifié',
  REJETE: 'Validation rejetée',
}

/** Returns Tailwind-compatible color classes for each validation status */
function statusClasses(statut: string): { bg: string; border: string; text: string; dot: string } {
  switch (statut) {
    case 'VALIDE':
      return {
        bg: 'bg-[var(--vfp-accent)]/[0.08]',
        border: 'border-[var(--vfp-accent)]/20',
        text: 'text-[var(--vfp-accent)]',
        dot: 'bg-[var(--vfp-accent)]',
      }
    case 'REJETE':
      return {
        bg: 'bg-red-500/[0.08]',
        border: 'border-red-500/20',
        text: 'text-red-400',
        dot: 'bg-red-400',
      }
    default: // EN_ATTENTE
      return {
        bg: 'bg-yellow-500/[0.06]',
        border: 'border-yellow-500/20',
        text: 'text-yellow-300',
        dot: 'bg-yellow-400',
      }
  }
}

export function AgronomeView({ cardNumber, agronome, missions, card }: AgronomeViewProps) {
  const [activeView, setActiveView] = useState<ActiveView>('menu')
  const [missionsKey, setMissionsKey] = useState(0)

  const rawFirst = (agronome.first_name ?? '').trim()
  const firstName = rawFirst
    ? rawFirst.charAt(0).toUpperCase() + rawFirst.slice(1).toLowerCase()
    : 'Agronome'

  const greetHour = new Date().getHours()
  const greeting = greetHour < 12 ? 'Bonjour' : greetHour < 18 ? 'Bon après-midi' : 'Bonsoir'

  const badgeLabel = VALIDATION_LABELS[agronome.statut_validation] ?? agronome.statut_validation
  const sc = statusClasses(agronome.statut_validation)

  const phoneDigits = agronome.phone ? agronome.phone.replace(/\D/g, '') : null
  const waPhone = phoneDigits ? (phoneDigits.startsWith('228') ? phoneDigits : `228${phoneDigits}`) : null

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  function renderStars(note: number) {
    return Array.from({ length: 5 }, (_, i) => (
      <span key={i} className={i < Math.round(note) ? 'text-[var(--vfp-accent)]' : 'text-white/20'}>★</span>
    ))
  }

  if (activeView === 'prices') {
    return (
      <div className="agronome-wrap space-y-4 vfp-enter">
        <style>{agronomeStyles}</style>
        <button onClick={() => setActiveView('menu')} className="flex items-center gap-2 text-[var(--vfp-accent)] text-sm font-medium active:opacity-70">
          <ArrowLeft className="h-4 w-4" /> Retour
        </button>
        <MarketPricesDashboard />
      </div>
    )
  }

  if (activeView === 'ai') {
    return (
      <div className="agronome-wrap">
        <style>{agronomeStyles}</style>
        <AiChat cardNumber={cardNumber} memberName={firstName} onBack={() => setActiveView('menu')} />
      </div>
    )
  }

  return (
    <div className="agronome-wrap space-y-4">
      <style>{agronomeStyles}</style>

      {/* Hero */}
      <section className="vfp-enter">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-white/60 text-sm mb-1">{greeting}, {firstName} ! 🌱</p>
            <h1 className="text-[24px] font-bold text-white leading-tight">
              Votre espace<br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-[var(--vfp-accent)] to-[var(--vfp-accent-dim)]">Ingénieur Agronome</span>
            </h1>
            <p className="text-white/40 text-sm mt-2">Missions, expertise et accompagnement agricole.</p>
          </div>
          <div className="vfp-glass-subtle rounded-2xl px-4 py-3 text-center shrink-0">
            <div className="w-10 h-10 rounded-full bg-[var(--vfp-accent)]/15 flex items-center justify-center mx-auto mb-1.5">
              {agronome.badge_valide
                ? <Award className="h-5 w-5 text-[var(--vfp-accent)] vfp-pop" />
                : agronome.statut_validation === 'REJETE'
                  ? <XCircle className="h-5 w-5 text-red-400" />
                  : <Clock className="h-5 w-5 text-yellow-400" />}
            </div>
            <p className="text-white text-[10px] font-semibold leading-tight max-w-[80px]">
              {agronome.badge_valide ? '🏅 Certifié' : agronome.statut_validation === 'REJETE' ? 'Rejeté' : 'En attente'}
            </p>
            <div className="flex items-center gap-1 justify-center mt-0.5">
              <span className={`w-1.5 h-1.5 rounded-full ${sc.dot} ${agronome.badge_valide ? 'animate-pulse' : ''}`} />
              <span className="text-[var(--vfp-accent-dim)] text-[10px]">Carte vérifiée</span>
            </div>
          </div>
        </div>
      </section>

      {/* Card info strip */}
      <div className="vfp-card rounded-xl px-4 py-3 flex items-center gap-3 vfp-enter">
        <div className="w-9 h-9 rounded-full bg-[var(--vfp-accent)]/15 flex items-center justify-center shrink-0">
          {agronome.photo_url
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={agronome.photo_url} alt="" className="w-9 h-9 rounded-full object-cover" />
            : <User className="h-4 w-4 text-[var(--vfp-accent)]" />}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-white text-sm font-semibold truncate">
            {agronome.first_name ?? ''} <span className="uppercase">{agronome.last_name ?? ''}</span>
          </p>
          <p className="text-white/40 text-[11px] font-mono">{card.card_number}</p>
        </div>
        {agronome.badge_valide && (
          <div className="shrink-0">
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-[var(--vfp-accent)]/10 border border-[var(--vfp-accent)]/20">
              <CheckCircle className="h-3 w-3 text-[var(--vfp-accent)]" />
              <span className="text-[10px] font-bold text-[var(--vfp-accent)] uppercase">Certifié</span>
            </span>
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

          {/* Mon Badge */}
          <button onClick={() => setActiveView(activeView === 'badge' ? 'menu' : 'badge')} className="vfp-card rounded-2xl p-4 flex flex-col items-center justify-center text-center min-h-[110px]">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-[var(--vfp-accent)]/20 to-[var(--vfp-accent)]/5 flex items-center justify-center mb-2.5">
              <Award className="h-5 w-5 text-[var(--vfp-accent-bright)]" />
            </div>
            <p className="font-semibold text-sm text-white mb-0.5">Mon Badge</p>
            {/* Colored status indicator */}
            <span className={`inline-flex items-center gap-1 text-xs font-medium ${sc.text}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${sc.dot}`} />
              {agronome.badge_valide ? 'Certifié' : agronome.statut_validation === 'REJETE' ? 'Rejeté' : 'En attente'}
            </span>
          </button>

          {/* Missions disponibles */}
          <button onClick={() => setActiveView(activeView === 'missions' ? 'menu' : 'missions')} className="vfp-card rounded-2xl p-4 flex flex-col items-center justify-center text-center min-h-[110px]">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-amber-500/20 to-amber-700/5 flex items-center justify-center mb-2.5 relative">
              <FileText className="h-5 w-5 text-amber-300" />
              {missions.length > 0 && (
                <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-[var(--vfp-accent)] text-[var(--vfp-cta-fg)] text-[10px] font-bold flex items-center justify-center">{missions.length}</span>
              )}
            </div>
            <p className="font-semibold text-sm text-white mb-0.5">Missions</p>
            <p className="text-xs text-white/30">{missions.length} disponible{missions.length > 1 ? 's' : ''}</p>
          </button>

          {/* Ma Zone */}
          <button onClick={() => setActiveView(activeView === 'zone' ? 'menu' : 'zone')} className="vfp-card rounded-2xl p-4 flex flex-col items-center justify-center text-center min-h-[110px]">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-teal-500/20 to-teal-700/5 flex items-center justify-center mb-2.5">
              <MapPin className="h-5 w-5 text-teal-300" />
            </div>
            <p className="font-semibold text-sm text-white mb-0.5">Ma Zone</p>
            <p className="text-xs text-white/30 truncate">{agronome.canton ?? agronome.prefecture ?? '—'}</p>
          </button>

          {/* Fiches Techniques — external link with noopener */}
          <a
            href="/marketplace"
            target="_blank"
            rel="noopener noreferrer"
            className="vfp-card rounded-2xl p-4 flex flex-col items-center justify-center text-center min-h-[110px]"
          >
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-cyan-500/20 to-cyan-700/5 flex items-center justify-center mb-2.5">
              <ExternalLink className="h-5 w-5 text-cyan-300" />
            </div>
            <p className="font-semibold text-sm text-white mb-0.5">Fiches Techniques</p>
            <p className="text-xs text-white/30">Accéder au catalogue</p>
          </a>

          {/* Mon Planning */}
          <button className="vfp-card rounded-2xl p-4 flex flex-col items-center justify-center text-center min-h-[110px] opacity-60" disabled>
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-slate-500/10 to-slate-700/5 flex items-center justify-center mb-2.5">
              <Clock className="h-5 w-5 text-white/30" />
            </div>
            <p className="font-semibold text-sm text-white/40 mb-0.5">Mon Planning</p>
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

          {/* Mes Évaluations */}
          <button onClick={() => setActiveView(activeView === 'evaluations' ? 'menu' : 'evaluations')} className="vfp-card rounded-2xl p-4 flex flex-col items-center justify-center text-center min-h-[110px]">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-yellow-400/20 to-yellow-600/5 flex items-center justify-center mb-2.5">
              <Star className="h-5 w-5 text-yellow-300" />
            </div>
            <p className="font-semibold text-sm text-white mb-0.5">Mes Évaluations</p>
            <div className="flex gap-0.5 text-xs">{renderStars(agronome.note_moyenne)}</div>
          </button>

          {/* Prix du Marché */}
          <button onClick={() => setActiveView('prices')} className="vfp-card rounded-2xl p-4 flex flex-col items-center justify-center text-center min-h-[110px]">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-violet-500/20 to-violet-700/5 flex items-center justify-center mb-2.5">
              <TrendingUp className="h-5 w-5 text-violet-300" />
            </div>
            <p className="font-semibold text-sm text-white mb-0.5">Prix du Marché</p>
            <p className="text-xs text-white/30">Cours en temps réel</p>
          </button>

        </div>
      </section>

      {/* ─── Badge expanded ─── */}
      {activeView === 'badge' && (
        <div className="vfp-card rounded-2xl p-5 space-y-4 vfp-enter">
          <div className="flex items-center justify-between">
            <h3 className="text-white font-bold text-base">Mon Badge</h3>
            <button onClick={() => setActiveView('menu')} className="text-[var(--vfp-accent)] text-sm font-medium">
              <ArrowLeft className="h-4 w-4 inline mr-1" />Réduire
            </button>
          </div>
          {/* Colored status banner */}
          <div className={`rounded-xl border p-4 flex items-center gap-3 ${sc.bg} ${sc.border}`}>
            <div className={`w-10 h-10 rounded-full flex items-center justify-center ${agronome.badge_valide ? 'bg-[var(--vfp-accent)]/15' : agronome.statut_validation === 'REJETE' ? 'bg-red-500/15' : 'bg-yellow-500/15'}`}>
              {agronome.badge_valide
                ? <Award className="h-5 w-5 text-[var(--vfp-accent)]" />
                : agronome.statut_validation === 'REJETE'
                  ? <XCircle className="h-5 w-5 text-red-400" />
                  : <Clock className="h-5 w-5 text-yellow-400" />}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <span className={`w-2 h-2 rounded-full ${sc.dot} ${agronome.badge_valide ? 'animate-pulse' : ''}`} />
                <p className={`font-bold text-sm ${sc.text}`}>{agronome.badge_valide ? '🏅 ' : ''}{badgeLabel}</p>
              </div>
              <p className="text-white/50 text-xs">Statut : {agronome.statut_validation}</p>
            </div>
          </div>
          {agronome.specialisations.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Star className="h-3.5 w-3.5 text-[var(--vfp-accent)]" />
                <span className="text-xs text-[var(--vfp-accent)] font-semibold uppercase tracking-wider">Spécialisations</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {agronome.specialisations.map((s, i) => (
                  <span key={i} className="px-2.5 py-1 rounded-full bg-[var(--vfp-accent)]/10 border border-[var(--vfp-accent)]/20 text-[var(--vfp-accent-bright)] text-xs font-medium">{s}</span>
                ))}
              </div>
            </div>
          )}
          {/* Phone contact */}
          {agronome.phone && (
            <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-3">
              <div className="flex items-center gap-2 mb-2">
                <Phone className="h-3.5 w-3.5 text-[var(--vfp-accent)]" />
                <span className="text-xs text-[var(--vfp-accent)] font-semibold uppercase tracking-wider">Contact</span>
              </div>
              <div className="flex items-center gap-2">
                <a
                  href={`tel:${agronome.phone}`}
                  className="flex-1 flex items-center gap-2 px-3 py-2 rounded-xl bg-[var(--vfp-accent)]/10 border border-[var(--vfp-accent)]/20 text-[var(--vfp-accent-bright)] text-sm font-medium active:opacity-70"
                >
                  <Phone className="h-4 w-4" />
                  {agronome.phone}
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

      {/* ─── Missions expanded ─── */}
      {activeView === 'missions' && (
        <div key={missionsKey} className="space-y-3 vfp-enter">
          <div className="flex items-center justify-between px-1">
            <h3 className="text-white font-bold text-base">Missions disponibles</h3>
            <button onClick={() => setActiveView('menu')} className="text-[var(--vfp-accent)] text-sm font-medium">
              <ArrowLeft className="h-4 w-4 inline mr-1" />Réduire
            </button>
          </div>
          {missions.length === 0 && (
            <div className="vfp-card rounded-2xl p-6 text-center space-y-3">
              <FileText className="h-8 w-8 text-white/20 mx-auto" />
              <p className="text-white/50 text-sm">Aucune mission dans votre canton pour l&apos;instant.</p>
              <button
                onClick={() => setMissionsKey(k => k + 1)}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[var(--vfp-accent)]/10 border border-[var(--vfp-accent)]/20 text-[var(--vfp-accent-bright)] text-sm font-medium active:opacity-70"
              >
                <RefreshCw className="h-4 w-4" />
                Actualiser
              </button>
            </div>
          )}
          {missions.map((m) => {
            const missionDate = m.date_souhaitee ? new Date(m.date_souhaitee) : null
            const isPast = missionDate !== null && missionDate < today
            return (
              <div key={m.id} className="vfp-card rounded-2xl p-4 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-white font-semibold text-sm leading-tight">{m.titre}</p>
                    {m.culture && <p className="text-[var(--vfp-accent-dim)] text-xs mt-0.5">{m.culture}</p>}
                  </div>
                  {m.budget && (
                    <div className="text-right shrink-0">
                      <p className="text-[var(--vfp-accent)] font-bold text-sm">{m.budget.toLocaleString('fr-FR')} FCFA</p>
                      <p className="text-white/30 text-[10px]">Budget</p>
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-3 text-xs text-white/40">
                  <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{m.canton}</span>
                  {m.date_souhaitee && (
                    <span className={`flex items-center gap-1 ${isPast ? 'text-red-400 font-semibold' : ''}`}>
                      <Clock className="h-3 w-3" />
                      {new Date(m.date_souhaitee).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
                      {isPast && <span className="ml-0.5">(passée)</span>}
                    </span>
                  )}
                </div>
                {m.description && <p className="text-white/40 text-xs leading-relaxed">{m.description}</p>}
              </div>
            )
          })}
        </div>
      )}

      {/* ─── Zone expanded ─── */}
      {activeView === 'zone' && (
        <div className="vfp-card rounded-2xl p-5 space-y-3 vfp-enter">
          <div className="flex items-center justify-between">
            <h3 className="text-white font-bold text-base">Ma Zone</h3>
            <button onClick={() => setActiveView('menu')} className="text-[var(--vfp-accent)] text-sm font-medium">
              <ArrowLeft className="h-4 w-4 inline mr-1" />Réduire
            </button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-3">
              <span className="text-[11px] text-white/40 uppercase font-semibold tracking-wider">Région</span>
              <p className="text-white text-sm font-semibold mt-0.5">{agronome.region ?? '—'}</p>
            </div>
            <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-3">
              <span className="text-[11px] text-white/40 uppercase font-semibold tracking-wider">Préfecture</span>
              <p className="text-white text-sm font-medium mt-0.5">{agronome.prefecture ?? '—'}</p>
            </div>
            <div className="col-span-2 rounded-xl bg-white/[0.03] border border-white/[0.06] p-3">
              <span className="text-[11px] text-white/40 uppercase font-semibold tracking-wider">Canton</span>
              <p className="text-white text-sm font-medium mt-0.5">{agronome.canton ?? '—'}</p>
            </div>
          </div>
        </div>
      )}

      {/* ─── Évaluations expanded ─── */}
      {activeView === 'evaluations' && (
        <div className="vfp-card rounded-2xl p-5 space-y-3 vfp-enter">
          <div className="flex items-center justify-between">
            <h3 className="text-white font-bold text-base">Mes Évaluations</h3>
            <button onClick={() => setActiveView('menu')} className="text-[var(--vfp-accent)] text-sm font-medium">
              <ArrowLeft className="h-4 w-4 inline mr-1" />Réduire
            </button>
          </div>
          <div className="text-center py-4">
            <div className="text-4xl font-bold text-[var(--vfp-accent)]">{agronome.note_moyenne.toFixed(1)}</div>
            <div className="flex justify-center gap-1 text-xl my-2">{renderStars(agronome.note_moyenne)}</div>
            <p className="text-white/50 text-sm">{agronome.nombre_missions} mission{agronome.nombre_missions > 1 ? 's' : ''} réalisée{agronome.nombre_missions > 1 ? 's' : ''}</p>
          </div>
          <div className="flex items-center gap-2 justify-center">
            <Coins className="h-4 w-4 text-[var(--vfp-accent-dim)]" />
            <span className="text-white/50 text-sm">{agronome.disponible_missions ? 'Disponible pour de nouvelles missions' : 'Actuellement indisponible'}</span>
          </div>
        </div>
      )}

    </div>
  )
}

const agronomeStyles = `
  .agronome-wrap {
    --vfp-accent: oklch(0.72 0.18 230);
    --vfp-accent-dim: oklch(0.58 0.14 230);
    --vfp-accent-bright: oklch(0.84 0.16 230);
    --vfp-cta: oklch(0.72 0.18 230);
    --vfp-cta-fg: oklch(0.10 0.03 230);
  }
  .agronome-wrap .vfp-glass-subtle {
    background: rgba(255,255,255,.04);
    border: 1px solid rgba(255,255,255,.06);
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
  }
  .agronome-wrap .vfp-card {
    background: linear-gradient(160deg, rgba(255,255,255,.055), rgba(255,255,255,.015));
    border: 1px solid rgba(255,255,255,.07);
    backdrop-filter: blur(12px) saturate(1.05);
    -webkit-backdrop-filter: blur(12px) saturate(1.05);
    box-shadow: 0 4px 24px -8px rgba(0,0,0,.4), inset 0 1px 0 rgba(255,255,255,.06);
    transition: transform .2s cubic-bezier(.2,.7,.2,1), border-color .2s, box-shadow .2s;
  }
  .agronome-wrap .vfp-card:active:not(:disabled) { transform: scale(.97); }
  .agronome-wrap .vfp-card:hover:not(:disabled) { border-color: oklch(0.72 0.18 230 / 0.25); }
  .vfp-enter { animation: vfpIn .5s cubic-bezier(.2,.7,.2,1) both; }
  @keyframes vfpIn { from { opacity:0; transform: translateY(12px); } to { opacity:1; transform: none; } }
  .vfp-pop { animation: vfpPop .5s cubic-bezier(.2,1.4,.4,1) .3s both; }
  @keyframes vfpPop { 0% { transform: scale(0); } 60% { transform: scale(1.2); } 100% { transform: scale(1); } }
`
