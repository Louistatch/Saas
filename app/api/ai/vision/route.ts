/**
 * POST /api/ai/vision — Analyse phytosanitaire par image (Gemini Vision)
 *
 * Pourquoi Gemini reste ici ?
 *   DeepSeek ne propose pas d'API vision publique à ce jour.
 *   Gemini 2.0 Flash est le seul modèle multimodal image disponible dans le projet.
 *   Dès que DeepSeek publiera une API vision, cette route sera migrée.
 *
 * Accepte une image base64, retourne une analyse agronomique en français :
 * culture identifiée, maladies/ravageurs, gravité, traitement, prévention.
 */
import { NextResponse, type NextRequest } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { applyRateLimit } from '@/lib/utils/rate-limit-persistent'
import {
  getGeminiKey,
  rotateGeminiKey,
  getKeyCount,
  markKeyExhausted,
  getRecoveryWaitMs,
  allKeysExhausted,
} from '@/lib/utils/gemini-keys'
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

    const firstKey = getGeminiKey()
    if (!firstKey) {
      return NextResponse.json(
        { error: 'Service d\'analyse image indisponible (GEMINI_API_KEY manquant).' },
        { status: 503 },
      )
    }

    const systemText = [
      'Tu es un expert agronome spécialisé dans l\'agriculture tropicale en Afrique de l\'Ouest',
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

    const totalKeys = getKeyCount()
    const MAX_ROUNDS = 2
    let lastError = ''

    for (let round = 0; round < MAX_ROUNDS; round++) {
      if (round > 0 && allKeysExhausted()) {
        const waitMs = getRecoveryWaitMs()
        if (waitMs > 0 && waitMs <= 45000) {
          log.info(`All Gemini keys exhausted. Waiting ${Math.ceil(waitMs / 1000)}s…`)
          await new Promise(resolve => setTimeout(resolve, waitMs + 500))
        } else if (waitMs > 45000) {
          break
        }
      }

      for (let attempt = 0; attempt < totalKeys; attempt++) {
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
          return NextResponse.json({ response, engine: 'gemini-vision' })

        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Erreur inconnue'
          lastError = msg
          if (msg.includes('429') || msg.includes('quota') || msg.includes('RESOURCE_EXHAUSTED')) {
            log.warn(`Gemini key ${attempt + 1}/${totalKeys} exhausted (round ${round + 1}), cooldown 60s`)
            markKeyExhausted()
            rotateGeminiKey()
            continue
          }
          if (msg.includes('503') || msg.includes('overloaded')) {
            log.warn(`Gemini key ${attempt + 1}/${totalKeys} overloaded, trying next`)
            rotateGeminiKey()
            continue
          }
          log.error('Gemini vision error', msg)
          break
        }
      }
    }

    log.error('All vision retries failed', lastError)
    return NextResponse.json({ error: 'Erreur d\'analyse image. Réessayez.' }, { status: 500 })

  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erreur inconnue'
    log.error('Vision unexpected error', msg)
    return NextResponse.json({ error: 'Erreur d\'analyse image.' }, { status: 500 })
  }
}
