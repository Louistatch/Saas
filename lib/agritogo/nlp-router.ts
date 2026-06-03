/**
 * AgriTogo NLP Router — Intelligent intent detection + entity extraction.
 *
 * Parses the user's French message to determine:
 *   1. INTENT: what do they want? (price, trend, yield, risk, advice...)
 *   2. ENTITIES: product, market, amount, quantity
 *   3. STRATEGY: direct data (no LLM) vs agent (needs Gemini)
 *
 * 70% of farmer questions are simple data lookups that don't need an LLM.
 */

export type Intent =
  | 'prix_simple'
  | 'tendance'
  | 'prediction_rendement'
  | 'volatilite'
  | 'risque_financier'
  | 'segmentation'
  | 'kpi'
  | 'liste_produits'
  | 'liste_marches'
  | 'conseil_decision'
  | 'conseil_general'
  | 'salutation'

export interface ParsedQuery {
  intent: Intent
  produit: string | null
  marche: string | null
  montant: number | null
  quantite: string | null
  needsLLM: boolean
  confidence: number // 0-1
  raw: string
}

// ─── Product names (normalized) ──────────────────────────────────
const PRODUITS: Record<string, string> = {
  'mais': 'Maïs', 'maïs': 'Maïs', 'maize': 'Maïs', 'corn': 'Maïs',
  'riz': 'Riz', 'rice': 'Riz', 'riz local': 'Riz',
  'sorgho': 'Sorgho', 'sorghum': 'Sorgho',
  'mil': 'Mil', 'millet': 'Mil',
  'haricot': 'Haricot', 'bean': 'Haricot', 'beans': 'Haricot',
  'soja': 'Soja', 'soy': 'Soja', 'soybean': 'Soja',
  'arachide': 'Arachide', 'peanut': 'Arachide', 'cacahuète': 'Arachide',
  'igname': 'Igname', 'yam': 'Igname',
  'manioc': 'Manioc', 'cassava': 'Manioc',
  'tomate': 'Tomate', 'tomato': 'Tomate',
  'piment': 'Piment', 'pepper': 'Piment', 'chili': 'Piment',
  'oignon': 'Oignon', 'onion': 'Oignon',
  'gombo': 'Gombo', 'okra': 'Gombo',
}

// ─── Market names (normalized) ───────────────────────────────────
const MARCHES: Record<string, string> = {
  'lomé': 'Lomé-Adawlato', 'lome': 'Lomé-Adawlato', 'adawlato': 'Lomé-Adawlato',
  'kara': 'Kara',
  'sokodé': 'Sokodé', 'sokode': 'Sokodé',
  'atakpamé': 'Atakpamé', 'atakpame': 'Atakpamé',
  'dapaong': 'Dapaong',
  'kpalimé': 'Kpalimé', 'kpalime': 'Kpalimé',
  'tsévié': 'Tsévié', 'tsevie': 'Tsévié',
  'bassar': 'Bassar',
  'mango': 'Mango',
  'notsé': 'Notsé', 'notse': 'Notsé',
}

// ─── Intent rules (ordered by priority) ──────────────────────────
const INTENT_RULES: { keywords: string[]; intent: Intent; needsLLM: boolean }[] = [
  // Salutations
  { keywords: ['bonjour', 'salut', 'bonsoir', 'hello', 'coucou', 'hey'],
    intent: 'salutation', needsLLM: false },

  // Prix simple — most common query
  { keywords: ['prix', 'coûte', 'coute', 'combien', 'tarif', 'vaut', 'cher', 'cours'],
    intent: 'prix_simple', needsLLM: false },

  // Tendance
  { keywords: ['tendance', 'monte', 'descend', 'baisse', 'hausse', 'évolue', 'evolue', 'variation', 'augmente', 'diminue', 'stable'],
    intent: 'tendance', needsLLM: false },

  // Prédiction rendement
  { keywords: ['rendement', 'récolte', 'recolte', 'production', 'yield', 'productivité', 'hectare', 'ha'],
    intent: 'prediction_rendement', needsLLM: false },

  // Volatilité
  { keywords: ['volatilité', 'volatilite', 'fluctuation', 'instable', 'garch'],
    intent: 'volatilite', needsLLM: false },

  // Risque financier
  { keywords: ['risque', 'crédit', 'credit', 'emprunt', 'prêt', 'pret', 'rembourser', 'dette', 'financement'],
    intent: 'risque_financier', needsLLM: false },

  // Segmentation
  { keywords: ['type agriculteur', 'catégorie', 'categorie', 'profil', 'segment', 'classif', 'groupe'],
    intent: 'segmentation', needsLLM: false },

  // KPI
  { keywords: ['kpi', 'indicateur', 'performance', 'bilan', 'statistique', 'dashboard'],
    intent: 'kpi', needsLLM: false },

  // Listes
  { keywords: ['quels produits', 'liste produits', 'produits disponibles', 'cultures disponibles'],
    intent: 'liste_produits', needsLLM: false },
  { keywords: ['quels marchés', 'liste marchés', 'marches disponibles', 'où acheter', 'où vendre'],
    intent: 'liste_marches', needsLLM: false },

  // Decision/Conseil (NEEDS LLM)
  { keywords: ['vendre', 'acheter', 'stocker', 'moment', 'quand', 'stratégie', 'strategie', 'investir', 'décision', 'decision'],
    intent: 'conseil_decision', needsLLM: true },

  // Conseil général (NEEDS LLM)
  { keywords: ['conseil', 'aide', 'comment', 'quoi faire', 'recommand', 'suggère', 'suggere', 'explique', 'pourquoi'],
    intent: 'conseil_general', needsLLM: true },
]

/**
 * Parse a French agricultural query into structured intent + entities.
 */
export function parseQuery(message: string): ParsedQuery {
  const raw = message.trim()
  const q = raw.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // remove accents for matching
  const qOriginal = raw.toLowerCase()

  // Extract product
  let produit: string | null = null
  for (const [key, val] of Object.entries(PRODUITS)) {
    const normalizedKey = key.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    if (q.includes(normalizedKey)) {
      produit = val
      break
    }
  }

  // Extract market
  let marche: string | null = null
  for (const [key, val] of Object.entries(MARCHES)) {
    const normalizedKey = key.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    if (q.includes(normalizedKey)) {
      marche = val
      break
    }
  }

  // Extract amount (FCFA)
  let montant: number | null = null
  const montantMatch = raw.match(/(\d[\d\s.,]*)\s*(?:fcfa|francs?|f\b)/i)
  if (montantMatch) {
    montant = parseInt(montantMatch[1].replace(/[\s.,]/g, ''), 10)
  }

  // Extract quantity
  let quantite: string | null = null
  const qteMatch = raw.match(/(\d[\d.,]*)\s*(?:kg|tonnes?|sacs?|quintaux?)/i)
  if (qteMatch) {
    quantite = qteMatch[0]
  }

  // Detect intent
  let intent: Intent = 'conseil_general'
  let needsLLM = true
  let confidence = 0.3

  for (const rule of INTENT_RULES) {
    const matched = rule.keywords.some(kw => {
      const normalizedKw = kw.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      return q.includes(normalizedKw)
    })
    if (matched) {
      intent = rule.intent
      needsLLM = rule.needsLLM
      confidence = 0.85
      break
    }
  }

  // Boost confidence if we extracted entities matching the intent
  if (produit && ['prix_simple', 'tendance', 'volatilite'].includes(intent)) {
    confidence = 0.95
  }

  // High stakes → force LLM even if simple intent matched
  if (montant && montant >= 100000) {
    needsLLM = true
    intent = 'conseil_decision'
    confidence = 0.9
  }

  return { intent, produit, marche, montant, quantite, needsLLM, confidence, raw }
}
