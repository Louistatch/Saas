/**
 * POST /api/ai/chat — AgriTogo × FaîtiereHub Intelligent Chat
 *
 * Architecture NLP à 3 niveaux :
 *
 *   NIVEAU 1 — NLP Parser (local, 0ms, 0 quota)
 *     Parse la question → détecte l'intention + extrait produit/marché/montant.
 *
 *   NIVEAU 2 — Direct Data (Supabase, ~100ms, 0 quota)
 *     Pour les questions simples (prix, tendance, listes) → répond directement
 *     depuis Supabase sans aucun appel LLM. 70% des questions.
 *
 *   NIVEAU 3a — AgriTogo Multi-Agent (Railway, ~5s, rotation clés)
 *     Pour les questions complexes (conseil, décision, interprétation) →
 *     appelle le moteur multi-agent avec 6 agents, 14 outils, 5 modèles ML.
 *
 *   NIVEAU 3b — Gemini Direct (fallback, ~3s, rotation clés)
 *     Si AgriTogo est down → fallback contextuel avec Gemini.
 */
import { NextRequest, NextResponse } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@/lib/supabase/admin'
import { applyRateLimit } from '@/lib/utils/rate-limit-persistent'
import { parseQuery } from '@/lib/agritogo/nlp-router'
import { tryDirectAction } from '@/lib/agritogo/direct-actions'
import { getGeminiKey, rotateGeminiKey, getKeyCount, markKeyExhausted, getRecoveryWaitMs, allKeysExhausted } from '@/lib/utils/gemini-keys'

const MAX_HISTORY = 10

export async function POST(request: NextRequest) {
  const rateLimited = await applyRateLimit(request, 'ai-chat')
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

  // ─── NIVEAU 1 : NLP Parse ────────────────────────────────────
  const parsed = parseQuery(userMessage)

  // ─── NIVEAU 2 : Direct Data (no LLM, instant) ────────────────
  if (!parsed.needsLLM) {
    try {
      const directResult = await tryDirectAction(parsed)
      if (directResult) {
        // Save conversation
        const supabase = await createClient()
        await supabase.from('ai_conversations').insert([
          { card_number: cardNumber, role: 'user', content: userMessage },
          { card_number: cardNumber, role: 'assistant', content: directResult.response },
        ])

        return NextResponse.json({
          response: directResult.response,
          engine: 'direct-data',
          intent: parsed.intent,
          produit: parsed.produit,
          marche: parsed.marche,
          agent_type: null,
          model_used: null,
          debate_used: false,
        })
      }
    } catch (err) {
      console.warn('[AI Chat] Direct action failed, falling through:', err instanceof Error ? err.message : err)
    }
  }

  // ─── NIVEAU 3a : AgriTogo Multi-Agent ────────────────────────
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
        signal: AbortSignal.timeout(30000),
      })

      if (agriRes.ok) {
        const data = await agriRes.json()
        if (data.response) {
          // Save conversation
          const supabase = await createClient()
          await supabase.from('ai_conversations').insert([
            { card_number: cardNumber, role: 'user', content: userMessage },
            { card_number: cardNumber, role: 'assistant', content: data.response },
          ])

          return NextResponse.json({
            response: data.response,
            engine: 'agritogo-multiagent',
            intent: parsed.intent,
            produit: parsed.produit,
            marche: parsed.marche,
            agent_type: data.agent_type ?? null,
            model_used: data.model_used ?? null,
            debate_used: data.debate_used ?? false,
          })
        }
      }
      console.warn('[AI Chat] AgriTogo returned non-OK, falling back to Gemini')
    } catch (err) {
      console.warn('[AI Chat] AgriTogo unreachable:', err instanceof Error ? err.message : err)
    }
  }

  // ─── NIVEAU 3b : Gemini Direct (fallback with key rotation) ──
  const firstKey = getGeminiKey()
  if (!firstKey) {
    return NextResponse.json({ error: 'Service IA temporairement indisponible.' }, { status: 503 })
  }

  const supabase = await createClient()
  let lastError = ''

  // Resolve producer context — FAITIERE cards only; OUVRIER/ACHETEUR/AGRONOME
  // cards live in AgriTogo and have no Supabase record, so we gracefully
  // continue with empty context (the AgriTogo path above handles those).
  const { data: card } = await supabase
    .from('member_cards')
    .select('member_id, cooperative_id')
    .eq('card_number', cardNumber)
    .eq('status', 'active')
    .maybeSingle()

  const { data: member } = card?.member_id ? await supabase
    .from('members')
    .select('first_name, last_name, region, canton, prefecture, village')
    .eq('id', card.member_id)
    .maybeSingle() : { data: null }

  const { data: coop } = card?.cooperative_id ? await supabase
    .from('cooperatives')
    .select('name, faitiere_name')
    .eq('id', card.cooperative_id)
    .maybeSingle() : { data: null }

  // Load market prices for context
  let pricesContext = 'Aucun prix disponible.'
  const regionName = member?.region ?? null
  if (regionName) {
    const { data: regionRow } = await supabase
      .from('regions').select('id').eq('name', regionName).maybeSingle()
    if (regionRow) {
      const { data: prices } = await supabase
        .from('market_prices')
        .select('market_name, price, unit, currency, created_at, culture:cultures(name)')
        .eq('region_id', regionRow.id)
        .order('created_at', { ascending: false })
        .limit(20)
      if (prices && prices.length > 0) {
        pricesContext = prices.map((p) => {
          const cn = Array.isArray(p.culture) ? (p.culture[0] as { name?: string })?.name : (p.culture as { name?: string } | null)?.name
          return `${cn ?? '?'}: ${p.price} ${p.currency}/${p.unit} à ${p.market_name}`
        }).join('\n')
      }
    }
  }

  // Load conversation history — use admin client because SELECT on ai_conversations
  // requires admin role after the RLS fix (anon reads are blocked)
  const supabaseAdmin = createAdminClient()
  const { data: history } = await supabaseAdmin
    .from('ai_conversations')
    .select('role, content')
    .eq('card_number', cardNumber)
    .order('created_at', { ascending: true })
    .limit(MAX_HISTORY)

  const systemPrompt = `Tu es AgriTogo, l'assistant agricole intelligent de FaîtiereHub pour les coopératives du Togo.

CONTEXTE DU PRODUCTEUR :
- Nom : ${member?.first_name ?? ''} ${member?.last_name ?? ''}
- Village : ${member?.village ?? 'non renseigné'}, Canton : ${member?.canton ?? '?'}, Région : ${member?.region ?? '?'}
- Coopérative : ${coop?.name ?? '?'}, Faîtière : ${coop?.faitiere_name ?? '?'}

PRIX DU MARCHÉ :
${pricesContext}

RÈGLES : Français, concis (3-5 phrases), basé sur les prix réels, honnête si tu ne sais pas, pas de conseils médicaux/juridiques.`

  const geminiHistory = (history ?? []).map((h) => ({
    role: h.role === 'assistant' ? ('model' as const) : ('user' as const),
    parts: [{ text: h.content }],
  }))

  // Gemini call with key rotation + cooldown + auto-recovery
  const totalKeys = getKeyCount()
  const MAX_ROUNDS = 2 // Try all keys, wait, try again once

  for (let round = 0; round < MAX_ROUNDS; round++) {
    // If all keys are exhausted and this is round 2, wait for recovery
    if (round > 0 && allKeysExhausted()) {
      const waitMs = getRecoveryWaitMs()
      if (waitMs > 0 && waitMs <= 45000) {
        console.log(`[AI Chat] All keys exhausted. Waiting ${Math.ceil(waitMs / 1000)}s for recovery...`)
        await new Promise(resolve => setTimeout(resolve, waitMs + 500))
      } else if (waitMs > 45000) {
        break // Don't make the user wait more than 45s
      }
    }

    for (let attempt = 0; attempt < totalKeys; attempt++) {
      const key = getGeminiKey()
      if (!key) break

      try {
        const genAI = new GoogleGenerativeAI(key)
        const model = genAI.getGenerativeModel({
          model: 'gemini-2.0-flash',
          systemInstruction: systemPrompt,
        })
        const chat = model.startChat({ history: geminiHistory })
        const result = await chat.sendMessage(userMessage)
        const aiResponse = result.response.text()

        await supabase.from('ai_conversations').insert([
          { card_number: cardNumber, role: 'user', content: userMessage },
          { card_number: cardNumber, role: 'assistant', content: aiResponse },
        ])

        return NextResponse.json({
          response: aiResponse,
          engine: 'gemini-direct',
          intent: parsed.intent,
          produit: parsed.produit,
          marche: parsed.marche,
          agent_type: null,
          model_used: 'gemini-2.0-flash',
          debate_used: false,
        })
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Erreur inconnue'
        lastError = msg
        if (msg.includes('429') || msg.includes('quota') || msg.includes('RESOURCE_EXHAUSTED')) {
          console.warn(`[AI Chat] Key ${attempt + 1}/${totalKeys} exhausted (round ${round + 1}), cooling down 60s`)
          markKeyExhausted()
          rotateGeminiKey()
          continue
        }
        if (msg.includes('503') || msg.includes('overloaded')) {
          console.warn(`[AI Chat] Key ${attempt + 1}/${totalKeys} overloaded, trying next`)
          rotateGeminiKey()
          continue
        }
        console.error('[AI Chat] Gemini error:', msg)
        break
      }
    }
  }

  return NextResponse.json(
    { error: 'Toutes les clés IA sont épuisées. Réessayez dans quelques minutes.' },
    { status: 429 },
  )
}
