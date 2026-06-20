/**
 * POST /api/ai/vision — Analyse phytosanitaire par image
 *
 * Moteur principal  : DeepSeek V4 Flash (multimodal, ~10× moins cher que GPT-4o Vision)
 * Moteur de secours : Gemini 2.0 Flash (si DeepSeek est indisponible)
 *
 * Accepte une image base64, retourne une analyse agronomique en français :
 * culture identifiée, maladies/ravageurs, gravité, traitement, prévention.
 */
import { NextResponse, type NextRequest } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { applyRateLimit } from '@/lib/utils/rate-limit-persistent'
import {
  getDeepSeekKey,
  markDeepSeekKeyExhausted,
  rotateDeepSeekKey,
  getDeepSeekKeyCount,
  allDeepSeekKeysExhausted,
  getDeepSeekRecoveryWaitMs,
  createDeepSeekClient,
  DEEPSEEK_VISION_MODEL,
} from '@/lib/utils/deepseek-client'
import {
  getGeminiKey,
  rotateGeminiKey,
  getKeyCount,
  markKeyExhausted,
  getRecoveryWaitMs,
  allKeysExhausted,
} from '@/lib/utils/gemini-keys'
import OpenAI from 'openai'
import { createLogger } from '@/lib/utils/logger'

export async function POST(request: NextRequest) {
  const log = createLogger('api:ai:vision')
  const rateLimited = await applyRateLimit(request, 'ai-vision')
  if (rateLimited) return rateLimited

  try {
    const body = await request.json()
    const { image_base64, mime_type = 'image/jpeg', question } = body

    if (!image_base64 || typeof image_base64 !== 'string') {
      return NextResponse.json({ error: 'Image requise' }, { status: 400 })
    }
    if (image_base64.length > 5_000_000) {
      return NextResponse.json({ error: 'Image trop lourde (max 3 Mo)' }, { status: 400 })
    }

    const systemText = [
      "Tu es un expert agronome spécialisé dans l'agriculture tropicale en Afrique de l'Ouest",
      '(Togo, Bénin, Côte d\'Ivoire). Analyse cette image de plante agricole.',
      'Identifie : (1) la culture visible, (2) les maladies, carences ou ravageurs observés,',
      '(3) la gravité (légère/modérée/grave), (4) le traitement recommandé avec des produits',
      'accessibles en milieu rural togolais, (5) les mesures préventives.',
      'Réponds en français, de façon concise et pratique pour un agriculteur non-expert.',
      'Maximum 250 mots.',
    ].join(' ')

    const userText = question?.trim()
      ? question.trim()
      : "Analyse cette photo de ma culture et dis-moi si tu vois des maladies ou problèmes."

    // ── Moteur principal : DeepSeek V4 Flash (multimodal) ─────────────
    const dsKey = getDeepSeekKey()
    if (dsKey) {
      const totalKeys = getDeepSeekKeyCount()
      const MAX_ROUNDS = 2

      for (let round = 0; round < MAX_ROUNDS; round++) {
        if (round > 0 && allDeepSeekKeysExhausted()) {
          const waitMs = getDeepSeekRecoveryWaitMs()
          if (waitMs > 0 && waitMs <= 45000) {
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
            const completion = await client.chat.completions.create({
              model: DEEPSEEK_VISION_MODEL,
              messages: [
                { role: 'system', content: systemText },
                {
                  role: 'user',
                  content: [
                    {
                      type: 'image_url',
                      image_url: { url: `data:${mime_type};base64,${image_base64}` },
                    },
                    { type: 'text', text: userText },
                  ],
                },
              ],
              max_tokens: 600,
            })

            const response = completion.choices[0]?.message?.content?.trim() ?? ''
            if (!response) throw new Error('Réponse vide')

            return NextResponse.json({ response, engine: 'deepseek-vision' })

          } catch (err) {
            if (err instanceof OpenAI.APIError) {
              if (err.status === 429) {
                log.warn(`DeepSeek vision key ${attempt + 1}/${totalKeys} exhausted (round ${round + 1})`)
                markDeepSeekKeyExhausted()
                rotateDeepSeekKey()
                continue
              }
              if (err.status === 503 || err.status === 529) {
                log.warn(`DeepSeek vision key ${attempt + 1}/${totalKeys} overloaded`)
                rotateDeepSeekKey()
                continue
              }
            }
            // Vision non supportée ou autre erreur → passer au fallback
            log.warn('DeepSeek vision failed, switching to Gemini fallback:', err instanceof Error ? err.message : err)
            break
          }
        }
      }
    }

    // ── Moteur de secours : Gemini 2.0 Flash ──────────────────────────
    const firstGeminiKey = getGeminiKey()
    if (!firstGeminiKey) {
      return NextResponse.json(
        { error: "Service d'analyse image indisponible (aucune clé API disponible)." },
        { status: 503 },
      )
    }

    const totalGeminiKeys = getKeyCount()
    const MAX_GEMINI_ROUNDS = 2
    let lastError = ''

    for (let round = 0; round < MAX_GEMINI_ROUNDS; round++) {
      if (round > 0 && allKeysExhausted()) {
        const waitMs = getRecoveryWaitMs()
        if (waitMs > 0 && waitMs <= 45000) {
          await new Promise(resolve => setTimeout(resolve, waitMs + 500))
        } else if (waitMs > 45000) {
          break
        }
      }

      for (let attempt = 0; attempt < totalGeminiKeys; attempt++) {
        const key = getGeminiKey()
        if (!key) break

        try {
          const genAI = new GoogleGenerativeAI(key)
          const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' })

          const result = await model.generateContent([
            systemText + '\n\nQuestion : ' + userText,
            { inlineData: { data: image_base64, mimeType: mime_type } },
          ])

          const response = result.response.text()
          return NextResponse.json({ response, engine: 'gemini-vision-fallback' })

        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Erreur inconnue'
          lastError = msg
          if (msg.includes('429') || msg.includes('quota') || msg.includes('RESOURCE_EXHAUSTED')) {
            log.warn(`Gemini vision key ${attempt + 1}/${totalGeminiKeys} exhausted (round ${round + 1})`)
            markKeyExhausted()
            rotateGeminiKey()
            continue
          }
          if (msg.includes('503') || msg.includes('overloaded')) {
            rotateGeminiKey()
            continue
          }
          log.error('Gemini vision fallback error', msg)
          break
        }
      }
    }

    log.error('All vision engines failed', lastError)
    return NextResponse.json({ error: "Erreur d'analyse image. Réessayez." }, { status: 500 })

  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erreur inconnue'
    log.error('Vision unexpected error', msg)
    return NextResponse.json({ error: "Erreur d'analyse image." }, { status: 500 })
  }
}
