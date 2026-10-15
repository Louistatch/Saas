/**
 * Conseiller marché — données et règle de recommandation (sans affichage).
 *
 * Trois sources, toutes réelles :
 *  - le prix courant de la zone (vue market_price_current via /api/market-prices) ;
 *  - la prévision à 4 semaines d'AgriTogo (/api/market-prices/forecast) ;
 *  - le repère de saison sèche observé l'an passé (/api/market-prices/seasonal).
 *
 * La recommandation est une RÈGLE explicite appliquée à ces chiffres, pas une
 * réponse du modèle de langage : chaque raison affichée correspond à une
 * donnée. Quand une donnée manque, la recommandation le dit au lieu de deviner.
 */

import type { MarketPrice } from '@/lib/market-prices/models'

export type Confidence = 'faible' | 'moyenne' | 'élevée'

export interface AdvisorMarket {
  commodityId: string
  commodity: string
  location: string
  currentPrice: number
  minPrice: number | null
  maxPrice: number | null
  unit: 'FCFA/kg'
  lastObserved: string
  ageDays: number
  trend: 'up' | 'down' | 'stable'
  changePct: number | null
  marketsCount: number
  markets: string[]
  /** Médianes hebdomadaires, de la plus ancienne à la plus récente. */
  history: number[]
}

export interface ForecastPoint {
  weekStart: string
  price: number
  low: number
  high: number
}

export type AdvisorForecast =
  | {
      ok: true
      lastPrice: number
      lastWeek: string
      weeksObserved: number
      expectedPrice: number
      changePct: number
      direction: 'hausse' | 'baisse' | 'stable'
      confidence: Confidence
      points: ForecastPoint[]
      mape: number | null
      mapeNaive: number | null
      model: string
    }
  | { ok: false; reason: string }

export type SeasonalOutlook =
  | { ok: true; label: string; median: number; low: number; high: number; years: number[]; markets: number }
  | { ok: false; reason: string }

export interface AdvisorTip {
  icon: 'cash' | 'storage' | 'calendar' | 'compare'
  title: string
  text: string
}

export interface AdvisorReason {
  icon: 'trend' | 'forecast' | 'season' | 'spread' | 'data'
  title: string
  text: string
}

export interface Recommendation {
  kind: 'hold-part' | 'wait' | 'sell-as-needed' | 'no-signal'
  title: string
  explanation: string
  tips: AdvisorTip[]
  reasons: AdvisorReason[]
}

const fmt = (n: number) => Math.round(n).toLocaleString('fr-FR')
const pct = (n: number) => `${n > 0 ? '+' : ''}${n.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} %`

// Les noms de la table `cultures` sont sans accents (« Mais », « Niebe ») : on
// rétablit l'orthographe pour l'affichage, sans toucher aux données.
const DISPLAY_NAMES: Record<string, string> = {
  mais: 'Maïs',
  niebe: 'Niébé',
  cafe: 'Café',
  karite: 'Karité',
  palmierahuile: 'Palmier à huile',
}
export function displayCulture(name: string): string {
  const key = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z]/g, '')
  return DISPLAY_NAMES[key] ?? name
}

export function marketFromPrice(p: MarketPrice, history: number[]): AdvisorMarket {
  const range = p.priceRange
  return {
    commodityId: p.cultureId,
    commodity: displayCulture(p.cultureName),
    location: p.scopeName || p.regionName,
    currentPrice: p.price,
    minPrice: range?.min ?? null,
    maxPrice: range?.max ?? null,
    unit: 'FCFA/kg',
    lastObserved: p.createdAt,
    ageDays: p.ageDays,
    trend: p.trend,
    changePct: p.changePct,
    marketsCount: p.marketCount,
    markets: p.marketName ? p.marketName.split(', ') : [],
    history,
  }
}

// biome-ignore lint/suspicious/noExplicitAny: réponse JSON d'AgriTogo, validée champ par champ ci-dessous
export function forecastFromApi(raw: any): AdvisorForecast {
  if (!raw || raw.ok !== true || !Array.isArray(raw.previsions) || raw.previsions.length === 0) {
    return { ok: false, reason: typeof raw?.reason === 'string' ? raw.reason : 'prévision indisponible' }
  }
  const points: ForecastPoint[] = raw.previsions.map((p: { semaine_du: string; prix: number; bas: number; haut: number }) => ({
    weekStart: p.semaine_du,
    price: Number(p.prix),
    low: Number(p.bas),
    high: Number(p.haut),
  }))
  const v = raw.validation ?? {}
  const conf = raw.confiance === 'élevée' || raw.confiance === 'moyenne' ? raw.confiance : 'faible'
  return {
    ok: true,
    lastPrice: Number(raw.dernier_prix),
    lastWeek: String(raw.derniere_semaine),
    weeksObserved: Number(raw.semaines_observees),
    expectedPrice: points[points.length - 1].price,
    changePct: Number(raw.variation_4_semaines_pct),
    direction: raw.sens === 'hausse' || raw.sens === 'baisse' ? raw.sens : 'stable',
    confidence: conf,
    points,
    mape: typeof v.mape === 'number' ? v.mape : null,
    mapeNaive: typeof v.mape_naive === 'number' ? v.mape_naive : null,
    model: String(raw.modele ?? ''),
  }
}

// biome-ignore lint/suspicious/noExplicitAny: réponse JSON de /api/market-prices/seasonal
export function seasonalFromApi(raw: any): SeasonalOutlook {
  if (!raw || raw.ok !== true) return { ok: false, reason: raw?.reason ?? 'pas d’historique' }
  return {
    ok: true,
    label: 'Déc. – févr.',
    median: Number(raw.median),
    low: Number(raw.low),
    high: Number(raw.high),
    years: Array.isArray(raw.years) ? raw.years : [],
    markets: Number(raw.markets ?? 0),
  }
}

/**
 * Règle de recommandation. Prudente par construction : un signal faible ne
 * produit jamais un conseil tranché, et un conseil de stockage rappelle qu'il
 * dépend du besoin de liquidités et des conditions de stockage.
 */
export function buildRecommendation(m: AdvisorMarket, f: AdvisorForecast, s: SeasonalOutlook): Recommendation {
  const reasons: AdvisorReason[] = []
  const c = m.commodity.toLowerCase()

  if (m.changePct !== null) {
    reasons.push({
      icon: 'trend',
      title: m.trend === 'up' ? 'Prix en hausse' : m.trend === 'down' ? 'Prix en baisse' : 'Prix stable',
      text: `${pct(m.changePct)} sur les 3 dernières semaines (${fmt(m.currentPrice)} FCFA/kg, médiane de ${m.marketsCount} marché${m.marketsCount > 1 ? 's' : ''}).`,
    })
  }
  if (f.ok) {
    reasons.push({
      icon: 'forecast',
      title: f.direction === 'baisse' ? 'Baisse probable' : f.direction === 'hausse' ? 'Hausse probable' : 'Peu de mouvement attendu',
      text: `Environ ${fmt(f.expectedPrice)} FCFA/kg dans 4 semaines (${pct(f.changePct)}). Confiance ${f.confidence}.`,
    })
  }
  if (s.ok) {
    const vs = ((s.median - m.currentPrice) / m.currentPrice) * 100
    reasons.push({
      icon: 'season',
      title: 'Saison sèche',
      text: `L’an passé, de décembre à février : ${fmt(s.low)}–${fmt(s.high)} FCFA/kg (médiane ${fmt(s.median)}, soit ${pct(Math.round(vs * 10) / 10)} par rapport à aujourd’hui).`,
    })
  }
  if (m.minPrice !== null && m.maxPrice !== null && m.marketsCount > 1) {
    reasons.push({
      icon: 'spread',
      title: 'Écart entre marchés',
      text: `${fmt(m.maxPrice - m.minPrice)} FCFA/kg entre le marché le moins cher et le plus cher : comparer avant de vendre peut rapporter plus qu’attendre.`,
    })
  }

  const strong = f.ok && f.confidence !== 'faible'
  const seasonUp = s.ok && s.median > m.currentPrice * 1.05

  if (!f.ok || f.confidence === 'faible') {
    reasons.push({
      icon: 'data',
      title: 'Prévision peu fiable',
      text: f.ok
        ? 'Sur cette série, le modèle ne fait pas mieux que « le prix ne bouge pas ».'
        : 'Pas assez de relevés réguliers pour une prévision sur cette zone.',
    })
    return {
      kind: 'no-signal',
      title: `Vendre votre ${c} selon vos besoins`,
      explanation:
        'Les données ne donnent pas de signal fiable sur l’évolution du prix. Vendez la quantité dont vous avez besoin et comparez les marchés proches.',
      tips: [
        { icon: 'compare', title: 'Comparez', text: 'Regardez le prix de chaque marché avant de vous déplacer.' },
        { icon: 'cash', title: 'Besoin de liquidités ?', text: 'Vendez seulement la quantité nécessaire.' },
        { icon: 'calendar', title: 'Revenez', text: 'Consultez de nouveau dans deux semaines.' },
      ],
      reasons,
    }
  }

  if (strong && f.direction === 'baisse' && seasonUp) {
    return {
      kind: 'hold-part',
      title: `Conserver une partie de votre ${c}`,
      explanation: 'Si vous n’avez pas besoin immédiatement de liquidités, stocker une partie peut être intéressant : le prix devrait encore baisser à court terme, mais il a été plus élevé l’an passé en saison sèche (décembre – février). Ce n’est pas une certitude.',
      tips: [
        { icon: 'cash', title: 'Besoin de liquidités ?', text: 'Vendez seulement la quantité nécessaire.' },
        { icon: 'storage', title: 'Stockage disponible ?', text: 'Conservez le reste dans de bonnes conditions (sec, ventilé).' },
        { icon: 'calendar', title: 'Objectif', text: 'Réévaluez la situation en décembre.' },
      ],
      reasons,
    }
  }
  if (strong && f.direction === 'hausse') {
    return {
      kind: 'wait',
      title: `Attendre avant de vendre tout votre ${c}`,
      explanation:
        'Le prix devrait monter dans les prochaines semaines. Si vous pouvez attendre, vendre plus tard est probablement plus intéressant ; la prévision reste une estimation.',
      tips: [
        { icon: 'cash', title: 'Besoin de liquidités ?', text: 'Vendez une petite partie maintenant.' },
        { icon: 'storage', title: 'Stockage disponible ?', text: 'Gardez le reste en bon état.' },
        { icon: 'calendar', title: 'Objectif', text: 'Revérifiez le prix dans 2 à 4 semaines.' },
      ],
      reasons,
    }
  }
  return {
    kind: 'sell-as-needed',
    title: `Vendre votre ${c} selon vos besoins`,
    explanation:
      f.direction === 'baisse'
        ? 'Le prix devrait baisser et l’an passé ne montre pas de reprise nette : attendre n’apporte probablement pas grand-chose. Comparez les marchés pour vendre au meilleur prix.'
        : 'Peu de mouvement attendu dans les 4 prochaines semaines. Le meilleur levier est de choisir le marché qui paie le mieux.',
    tips: [
      { icon: 'compare', title: 'Comparez', text: 'Le marché le plus cher peut payer nettement plus.' },
      { icon: 'cash', title: 'Besoin de liquidités ?', text: 'Vendre maintenant ne vous désavantage pas.' },
      { icon: 'calendar', title: 'Objectif', text: 'Revenez dans deux semaines.' },
    ],
    reasons,
  }
}
