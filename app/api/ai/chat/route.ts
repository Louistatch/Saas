/**
 * POST /api/ai/chat
 *
 * AgriTogo intelligence engine integrated into FaîtiereHub.
 * The producer scans their card → arrives on verify → taps "Discuter avec l'IA"
 * → this endpoint powers the conversation.
 *
 * Flow:
 *   1. Resolve the producer's context from their card (region, cooperative, cultures).
 *   2. Load recent market prices for their zone.
 *   3. Load conversation history (last 10 messages).
 *   4. Call Gemini with a structured agricultural system prompt.
 *   5. Save both messages to ai_conversations.
 *   6. Return the AI response.
 *
 * Requires env: GEMINI_API_KEY
 */
import { NextRequest, NextResponse } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { createClient } from '@/lib/supabase/server'
import { applyRateLimit } from '@/lib/utils/rate-limit-persistent'

const MAX_HISTORY = 10

export async function POST(request: NextRequest) {
  const rateLimited = await applyRateLimit(request, 'verify')
  if (rateLimited) return rateLimited

  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    return NextResponse.json(
      { error: 'Service IA temporairement indisponible.' },
      { status: 503 },
    )
  }

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

  const supabase = await createClient()

  // ─── 1. Resolve the producer's context ───────────────────────────
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

  // ─── 2. Load market prices for the producer's region ─────────────
  const regionName = member?.region ?? null
  let pricesContext = 'Aucun prix disponible pour cette zone.'

  if (regionName) {
    const { data: prices } = await supabase
      .from('market_prices')
      .select('market_name, price, unit, currency, created_at, cultures!inner(name)')
      .eq('regions.name', regionName)
      .order('created_at', { ascending: false })
      .limit(30)

    // Fallback: query without the join filter if the above returns nothing
    // (the join syntax may vary; use a direct region_id lookup)
    if (!prices || prices.length === 0) {
      const { data: regionRow } = await supabase
        .from('regions')
        .select('id')
        .eq('name', regionName)
        .maybeSingle()

      if (regionRow) {
        const { data: fallbackPrices } = await supabase
          .from('market_prices')
          .select('market_name, price, unit, currency, created_at, culture:cultures(name)')
          .eq('region_id', regionRow.id)
          .order('created_at', { ascending: false })
          .limit(30)

        if (fallbackPrices && fallbackPrices.length > 0) {
          pricesContext = fallbackPrices
            .map((p) => {
              const cultureName = Array.isArray(p.culture)
                ? (p.culture[0] as { name?: string })?.name
                : (p.culture as { name?: string } | null)?.name
              return `${cultureName ?? '?'}: ${p.price} ${p.currency}/${p.unit} à ${p.market_name} (${new Date(p.created_at).toLocaleDateString('fr-FR')})`
            })
            .join('\n')
        }
      }
    } else {
      pricesContext = prices
        .map((p) => {
          const cultureName = Array.isArray(p.cultures)
            ? (p.cultures as unknown as { name?: string }[])[0]?.name
            : (p.cultures as unknown as { name?: string } | null)?.name
          return `${cultureName ?? '?'}: ${p.price} ${p.currency}/${p.unit} à ${p.market_name} (${new Date(p.created_at).toLocaleDateString('fr-FR')})`
        })
        .join('\n')
    }
  }

  // ─── 3. Load conversation history ───────────────────────────────
  const { data: history } = await supabase
    .from('ai_conversations')
    .select('role, content')
    .eq('card_number', cardNumber)
    .order('created_at', { ascending: true })
    .limit(MAX_HISTORY)

  // ─── 4. Build the Gemini prompt ─────────────────────────────────
  const systemPrompt = `Tu es l'assistant agricole intelligent de FaîtiereHub, une plateforme pour les coopératives agricoles du Togo.
Tu t'appelles AgriTogo. Tu réponds en français, de manière claire, pratique et adaptée à un producteur agricole.

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

  // ─── 5. Call Gemini ─────────────────────────────────────────────
  try {
    const genAI = new GoogleGenerativeAI(apiKey)
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' })

    const chat = model.startChat({
      history: geminiHistory,
      systemInstruction: systemPrompt,
    })

    const result = await chat.sendMessage(userMessage)
    const aiResponse = result.response.text()

    // ─── 6. Save both messages ──────────────────────────────────
    await supabase.from('ai_conversations').insert([
      { card_number: cardNumber, role: 'user', content: userMessage },
      { card_number: cardNumber, role: 'assistant', content: aiResponse },
    ])

    return NextResponse.json({ response: aiResponse })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erreur inconnue'
    console.error('[AI Chat] Gemini error:', msg)
    return NextResponse.json(
      { error: 'L\'assistant IA n\'a pas pu répondre. Réessayez.' },
      { status: 502 },
    )
  }
}
