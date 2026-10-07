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
 *   NIVEAU 3a — AgriTogo Multi-Agent (Railway, ~5s)
 *     Pour les questions complexes (conseil, décision, interprétation) →
 *     appelle le moteur multi-agent avec 6 agents, 14 outils, 5 modèles ML.
 *
 *   NIVEAU 3b — DeepSeek Direct (fallback, ~2s, rotation clés)
 *     Si AgriTogo est down → fallback contextuel avec DeepSeek-V3 (ou R1).
 */
import { type NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@/lib/supabase/admin'
import { applyRateLimit } from '@/lib/utils/rate-limit-persistent'
import { clientKeyFromHeaders, rateLimit } from '@/lib/utils/rate-limit'
import { parseQuery } from '@/lib/agritogo/nlp-router'
import { tryDirectAction } from '@/lib/agritogo/direct-actions'
import { buildProducerContext } from '@/lib/agritogo/producer-context'
import {
  getDeepSeekKey,
  rotateDeepSeekKey,
  getDeepSeekKeyCount,
  markDeepSeekKeyExhausted,
  getDeepSeekRecoveryWaitMs,
  allDeepSeekKeysExhausted,
  createDeepSeekClient,
  DEEPSEEK_MODEL,
} from '@/lib/utils/deepseek-client'
import OpenAI from 'openai'
import { createLogger } from '@/lib/utils/logger'

const MAX_HISTORY = 10

export async function POST(request: NextRequest) {
  const log = createLogger('api:ai:chat')
  const rateLimited = await applyRateLimit(request, 'ai-chat')
  if (rateLimited) return rateLimited
  // In-memory fallback: applyRateLimit returns null when Upstash is not configured.
  const memLimit = rateLimit(`ai-chat:${clientKeyFromHeaders(request.headers)}`, 20, 60_000)
  if (!memLimit.ok) {
    return NextResponse.json(
      { error: 'Trop de requêtes. Réessayez dans quelques instants.' },
      { status: 429, headers: { 'Retry-After': String(Math.ceil((memLimit.resetAt - Date.now()) / 1000)) } },
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

  // ─── NIVEAU 1 : NLP Parse ────────────────────────────────────
  const parsed = parseQuery(userMessage)

  // ─── NIVEAU 2 : Direct Data (no LLM, instant) ────────────────
  if (!parsed.needsLLM) {
    try {
      const directResult = await tryDirectAction(parsed)
      if (directResult) {
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
      log.warn('Direct action failed, falling through:', err instanceof Error ? err.message : err)
    }
  }

  // ─── NIVEAU 3a : AgriTogo Multi-Agent ────────────────────────
  const agritogoUrl = process.env.AGRITOGO_API_URL
  if (agritogoUrl) {
    try {
      const callAgritogo = () =>
        fetch(`${agritogoUrl}/api/v1/agent/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: userMessage,
            card_number: cardNumber,
            audience: 'farmer',
          }),
          signal: AbortSignal.timeout(30000),
        })

      let agriRes = await callAgritogo()
      // Service endormi (Railway) : il répond 503 le temps que ses modules agents se
      // chargent, soit quelques secondes. Un seul nouvel essai évite de basculer
      // sur le moteur de secours pour une simple mise en route.
      if (agriRes.status === 503) {
        await new Promise((resolve) => setTimeout(resolve, 3000))
        agriRes = await callAgritogo()
      }

      if (agriRes.ok) {
        const data = await agriRes.json()
        if (data.response) {
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
      log.warn('AgriTogo returned non-OK, falling back to DeepSeek')
    } catch (err) {
      log.warn('AgriTogo unreachable:', err instanceof Error ? err.message : err)
    }
  }

  // ─── NIVEAU 3b : DeepSeek Direct (fallback avec rotation de clés) ──
  const firstKey = getDeepSeekKey()
  if (!firstKey) {
    return NextResponse.json(
      { error: 'Service IA temporairement indisponible. Configurez DEEPSEEK_API_KEY.' },
      { status: 503 },
    )
  }

  const supabase = await createClient()
  const supabaseAdmin = createAdminClient()
  let lastError = ''

  // Construit le contexte riche du producteur (parcelles, météo, prix, cotisations…)
  const { systemPrompt } = await buildProducerContext(cardNumber, supabase, supabaseAdmin)

  // Historique de conversation (format OpenAI)
  const { data: history } = await supabaseAdmin
    .from('ai_conversations')
    .select('role, content')
    .eq('card_number', cardNumber)
    .order('created_at', { ascending: false })
    .limit(MAX_HISTORY)

  // Fetched newest-first so we keep the most recent N; restore chronological order.
  const historyMessages: OpenAI.Chat.ChatCompletionMessageParam[] = (history ?? []).reverse().map((h) => ({
    role: (h.role === 'assistant' ? 'assistant' : 'user') as 'user' | 'assistant',
    content: h.content,
  }))

  // Appel DeepSeek avec rotation de clés + cooldown + auto-recovery
  const totalKeys = getDeepSeekKeyCount()
  const MAX_ROUNDS = 2

  for (let round = 0; round < MAX_ROUNDS; round++) {
    if (round > 0 && allDeepSeekKeysExhausted()) {
      const waitMs = getDeepSeekRecoveryWaitMs()
      if (waitMs > 0 && waitMs <= 45000) {
        log.info(`All DeepSeek keys exhausted. Waiting ${Math.ceil(waitMs / 1000)}s…`)
        await new Promise(resolve => setTimeout(resolve, waitMs + 500))
      } else if (waitMs > 45000) {
        break
      }
    }

    for (let attempt = 0; attempt < totalKeys; attempt++) {
      const key = getDeepSeekKey()
      if (!key) break

      try {
        const client = createDeepSeekClient(key)

        const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
          { role: 'system', content: systemPrompt },
          ...historyMessages,
          { role: 'user', content: userMessage },
        ]

        const completion = await client.chat.completions.create({
          model: DEEPSEEK_MODEL,
          messages,
          max_tokens: 1500,
          temperature: 0.7,
        })

        const aiResponse = completion.choices[0]?.message?.content ?? ''
        if (!aiResponse) throw new Error('Réponse DeepSeek vide')

        await supabase.from('ai_conversations').insert([
          { card_number: cardNumber, role: 'user', content: userMessage },
          { card_number: cardNumber, role: 'assistant', content: aiResponse },
        ])

        return NextResponse.json({
          response: aiResponse,
          engine: 'deepseek-direct',
          intent: parsed.intent,
          produit: parsed.produit,
          marche: parsed.marche,
          agent_type: null,
          model_used: DEEPSEEK_MODEL,
          debate_used: false,
        })

      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Erreur inconnue'
        lastError = msg

        if (err instanceof OpenAI.APIError) {
          // Non-retryable: rotating keys or waiting cannot fix a bad model id,
          // a rejected key or an empty balance. Looping through every key and
          // then reporting "all keys exhausted" hid the real cause — which is
          // exactly why a correctly configured key still looked broken.
          if (err.status === 400 || err.status === 401 || err.status === 402 || err.status === 404) {
            // `error` is read aloud to a farmer in the chat bubble, so it stays
            // plain French with no environment variable names. The operator's
            // diagnosis goes to the server log only.
            const hint =
              err.status === 401
                ? 'Clé DEEPSEEK_API_KEY refusée par DeepSeek.'
                : err.status === 402
                  ? 'Solde DeepSeek insuffisant.'
                  : `Requête refusée — vérifier DEEPSEEK_MODEL (actuellement « ${DEEPSEEK_MODEL} »).`
            log.error(`DeepSeek rejected the request (${err.status})`, {
              model: DEEPSEEK_MODEL,
              message: msg,
              hint,
            })
            return NextResponse.json(
              {
                error: "L'assistant n'est pas disponible pour le moment. Réessayez plus tard.",
              },
              { status: 502 },
            )
          }
          if (err.status === 429) {
            log.warn(`DeepSeek key ${attempt + 1}/${totalKeys} exhausted (round ${round + 1}), cooldown 60s`)
            markDeepSeekKeyExhausted()
            rotateDeepSeekKey()
            continue
          }
          if (err.status === 503 || err.status === 529) {
            log.warn(`DeepSeek key ${attempt + 1}/${totalKeys} overloaded, trying next`)
            rotateDeepSeekKey()
            continue
          }
        }

        log.error('DeepSeek error', msg)
        break
      }
    }
  }

  // Carry the real error through: "keys exhausted" was returned for EVERY
  // failure mode, so a wrong model id or a rejected key looked like a quota
  // problem and sent the operator hunting in the wrong place.
  log.error('DeepSeek exhausted all keys/rounds', { lastError, model: DEEPSEEK_MODEL })
  return NextResponse.json(
    {
      error: "L'assistant est très sollicité. Réessayez dans quelques minutes.",
    },
    { status: 429 },
  )
}
