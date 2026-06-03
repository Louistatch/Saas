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

// ─── Conversational markers → ALWAYS needs LLM ──────────────────
const LLM_MARKERS = [
  'comment', 'pourquoi', 'explique', 'aide', 'conseil',
  'devrais', 'faut-il', 'est-ce que', 'est-ce qu',
  'penses', 'pense', 'crois', 'recommande', 'suggère', 'suggere',
  'que faire', 'quoi faire', 'mieux', 'meilleur',
  'améliorer', 'ameliorer', 'optimiser', 'stratégie', 'strategie',
  'avenir', 'futur', 'prochaine', 'saison',
  'problème', 'probleme', 'difficulté', 'difficile',
  'merci', 'ok', 'oui', 'non', 'd\'accord', 'compris',
  'je veux', 'je souhaite', 'j\'aimerais', 'j\'ai',
  'mon', 'ma', 'mes', 'notre', 'nos', // possessifs = contexte personnel → LLM
]

// ─── Intent rules (only SHORT factual queries are direct) ────────
const INTENT_RULES: { keywords: string[]; intent: Intent; needsLLM: boolean }[] = [
  // Salutations — direct, no LLM needed
  { keywords: ['bonjour', 'salut', 'bonsoir', 'hello', 'coucou', 'hey'],
    intent: 'salutation', needsLLM: false },

  // ONLY these very specific patterns go direct (must also pass the guards below):
  // "prix du maïs", "combien coûte le riz", "tarif igname"
  { keywords: ['prix', 'coûte', 'coute', 'combien', 'tarif'],
    intent: 'prix_simple', needsLLM: false },

  // "tendance maïs", "le riz monte ?"
  { keywords: ['tendance'],
    intent: 'tendance', needsLLM: false },

  // "liste des produits", "quels produits"
  { keywords: ['quels produits', 'liste produits', 'produits disponibles'],
    intent: 'liste_produits', needsLLM: false },
  { keywords: ['quels marchés', 'liste marchés', 'marchés disponibles'],
    intent: 'liste_marches', needsLLM: false },

  // Everything else → LLM (agent handles it with full context)
  { keywords: ['rendement', 'récolte', 'recolte', 'production', 'yield'],
    intent: 'prediction_rendement', needsLLM: true },
  { keywords: ['volatilité', 'volatilite', 'fluctuation', 'garch'],
    intent: 'volatilite', needsLLM: true },
  { keywords: ['risque', 'crédit', 'credit', 'emprunt', 'prêt', 'pret'],
    intent: 'risque_financier', needsLLM: true },
  { keywords: ['segmentation', 'type agriculteur', 'profil', 'catégorie'],
    intent: 'segmentation', needsLLM: true },
  { keywords: ['kpi', 'indicateur', 'performance', 'bilan', 'dashboard'],
    intent: 'kpi', needsLLM: true },
  { keywords: ['vendre', 'acheter', 'stocker', 'investir', 'décision'],
    intent: 'conseil_decision', needsLLM: true },
  { keywords: ['monte', 'descend', 'baisse', 'hausse', 'augmente', 'diminue', 'stable'],
    intent: 'tendance', needsLLM: true },
]

/**
 * Parse a French agricultural query into structured intent + entities.
 *
 * KEY PRINCIPLE: default to LLM. Only short, purely factual queries go direct.
 * "prix maïs" → direct. "comment évolue le prix du maïs cette saison?" → LLM.
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

  // ─── GUARD 1: Conversational markers → ALWAYS LLM ─────────────
  const hasConversationalMarker = LLM_MARKERS.some(marker => {
    const normalizedMarker = marker.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    return q.includes(normalizedMarker)
  })

  // ─── GUARD 2: Long messages (>10 words) → ALWAYS LLM ──────────
  const wordCount = raw.split(/\s+/).length
  const isLong = wordCount > 10

  // ─── GUARD 3: Questions with ? → likely needs explanation → LLM
  // UNLESS it's a pure "combien coûte X?" pattern
  const hasQuestionMark = raw.includes('?')
  const isPureFactualQuestion = hasQuestionMark && wordCount <= 6 && !hasConversationalMarker

  // ─── Detect intent ─────────────────────────────────────────────
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

  // ─── Apply guards: force LLM when conversation detected ────────
  if (hasConversationalMarker || isLong) {
    needsLLM = true
    confidence = Math.min(confidence, 0.7)
  }

  // ─── Only allow direct (no LLM) for very short factual queries ─
  // "prix maïs" (2 words) → direct
  // "quel est le prix actuel du maïs sur le marché de Kara?" (12 words) → LLM
  if (!needsLLM && wordCount > 8) {
    needsLLM = true
  }

  // Salutation is always direct regardless of length
  if (intent === 'salutation') {
    needsLLM = false
    confidence = 0.95
  }

  // High stakes amount → force LLM
  if (montant && montant >= 100000) {
    needsLLM = true
    intent = 'conseil_decision'
    confidence = 0.9
  }

  return { intent, produit, marche, montant, quantite, needsLLM, confidence, raw }
}
