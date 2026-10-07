'use client'

/**
 * Écran de la carte agronome (/verify/<numéro> et /verify/t/<jeton>).
 *
 * Partie PUBLIQUE (quiconque scanne le QR) : photo, nom, profession,
 * qualification (« Agronome certifié » seulement si le profil est vérifié),
 * faîtière, statut et validité de la carte. Jamais : téléphone, adresse,
 * notes, missions, documents.
 *
 * Outils du titulaire : « Mes missions » reste ici car il n'affiche RIEN sans
 * le PIN de la carte (CardMissions) ; il n'est proposé que sur une carte
 * active. Assistant IA / prix / fiches sont des services génériques.
 */

import { AiChat } from '@/components/verify/ai-chat'
import { CardMissions } from '@/components/verify/card-missions'
import { MarketPricesDashboard } from '@/components/verify/market-prices-dashboard'
import {
  AlertTriangle,
  ArrowLeft,
  Award,
  Bot,
  CheckCircle,
  ExternalLink,
  FileText,
  ShieldCheck,
  TrendingUp,
  User,
} from 'lucide-react'
import { useState } from 'react'

export type AgronomeCardStatus = 'ACTIVE' | 'SUSPENDED' | 'REVOKED' | 'EXPIRED'

export interface AgronomePublicProfile {
  first_name: string | null
  last_name: string | null
  photo_url: string | null
  badge_valide: boolean
  statut_validation: string
  verified?: boolean
  qualification?: string | null
  profession_label?: string
  faitiere_name?: string | null
  card_status?: AgronomeCardStatus
  valid_from?: string | null
  valid_until?: string | null
}

export interface AgronomePublicCard {
  card_number: string
  status: string
  public_status?: AgronomeCardStatus
  status_message?: string
  expiry_date: string | null
  created_at: string | null
}

interface AgronomeViewProps {
  cardNumber: string
  agronome: AgronomePublicProfile
  card: AgronomePublicCard
}

type ActiveView = 'menu' | 'missions' | 'prices' | 'ai'

const STATUS_TEXT: Record<Exclude<AgronomeCardStatus, 'ACTIVE'>, string> = {
  SUSPENDED: 'Carte suspendue — elle ne doit pas être acceptée pour le moment.',
  REVOKED: 'Carte révoquée — elle n’est plus valable.',
  EXPIRED: 'Carte expirée — son titulaire doit la renouveler.',
}

function legacyStatus(card: AgronomePublicCard): AgronomeCardStatus {
  if (card.public_status) return card.public_status
  if (card.status === 'revoked') return 'REVOKED'
  if (card.status === 'suspended') return 'SUSPENDED'
  if (card.status === 'expired') return 'EXPIRED'
  if (card.expiry_date && card.expiry_date < new Date().toISOString().split('T')[0])
    return 'EXPIRED'
  return 'ACTIVE'
}

function frDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00Z` : iso)
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('fr-FR', { timeZone: 'UTC' })
}

export function AgronomeView({ cardNumber, agronome, card }: AgronomeViewProps) {
  const [activeView, setActiveView] = useState<ActiveView>('menu')

  const status = agronome.card_status ?? legacyStatus(card)
  const isActive = status === 'ACTIVE'
  const verified =
    agronome.verified ?? (agronome.badge_valide && agronome.statut_validation === 'VALIDE')
  const qualification = verified ? (agronome.qualification ?? 'Agronome certifié') : null
  const validFrom = agronome.valid_from ?? card.created_at
  const validUntil = agronome.valid_until ?? card.expiry_date

  const rawFirst = (agronome.first_name ?? '').trim()
  const firstName = rawFirst
    ? rawFirst.charAt(0).toUpperCase() + rawFirst.slice(1).toLowerCase()
    : 'Agronome'

  if (activeView === 'prices') {
    return (
      <div className="agronome-wrap space-y-4 vfp-enter">
        <style>{agronomeStyles}</style>
        <button
          type="button"
          onClick={() => setActiveView('menu')}
          className="flex items-center gap-2 text-[var(--vfp-accent)] text-sm font-medium active:opacity-70"
        >
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
        <AiChat
          cardNumber={cardNumber}
          memberName={firstName}
          onBack={() => setActiveView('menu')}
        />
      </div>
    )
  }

  return (
    <div className="agronome-wrap space-y-4">
      <style>{agronomeStyles}</style>

      {!isActive && (
        <div
          role="alert"
          className="rounded-2xl border border-red-500/40 bg-red-600/20 px-4 py-3 flex items-start gap-3 vfp-enter"
        >
          <AlertTriangle className="h-5 w-5 text-red-300 shrink-0 mt-0.5" />
          <div>
            <p className="text-red-100 font-bold text-sm uppercase tracking-wide">
              Carte non valide
            </p>
            <p className="text-red-100/90 text-sm">{card.status_message ?? STATUS_TEXT[status]}</p>
          </div>
        </div>
      )}

      {/* Identité publique */}
      <section className="vfp-card rounded-2xl p-5 vfp-enter">
        <div className="flex items-center gap-4">
          <div className="w-20 h-20 rounded-2xl bg-[var(--vfp-accent)]/15 flex items-center justify-center shrink-0 overflow-hidden">
            {agronome.photo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={agronome.photo_url} alt="" className="w-full h-full object-cover" />
            ) : (
              <User className="h-8 w-8 text-[var(--vfp-accent)]" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-white text-lg font-bold leading-tight">
              {agronome.first_name ?? ''}{' '}
              <span className="uppercase">{agronome.last_name ?? ''}</span>
            </p>
            <p className="text-white/60 text-sm">
              {agronome.profession_label ?? 'Ingénieur agronome'}
            </p>
            {qualification && (
              <p className="mt-1 inline-flex items-center gap-1 text-[var(--vfp-accent-bright)] text-xs font-semibold">
                <Award className="h-3.5 w-3.5" /> {qualification}
              </p>
            )}
          </div>
        </div>

        {verified && (
          <div className="mt-4 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[var(--vfp-accent)]/10 border border-[var(--vfp-accent)]/25">
            <ShieldCheck className="h-3.5 w-3.5 text-[var(--vfp-accent)]" />
            <span className="text-xs font-bold text-[var(--vfp-accent)]">Profil vérifié</span>
          </div>
        )}

        <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-3">
            <dt className="text-[11px] text-white/40 uppercase font-semibold tracking-wider">
              N° de carte
            </dt>
            <dd className="text-white font-mono mt-0.5">{card.card_number}</dd>
          </div>
          <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-3">
            <dt className="text-[11px] text-white/40 uppercase font-semibold tracking-wider">
              Statut
            </dt>
            <dd
              className={`mt-0.5 font-semibold inline-flex items-center gap-1 ${isActive ? 'text-[var(--vfp-accent)]' : 'text-red-300'}`}
            >
              {isActive && <CheckCircle className="h-3.5 w-3.5" />}
              {isActive
                ? 'Active'
                : status === 'SUSPENDED'
                  ? 'Suspendue'
                  : status === 'REVOKED'
                    ? 'Révoquée'
                    : 'Expirée'}
            </dd>
          </div>
          <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-3">
            <dt className="text-[11px] text-white/40 uppercase font-semibold tracking-wider">
              Émise le
            </dt>
            <dd className="text-white mt-0.5">{frDate(validFrom)}</dd>
          </div>
          <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-3">
            <dt className="text-[11px] text-white/40 uppercase font-semibold tracking-wider">
              Valable jusqu’au
            </dt>
            <dd className="text-white mt-0.5">{frDate(validUntil)}</dd>
          </div>
          {agronome.faitiere_name && (
            <div className="col-span-2 rounded-xl bg-white/[0.03] border border-white/[0.06] p-3">
              <dt className="text-[11px] text-white/40 uppercase font-semibold tracking-wider">
                Faîtière de rattachement
              </dt>
              <dd className="text-white mt-0.5">{agronome.faitiere_name}</dd>
            </div>
          )}
        </dl>
      </section>

      {/* Services */}
      <section className="vfp-enter" style={{ transitionDelay: '100ms' }}>
        <div className="flex items-center gap-2 mb-3 px-1">
          <span className="w-1.5 h-1.5 rounded-full bg-[var(--vfp-accent)]" />
          <h3 className="text-white font-semibold text-[15px]">Services</h3>
        </div>
        <div className="grid grid-cols-2 gap-2.5">
          {isActive && (
            <button
              type="button"
              onClick={() => setActiveView(activeView === 'missions' ? 'menu' : 'missions')}
              className="vfp-card rounded-2xl p-4 flex flex-col items-center justify-center text-center min-h-[110px]"
            >
              <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-amber-500/20 to-amber-700/5 flex items-center justify-center mb-2.5">
                <FileText className="h-5 w-5 text-amber-300" />
              </div>
              <p className="font-semibold text-sm text-white mb-0.5">Mes missions</p>
              <p className="text-xs text-white/30">Titulaire : avec le PIN</p>
            </button>
          )}
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
          <button
            type="button"
            onClick={() => setActiveView('ai')}
            className="vfp-card rounded-2xl p-4 flex flex-col items-center justify-center text-center min-h-[110px]"
          >
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-amber-400/20 to-amber-600/5 flex items-center justify-center mb-2.5">
              <Bot className="h-5 w-5 text-amber-300" />
            </div>
            <p className="font-semibold text-sm text-white mb-0.5">Assistant IA</p>
            <p className="text-xs text-amber-300/50">Conseils &amp; prévisions</p>
          </button>
          <button
            type="button"
            onClick={() => setActiveView('prices')}
            className="vfp-card rounded-2xl p-4 flex flex-col items-center justify-center text-center min-h-[110px]"
          >
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-violet-500/20 to-violet-700/5 flex items-center justify-center mb-2.5">
              <TrendingUp className="h-5 w-5 text-violet-300" />
            </div>
            <p className="font-semibold text-sm text-white mb-0.5">Prix du Marché</p>
            <p className="text-xs text-white/30">Cours en temps réel</p>
          </button>
        </div>
      </section>

      {activeView === 'missions' && isActive && (
        <div className="space-y-3 vfp-enter">
          <button
            type="button"
            onClick={() => setActiveView('menu')}
            className="flex items-center gap-1 px-1 text-[var(--vfp-accent)] text-sm font-medium"
          >
            <ArrowLeft className="h-4 w-4" /> Réduire
          </button>
          <CardMissions cardNumber={cardNumber} />
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
