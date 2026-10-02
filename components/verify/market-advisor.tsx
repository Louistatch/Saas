'use client'

/**
 * Conseiller marché — page « Conseiller » de la carte membre.
 *
 * Données réelles uniquement (voir lib/market-advisor/model.ts) : prix courant
 * de la zone, prévision AgriTogo, repère de la saison sèche de l'an passé. La
 * recommandation applique une règle explicite à ces chiffres. Le chat en bas
 * est le VRAI conseiller (AiChat, mode intégré) : mêmes requêtes, même historique.
 */

import { AiChat } from '@/components/verify/ai-chat'
import {
  type AdvisorForecast,
  type AdvisorMarket,
  type AdvisorReason,
  type AdvisorTip,
  buildRecommendation,
  displayCulture,
  forecastFromApi,
  marketFromPrice,
  type SeasonalOutlook,
  seasonalFromApi,
} from '@/lib/market-advisor/model'
import { MarketPrice, type MarketPriceRow, Region } from '@/lib/market-prices/models'
import {
  ArrowLeftRight,
  ArrowRight,
  BarChart3,
  Calculator,
  CalendarDays,
  ChevronDown,
  ChevronRight,
  Clock,
  CloudSun,
  Database,
  Handshake,
  History,
  Info,
  MapPin,
  MessageSquareText,
  Scale,
  Sprout,
  Target,
  TrendingDown,
  TrendingUp,
  Wallet,
  Warehouse,
  WifiOff,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

interface Props {
  cardNumber: string
  memberName: string
  regionName?: string | null
  /** Ouvre la vue « Prix du marché » existante (comparaison par localité). */
  onOpenPrices: () => void
}

// Palette locale à la page : cartes claires sur le fond vert sombre de la carte membre.
const C = {
  card: '#F5F2E9',
  ink: '#10231A',
  inkSoft: '#4B5E54',
  line: 'rgba(16,35,26,.10)',
  accent: '#2F8A4E',
  down: '#B94A2C',
  up: '#2F8A4E',
  forest: '#123E2A',
}

const fmt = (n: number) => Math.round(n).toLocaleString('fr-FR')
const pctTxt = (n: number) =>
  `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} %`
const dateFr = (iso: string, opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' }) =>
  new Date(iso).toLocaleDateString('fr-FR', opts)

// ─── Chargement des données ──────────────────────────────────────────────────

type Load<T> = { state: 'loading' } | { state: 'error' } | { state: 'ready'; value: T }

function useAdvisorData(cardNumber: string, regionId: string | undefined) {
  const [prices, setPrices] = useState<Load<MarketPrice[]>>({ state: 'loading' })
  const [ownCultures, setOwnCultures] = useState<string[]>([])

  useEffect(() => {
    if (!regionId) {
      setPrices({ state: 'ready', value: [] })
      return
    }
    const ctrl = new AbortController()
    setPrices({ state: 'loading' })
    fetch(`/api/market-prices?region_id=${regionId}`, { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: { prices?: MarketPriceRow[] }) =>
        setPrices({ state: 'ready', value: MarketPrice.fromRows(d.prices ?? []) }),
      )
      .catch((e) => {
        if ((e as Error).name !== 'AbortError') setPrices({ state: 'error' })
      })
    return () => ctrl.abort()
  }, [regionId])

  // Les cultures des parcelles du membre (si l'espace privé est ouvert) servent
  // à choisir la culture affichée par défaut. 401 = non connecté : on s'en passe.
  useEffect(() => {
    const ctrl = new AbortController()
    fetch(`/api/verify/${encodeURIComponent(cardNumber)}/parcelles`, { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { cultures?: string[] } | null) => setOwnCultures(d?.cultures ?? []))
      .catch(() => {})
    return () => ctrl.abort()
  }, [cardNumber])

  return { prices, ownCultures }
}

function useForecast(culture: string | undefined, zone: string | undefined) {
  const [f, setF] = useState<Load<AdvisorForecast>>({ state: 'loading' })
  useEffect(() => {
    if (!culture || !zone) return
    const ctrl = new AbortController()
    setF({ state: 'loading' })
    fetch(`/api/market-prices/forecast?produit=${encodeURIComponent(culture)}&zone=${encodeURIComponent(zone)}`, {
      signal: ctrl.signal,
    })
      .then((r) => r.json())
      .then((d) => setF({ state: 'ready', value: forecastFromApi(d) }))
      .catch((e) => {
        if ((e as Error).name !== 'AbortError') setF({ state: 'ready', value: { ok: false, reason: 'prévision indisponible' } })
      })
    return () => ctrl.abort()
  }, [culture, zone])
  return f
}

function useSeasonal(cultureId: string | undefined, regionId: string | undefined) {
  const [s, setS] = useState<SeasonalOutlook | null>(null)
  useEffect(() => {
    if (!cultureId || !regionId) return
    const ctrl = new AbortController()
    setS(null)
    fetch(`/api/market-prices/seasonal?culture_id=${cultureId}&region_id=${regionId}`, { signal: ctrl.signal })
      .then((r) => r.json())
      .then((d) => setS(seasonalFromApi(d)))
      .catch((e) => {
        if ((e as Error).name !== 'AbortError') setS({ ok: false, reason: 'indisponible' })
      })
    return () => ctrl.abort()
  }, [cultureId, regionId])
  return s
}

function useOnline() {
  const [online, setOnline] = useState(true)
  useEffect(() => {
    setOnline(navigator.onLine)
    const on = () => setOnline(true)
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, [])
  return online
}

// ─── Page ────────────────────────────────────────────────────────────────────

export function MarketAdvisor({ cardNumber, memberName, regionName, onOpenPrices }: Props) {
  const [region, setRegion] = useState<Region | undefined>(() => Region.findByName(regionName) ?? Region.all()[0])
  const { prices, ownCultures } = useAdvisorData(cardNumber, region?.id)
  const [cultureId, setCultureId] = useState<string | null>(null)
  const [question, setQuestion] = useState<{ id: number; text: string } | null>(null)
  const [showSim, setShowSim] = useState(false)
  const online = useOnline()

  // Cultures avec un prix récent dans la zone, les mieux couvertes d'abord.
  const available = useMemo(() => {
    if (prices.state !== 'ready') return []
    return [...prices.value]
      .filter((p) => p.ageDays <= 45)
      .sort((a, b) => b.marketCount - a.marketCount || a.ageDays - b.ageDays)
  }, [prices])

  // Culture par défaut : celle des parcelles du membre si elle a un prix, sinon la mieux suivie.
  useEffect(() => {
    if (!available.length) return
    if (cultureId && available.some((p) => p.cultureId === cultureId)) return
    const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    const own = available.find((p) => ownCultures.some((c) => norm(c).startsWith(norm(p.cultureName))))
    setCultureId((own ?? available[0]).cultureId)
  }, [available, ownCultures, cultureId])

  const price = available.find((p) => p.cultureId === cultureId)
  const market: AdvisorMarket | null = price ? marketFromPrice(price, price.history) : null
  const forecast = useForecast(market?.commodity, region?.name)
  const seasonal = useSeasonal(market?.commodityId, region?.id)
  const recommendation =
    market && forecast.state === 'ready' && seasonal ? buildRecommendation(market, forecast.value, seasonal) : null

  const ask = useCallback((text: string) => {
    setQuestion({ id: Date.now(), text })
    setTimeout(() => document.getElementById('advisor-chat')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50)
  }, [])

  const historyCount = useMemo(() => {
    try {
      const saved = sessionStorage.getItem(`agritogo_chat_${cardNumber}`)
      return saved ? (JSON.parse(saved) as unknown[]).length : 0
    } catch {
      return 0
    }
  }, [cardNumber])

  return (
    <div className="space-y-4 vfp-enter">
      {/* Titre de page */}
      <div className="flex items-start gap-3">
        <div className="h-11 w-11 shrink-0 rounded-2xl bg-[var(--vfp-accent)]/15 ring-1 ring-[var(--vfp-accent)]/25 grid place-items-center">
          <MessageSquareText className="h-5 w-5 text-[var(--vfp-accent)]" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-white text-[19px] font-semibold leading-tight">Conseiller marché</h3>
          <p className="text-white/55 text-[12.5px] leading-snug mt-0.5">
            Informations fiables pour de meilleures décisions
          </p>
        </div>
        <button
          type="button"
          onClick={() => document.getElementById('advisor-chat')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
          className="shrink-0 inline-flex items-center gap-1.5 rounded-xl border border-white/[0.12] px-3 min-h-[40px] text-[12.5px] font-medium text-white/80 active:scale-95"
        >
          <History className="h-4 w-4" />
          <span className="hidden min-[380px]:inline">Historique</span>
          {historyCount > 0 && <span className="text-white/45">{Math.floor(historyCount / 2) || ''}</span>}
        </button>
      </div>

      {!online && (
        <div className="flex items-center gap-2 rounded-2xl bg-amber-500/10 ring-1 ring-amber-400/25 px-3.5 py-2.5 text-amber-100/90 text-[12.5px]">
          <WifiOff className="h-4 w-4 shrink-0" /> Hors ligne : les chiffres affichés peuvent dater.
        </div>
      )}

      {/* Filtres */}
      <div className="flex flex-wrap gap-2">
        <FilterSelect
          icon={<Sprout className="h-4 w-4" />}
          label="Culture"
          value={cultureId ?? ''}
          onChange={setCultureId}
          options={available.map((p) => ({ value: p.cultureId, label: displayCulture(p.cultureName) }))}
          placeholder={prices.state === 'loading' ? 'Chargement…' : 'Aucune culture'}
        />
        <FilterSelect
          icon={<MapPin className="h-4 w-4" />}
          label="Région"
          value={region?.id ?? ''}
          onChange={(id) => {
            setRegion(Region.findById(id))
            setCultureId(null)
          }}
          options={Region.all().map((r) => ({ value: r.id, label: r.name }))}
        />
        {market && (
          <span className="inline-flex items-center gap-2 rounded-xl border border-white/[0.12] bg-white/[0.04] px-3 min-h-[44px] text-[13px] text-white/80">
            <CalendarDays className="h-4 w-4 text-white/50" />
            {dateFr(market.lastObserved, { day: 'numeric', month: 'short', year: 'numeric' })}
          </span>
        )}
      </div>

      {/* Contenu */}
      {prices.state === 'loading' && <LoadingCards />}
      {prices.state === 'error' && (
        <Notice text="Impossible de charger les prix pour le moment. Vérifiez votre connexion puis réessayez." />
      )}
      {prices.state === 'ready' && !market && (
        <Notice
          text={`Aucun prix récent pour ${region?.name ?? 'cette région'}. Essayez une autre région, ou posez votre question au conseiller ci-dessous.`}
        />
      )}

      {market && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <CurrentPriceCard market={market} onDetail={onOpenPrices} />
            <ForecastCard market={market} forecast={forecast} seasonal={seasonal} />
          </div>

          {recommendation ? (
            <RecommendationCard title={recommendation.title} explanation={recommendation.explanation} tips={recommendation.tips} />
          ) : (
            <LoadingBlock label="Préparation de la recommandation…" />
          )}

          <AdvisorActions
            onSimulate={() => setShowSim((v) => !v)}
            simOpen={showSim}
            onCompare={onOpenPrices}
            onWhen={() => ask(`Quand vendre mon ${market.commodity.toLowerCase()} à ${market.location} ?`)}
          />
          {showSim && <SaleSimulator market={market} forecast={forecast.state === 'ready' ? forecast.value : null} />}

          {recommendation && recommendation.reasons.length > 0 && <RecommendationReasons reasons={recommendation.reasons} />}
        </>
      )}

      {/* Le vrai conseiller : mêmes requêtes et même historique que l'ancienne page */}
      <section id="advisor-chat" className="scroll-mt-4 pt-2">
        <p className="text-white/55 text-[13px] font-medium mb-1">Vos questions au conseiller</p>
        <AiChat
          embedded
          cardNumber={cardNumber}
          memberName={memberName}
          regionName={region?.name ?? regionName}
          onBack={() => {}}
          pendingQuestion={question}
          placeholder="Posez votre question au conseiller…"
        />
      </section>
    </div>
  )
}

// ─── Sous-composants ─────────────────────────────────────────────────────────

function FilterSelect({
  icon,
  label,
  value,
  options,
  onChange,
  placeholder,
}: {
  icon: React.ReactNode
  label: string
  value: string
  options: { value: string; label: string }[]
  onChange: (v: string) => void
  placeholder?: string
}) {
  return (
    <label className="relative inline-flex items-center gap-2 rounded-xl border border-[var(--vfp-accent)]/25 bg-white/[0.04] pl-3 pr-8 min-h-[44px] text-[13px] text-white max-w-full">
      <span className="text-[var(--vfp-accent)]">{icon}</span>
      <span className="sr-only">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={options.length === 0}
        className="appearance-none bg-transparent pr-1 font-medium focus:outline-none disabled:text-white/40 max-w-[44vw] truncate"
      >
        {options.length === 0 && <option value="">{placeholder ?? '—'}</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value} className="bg-neutral-900">
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2.5 h-4 w-4 text-white/45" />
    </label>
  )
}

function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-[18px] p-4 ${className}`} style={{ background: C.card, color: C.ink }}>
      {children}
    </div>
  )
}

function TrendPill({ trend, changePct }: { trend: AdvisorMarket['trend']; changePct: number | null }) {
  const color = trend === 'up' ? C.up : trend === 'down' ? C.down : C.inkSoft
  const Icon = trend === 'up' ? TrendingUp : trend === 'down' ? TrendingDown : ArrowLeftRight
  const label =
    changePct === null ? 'pas de comparaison' : trend === 'stable' ? 'Stable' : pctTxt(changePct)
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[12.5px] font-semibold"
      style={{ color, background: `${color}14` }}
    >
      <Icon className="h-3.5 w-3.5" /> {label}
    </span>
  )
}

function CurrentPriceCard({ market, onDetail }: { market: AdvisorMarket; onDetail: () => void }) {
  // Une date par point : semaines comptées à rebours depuis le dernier relevé.
  const data = market.history.map((v, i) => {
    const d = new Date(market.lastObserved)
    d.setDate(d.getDate() - 7 * (market.history.length - 1 - i))
    return { label: dateFr(d.toISOString()), price: v }
  })
  return (
    <Card>
      <p className="text-[13px] font-medium" style={{ color: C.inkSoft }}>
        Prix actuel à {market.location}
      </p>
      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
        <p className="text-[30px] font-bold leading-none tracking-tight">
          {fmt(market.currentPrice)} <span className="text-[15px] font-semibold">FCFA/kg</span>
        </p>
        <TrendPill trend={market.trend} changePct={market.changePct} />
      </div>
      {market.minPrice !== null && market.maxPrice !== null ? (
        <p className="mt-2 text-[12.5px]" style={{ color: C.inkSoft }}>
          Fourchette selon les marchés :{' '}
          <strong style={{ color: C.ink }}>
            {fmt(market.minPrice)} – {fmt(market.maxPrice)} FCFA/kg
          </strong>
        </p>
      ) : (
        <p className="mt-2 text-[12.5px]" style={{ color: C.inkSoft }}>
          Un seul marché suivi : pas de fourchette.
        </p>
      )}
      {data.length >= 2 ? (
        <div className="mt-3 h-[108px] -mx-1">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 6, right: 6, left: 6, bottom: 0 }}>
              <defs>
                <linearGradient id="advisorPrice" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={C.accent} stopOpacity={0.28} />
                  <stop offset="100%" stopColor={C.accent} stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="label"
                tickLine={false}
                axisLine={false}
                interval="preserveStartEnd"
                tick={{ fontSize: 10.5, fill: C.inkSoft }}
                minTickGap={18}
              />
              <YAxis hide domain={['dataMin - 10', 'dataMax + 10']} />
              <Tooltip
                formatter={(v) => [`${fmt(Number(v))} FCFA/kg`, 'Médiane']}
                contentStyle={{ borderRadius: 10, border: 'none', fontSize: 12 }}
              />
              <Area type="monotone" dataKey="price" stroke={C.accent} strokeWidth={2} fill="url(#advisorPrice)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <p className="mt-3 text-[12px]" style={{ color: C.inkSoft }}>
          Pas encore d’historique sur plusieurs semaines.
        </p>
      )}
      <div className="mt-3 pt-3 flex items-center justify-between gap-2 border-t" style={{ borderColor: C.line }}>
        <span className="inline-flex items-center gap-1.5 text-[12.5px]" style={{ color: C.inkSoft }}>
          <Database className="h-4 w-4" />
          {market.marketsCount} marché{market.marketsCount > 1 ? 's' : ''} suivi{market.marketsCount > 1 ? 's' : ''}
        </span>
        <button
          type="button"
          onClick={onDetail}
          className="inline-flex items-center gap-1 text-[13px] font-semibold min-h-[36px]"
          style={{ color: C.accent }}
        >
          Voir le détail <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    </Card>
  )
}

function ConfidenceBars({ level }: { level: 'faible' | 'moyenne' | 'élevée' }) {
  const n = level === 'élevée' ? 3 : level === 'moyenne' ? 2 : 1
  return (
    <span className="inline-flex gap-1" aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <span key={i} className="h-2 w-5 rounded-sm" style={{ background: i < n ? C.accent : C.line }} />
      ))}
    </span>
  )
}

function ForecastCard({
  market,
  forecast,
  seasonal,
}: {
  market: AdvisorMarket
  forecast: Load<AdvisorForecast>
  seasonal: SeasonalOutlook | null
}) {
  if (forecast.state === 'loading')
    return (
      <Card>
        <p className="text-[13px] font-medium" style={{ color: C.inkSoft }}>
          Prévision à 4 semaines
        </p>
        <div className="mt-3 h-8 w-40 rounded-lg animate-pulse" style={{ background: C.line }} />
        <p className="mt-3 text-[12.5px]" style={{ color: C.inkSoft }}>
          Calcul en cours sur les relevés de la région…
        </p>
      </Card>
    )
  const f = forecast.state === 'ready' ? forecast.value : null
  if (!f || !f.ok)
    return (
      <Card>
        <p className="text-[13px] font-medium" style={{ color: C.inkSoft }}>
          Prévision à 4 semaines
        </p>
        <p className="mt-2 text-[15px] font-semibold">Prévision indisponible</p>
        <p className="mt-1 text-[12.5px]" style={{ color: C.inkSoft }}>
          {f && !f.ok ? f.reason : 'Le service de prévision ne répond pas.'} Le prix actuel et la tendance restent
          valables.
        </p>
      </Card>
    )
  const down = f.changePct < 0
  const color = f.direction === 'stable' ? C.inkSoft : down ? C.down : C.up
  const end = f.points[f.points.length - 1]
  return (
    <Card>
      <p className="text-[13px] font-medium" style={{ color: C.inkSoft }}>
        Prévision à 4 semaines
      </p>
      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
        <p className="text-[30px] font-bold leading-none tracking-tight">
          ≈ {fmt(f.expectedPrice)} <span className="text-[15px] font-semibold">FCFA/kg</span>
        </p>
        <span
          className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[12.5px] font-semibold"
          style={{ color, background: `${color}14` }}
        >
          {down ? <TrendingDown className="h-3.5 w-3.5" /> : <TrendingUp className="h-3.5 w-3.5" />} {pctTxt(f.changePct)}
        </span>
      </div>
      <div className="mt-2 flex items-center gap-2 text-[12.5px]" style={{ color: C.inkSoft }}>
        Confiance : <strong style={{ color: C.ink }}>{f.confidence[0].toUpperCase() + f.confidence.slice(1)}</strong>
        <ConfidenceBars level={f.confidence} />
      </div>
      <p className="mt-2.5 rounded-xl px-3 py-2 text-[12.5px] leading-snug" style={{ background: `${C.ink}08`, color: C.inkSoft }}>
        <Info className="inline h-3.5 w-3.5 -mt-0.5 mr-1" />
        Fourchette probable {fmt(end.low)}–{fmt(end.high)} FCFA/kg, d’après {f.weeksObserved} semaines de relevés.
        {f.mape !== null && f.mapeNaive !== null
          ? ` Erreur mesurée ${f.mape.toLocaleString('fr-FR')} % (contre ${f.mapeNaive.toLocaleString('fr-FR')} % si l’on suppose un prix inchangé).`
          : ''}
        {f.confidence === 'faible' ? ' Sur cette zone, la prévision n’est pas plus fiable qu’un prix inchangé.' : ''}
      </p>
      <p className="mt-3 text-[12.5px] font-medium" style={{ color: C.inkSoft }}>
        Évolution attendue
      </p>
      <ol className="mt-1.5 grid grid-cols-3 gap-1.5 text-center">
        <TimelineStep label="Aujourd’hui" value={fmt(market.currentPrice)} />
        <TimelineStep label={`Vers le ${dateFr(end.weekStart)}`} value={`≈ ${fmt(f.expectedPrice)}`} tone={color} />
        {seasonal?.ok ? (
          <TimelineStep label={`${seasonal.label} (l’an passé)`} value={`${fmt(seasonal.low)}–${fmt(seasonal.high)}`} />
        ) : (
          <TimelineStep label="Déc. – févr." value="pas d’historique" muted />
        )}
      </ol>
    </Card>
  )
}

function TimelineStep({ label, value, tone, muted }: { label: string; value: string; tone?: string; muted?: boolean }) {
  return (
    <li className="rounded-xl px-1.5 py-2" style={{ background: `${C.ink}08` }}>
      <p className="text-[10.5px] leading-tight" style={{ color: C.inkSoft }}>
        {label}
      </p>
      <p className={`mt-0.5 font-bold ${muted ? 'text-[11.5px] font-medium' : 'text-[15px]'}`} style={{ color: muted ? C.inkSoft : (tone ?? C.ink) }}>
        {value}
      </p>
    </li>
  )
}

const TIP_ICONS: Record<AdvisorTip['icon'], typeof Wallet> = {
  cash: Wallet,
  storage: Warehouse,
  calendar: Target,
  compare: Scale,
}

function RecommendationCard({ title, explanation, tips }: { title: string; explanation: string; tips: AdvisorTip[] }) {
  return (
    <div className="rounded-[20px] p-4 ring-1 ring-[var(--vfp-accent)]/30" style={{ background: C.forest }}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-white/65 text-[13px] font-medium">Notre recommandation</p>
        <span className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2.5 py-1 text-[11.5px] font-medium text-white/85">
          Conseil calculé
        </span>
      </div>
      <p className="mt-1.5 text-white text-[20px] font-semibold leading-snug">{title}</p>
      <p className="mt-2 text-white/80 text-[14px] leading-[21px]">{explanation}</p>
      <div className="mt-3.5 grid grid-cols-1 min-[420px]:grid-cols-3 gap-2">
        {tips.map((t) => {
          const Icon = TIP_ICONS[t.icon]
          return (
            <div key={t.title} className="rounded-2xl bg-white/[0.07] p-3">
              <Icon className="h-4.5 w-4.5 h-[18px] w-[18px] text-[var(--vfp-accent)]" />
              <p className="mt-1.5 text-white text-[13px] font-semibold leading-tight">{t.title}</p>
              <p className="mt-0.5 text-white/70 text-[12.5px] leading-snug">{t.text}</p>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function AdvisorActions({
  onSimulate,
  simOpen,
  onCompare,
  onWhen,
}: {
  onSimulate: () => void
  simOpen: boolean
  onCompare: () => void
  onWhen: () => void
}) {
  const items = [
    { icon: Calculator, title: 'Simuler ma vente', sub: 'Estimer mes revenus', onClick: onSimulate, active: simOpen },
    { icon: BarChart3, title: 'Comparer les marchés', sub: 'Voir les prix par localité', onClick: onCompare },
    { icon: Clock, title: 'Quand vendre ?', sub: 'Demander au conseiller', onClick: onWhen },
  ]
  return (
    <div className="grid grid-cols-2 gap-2">
      {items.map((it) => (
        <button
          key={it.title}
          type="button"
          onClick={it.onClick}
          aria-expanded={it.active}
          className={`flex items-start gap-2.5 rounded-2xl p-3 text-left min-h-[64px] active:scale-[0.98] transition-transform ${it.active ? 'bg-[var(--vfp-accent)]/15 ring-1 ring-[var(--vfp-accent)]/40' : 'vfp-card'}`}
        >
          <it.icon className="h-5 w-5 shrink-0 text-[var(--vfp-accent)]" />
          <span className="min-w-0">
            <span className="block text-white text-[13.5px] font-semibold leading-tight">{it.title}</span>
            <span className="block text-white/55 text-[12px] leading-snug mt-0.5">{it.sub}</span>
          </span>
        </button>
      ))}
      <a
        href="/marche"
        className="flex items-start gap-2.5 rounded-2xl p-3 text-left min-h-[64px] vfp-card active:scale-[0.98] transition-transform"
      >
        <Handshake className="h-5 w-5 shrink-0 text-[var(--vfp-accent)]" />
        <span className="min-w-0">
          <span className="block text-white text-[13.5px] font-semibold leading-tight">Trouver un acheteur</span>
          <span className="block text-white/55 text-[12px] leading-snug mt-0.5">Annonces et préventes</span>
        </span>
      </a>
    </div>
  )
}

function SaleSimulator({ market, forecast }: { market: AdvisorMarket; forecast: AdvisorForecast | null }) {
  const [kg, setKg] = useState('500')
  const q = Math.max(0, Number.parseFloat(kg.replace(',', '.')) || 0)
  const end = forecast?.ok ? forecast.points[forecast.points.length - 1] : null
  return (
    <div className="vfp-card rounded-2xl p-4 space-y-3">
      <label className="block">
        <span className="text-white/60 text-[12.5px]">Quantité à vendre (kg)</span>
        <input
          inputMode="decimal"
          value={kg}
          onChange={(e) => setKg(e.target.value.replace(/[^\d.,]/g, ''))}
          className="mt-1 w-full rounded-xl bg-white/[0.06] border border-white/[0.12] px-3.5 py-3 text-base text-white focus:outline-none focus:border-[var(--vfp-accent)]/50"
        />
      </label>
      <div className="grid grid-cols-1 min-[380px]:grid-cols-2 gap-2 text-[13px]">
        <div className="rounded-xl bg-white/[0.05] p-3">
          <p className="text-white/55">Au prix d’aujourd’hui</p>
          <p className="text-white text-[17px] font-semibold mt-0.5">{fmt(q * market.currentPrice)} FCFA</p>
          {market.minPrice !== null && market.maxPrice !== null && (
            <p className="text-white/50 text-[12px] mt-0.5">
              selon le marché : {fmt(q * market.minPrice)} – {fmt(q * market.maxPrice)}
            </p>
          )}
        </div>
        <div className="rounded-xl bg-white/[0.05] p-3">
          <p className="text-white/55">Dans 4 semaines (prévision)</p>
          {end ? (
            <>
              <p className="text-white text-[17px] font-semibold mt-0.5">≈ {fmt(q * end.price)} FCFA</p>
              <p className="text-white/50 text-[12px] mt-0.5">
                probablement {fmt(q * end.low)} – {fmt(q * end.high)}
              </p>
            </>
          ) : (
            <p className="text-white/50 text-[12.5px] mt-1">Prévision indisponible.</p>
          )}
        </div>
      </div>
      <p className="text-white/45 text-[11.5px]">
        Estimation brute : sans transport, stockage ni pertes. La prévision n’est pas une garantie.
      </p>
    </div>
  )
}

const REASON_ICONS: Record<AdvisorReason['icon'], typeof Sprout> = {
  trend: TrendingUp,
  forecast: BarChart3,
  season: CloudSun,
  spread: Scale,
  data: Info,
}

function RecommendationReasons({ reasons }: { reasons: AdvisorReason[] }) {
  return (
    <details open className="vfp-card rounded-2xl group">
      <summary className="flex items-center justify-between gap-2 px-4 py-3.5 cursor-pointer list-none min-h-[52px]">
        <span className="text-white text-[14.5px] font-semibold">Pourquoi cette recommandation ?</span>
        <ChevronRight className="h-4 w-4 text-white/45 transition-transform group-open:rotate-90" />
      </summary>
      <ul className="px-4 pb-4 space-y-3">
        {reasons.map((r) => {
          const Icon = REASON_ICONS[r.icon]
          return (
            <li key={r.title} className="flex gap-3">
              <span className="h-8 w-8 shrink-0 rounded-xl bg-[var(--vfp-accent)]/12 grid place-items-center">
                <Icon className="h-4 w-4 text-[var(--vfp-accent)]" />
              </span>
              <span className="min-w-0">
                <span className="block text-white text-[13.5px] font-semibold">{r.title}</span>
                <span className="block text-white/65 text-[13px] leading-snug">{r.text}</span>
              </span>
            </li>
          )
        })}
      </ul>
    </details>
  )
}

function Notice({ text }: { text: string }) {
  return (
    <div className="vfp-card rounded-2xl p-4 flex gap-3 text-white/75 text-[13.5px] leading-snug">
      <Info className="h-5 w-5 shrink-0 text-white/45" />
      {text}
    </div>
  )
}

function LoadingBlock({ label }: { label: string }) {
  return <div className="vfp-card rounded-2xl p-4 text-white/55 text-[13px]">{label}</div>
}

function LoadingCards() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      {[0, 1].map((i) => (
        <div key={i} className="rounded-[18px] p-4 space-y-3" style={{ background: C.card }}>
          <div className="h-3 w-32 rounded animate-pulse" style={{ background: C.line }} />
          <div className="h-8 w-44 rounded-lg animate-pulse" style={{ background: C.line }} />
          <div className="h-20 rounded-lg animate-pulse" style={{ background: C.line }} />
        </div>
      ))}
    </div>
  )
}
