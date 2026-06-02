/**
 * POST /api/ai/chat
 *
 * AgriTogo × FaîtiereHub — AI chat endpoint.
 *
 * Architecture:
 *   1. Try the AgriTogo multi-agent service (AGRITOGO_API_URL) first.
 *      → This uses the full Decision Intelligence Engine: 6 specialized agents,
 *        14 tools (market data + ML + KoboCollect), multi-model debate, UX reformulation.
 *   2. If AgriTogo is down or unavailable → fallback to direct Gemini API.
 *      → Simpler but still contextual (loads producer context + prices from Supabase).
 *
 * Both paths save conversation history to the shared ai_conversations table.
 *
 * Env vars:
 *   AGRITOGO_API_URL   — e.g. https://agritogo.up.railway.app (optional)
 *   GEMINI_API_KEY     — fallback Gemini key (required)
 */
import { NextRequest, NextResponse } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { createClient } from '@/lib/supabase/server'
import { applyRateLimit } from '@/lib/utils/rate-limit-persistent'

const MAX_HISTORY = 10

export async function POST(request: NextRequest) {
  const rateLimited = await applyRateLimit(request, 'verify')
  if (rateLimited) return rateLimited

  let body: { card_number?: string; message?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Corps de requête invalide.' }, { status: 400 })
  }

  const cardNumber = (body.card_number ?? '').trim().toUpperCase()
  const userMessage = (body.message ?? '').trim()

  if (!cardNumber || !userMessage) {
    return NextResponse.json({ error: 'card_number et message requis.' }, { status: 400 })
  }
  if (userMessage.length > 1000) {
    return NextResponse.json({ error: 'Message trop long (1000 caractères max).' }, { status: 400 })
  }

  // ─── Strategy 1: AgriTogo multi-agent service ───────────────────
  const agritogoUrl = process.env.AGRITOGO_API_URL
  if (agritogoUrl) {
    try {
      const agriRes = await fetch(`${agritogoUrl}/api/v1/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userMessage,
          card_number: cardNumber,
          audience: 'farmer',
        }),
        signal: AbortSignal.timeout(30000), // 30s timeout
      })

      if (agriRes.ok) {
        const data = await agriRes.json()
        if (data.response) {
          return NextResponse.json({
            response: data.response,
            engine: 'agritogo-multiagent',
            agent_type: data.agent_type ?? null,
            model_used: data.model_used ?? null,
            debate_used: data.debate_used ?? false,
          })
        }
      }
      // If AgriTogo returned an error, fall through to Gemini fallback
      console.warn('[AI Chat] AgriTogo returned non-OK, falling back to Gemini')
    } catch (err) {
      console.warn('[AI Chat] AgriTogo unreachable, falling back to Gemini:', err instanceof Error ? err.message : err)
    }
  }

  // ─── Strategy 2: Direct Gemini fallback ─────────────────────────
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    return NextResponse.json(
      { error: 'Service IA temporairement indisponible.' },
      { status: 503 },
    )
  }

  const supabase = await createClient()

  // Resolve the producer's context
  const { data: card } = await supabase
    .from('member_cards')
    .select('member_id, cooperative_id')
    .eq('card_number', cardNumber)
    .eq('status', 'active')
    .maybeSingle()

  if (!card) {
    return NextResponse.json({ error: 'Carte non trouvée ou inactive.' }, { status: 404 })
  }

  const { data: member } = await supabase
    .from('members')
    .select('first_name, last_name, region, canton, prefecture, village')
    .eq('id', card.member_id)
    .maybeSingle()

  const { data: coop } = await supabase
    .from('cooperatives')
    .select('name, faitiere_name')
    .eq('id', card.cooperative_id)
    .maybeSingle()

  // Load market prices for the producer's region
  let pricesContext = 'Aucun prix disponible pour cette zone.'
  const regionName = member?.region ?? null
  if (regionName) {
    const { data: regionRow } = await supabase
      .from('regions')
      .select('id')
      .eq('name', regionName)
      .maybeSingle()

    if (regionRow) {
      const { data: prices } = await supabase
        .from('market_prices')
        .select('market_name, price, unit, currency, created_at, culture:cultures(name)')
        .eq('region_id', regionRow.id)
        .order('created_at', { ascending: false })
        .limit(30)

      if (prices && prices.length > 0) {
        pricesContext = prices
          .map((p) => {
            const cultureName = Array.isArray(p.culture)
              ? (p.culture[0] as { name?: string })?.name
              : (p.culture as { name?: string } | null)?.name
            return `${cultureName ?? '?'}: ${p.price} ${p.currency}/${p.unit} à ${p.market_name} (${new Date(p.created_at).toLocaleDateString('fr-FR')})`
          })
          .join('\n')
      }
    }
  }

  // Load conversation history
  const { data: history } = await supabase
    .from('ai_conversations')
    .select('role, content')
    .eq('card_number', cardNumber)
    .order('created_at', { ascending: true })
    .limit(MAX_HISTORY)

  // Build Gemini prompt
  const systemPrompt = `Tu es AgriTogo, l'assistant agricole intelligent de FaîtiereHub, une plateforme pour les coopératives agricoles du Togo.

CONTEXTE DU PRODUCTEUR :
- Nom : ${member?.first_name ?? ''} ${member?.last_name ?? ''}
- Village : ${member?.village ?? 'non renseigné'}
- Canton : ${member?.canton ?? 'non renseigné'}
- Préfecture : ${member?.prefecture ?? 'non renseigné'}
- Région : ${member?.region ?? 'non renseigné'}
- Coopérative : ${coop?.name ?? 'non renseignée'}
- Faîtière : ${coop?.faitiere_name ?? 'non renseignée'}
- Carte : ${cardNumber}

PRIX DU MARCHÉ (zone du producteur) :
${pricesContext}

RÈGLES :
- Réponds TOUJOURS en français.
- Sois concis (3-5 phrases maximum sauf si on te demande plus).
- Base tes conseils sur les prix réels ci-dessus quand c'est pertinent.
- Si tu ne sais pas, dis-le honnêtement. Ne fabrique pas de chiffres.
- Tu peux conseiller sur : les prix, le meilleur moment pour vendre, les cultures adaptées à la région, les pratiques agricoles, la gestion de l'exploitation.
- Ne donne PAS de conseils médicaux, juridiques ou financiers complexes. Redirige vers le technicien de la faîtière.
- Tu es amical et respectueux.`

  const geminiHistory = (history ?? []).map((h) => ({
    role: h.role === 'assistant' ? ('model' as const) : ('user' as const),
    parts: [{ text: h.content }],
  }))

  try {
    const genAI = new GoogleGenerativeAI(apiKey)
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' })

    const chat = model.startChat({
      history: geminiHistory,
      systemInstruction: systemPrompt,
    })

    const result = await chat.sendMessage(userMessage)
    const aiResponse = result.response.text()

    // Save both messages
    await supabase.from('ai_conversations').insert([
      { card_number: cardNumber, role: 'user', content: userMessage },
      { card_number: cardNumber, role: 'assistant', content: aiResponse },
    ])

    return NextResponse.json({
      response: aiResponse,
      engine: 'gemini-direct',
      agent_type: null,
      model_used: 'gemini-2.0-flash',
      debate_used: false,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erreur inconnue'
    console.error('[AI Chat] Gemini error:', msg)
    return NextResponse.json(
      { error: "L'assistant IA n'a pas pu répondre. Réessayez." },
      { status: 502 },
    )
  }
}
