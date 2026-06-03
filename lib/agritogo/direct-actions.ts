/**
 * AgriTogo Direct Actions — resolve simple queries from Supabase.
 *
 * These functions answer farmer questions WITHOUT calling Gemini.
 * They query Supabase directly and format the response in simple French.
 *
 * This handles ~70% of all questions: prices, trends, lists.
 */

import { createClient } from '@/lib/supabase/server'
import type { ParsedQuery } from './nlp-router'

interface ActionResult {
  response: string
  engine: 'direct-data'
  data?: Record<string, unknown>
}

/**
 * Try to resolve a parsed query directly from Supabase.
 * Returns null if the query needs an LLM (complex question).
 */
export async function tryDirectAction(parsed: ParsedQuery): Promise<ActionResult | null> {
  switch (parsed.intent) {
    case 'salutation':
      return handleSalutation(parsed)
    case 'prix_simple':
      return handlePrix(parsed)
    case 'tendance':
      return handleTendance(parsed)
    case 'liste_produits':
      return handleListeProduits()
    case 'liste_marches':
      return handleListeMarches()
    case 'prediction_rendement':
      return handleMLProxy(parsed, 'crop-yield')
    case 'volatilite':
      return handleMLProxy(parsed, 'garch')
    case 'risque_financier':
      return handleMLProxy(parsed, 'risk')
    case 'segmentation':
      return handleMLProxy(parsed, 'segmentation')
    case 'kpi':
      return handleMLProxy(parsed, 'kpi')
    default:
      return null // Needs LLM
  }
}

// ─── Salutation ──────────────────────────────────────────────────

async function handleSalutation(parsed: ParsedQuery): Promise<ActionResult> {
  return {
    response: 'Bonjour ! Je suis AgriTogo, votre assistant agricole. '
      + 'Je peux vous renseigner sur les prix du marché, les tendances, '
      + 'les prévisions de rendement, et vous conseiller pour vos décisions. '
      + 'Posez-moi votre question !',
    engine: 'direct-data',
  }
}

// ─── Prix simple ─────────────────────────────────────────────────

async function handlePrix(parsed: ParsedQuery): Promise<ActionResult | null> {
  if (!parsed.produit) {
    return {
      response: 'De quel produit voulez-vous connaître le prix ? '
        + 'Par exemple : maïs, riz, soja, igname, tomate, arachide...',
      engine: 'direct-data',
    }
  }

  const supabase = await createClient()

  // Find culture ID
  const { data: culture } = await supabase
    .from('cultures')
    .select('id, name')
    .ilike('name', `%${parsed.produit}%`)
    .limit(1)
    .maybeSingle()

  if (!culture) {
    return {
      response: `Je n'ai pas trouvé de données pour "${parsed.produit}". `
        + 'Les produits disponibles sont : Maïs, Riz, Sorgho, Mil, Haricot, Soja, '
        + 'Arachide, Igname, Manioc, Tomate, Piment, Oignon.',
      engine: 'direct-data',
    }
  }

  // Build query
  let query = supabase
    .from('market_prices')
    .select('market_name, price, created_at')
    .eq('culture_id', culture.id)
    .order('created_at', { ascending: false })
    .limit(20)

  if (parsed.marche) {
    query = query.ilike('market_name', `%${parsed.marche}%`)
  }

  const { data: prices } = await query

  if (!prices || prices.length === 0) {
    const suffix = parsed.marche ? ` au marché de ${parsed.marche}` : ''
    return {
      response: `Aucun prix trouvé pour ${culture.name}${suffix}. `
        + 'Essayez un autre marché : Lomé-Adawlato, Kara, Sokodé, Atakpamé ou Dapaong.',
      engine: 'direct-data',
    }
  }

  // Group by market, get latest per market
  const byMarket = new Map<string, { price: number; date: string }>()
  for (const p of prices) {
    if (!byMarket.has(p.market_name)) {
      byMarket.set(p.market_name, {
        price: Number(p.price),
        date: new Date(p.created_at).toLocaleDateString('fr-FR'),
      })
    }
  }

  // Calculate average
  const allPrices = prices.map(p => Number(p.price))
  const avg = Math.round(allPrices.reduce((a, b) => a + b, 0) / allPrices.length)
  const min = Math.min(...allPrices)
  const max = Math.max(...allPrices)

  let response = `📊 **${culture.name}**`
  if (parsed.marche && byMarket.size === 1) {
    const entry = [...byMarket.values()][0]
    const marketName = [...byMarket.keys()][0]
    response += ` à ${marketName} : **${entry.price} FCFA/kg** (${entry.date}).`
  } else {
    response += ` — Prix récents :\n`
    for (const [market, info] of byMarket) {
      response += `• ${market} : ${info.price} FCFA/kg (${info.date})\n`
    }
    response += `\nMoyenne : ${avg} FCFA/kg | Min : ${min} | Max : ${max}`
  }

  return { response, engine: 'direct-data', data: { prices: [...byMarket.entries()] } }
}

// ─── Tendance ────────────────────────────────────────────────────

async function handleTendance(parsed: ParsedQuery): Promise<ActionResult | null> {
  if (!parsed.produit) {
    return {
      response: 'Pour quel produit voulez-vous connaître la tendance ? '
        + 'Exemples : maïs, riz, soja, igname...',
      engine: 'direct-data',
    }
  }

  const supabase = await createClient()

  const { data: culture } = await supabase
    .from('cultures')
    .select('id, name')
    .ilike('name', `%${parsed.produit}%`)
    .limit(1)
    .maybeSingle()

  if (!culture) {
    return { response: `Produit "${parsed.produit}" non trouvé.`, engine: 'direct-data' }
  }

  let query = supabase
    .from('market_prices')
    .select('price, created_at')
    .eq('culture_id', culture.id)
    .order('created_at', { ascending: false })
    .limit(60)

  if (parsed.marche) {
    query = query.ilike('market_name', `%${parsed.marche}%`)
  }

  const { data: prices } = await query

  if (!prices || prices.length < 2) {
    return {
      response: `Pas assez de données pour analyser la tendance de ${culture.name}.`,
      engine: 'direct-data',
    }
  }

  const prixList = prices.map(p => Number(p.price))
  const recent = prixList.slice(0, Math.min(3, prixList.length))
  const ancien = prixList.slice(-Math.min(3, prixList.length))

  const moyRecent = recent.reduce((a, b) => a + b, 0) / recent.length
  const moyAncien = ancien.reduce((a, b) => a + b, 0) / ancien.length
  const variation = ((moyRecent - moyAncien) / moyAncien) * 100

  const avg = Math.round(prixList.reduce((a, b) => a + b, 0) / prixList.length)
  const min = Math.min(...prixList)
  const max = Math.max(...prixList)

  let emoji: string
  let label: string
  if (variation > 5) { emoji = '📈'; label = 'HAUSSE' }
  else if (variation < -5) { emoji = '📉'; label = 'BAISSE' }
  else { emoji = '➡️'; label = 'STABLE' }

  const suffix = parsed.marche ? ` à ${parsed.marche}` : ''
  const response = `${emoji} **${culture.name}${suffix}** : tendance **${label}** (${variation > 0 ? '+' : ''}${variation.toFixed(1)}%)\n\n`
    + `• Prix moyen : ${avg} FCFA/kg\n`
    + `• Min : ${min} FCFA/kg | Max : ${max} FCFA/kg\n`
    + `• Basé sur ${prixList.length} observations`

  return { response, engine: 'direct-data' }
}

// ─── Listes ──────────────────────────────────────────────────────

async function handleListeProduits(): Promise<ActionResult> {
  const supabase = await createClient()
  const { data } = await supabase.from('cultures').select('name, category').order('name')
  const produits = (data ?? []).map(p => p.name).join(', ')
  return {
    response: `📋 **Produits disponibles** (${data?.length ?? 0}) :\n${produits}`,
    engine: 'direct-data',
  }
}

async function handleListeMarches(): Promise<ActionResult> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('market_prices')
    .select('market_name')

  const marches = [...new Set((data ?? []).map(m => m.market_name))].sort()
  return {
    response: `📍 **Marchés disponibles** (${marches.length}) :\n${marches.join(', ')}`,
    engine: 'direct-data',
  }
}

// ─── ML Proxy (calls AgriTogo API for ML results, no Gemini) ─────

async function handleMLProxy(parsed: ParsedQuery, module: string): Promise<ActionResult | null> {
  const agritogoUrl = process.env.AGRITOGO_API_URL
  if (!agritogoUrl) return null // Fallback to LLM if AgriTogo not configured

  try {
    const endpoint = module === 'kpi' ? '/api/v1/kpi' :
      module === 'crop-yield' ? '/api/v1/forecast' :
      `/api/v1/${module === 'garch' ? 'forecast' : module}`

    const method = module === 'kpi' ? 'GET' : 'POST'
    const body = method === 'POST' ? JSON.stringify({
      produit: parsed.produit ?? 'Maïs',
      periods: 30,
      n_clusters: 4,
    }) : undefined

    const res = await fetch(`${agritogoUrl}${endpoint}`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body,
      signal: AbortSignal.timeout(15000),
    })

    if (!res.ok) return null

    const data = await res.json()

    // Format the ML result as simple French text
    const response = formatMLResult(module, data, parsed.produit)
    return { response, engine: 'direct-data', data }
  } catch {
    return null // Fallback to LLM
  }
}

function formatMLResult(module: string, data: Record<string, unknown>, produit: string | null): string {
  switch (module) {
    case 'crop-yield':
    case 'garch': {
      const d = data as Record<string, unknown>
      const product = (d.product as string) ?? produit ?? 'Maïs'
      const lastPrice = d.last_price_fcfa ?? '?'
      const vol = (d.historical_volatility_stats as Record<string, unknown>)?.current ?? '?'
      return `📈 **Prévision ${product}** :\n`
        + `• Dernier prix : ${lastPrice} FCFA/kg\n`
        + `• Volatilité actuelle : ${vol}\n`
        + `• ${(d.summary as string) ?? 'Analyse en cours...'}`
    }
    case 'risk': {
      const d = data as Record<string, unknown>
      const total = d.total_dossiers ?? '?'
      const riskiest = d.riskiest_region ?? '?'
      const safest = d.safest_region ?? '?'
      return `⚠️ **Évaluation du risque financier** :\n`
        + `• ${total} dossiers analysés\n`
        + `• Région la plus risquée : ${riskiest}\n`
        + `• Région la plus sûre : ${safest}\n`
        + `• ${(d.summary as string) ?? ''}`
    }
    case 'segmentation': {
      const d = data as Record<string, unknown>
      const total = d.total_farmers ?? '?'
      const clusters = d.n_clusters ?? '?'
      return `👥 **Segmentation des agriculteurs** :\n`
        + `• ${total} agriculteurs en ${clusters} groupes\n`
        + `• ${(d.summary as string) ?? 'Analyse complète disponible.'}`
    }
    case 'kpi': {
      const d = data as Record<string, unknown>
      const ns = (d.national_summary as Record<string, unknown>) ?? {}
      return `📊 **KPIs Agriculture Togo** :\n`
        + `• Rendement national moyen : ${ns.avg_national_yield ?? '?'} kg/ha\n`
        + `• Surface cultivée totale : ${ns.total_cultivated_ha ?? '?'} ha\n`
        + `• Coût intrants : ${ns.total_input_cost_ha ?? '?'} FCFA/ha`
    }
    default:
      return JSON.stringify(data).slice(0, 500)
  }
}
