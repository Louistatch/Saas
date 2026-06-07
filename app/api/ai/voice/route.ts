/**
 * POST /api/ai/voice — AgriTogo voice input endpoint
 *
 * Accepts a base64-encoded audio clip (WebM/OGG from MediaRecorder),
 * sends it directly to Gemini as multimodal input so Gemini transcribes
 * AND answers in one pass, then returns the text response.
 *
 * The client then speaks the response via Web Speech Synthesis.
 */
import { NextRequest, NextResponse } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@/lib/supabase/admin'
import { applyRateLimit } from '@/lib/utils/rate-limit-persistent'
import { buildProducerContext } from '@/lib/agritogo/producer-context'
import {
  getGeminiKey,
  rotateGeminiKey,
  markKeyExhausted,
} from '@/lib/utils/gemini-keys'

const MAX_AUDIO_BYTES = 10 * 1024 * 1024 // 10 MB

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

  // Guard against oversized audio
  const byteLen = Math.ceil(audio_base64.length * 0.75)
  if (byteLen > MAX_AUDIO_BYTES) {
    return NextResponse.json({ error: 'Audio trop long (max 10 Mo).' }, { status: 413 })
  }

  const key = getGeminiKey()
  if (!key) {
    return NextResponse.json(
      { error: 'Service IA temporairement indisponible. Réessayez dans quelques minutes.' },
      { status: 503 },
    )
  }

  const supabase = await createClient()
  const supabaseAdmin = createAdminClient()

  // Build rich producer context (same data as /api/ai/chat)
  const { systemPrompt, memberName } = await buildProducerContext(
    card_number,
    supabase,
    supabaseAdmin,
  )

  try {
    const genAI = new GoogleGenerativeAI(key)
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.0-flash',
      systemInstruction: systemPrompt,
    })

    const result = await model.generateContent([
      {
        inlineData: {
          mimeType: mime_type as string,
          data: audio_base64,
        },
      },
      // Ask Gemini to both transcribe and answer in a single pass
      'Écoute attentivement ce message audio d\'un producteur togolais. '
      + 'D\'abord indique sa question entre [QUESTION: ...], puis réponds directement '
      + 'en français, de façon concise (2-4 phrases), en utilisant le contexte fourni.',
    ])

    const fullText = result.response.text()

    // Extract transcript and actual answer ([QUESTION: ...] tag may span one line)
    const questionMatch = fullText.match(/\[QUESTION:\s*([\s\S]+?)\]/)
    const transcript = questionMatch ? questionMatch[1].trim() : ''
    const response = fullText.replace(/\[QUESTION:[\s\S]*?\]/, '').trim()

    // Save to conversation history
    if (card_number) {
      await supabase.from('ai_conversations').insert([
        {
          card_number,
          role: 'user',
          content: transcript ? `🎤 ${transcript}` : '🎤 [Message vocal]',
        },
        {
          card_number,
          role: 'assistant',
          content: response,
        },
      ]).then(() => undefined)
    }

    return NextResponse.json({
      response,
      transcript,
      engine: 'gemini-voice',
      memberName,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erreur inconnue'
    if (msg.includes('429') || msg.includes('quota') || msg.includes('RESOURCE_EXHAUSTED')) {
      markKeyExhausted()
      rotateGeminiKey()
      return NextResponse.json(
        { error: 'Quota IA atteint. Réessayez dans quelques secondes.' },
        { status: 429 },
      )
    }
    return NextResponse.json(
      { error: 'Impossible de traiter le message vocal.' },
      { status: 500 },
    )
  }
}
