'use client'

import { useState, useCallback, useEffect, useMemo, useRef } from 'react'
import { TrendingUp, MapPin, Filter, AlertTriangle } from 'lucide-react'
import {
  Region,
  Culture,
  MarketPrice,
  type LocationOption,
  type PriceTrend,
} from '@/lib/market-prices/models'
import { MarketPricesService } from '@/lib/market-prices/service'
import { NearbyOffers } from '@/components/verify/nearby-offers'

function TrendBadge({ trend }: { trend: PriceTrend | string }) {
  if (trend === 'up')
    return (
      <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-red-500/10 text-red-400 text-[10px] font-bold whitespace-nowrap">
        ↑ Hausse
      </span>
    )
  if (trend === 'down')
    return (
      <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-green-500/10 text-green-400 text-[10px] font-bold whitespace-nowrap">
        ↓ Baisse
      </span>
    )
  return (
    <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-white/5 text-white/50 text-[10px] font-bold whitespace-nowrap">
      → Stable
    </span>
  )
}

function SVGSparkline({ values, trend }: { values: number[]; trend: string }) {
  if (values.length < 2) return null
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1
  const W = 48
  const H = 20
  const pts = values.map((v, i) => [
    (i / (values.length - 1)) * W,
    H - ((v - min) / range) * (H - 4) - 2,
  ])
  const d = pts
    .map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`)
    .join(' ')
  const color = trend === 'up' ? '#f87171' : trend === 'down' ? '#4ade80' : 'rgba(255,255,255,0.3)'
  return (
    <svg
      aria-hidden="true"
      width={W}
      height={H}
      viewBox={`0 0 ${W} ${H}`}
      className="shrink-0 opacity-80"
    >
      <path
        d={d}
        fill="none"
        stroke={color}
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r="2.5" fill={color} />
    </svg>
  )
}

interface Props {
  cooperativeName?: string
  cardNumber?: string
  memberLocality?: {
    village: string | null
    canton: string | null
    prefecture: string | null
    region: string | null
  }
  compact?: boolean
  onSeeMore?: () => void
}

const ALL_REGIONS = Region.all()
// Cultures proposées à la SAISIE d'un prix (les puces de filtre, elles, suivent les données).
const ALL_CULTURES = Culture.all()

export function MarketPricesDashboard({ cardNumber, memberLocality }: Props) {
  // One service instance per mount; aborts in-flight requests on unmount.
  const serviceRef = useRef<MarketPricesService>(new MarketPricesService())
  useEffect(() => () => serviceRef.current.dispose(), [])

  const [selectedRegion, setSelectedRegion] = useState<Region | null>(null)
  const [selectedPrefectureId, setSelectedPrefectureId] = useState('')
  const [selectedCantonId, setSelectedCantonId] = useState('')
  const [cultureFilter, setCultureFilter] = useState<string | null>(null)
  const [priceTypeFilter, setPriceTypeFilter] = useState<'all' | 'wholesale' | 'retail'>('all')

  const [prefectures, setPrefectures] = useState<LocationOption[]>([])
  const [cantons, setCantons] = useState<LocationOption[]>([])
  const [prices, setPrices] = useState<MarketPrice[]>([])
  const [regionCounts, setRegionCounts] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(false)

  const [showSubmitForm, setShowSubmitForm] = useState(false)
  const [submitForm, setSubmitForm] = useState({ culture_id: '', price: '' })
  const [submitting, setSubmitting] = useState(false)
  const [submitResult, setSubmitResult] = useState<{ ok: boolean; msg: string } | null>(null)

  const sortedRegions = useMemo(() => {
    const memberRegionName = memberLocality?.region
    if (!memberRegionName) return ALL_REGIONS
    return [...ALL_REGIONS].sort((a, b) => {
      if (a.name === memberRegionName) return -1
      if (b.name === memberRegionName) return 1
      return 0
    })
  }, [memberLocality?.region])

  const pricesByCulture = useMemo(() => MarketPrice.groupValuesByCulture(prices), [prices])

  // Les puces suivent les cultures qui ONT un prix ici (maïs, riz, haricot… arrivent
  // avec la source CPC), au lieu de quatre cultures figées dans le code.
  const cultureChips = useMemo(() => {
    const seen = new Map<string, { id: string; name: string; emoji: string }>()
    for (const p of prices) {
      if (!seen.has(p.cultureId)) {
        seen.set(p.cultureId, { id: p.cultureId, name: p.cultureName, emoji: p.cultureEmoji })
      }
    }
    return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name, 'fr'))
  }, [prices])

  // Le filtre gros/détail n'apparaît QUE si les deux coexistent réellement.
  // Avant l'ingestion CPC tout est `unknown` : afficher un sélecteur sans objet
  // encombrerait l'écran d'un choix qui ne change rien.
  const hasBothPriceTypes = useMemo(
    () =>
      prices.some((p) => p.priceType === 'wholesale') &&
      prices.some((p) => p.priceType === 'retail'),
    [prices],
  )

  const visiblePrices = useMemo(() => {
    let list = cultureFilter ? prices.filter((p) => p.cultureId === cultureFilter) : prices
    if (hasBothPriceTypes && priceTypeFilter !== 'all') {
      list = list.filter((p) => p.priceType === priceTypeFilter)
    }
    // Une ligne par culture / marché / type de prix : le relevé le plus récent.
    // `prices` arrive trié du plus récent au plus ancien et garde l'historique
    // pour les courbes (pricesByCulture) ; le tableau, lui, montre le prix actuel.
    const latest = new Set<string>()
    const ordered = [...list].sort(
      (a, b) => a.ageDays - b.ageDays || a.cultureName.localeCompare(b.cultureName, 'fr'),
    )
    return ordered.filter((p) => {
      const key = `${p.cultureId}|${p.scopeName}|${p.marketName.toLowerCase()}|${p.priceType}`
      if (latest.has(key)) return false
      latest.add(key)
      return true
    })
  }, [prices, cultureFilter, hasBothPriceTypes, priceTypeFilter])

  // Pre-select the member's own region on mount.
  useEffect(() => {
    const memberRegion = Region.findByName(memberLocality?.region)
    if (memberRegion) setSelectedRegion(memberRegion)
  }, [memberLocality?.region])

  useEffect(() => {
    serviceRef.current
      .getRegionCounts()
      .then(setRegionCounts)
      .catch(() => {})
  }, [])

  // Load prefectures whenever the region changes.
  useEffect(() => {
    setSelectedPrefectureId('')
    setSelectedCantonId('')
    setCantons([])
    if (!selectedRegion) {
      setPrefectures([])
      return
    }
    let cancelled = false
    setLoading(true)
    serviceRef.current
      .getPrefectures(selectedRegion.id)
      .then((list) => {
        if (!cancelled) setPrefectures(list)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [selectedRegion])

  // Load cantons whenever the prefecture changes.
  useEffect(() => {
    setSelectedCantonId('')
    if (!selectedPrefectureId) {
      setCantons([])
      return
    }
    let cancelled = false
    serviceRef.current.getCantons(selectedPrefectureId).then((list) => {
      if (!cancelled) setCantons(list)
    })
    return () => {
      cancelled = true
    }
  }, [selectedPrefectureId])

  // Load prices whenever region/canton selection settles.
  useEffect(() => {
    if (!selectedRegion) {
      setPrices([])
      return
    }
    let cancelled = false
    setLoading(true)
    serviceRef.current
      .getPrices(selectedRegion.id, selectedCantonId || undefined, selectedPrefectureId || undefined)
      .then((list) => {
        if (!cancelled) setPrices(list)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [selectedRegion, selectedPrefectureId, selectedCantonId])

  const handleSubmitPrice = useCallback(async () => {
    if (!submitForm.culture_id || !submitForm.price) return
    setSubmitting(true)
    setSubmitResult(null)
    const marketName =
      memberLocality?.canton ??
      memberLocality?.village ??
      cantons.find((c) => c.id === selectedCantonId)?.name ??
      prefectures.find((p) => p.id === selectedPrefectureId)?.name ??
      'Non précisé'
    const memberRegion = Region.findByName(memberLocality?.region)
    const regionId = memberRegion?.id ?? selectedRegion?.id
    if (!regionId) {
      setSubmitResult({ ok: false, msg: 'Région introuvable' })
      setSubmitting(false)
      return
    }
    const result = await serviceRef.current.submitPrice({
      cardNumber: decodeURIComponent(cardNumber ?? ''),
      cultureId: submitForm.culture_id,
      regionId,
      marketName,
      price: Number.parseInt(submitForm.price, 10),
    })
    setSubmitResult({ ok: result.ok, msg: result.message })
    if (result.ok) setSubmitForm({ culture_id: '', price: '' })
    setSubmitting(false)
  }, [
    submitForm,
    memberLocality,
    cantons,
    prefectures,
    selectedCantonId,
    selectedPrefectureId,
    selectedRegion,
    cardNumber,
  ])

  const breadcrumb = [
    selectedRegion?.name,
    prefectures.find((p) => p.id === selectedPrefectureId)?.name,
    cantons.find((c) => c.id === selectedCantonId)?.name,
  ]
    .filter(Boolean)
    .join(' › ')

  return (
    <div className="space-y-4">
      {/* Un second bouton « Retour au menu » s'empilait sous celui de la page
          verify — et il était MORT : la page ne passe pas `onBack`, donc le
          clic ne faisait rien. Bouton et prop supprimés, la page pilote le
          retour. */}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-white text-lg font-bold flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-[var(--vfp-accent)]" /> Prix du Marché
          </h3>
          {breadcrumb && (
            <p className="text-[10px] text-white/30 font-mono mt-0.5">📍 {breadcrumb}</p>
          )}
        </div>
        <div className="px-2 py-1 rounded-full bg-orange-500/10 border border-orange-500/20">
          <span className="text-[9px] font-bold text-orange-400 uppercase">FCFA/kg</span>
        </div>
      </div>

      {/* Filter bar: region / prefecture / canton selects */}
      <div className="rounded-2xl vfp-card p-3 space-y-2.5">
        <div className="flex items-center gap-1.5 text-white/40 text-[10px] uppercase tracking-wider font-semibold">
          <Filter className="h-3 w-3" /> Filtrer par localité
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <select
            value={selectedRegion?.id ?? ''}
            onChange={(e) => setSelectedRegion(Region.findById(e.target.value) ?? null)}
            className="w-full rounded-xl bg-white/[0.04] border border-white/[0.1] px-3 py-2.5 text-sm text-white focus:outline-none focus:border-[var(--vfp-accent)]/40"
          >
            <option value="" className="bg-neutral-900">
              Toutes les régions
            </option>
            {sortedRegions.map((r) => (
              <option key={r.id} value={r.id} className="bg-neutral-900">
                {r.emoji} {r.name}
                {r.name === memberLocality?.region ? ' (ma région)' : ''} —{' '}
                {regionCounts[r.id] ?? 0} prix
              </option>
            ))}
          </select>

          <select
            value={selectedPrefectureId}
            onChange={(e) => setSelectedPrefectureId(e.target.value)}
            disabled={!selectedRegion || prefectures.length === 0}
            className="w-full rounded-xl bg-white/[0.04] border border-white/[0.1] px-3 py-2.5 text-sm text-white focus:outline-none focus:border-[var(--vfp-accent)]/40 disabled:opacity-40"
          >
            <option value="" className="bg-neutral-900">
              Toutes les préfectures
            </option>
            {prefectures.map((p) => (
              <option key={p.id} value={p.id} className="bg-neutral-900">
                {p.name}
                {p.priceCount ? ` — ${p.priceCount} prix` : ''}
              </option>
            ))}
          </select>

          <select
            value={selectedCantonId}
            onChange={(e) => setSelectedCantonId(e.target.value)}
            disabled={!selectedPrefectureId || cantons.length === 0}
            className="w-full rounded-xl bg-white/[0.04] border border-white/[0.1] px-3 py-2.5 text-sm text-white focus:outline-none focus:border-[var(--vfp-accent)]/40 disabled:opacity-40"
          >
            <option value="" className="bg-neutral-900">
              Tous les cantons
            </option>
            {cantons.map((c) => (
              <option key={c.id} value={c.id} className="bg-neutral-900">
                {c.name}
                {c.priceCount ? ` — ${c.priceCount} prix` : ''}
              </option>
            ))}
          </select>
        </div>

        {/* Culture filter chips */}
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => setCultureFilter(null)}
            className={`px-2.5 py-1 rounded-full text-[11px] font-semibold border transition-colors ${cultureFilter === null ? 'bg-[var(--vfp-accent)]/15 border-[var(--vfp-accent)]/40 text-[var(--vfp-accent)]' : 'bg-white/[0.02] border-white/[0.06] text-white/50'}`}
          >
            Toutes les cultures
          </button>
          {cultureChips.map((c) => (
            <button
              type="button"
              key={c.id}
              onClick={() => setCultureFilter(cultureFilter === c.id ? null : c.id)}
              className={`px-2.5 py-1 rounded-full text-[11px] font-semibold border transition-colors flex items-center gap-1 ${cultureFilter === c.id ? 'bg-[var(--vfp-accent)]/15 border-[var(--vfp-accent)]/40 text-[var(--vfp-accent)]' : 'bg-white/[0.02] border-white/[0.06] text-white/50'}`}
            >
              <span>{c.emoji}</span> {c.name}
            </button>
          ))}
        </div>
      </div>

      {loading && (
        <div className="flex justify-center py-8">
          <div className="w-6 h-6 border-2 border-[var(--vfp-accent)]/30 border-t-[var(--vfp-accent)] rounded-full animate-spin" />
        </div>
      )}

      {hasBothPriceTypes && (
        <div className="flex items-center gap-1.5">
          {(
            [
              ['all', 'Tous'],
              ['retail', 'Détail'],
              ['wholesale', 'Gros'],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setPriceTypeFilter(value)}
              className={`flex-1 rounded-xl px-3 py-2 text-[12.5px] font-semibold transition-colors ${
                priceTypeFilter === value
                  ? 'bg-[var(--vfp-accent)]/15 text-[var(--vfp-accent)] ring-1 ring-[var(--vfp-accent)]/30'
                  : 'bg-white/[0.04] text-white/50'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {/* Avertissement global : quand MÊME le relevé le plus récent est vieux,
          la liste entière est une archive. Le dire une fois en haut vaut mieux
          que de laisser l'utilisateur additionner lui-même les mentions
          « il y a 4 mois » ligne par ligne. */}
      {!loading &&
        visiblePrices.length > 0 &&
        Math.min(...visiblePrices.map((p) => p.ageDays)) > 14 && (
          <div className="rounded-2xl bg-amber-500/10 ring-1 ring-amber-400/25 px-3.5 py-3 flex items-start gap-2.5">
            <AlertTriangle className="h-4 w-4 text-amber-300 shrink-0 mt-0.5" />
            <p className="text-amber-100/90 text-[12.5px] leading-snug">
              Ces prix datent de{' '}
              <strong>{visiblePrices.reduce((a, p) => (p.ageDays < a.ageDays ? p : a)).freshnessLabel}</strong>.
              Vérifiez sur votre marché avant de vendre.
            </p>
          </div>
        )}

      {/* Compact price table */}
      {!loading && (
        <div className="rounded-2xl vfp-card overflow-hidden">
          {visiblePrices.length === 0 ? (
            <div className="p-6 text-center">
              <p className="text-white/50 text-sm">Aucun prix disponible ici</p>
              <p className="text-white/30 text-xs mt-1">Soyez le premier à renseigner !</p>
            </div>
          ) : (
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-white/[0.06] text-[10px] uppercase tracking-wider text-white/30">
                  <th className="px-3 py-2 font-semibold">Culture</th>
                  <th className="px-3 py-2 font-semibold hidden sm:table-cell">Marché</th>
                  <th className="px-3 py-2 font-semibold">Tendance</th>
                  <th className="px-3 py-2 font-semibold text-right">Prix</th>
                </tr>
              </thead>
              <tbody>
                {visiblePrices.map((p) => {
                  const sparkValues = p.history.length >= 2 ? p.history : (pricesByCulture[p.cultureId] ?? [])
                  return (
                    <tr key={p.id} className="border-b border-white/[0.04] last:border-0">
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-base shrink-0">{p.cultureEmoji}</span>
                          <span className="text-xs font-semibold text-white truncate">
                            {p.cultureName}
                          </span>
                          {/* Le badge n'apparaît que quand la distinction est
                              réelle : sans lui, deux lignes « Maïs — Kara »
                              affichant des prix différents passeraient pour une
                              incohérence de la base. */}
                          {p.priceTypeLabel && (
                            <span className="shrink-0 rounded px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-wide bg-white/[0.07] text-white/55">
                              {p.priceTypeLabel}
                            </span>
                          )}
                        </div>
                        {/* Où : la région du prix, et sur combien de marchés il repose. */}
                        {p.regionName && (
                          <p className="mt-0.5 pl-7 text-[10.5px] text-white/35 truncate">
                            {p.regionName}
                            {p.scopeName && p.scopeName !== p.regionName ? ` › ${p.scopeName}` : ''}
                            {p.marketCount > 1 ? ` · ${p.marketCount} marchés` : p.marketName ? ` · ${p.marketName}` : ''}
                          </p>
                        )}
                      </td>
                      <td className="px-3 py-2.5 hidden sm:table-cell">
                        <span className="text-xs text-white/50 truncate flex items-center gap-1">
                          <MapPin className="h-3 w-3 text-white/25 shrink-0" />
                          {p.marketName}
                        </span>
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-2">
                          <TrendBadge trend={p.trend} />
                          {p.changePct !== null ? (
                            <span className="text-[10.5px] font-mono text-white/45">
                              {p.changePct > 0 ? '+' : ''}
                              {p.changePct.toLocaleString('fr-FR')} %
                            </span>
                          ) : p.regionName ? (
                            <span className="text-[10px] text-white/30">pas de base de comparaison</span>
                          ) : null}
                          {sparkValues.length >= 2 && (
                            <SVGSparkline values={sparkValues} trend={p.trend} />
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-right whitespace-nowrap">
                        <span
                          className={`text-sm font-bold ${p.isStale ? 'text-white/45' : 'text-white'}`}
                        >
                          {p.formattedPrice}
                        </span>
                        {/* L'ancienneté accompagne TOUJOURS le prix : un chiffre
                            sans date se lit comme le cours du jour. Un relevé
                            périmé est en plus grisé, pour que l'œil le traite
                            comme une indication et non comme une référence. */}
                        {p.priceRange && (
                          <span className="block text-[10px] leading-tight text-white/35">
                            {p.priceRange.min.toLocaleString('fr-FR')}–
                            {p.priceRange.max.toLocaleString('fr-FR')}
                          </span>
                        )}
                        <span
                          className={`block text-[10px] leading-tight ${p.isStale ? 'text-amber-300/70' : 'text-white/35'}`}
                        >
                          {p.freshnessLabel}
                        </span>
                        {/* Source externe : publiée, mais pas vérifiée par la plateforme. */}
                        {p.isExternal && !p.verified && (
                          <span className="block text-[9.5px] leading-tight text-sky-300/70">
                            Source {p.sourceLabel} · non vérifié
                          </span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Préventes publiées près de la zone et de la culture choisies ci-dessus.
          Les annonces se GÈRENT depuis Exploitation ; ici on les DÉCOUVRE, à côté
          des prix qui permettent de juger si une offre est correcte. */}
      <NearbyOffers
        regionId={selectedRegion?.id}
        prefectureId={selectedPrefectureId || undefined}
        cantonId={selectedCantonId || undefined}
        culture={cultureFilter ? Culture.findById(cultureFilter)?.name : undefined}
      />

      {/* Submit a price (collapsible) */}
      {!showSubmitForm ? (
        <button
          type="button"
          onClick={() => {
            setShowSubmitForm(true)
            setSubmitResult(null)
          }}
          className="w-full rounded-2xl p-4 bg-[var(--vfp-accent)]/[0.08] border border-[var(--vfp-accent)]/20 flex items-center gap-3 active:scale-[0.98] transition-transform"
        >
          <div className="w-10 h-10 rounded-xl bg-[var(--vfp-accent)]/15 flex items-center justify-center shrink-0">
            <TrendingUp className="h-5 w-5 text-[var(--vfp-accent)]" />
          </div>
          <div className="flex-1 text-left">
            <p className="text-sm font-semibold text-white">Renseigner un prix</p>
            <p className="text-xs text-white/50">
              📍 {memberLocality?.canton ?? memberLocality?.village ?? 'Votre zone'}
            </p>
          </div>
        </button>
      ) : (
        <div className="rounded-2xl vfp-card p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-[var(--vfp-accent)]/10 flex items-center justify-center">
                <TrendingUp className="h-4 w-4 text-[var(--vfp-accent)]" />
              </div>
              <div>
                <p className="text-sm font-bold text-white">Renseigner un prix</p>
                <p className="text-xs text-white/40">
                  📍{' '}
                  {[memberLocality?.village, memberLocality?.canton, memberLocality?.prefecture]
                    .filter(Boolean)
                    .join(', ') || 'Votre zone'}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setShowSubmitForm(false)}
              className="text-white/30 text-xs hover:text-white/60"
            >
              Fermer
            </button>
          </div>
          <fieldset className="border-0 p-0 m-0">
            <legend className="text-xs text-white/50 uppercase tracking-wider font-semibold block mb-1.5">
              Culture
            </legend>
            <div className="grid grid-cols-4 gap-2">
              {ALL_CULTURES.map((c) => (
                <button
                  type="button"
                  key={c.id}
                  onClick={() => setSubmitForm((f) => ({ ...f, culture_id: c.id }))}
                  className={`flex flex-col items-center gap-0.5 p-2 rounded-xl border transition-all ${submitForm.culture_id === c.id ? 'bg-[var(--vfp-accent)]/10 border-[var(--vfp-accent)]/40' : 'bg-white/[0.02] border-white/[0.06]'}`}
                >
                  <span className="text-lg">{c.emoji}</span>
                  <span className="text-[10px] text-white/60 text-center">{c.name}</span>
                </button>
              ))}
            </div>
          </fieldset>
          <div>
            <label
              htmlFor="price-submit"
              className="text-xs text-white/50 uppercase tracking-wider font-semibold block mb-1.5"
            >
              Prix (FCFA/kg)
            </label>
            <input
              id="price-submit"
              type="number"
              inputMode="numeric"
              placeholder="Ex: 450"
              value={submitForm.price}
              onChange={(e) => setSubmitForm((f) => ({ ...f, price: e.target.value }))}
              className="w-full rounded-xl bg-white/[0.04] border border-white/[0.1] px-4 py-3 text-white text-lg font-bold placeholder:text-white/20 focus:outline-none focus:border-[var(--vfp-accent)]/40"
            />
          </div>
          <button
            type="button"
            onClick={handleSubmitPrice}
            disabled={!submitForm.culture_id || !submitForm.price || submitting}
            className="w-full py-3.5 rounded-xl bg-[var(--vfp-cta)] text-[var(--vfp-cta-fg)] font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-40 active:scale-[0.97] transition-transform"
          >
            {submitting ? (
              <div className="w-4 h-4 border-2 border-[var(--vfp-cta-fg)]/30 border-t-[var(--vfp-cta-fg)] rounded-full animate-spin" />
            ) : (
              <>✓ Envoyer</>
            )}
          </button>
          {submitResult && (
            <div
              className={`rounded-xl p-3 text-center text-xs font-medium ${submitResult.ok ? 'bg-[var(--vfp-accent)]/10 text-[var(--vfp-accent)]' : 'bg-red-500/10 text-red-400'}`}
            >
              {submitResult.msg}
            </div>
          )}
          <p className="text-[11px] text-white/25 text-center">
            Vérifié par la coopérative avant publication
          </p>
        </div>
      )}
    </div>
  )
}
