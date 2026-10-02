'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ArrowDownRight,
  ArrowUpRight,
  Camera,
  ChevronRight,
  Loader2,
  Mic,
  MicOff,
  Volume2,
  VolumeX,
} from 'lucide-react'
import { MarketPrice, type MarketPriceRow, Region } from '@/lib/market-prices/models'

/**
 * Web Speech API : absente de lib.dom.d.ts, et préfixée `webkit` sur les
 * navigateurs qui l'implémentent. On décrit ici la seule surface utilisée,
 * plutôt que de passer par `any` — le compilateur vérifie alors les rappels.
 */
interface SpeechRecognitionResultLike {
  readonly transcript: string
}
interface SpeechRecognitionEventLike {
  readonly results: ArrayLike<ArrayLike<SpeechRecognitionResultLike>>
}
interface SpeechRecognitionLike {
  lang: string
  continuous: boolean
  interimResults: boolean
  onresult: ((event: SpeechRecognitionEventLike) => void) | null
  onerror: (() => void) | null
  onend: (() => void) | null
  start(): void
  stop(): void
}
type SpeechRecognitionWindow = Window & {
  SpeechRecognition?: new () => SpeechRecognitionLike
  webkitSpeechRecognition?: new () => SpeechRecognitionLike
}

interface Message {
  role: 'user' | 'assistant'
  content: string
  engine?: string | null
  debate?: boolean
}

interface AiChatProps {
  cardNumber: string
  memberName: string
  /** Région du membre : la carte d'accueil y montre les prix courants. */
  regionName?: string | null
  onBack: () => void
  suggestions?: string[]
}

// Short, concrete, everyday French. These are read by people for whom French
// is a second language and typing is slow — the wording has to be scannable at
// a glance, and tapping one must ASK it, not merely fill the box.
const DEFAULT_SUGGESTIONS = [
  'Prix du maïs près de chez moi',
  'Quand vendre mon soja ?',
  'Que planter cette saison ?',
  'Va-t-il pleuvoir cette semaine ?',
]

// ─── Voice conversation states ────────────────────────────────────────────────
type VoiceState = 'idle' | 'recording' | 'processing' | 'speaking'

const VOICE_STATE_LABELS: Record<VoiceState, string> = {
  idle: 'Appuyez pour parler',
  recording: 'Je vous écoute…',
  processing: 'Je cherche…',
  speaking: 'Je réponds…',
}

const VOICE_STATE_COLORS: Record<VoiceState, string> = {
  idle: 'rgba(52,211,153,.20)',
  recording: 'rgba(239,68,68,.30)',
  processing: 'rgba(251,191,36,.20)',
  speaking: 'rgba(59,130,246,.25)',
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function TypingDots() {
  return (
    <div className="flex items-center gap-1 px-1 py-0.5">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="w-1.5 h-1.5 rounded-full bg-emerald-400"
          style={{
            animation: 'typing-bounce 1.2s ease-in-out infinite',
            animationDelay: `${i * 0.2}s`,
          }}
        />
      ))}
    </div>
  )
}


// ─── Voice mode overlay ───────────────────────────────────────────────────────

function VoiceModeOverlay({
  voiceState,
  onMicPress,
  onExit,
  lastTranscript,
}: {
  voiceState: VoiceState
  onMicPress: () => void
  onExit: () => void
  lastTranscript: string
}) {
  const isActive =
    voiceState === 'recording' || voiceState === 'processing' || voiceState === 'speaking'
  const ringColor = VOICE_STATE_COLORS[voiceState]

  return (
    <div
      className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-6 rounded-[20px]"
      style={{ background: 'rgba(0,10,8,.92)', backdropFilter: 'blur(16px)' }}
    >
      {/* Close */}
      <button
        type="button"
        onClick={onExit}
        className="absolute top-4 right-4 text-white/40 hover:text-white/70 text-[13px] transition-colors"
      >
        ✕ Fermer
      </button>

      {/* Label */}
      <p
        className="text-emerald-300/80 text-sm font-medium tracking-wide"
        style={{ animation: 'chat-fade-up 0.3s ease both' }}
      >
        Conversation vocale
      </p>

      {/* Big mic button with animated ring */}
      <button
        type="button"
        onClick={onMicPress}
        disabled={voiceState === 'processing' || voiceState === 'speaking'}
        className="relative flex items-center justify-center rounded-full transition-transform active:scale-95 disabled:opacity-70"
        style={{
          width: 120,
          height: 120,
          background: ringColor,
          border: `2px solid ${ringColor
            .replace('.', '')
            .replace('rgba', 'rgba')
            .replace(')', ', 0.6)')
            .replace(/,\s*[\d.]+\)$/, ', 0.6)')}`,
          boxShadow: isActive
            ? `0 0 0 20px ${ringColor}, 0 0 0 40px ${ringColor.replace(/[\d.]+\)$/, '0.08)')}`
            : 'none',
          animation:
            voiceState === 'recording' ? 'voice-ring-pulse 1.2s ease-in-out infinite' : 'none',
        }}
        aria-label={VOICE_STATE_LABELS[voiceState]}
      >
        {voiceState === 'processing' ? (
          <Loader2 size={48} className="text-yellow-300 animate-spin" />
        ) : voiceState === 'speaking' ? (
          <Volume2
            size={48}
            className="text-blue-300"
            style={{ animation: 'voice-ring-pulse 0.8s ease-in-out infinite' }}
          />
        ) : voiceState === 'recording' ? (
          <MicOff size={48} className="text-red-300" />
        ) : (
          <Mic size={48} className="text-emerald-300" />
        )}
      </button>

      {/* State label */}
      <p className="text-white/70 text-sm">{VOICE_STATE_LABELS[voiceState]}</p>

      {/* Last transcript */}
      {lastTranscript && (
        <p
          className="text-white/40 text-xs text-center max-w-[240px] px-4"
          style={{ animation: 'chat-fade-up 0.3s ease both' }}
        >
          &ldquo;{lastTranscript}&rdquo;
        </p>
      )}

      {/* Hint */}
      {voiceState === 'idle' && (
        <p className="text-white/25 text-[11px] text-center max-w-[200px]">
          Appuyez pour parler, appuyez encore pour envoyer
        </p>
      )}
      {voiceState === 'speaking' && (
        <button
          type="button"
          onClick={onMicPress}
          className="text-white/40 text-[11px] hover:text-white/70 transition-colors"
        >
          Interrompre
        </button>
      )}
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export function AiChat({
  cardNumber,
  memberName,
  regionName,
  onBack,
  suggestions = DEFAULT_SUGGESTIONS,
}: AiChatProps) {
  const storageKey = `agritogo_chat_${cardNumber}`
  const [messages, setMessages] = useState<Message[]>(() => {
    if (typeof window === 'undefined') return []
    try {
      const saved = sessionStorage.getItem(storageKey)
      return saved ? JSON.parse(saved) : []
    } catch {
      return []
    }
  })
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Legacy dictation (Web Speech API → text box)
  const [isListening, setIsListening] = useState(false)
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null)

  // Photo analysis
  const photoInputRef = useRef<HTMLInputElement>(null)
  const [photoLoading, setPhotoLoading] = useState(false)

  // ── Voice mode state ────────────────────────────────────────────
  const [voiceMode, setVoiceMode] = useState(false)
  const [voiceState, setVoiceState] = useState<VoiceState>('idle')
  const [lastTranscript, setLastTranscript] = useState('')
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const synthRef = useRef<SpeechSynthesisUtterance | null>(null)
  // Auto-loop: after speaking, auto-record again
  const autoLoopRef = useRef(false)

  // Auto-scroll
  // Défiler en bas à chaque nouveau message. `messages` est le déclencheur,
  // pas une capture — sans lui, le fil resterait figé en haut.
  // biome-ignore lint/correctness/useExhaustiveDependencies: messages est le déclencheur voulu
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages])

  // Persist messages
  useEffect(() => {
    if (messages.length === 0) return
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(messages.slice(-20)))
    } catch {}
  }, [messages, storageKey])

  // Focus input
  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (mediaRecorderRef.current?.state === 'recording') mediaRecorderRef.current.stop()
      window.speechSynthesis?.cancel()
    }
  }, [])

  // ── Text chat ────────────────────────────────────────────────────

  const sendMessage = useCallback(
    async (text: string) => {
      if (!text || loading) return
      setInput('')
      setMessages((m) => [...m, { role: 'user', content: text }])
      setLoading(true)
      try {
        const res = await fetch('/api/ai/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ card_number: cardNumber, message: text }),
        })
        const data = await res.json()
        if (data.response) {
          setMessages((m) => [
            ...m,
            {
              role: 'assistant',
              content: data.response,
              engine: data.engine ?? null,
              debate: data.debate_used ?? false,
            },
          ])
        } else {
          setMessages((m) => [
            ...m,
            { role: 'assistant', content: data.error ?? "Désolé, je n'ai pas pu répondre." },
          ])
        }
      } catch {
        // Distinguish "no network" from "the service failed": in rural Togo the
        // first is by far the commonest, and telling someone to check a network
        // they already know is down is useless. Say what to do instead.
        const offline = typeof navigator !== 'undefined' && navigator.onLine === false
        setMessages((m) => [
          ...m,
          {
            role: 'assistant',
            content: offline
              ? "Vous n'avez pas de réseau. Votre question sera à reposer une fois le réseau revenu."
              : "La connexion a échoué. Réessayez dans un instant.",
          },
        ])
      } finally {
        setLoading(false)
        inputRef.current?.focus()
      }
    },
    [loading, cardNumber],
  )

  const send = useCallback(() => {
    const t = input.trim()
    if (t) sendMessage(t)
  }, [input, sendMessage])
  const sendText = useCallback((t: string) => sendMessage(t), [sendMessage])

  // ── Legacy dictation ─────────────────────────────────────────────

  const toggleVoice = useCallback(() => {
    if (isListening) {
      recognitionRef.current?.stop()
      setIsListening(false)
      return
    }
    const w = window as SpeechRecognitionWindow
    const SR = w.SpeechRecognition ?? w.webkitSpeechRecognition
    if (!SR) {
      alert('Votre navigateur ne supporte pas la reconnaissance vocale.')
      return
    }
    const rec = new SR()
    rec.lang = 'fr-FR'
    rec.continuous = false
    rec.interimResults = false
    rec.onresult = (e) => {
      const t: string = e.results[0][0].transcript
      setInput((prev) => (prev ? `${prev} ${t}` : t))
      setIsListening(false)
    }
    rec.onerror = () => setIsListening(false)
    rec.onend = () => setIsListening(false)
    rec.start()
    recognitionRef.current = rec
    setIsListening(true)
  }, [isListening])

  // ── Photo analysis ───────────────────────────────────────────────

  const handlePhoto = useCallback(async (file: File) => {
    if (!file) return
    setPhotoLoading(true)
    const base64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      const img = new Image()
      reader.onload = (e) => {
        img.src = e.target?.result as string
        img.onload = () => {
          const canvas = document.createElement('canvas')
          const MAX = 1024
          const ratio = Math.min(MAX / img.width, MAX / img.height, 1)
          canvas.width = Math.round(img.width * ratio)
          canvas.height = Math.round(img.height * ratio)
          canvas.getContext('2d')?.drawImage(img, 0, 0, canvas.width, canvas.height)
          resolve(canvas.toDataURL('image/jpeg', 0.82).split(',')[1])
        }
        img.onerror = reject
      }
      reader.readAsDataURL(file)
    })
    setMessages((m) => [...m, { role: 'user', content: '📸 Photo envoyée — analyse en cours…' }])
    try {
      const res = await fetch('/api/ai/vision', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image_base64: base64, mime_type: 'image/jpeg' }),
      })
      const data = await res.json()
      setMessages((m) => [
        ...m,
        {
          role: 'assistant',
          content: data.response ?? data.error ?? "Impossible d'analyser l'image.",
          engine: 'gemini-vision',
        },
      ])
    } catch {
      setMessages((m) => [...m, { role: 'assistant', content: "Erreur lors de l'analyse photo." }])
    } finally {
      setPhotoLoading(false)
      if (photoInputRef.current) photoInputRef.current.value = ''
    }
  }, [])

  // ── Voice mode: speak a text response ───────────────────────────

  const speakResponse = useCallback((text: string) => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return

    // Strip markdown markers for cleaner speech
    const clean = text
      .replace(/\*\*(.+?)\*\*/g, '$1')
      .replace(/\*(.+?)\*/g, '$1')
      .replace(/`(.+?)`/g, '$1')
      .replace(/^[-*•]\s+/gm, '')
      .replace(/📊|📈|📉|➡️|⚠️|✓|📋|📍|🎤/g, '')
      .trim()

    window.speechSynthesis.cancel()
    const utt = new SpeechSynthesisUtterance(clean)
    utt.lang = 'fr-FR'
    utt.rate = 1.0
    utt.pitch = 1.0

    // Pick a French voice if available
    const voices = window.speechSynthesis.getVoices()
    const frVoice =
      voices.find((v) => v.lang.startsWith('fr') && v.localService) ??
      voices.find((v) => v.lang.startsWith('fr'))
    if (frVoice) utt.voice = frVoice

    utt.onend = () => {
      setVoiceState('idle')
      // Auto-loop: start recording again after response
      if (autoLoopRef.current) {
        setTimeout(() => startRecording(), 600)
      }
    }
    utt.onerror = () => setVoiceState('idle')
    synthRef.current = utt
    setVoiceState('speaking')
    window.speechSynthesis.speak(utt)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Voice mode: start recording ──────────────────────────────────

  const startRecording = useCallback(async () => {
    if (voiceState !== 'idle') return
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      audioChunksRef.current = []

      // Pick best supported MIME type
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
          ? 'audio/webm'
          : 'audio/ogg'

      const recorder = new MediaRecorder(stream, { mimeType })
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data)
      }
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop())
        const blob = new Blob(audioChunksRef.current, { type: mimeType })
        if (blob.size < 1000) {
          setVoiceState('idle')
          return
        } // Too short, ignore

        setVoiceState('processing')

        // Convert to base64
        const arrayBuffer = await blob.arrayBuffer()
        const bytes = new Uint8Array(arrayBuffer)
        let binary = ''
        for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i])
        const base64 = btoa(binary)

        try {
          const res = await fetch('/api/ai/voice', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              audio_base64: base64,
              mime_type: mimeType,
              card_number: cardNumber,
            }),
          })
          const data = await res.json()

          if (data.response) {
            if (data.transcript) setLastTranscript(data.transcript)

            // Add to message history (visible in text chat)
            setMessages((m) => [
              ...m,
              {
                role: 'user',
                content: data.transcript ? `🎤 ${data.transcript}` : '🎤 Message vocal',
              },
              { role: 'assistant', content: data.response, engine: 'gemini-voice' },
            ])

            speakResponse(data.response)
          } else {
            setVoiceState('idle')
            setLastTranscript(data.error ?? 'Erreur inconnue')
          }
        } catch {
          setVoiceState('idle')
          setLastTranscript('Erreur de connexion')
        }
      }

      mediaRecorderRef.current = recorder
      recorder.start()
      setVoiceState('recording')
    } catch (err) {
      alert('Microphone inaccessible. Vérifiez les permissions.')
      console.error(err)
    }
  }, [voiceState, cardNumber, speakResponse])

  // ── Voice mode: stop recording ───────────────────────────────────

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop()
    }
  }, [])

  // ── Voice mode: mic button handler ───────────────────────────────

  const handleVoiceMicPress = useCallback(() => {
    if (voiceState === 'idle') {
      autoLoopRef.current = true
      startRecording()
    } else if (voiceState === 'recording') {
      stopRecording()
    } else if (voiceState === 'speaking') {
      // Interrupt TTS and stop auto-loop
      autoLoopRef.current = false
      window.speechSynthesis?.cancel()
      setVoiceState('idle')
    }
  }, [voiceState, startRecording, stopRecording])

  const exitVoiceMode = useCallback(() => {
    autoLoopRef.current = false
    if (mediaRecorderRef.current?.state === 'recording') mediaRecorderRef.current.stop()
    window.speechSynthesis?.cancel()
    setVoiceState('idle')
    setVoiceMode(false)
  }, [])

  const firstName = memberName ? memberName.split(' ')[0] : ''

  // Carte d'accueil : les prix courants de la région du membre (même calcul que
  // l'écran Marché). C'est ce qui ancre le conseiller dans les données réelles.
  const [regionPrices, setRegionPrices] = useState<MarketPrice[]>([])
  useEffect(() => {
    const region = Region.findByName(regionName)
    if (!region) return
    const controller = new AbortController()
    fetch(`/api/market-prices?region_id=${region.id}`, { signal: controller.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { prices?: MarketPriceRow[] } | null) => {
        const fresh = MarketPrice.fromRows(d?.prices ?? [])
          .filter((p) => p.ageDays <= 30)
          .sort((a, b) => b.marketCount - a.marketCount || a.ageDays - b.ageDays)
          .slice(0, 3)
        setRegionPrices(fresh)
      })
      .catch(() => {})
    return () => controller.abort()
  }, [regionName])
  const latestDate = regionPrices.length
    ? new Date(Math.max(...regionPrices.map((p) => Date.parse(p.createdAt)))).toLocaleDateString(
        'fr-FR',
        { day: 'numeric', month: 'short' },
      )
    : null
  const headerSub = regionName
    ? latestDate
      ? `${regionName} · prix du ${latestDate}`
      : regionName
    : 'Prix, météo et conseils'

  return (
    <div
      className="relative flex flex-col h-full min-h-[420px] max-h-[calc(100dvh-120px)] rounded-[20px] overflow-hidden"
      style={{ background: '#06150e', border: '1px solid rgba(255,255,255,.07)' }}
    >
      {/* ── VOICE MODE OVERLAY ─────────────────────────────────────── */}
      {voiceMode && (
        <VoiceModeOverlay
          voiceState={voiceState}
          onMicPress={handleVoiceMicPress}
          onExit={exitVoiceMode}
          lastTranscript={lastTranscript}
        />
      )}

      {/* ── HEADER ─────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 px-4 py-3.5 border-b border-white/[0.06]">
        <button
          type="button"
          onClick={onBack}
          className="text-white/60 -ml-1 p-1 hover:text-white transition-colors flex-shrink-0"
          aria-label="Retour"
        >
          <ArrowLeft size={20} />
        </button>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-white text-[17px] leading-tight">Conseiller</p>
          <p className="text-white/50 text-[12.5px] leading-tight mt-0.5 truncate">{headerSub}</p>
        </div>
        <button
          type="button"
          onClick={() => setVoiceMode((v) => !v)}
          className={`w-9 h-9 flex-shrink-0 flex items-center justify-center rounded-full transition-colors ${
            voiceMode ? 'text-emerald-300 bg-emerald-500/15' : 'text-white/45 hover:text-white'
          }`}
          title={voiceMode ? 'Désactiver la conversation vocale' : 'Conversation vocale'}
          aria-label="Conversation vocale"
          aria-pressed={voiceMode}
        >
          {voiceMode ? <Volume2 size={18} /> : <VolumeX size={18} />}
        </button>
        {messages.length > 0 && (
          <button
            type="button"
            onClick={() => {
              setMessages([])
              try {
                sessionStorage.removeItem(storageKey)
              } catch {}
            }}
            className="text-white/45 text-[12.5px] hover:text-white transition-colors flex-shrink-0"
          >
            Effacer
          </button>
        )}
      </div>

      {/* ── MESSAGES AREA ──────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-3" ref={scrollRef}>
        {messages.length === 0 && (
          <div className="flex flex-col gap-6 pt-2" style={{ animation: 'chat-fade-up 0.3s ease both' }}>
            <div>
              <p className="text-[26px] font-semibold text-white leading-tight">
                Bonjour{firstName ? ` ${firstName}` : ''}
              </p>
              <p className="text-white/55 text-[15px] leading-[21px] mt-1.5">
                Je vous réponds avec les prix relevés sur vos marchés et la météo de votre zone.
              </p>
            </div>

            {regionPrices.length > 0 && (
              <div className="rounded-2xl border border-white/[0.08] bg-white/[0.045] px-4 pt-3.5 pb-1.5">
                <div className="flex items-center justify-between pb-1">
                  <p className="text-white/55 text-[13px] font-medium">Prix à {regionName} cette semaine</p>
                  <p className="text-white/45 text-[12px]">21 jours</p>
                </div>
                {regionPrices.map((p) => {
                  const pct = p.changePct
                  const tone =
                    p.trend === 'up' ? 'text-emerald-300' : p.trend === 'down' ? 'text-orange-300' : 'text-white/50'
                  const TrendIcon = p.trend === 'up' ? ArrowUpRight : p.trend === 'down' ? ArrowDownRight : ArrowRight
                  return (
                    <div key={p.id} className="flex items-center gap-3 py-2.5">
                      <div className="flex-1 min-w-0">
                        <p className="text-white text-[15px] font-medium">{p.cultureName}</p>
                        <p className="text-white/45 text-[12px] truncate">
                          {p.marketCount > 1 ? `${p.marketCount} marchés` : p.marketName}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-white text-[15px] font-semibold">{p.formattedPrice}</p>
                        {pct !== null && (
                          <p className={`text-[12px] font-medium inline-flex items-center gap-0.5 ${tone}`}>
                            <TrendIcon size={13} />
                            {pct === 0 ? 'stable' : `${pct > 0 ? '+' : ''}${pct.toLocaleString('fr-FR')} %`}
                          </p>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            <div>
              <p className="text-white/55 text-[13px] font-medium">Questions fréquentes</p>
              {suggestions.map((s) => (
                <button
                  type="button"
                  key={s}
                  // Taper la question la POSE : un second geste « envoyer » perd
                  // les personnes qui tapent lentement, à qui ces raccourcis servent.
                  className="w-full flex items-center gap-3 py-3.5 min-h-[52px] text-left border-b border-white/[0.07] text-white text-[15.5px] active:opacity-70"
                  onClick={() => sendText(s)}
                >
                  <span className="flex-1">{s}</span>
                  <ChevronRight size={18} className="text-white/40 flex-shrink-0" />
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, i) => {
          const isLastAssistant = m.role === 'assistant' && i === messages.length - 1 && !loading
          const followUps = isLastAssistant ? getFollowUpSuggestions(m.content) : []
          const isUser = m.role === 'user'
          return (
            // biome-ignore lint/suspicious/noArrayIndexKey: fragments de rendu Markdown d'un même message, régénérés ensemble à chaque rendu
            <div key={i}>
              {isUser ? (
                <div className="flex justify-end" style={{ animation: 'chat-fade-up 0.2s ease both' }}>
                  <div className="max-w-[80%] rounded-[20px] bg-emerald-500/[0.18] px-4 py-2.5 text-[15px] leading-[21px] text-white">
                    {m.content}
                  </div>
                </div>
              ) : (
                // Réponse sans bulle ni avatar : un texte qu'on lit, pas un robot qui parle.
                <div
                  className="text-white/90 text-[15.5px] leading-[23px]"
                  style={{ animation: 'chat-fade-up 0.25s ease both' }}
                >
                  {renderMd(m.content)}
                </div>
              )}
              {followUps.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-3">
                  {followUps.map((s) => (
                    <button
                      type="button"
                      key={s}
                      className="border border-white/[0.14] text-white/85 rounded-full px-3.5 py-2 text-[13.5px] hover:bg-white/[0.05] active:scale-95 transition-all"
                      onClick={() => sendText(s)}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )
        })}

        {(loading || photoLoading) && (
          <div className="flex items-center gap-2 text-white/50 text-[14px]">
            <TypingDots />
            <span>{photoLoading ? 'J’examine la photo…' : 'Je cherche dans vos données…'}</span>
          </div>
        )}
      </div>

      {/* ── INPUT BAR ──────────────────────────────────────────────── */}
      <div className="flex gap-2.5 px-4 pt-3 pb-4 items-center">
        <input
          ref={photoInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          style={{ display: 'none' }}
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) handlePhoto(f)
          }}
        />
        <div className="flex-1 flex items-center gap-1 rounded-full border border-white/[0.10] bg-white/[0.06] pl-4 pr-2 min-h-[50px] focus-within:border-emerald-400/40">
          <input
            ref={inputRef}
            type="text"
            // 16px minimum : en dessous, Safari iOS zoome la page au focus.
            className="flex-1 min-w-0 bg-transparent py-3 text-base text-white placeholder:text-white/40 focus:outline-none"
            placeholder={isListening ? 'Je vous écoute…' : 'Écrivez votre question…'}
            value={input}
            maxLength={1000}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && send()}
            disabled={loading || photoLoading}
          />
          <button
            type="button"
            className="w-9 h-9 flex items-center justify-center rounded-full text-white/55 hover:text-white disabled:opacity-40"
            onClick={() => photoInputRef.current?.click()}
            disabled={loading || photoLoading || isListening}
            aria-label="Analyser une plante (photo)"
          >
            {photoLoading ? <Loader2 size={18} className="animate-spin" /> : <Camera size={19} />}
          </button>
          <button
            type="button"
            className={`w-9 h-9 flex items-center justify-center rounded-full disabled:opacity-40 ${
              isListening ? 'text-red-300 bg-red-500/15 animate-pulse' : 'text-white/55 hover:text-white'
            }`}
            onClick={toggleVoice}
            disabled={loading || photoLoading}
            aria-label={isListening ? 'Arrêter la dictée' : 'Dicter un message'}
          >
            {isListening ? <MicOff size={19} /> : <Mic size={19} />}
          </button>
        </div>
        <button
          type="button"
          className={`w-[50px] h-[50px] flex-shrink-0 flex items-center justify-center rounded-full transition-all ${
            input.trim() && !loading && !photoLoading
              ? 'bg-emerald-400 text-[#082011] active:scale-95'
              : 'bg-white/[0.08] text-white/30'
          }`}
          onClick={send}
          disabled={loading || photoLoading || !input.trim()}
          aria-label="Envoyer"
        >
          <ArrowUp size={21} strokeWidth={2.4} />
        </button>
      </div>

      {/* ── ANIMATIONS ─────────────────────────────────────────────── */}
      <style>{`
        @keyframes typing-bounce {
          0%,60%,100%{transform:translateY(0);opacity:1}
          30%{transform:translateY(-6px);opacity:.7}
        }
        @keyframes chat-fade-up {
          from{opacity:0;transform:translateY(12px)}
          to{opacity:1;transform:translateY(0)}
        }
        @keyframes chat-slide-left {
          from{opacity:0;transform:translateX(16px)}
          to{opacity:1;transform:translateX(0)}
        }
        @keyframes chat-slide-right {
          from{opacity:0;transform:translateX(-16px)}
          to{opacity:1;transform:translateX(0)}
        }
        @keyframes halo-pulse {
          0%,100%{box-shadow:0 0 0 8px rgba(52,211,153,.15),0 0 0 16px rgba(52,211,153,.07)}
          50%{box-shadow:0 0 0 12px rgba(52,211,153,.20),0 0 0 22px rgba(52,211,153,.08)}
        }
        @keyframes voice-ring-pulse {
          0%,100%{box-shadow:0 0 0 0 currentColor,0 0 0 0 currentColor;opacity:1}
          50%{box-shadow:0 0 0 16px rgba(0,0,0,0),0 0 0 32px rgba(0,0,0,0);opacity:.85}
        }
        .ai-inline-code{background:rgba(0,0,0,.18);padding:1px 5px;border-radius:4px;font-size:.88em;font-family:monospace}
        .ai-md-li{padding-left:.8em;text-indent:-.8em}
      `}</style>
    </div>
  )
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getFollowUpSuggestions(response: string): string[] {
  const lo = response.toLowerCase()
  const picks: string[] = []
  if (/prix|marché|fcfa|kg/.test(lo)) picks.push('Quand vendre pour le meilleur prix ?')
  if (/irrigat|eau|et0|mm/.test(lo)) picks.push('Calculer mes besoins en eau')
  if (/engrais|fertilisan|npk/.test(lo)) picks.push('Quelle dose recommandez-vous ?')
  if (/semenc|planting|variété/.test(lo)) picks.push('Quelle variété est la meilleure ?')
  if (/récolte|harvest|maturité/.test(lo)) picks.push('Comment améliorer ma récolte ?')
  if (/pest|maladie|traitement/.test(lo)) picks.push('Quels traitements appliquer ?')
  if (/sol|terre|ph/.test(lo)) picks.push('Comment améliorer mon sol ?')
  if (picks.length === 0) picks.push('Expliquez-moi davantage', "D'autres conseils ?")
  return picks.slice(0, 3)
}

function renderMd(text: string) {
  return text.split('\n').map((line, i) => {
    const trimmed = line.trim()
    // biome-ignore lint/suspicious/noArrayIndexKey: fragments de rendu Markdown d'un même message, régénérés ensemble à chaque rendu
    if (!trimmed) return <br key={i} />
    const isBullet = /^[-*•]\s+/.test(trimmed)
    const content = isBullet ? trimmed.replace(/^[-*•]\s+/, '') : trimmed
    const parts: React.ReactNode[] = []
    const regex = /(\*\*(.+?)\*\*|\*(.+?)\*|`(.+?)`)/g
    let last = 0
    let key = 0
    const src = content
    let match = regex.exec(src)
    while (match !== null) {
      if (match.index > last) parts.push(src.slice(last, match.index))
      if (match[2])
        parts.push(
          <strong key={`b${i}-${key++}`} className="font-semibold text-emerald-200">
            {match[2]}
          </strong>,
        )
      else if (match[3])
        parts.push(
          <em key={`i${i}-${key++}`} className="italic text-emerald-300">
            {match[3]}
          </em>,
        )
      else if (match[4])
        parts.push(
          <code key={`c${i}-${key++}`} className="ai-inline-code">
            {match[4]}
          </code>,
        )
      last = match.index + match[0].length
      match = regex.exec(src)
    }
    if (last < src.length) parts.push(src.slice(last))
    if (isBullet)
      return (
        <p
          // biome-ignore lint/suspicious/noArrayIndexKey: fragments de rendu Markdown d'un même message, régénérés ensemble à chaque rendu
          key={i}
          className="ai-md-li"
        >
          {'• '}
          {parts}
        </p>
      )
    return (
      <p
        // biome-ignore lint/suspicious/noArrayIndexKey: fragments de rendu Markdown d'un même message, régénérés ensemble à chaque rendu
        key={i}
        className="m-0 last:mb-0 mb-1"
      >
        {parts}
      </p>
    )
  })
}
