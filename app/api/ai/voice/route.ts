/**
 * POST /api/ai/voice — AgriTogo voice input endpoint
 *
 * Architecture hybride 2 étapes :
 *
 *   ÉTAPE 1 — Transcription (Gemini multimodal)
 *     Gemini reçoit l'audio et retourne uniquement le texte transcrit.
 *     Gemini est conservé ici car DeepSeek ne supporte pas l'audio.
 *
 *   ÉTAPE 2 — Réponse agricole (DeepSeek)
 *     Le transcript est envoyé à DeepSeek avec le contexte producteur complet.
 *     DeepSeek génère un conseil agricole de meilleure qualité que Gemini Flash.
 *
 * Le client reçoit la réponse texte et la lit via Web Speech Synthesis.
 */
import { NextRequest, NextResponse } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@/lib/supabase/admin'
import { applyRateLimit } from '@/lib/utils/rate-limit-persistent'
import { buildProducerContext } from '@/lib/agritogo/producer-context'
import {
  getGeminiKey,
  markKeyExhausted as markGeminiKeyExhausted,
  rotateGeminiKey,
} from '@/lib/utils/gemini-keys'
import {
  getDeepSeekKey,
  markDeepSeekKeyExhausted,
  rotateDeepSeekKey,
  createDeepSeekClient,
  DEEPSEEK_MODEL,
} from '@/lib/utils/deepseek-client'
import OpenAI from 'openai'

const MAX_AUDIO_BYTES = 10 * 1024 * 1024 // 10 Mo
const MAX_HISTORY = 8

export async function POST(request: NextRequest) {
  const rateLimited = await applyRateLimit(request, 'ai-voice')
  if (rateLimited) return rateLimited

  let body: { audio_base64?: string; mime_type?: string; card_number?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Corps de requête invalide.' }, { status: 400 })
  }

  const { audio_base64, mime_type = 'audio/webm', card_number = '' } = body

  if (!audio_base64) {
    return NextResponse.json({ error: 'audio_base64 requis.' }, { status: 400 })
  }
  if (Math.ceil(audio_base64.length * 0.75) > MAX_AUDIO_BYTES) {
    return NextResponse.json({ error: 'Audio trop long (max 10 Mo).' }, { status: 413 })
  }

  const supabase = await createClient()
  const supabaseAdmin = createAdminClient()

  // Contexte producteur + historique (en parallèle)
  const [contextResult, historyResult] = await Promise.all([
    buildProducerContext(card_number, supabase, supabaseAdmin),
    supabaseAdmin
      .from('ai_conversations')
      .select('role, content')
      .eq('card_number', card_number)
      .order('created_at', { ascending: true })
      .limit(MAX_HISTORY),
  ])
  const { systemPrompt, memberName } = contextResult
  const history = historyResult.data ?? []

  // ─── ÉTAPE 1 : Transcription audio via Gemini ─────────────────
  const geminiKey = getGeminiKey()
  if (!geminiKey) {
    return NextResponse.json(
      { error: 'Service de transcription indisponible (GEMINI_API_KEY manquant).' },
      { status: 503 },
    )
  }

  let transcript = ''
  try {
    const genAI = new GoogleGenerativeAI(geminiKey)
    const transcribeModel = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' })

    const transcribeResult = await transcribeModel.generateContent([
      {
        inlineData: {
          mimeType: mime_type as string,
          data: audio_base64,
        },
      },
      'Transcris exactement ce message audio en français. '
      + 'Réponds UNIQUEMENT avec le texte transcrit, sans explication ni formatage. '
      + 'Si le message est inaudible ou vide, réponds: [INAUDIBLE]',
    ])

    transcript = transcribeResult.response.text().trim()

    if (!transcript || transcript === '[INAUDIBLE]') {
      return NextResponse.json(
        { error: 'Message vocal incompréhensible. Parlez plus distinctement.' },
        { status: 422 },
      )
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erreur transcription'
    if (msg.includes('429') || msg.includes('quota') || msg.includes('RESOURCE_EXHAUSTED')) {
      markGeminiKeyExhausted()
      rotateGeminiKey()
    }
    return NextResponse.json(
      { error: 'Impossible de transcrire le message vocal.' },
      { status: 500 },
    )
  }

  // ─── ÉTAPE 2 : Réponse agricole via DeepSeek ──────────────────
  const deepseekKey = getDeepSeekKey()
  if (!deepseekKey) {
    return NextResponse.json(
      { error: 'Service de réponse IA indisponible (DEEPSEEK_API_KEY manquant).' },
      { status: 503 },
    )
  }

  try {
    const client = createDeepSeekClient(deepseekKey)

    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: 'system', content: systemPrompt },
      ...history.map(h => ({
        role: (h.role === 'assistant' ? 'assistant' : 'user') as 'user' | 'assistant',
        content: h.content,
      })),
      { role: 'user', content: transcript },
    ]

    const completion = await client.chat.completions.create({
      model: DEEPSEEK_MODEL,
      messages,
      max_tokens: 512,
      temperature: 0.7,
    })

    const response = completion.choices[0]?.message?.content?.trim() ?? ''
    if (!response) throw new Error('Réponse DeepSeek vide')

    // Sauvegarde dans l'historique
    if (card_number) {
      await supabase.from('ai_conversations').insert([
        { card_number, role: 'user', content: `🎤 ${transcript}` },
        { card_number, role: 'assistant', content: response },
      ]).then(() => undefined)
    }

    return NextResponse.json({
      response,
      transcript,
      engine: 'deepseek-voice',
      model_used: DEEPSEEK_MODEL,
      memberName,
    })

  } catch (err) {
    if (err instanceof OpenAI.APIError) {
      if (err.status === 429) {
        markDeepSeekKeyExhausted()
        rotateDeepSeekKey()
        return NextResponse.json(
          { error: 'Quota IA atteint. Réessayez dans quelques secondes.' },
          { status: 429 },
        )
      }
    }
    return NextResponse.json(
      { error: 'Impossible de générer une réponse.' },
      { status: 500 },
    )
  }
}
