'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowLeft, Send, Bot, Loader2 } from 'lucide-react'

interface Message {
  role: 'user' | 'assistant'
  content: string
  engine?: string | null
  debate?: boolean
}

interface AiChatProps {
  cardNumber: string
  memberName: string
  onBack: () => void
  suggestions?: string[]
}

/**
 * AgriTogo AI chat — contextual agricultural assistant.
 *
 * Uses the /api/ai/chat endpoint which calls Gemini with the producer's
 * context (region, cooperative, market prices).
 * Also supports voice input (Web Speech API) and plant disease photo analysis
 * via /api/ai/vision (Gemini Vision).
 */
const DEFAULT_SUGGESTIONS = [
  'Quel est le prix du maïs dans ma zone ?',
  'Quand vendre mon soja ?',
  'Quelles cultures pour ma région ?',
]

// ─── Typing indicator component ───────────────────────────────────────────────
function TypingDots() {
  return (
    <div className="flex items-center gap-1 px-1 py-0.5">
      {[0, 1, 2].map(i => (
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

// ─── Engine badge component ────────────────────────────────────────────────────
function EngineBadge({ engine, debate }: { engine: string; debate?: boolean }) {
  const config =
    engine === 'direct-data'
      ? { icon: '⚡', label: 'Réponse instantanée', cls: 'bg-yellow-500/10 border-yellow-500/20 text-yellow-300/70' }
      : engine === 'agritogo-multiagent'
      ? { icon: '🧠', label: 'Multi-Agent', cls: 'bg-purple-500/10 border-purple-500/20 text-purple-300/70' }
      : engine === 'gemini-vision'
      ? { icon: '📷', label: 'Analyse photo', cls: 'bg-blue-500/10 border-blue-500/20 text-blue-300/70' }
      : { icon: '💬', label: 'Gemini', cls: 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300/70' }

  return (
    <span className={`mt-1.5 inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full border ${config.cls}`}>
      {config.icon} {config.label}{debate ? ' • Débat' : ''}
    </span>
  )
}

export function AiChat({ cardNumber, memberName, onBack, suggestions = DEFAULT_SUGGESTIONS }: AiChatProps) {
  const storageKey = `agritogo_chat_${cardNumber}`
  const [messages, setMessages] = useState<Message[]>(() => {
    if (typeof window === 'undefined') return []
    try {
      const saved = sessionStorage.getItem(`agritogo_chat_${cardNumber}`)
      return saved ? JSON.parse(saved) : []
    } catch { return [] }
  })
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Voice input state
  const [isListening, setIsListening] = useState(false)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null)

  // Photo analysis state
  const photoInputRef = useRef<HTMLInputElement>(null)
  const [photoLoading, setPhotoLoading] = useState(false)

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages])

  // Persist messages in sessionStorage
  useEffect(() => {
    if (messages.length === 0) return
    try { sessionStorage.setItem(storageKey, JSON.stringify(messages.slice(-20))) } catch {}
  }, [messages, storageKey])

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const sendMessage = useCallback(async (text: string) => {
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
        setMessages((m) => [...m, {
          role: 'assistant',
          content: data.response,
          engine: data.engine ?? null,
          debate: data.debate_used ?? false,
        }])
      } else {
        setMessages((m) => [...m, { role: 'assistant', content: data.error ?? 'Désolé, je n\'ai pas pu répondre.' }])
      }
    } catch {
      setMessages((m) => [...m, { role: 'assistant', content: 'Erreur de connexion. Vérifiez votre réseau.' }])
    } finally {
      setLoading(false)
      inputRef.current?.focus()
    }
  }, [loading, cardNumber])

  const send = useCallback(() => {
    const text = input.trim()
    if (text) sendMessage(text)
  }, [input, sendMessage])

  const sendText = useCallback((text: string) => sendMessage(text), [sendMessage])

  // Voice input toggle
  const toggleVoice = useCallback(() => {
    if (isListening) {
      recognitionRef.current?.stop()
      setIsListening(false)
      return
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as any
    const SR = w.SpeechRecognition || w.webkitSpeechRecognition
    if (!SR) { alert('Votre navigateur ne supporte pas la reconnaissance vocale.'); return }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rec = new SR() as any
    rec.lang = 'fr-FR'
    rec.continuous = false
    rec.interimResults = false
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rec.onresult = (e: any) => {
      const transcript: string = e.results[0][0].transcript
      setInput(prev => (prev ? prev + ' ' + transcript : transcript))
      setIsListening(false)
    }
    rec.onerror = () => setIsListening(false)
    rec.onend = () => setIsListening(false)
    rec.start()
    recognitionRef.current = rec
    setIsListening(true)
  }, [isListening])

  // Photo analysis handler
  const handlePhoto = useCallback(async (file: File) => {
    if (!file) return
    setPhotoLoading(true)

    // Compress to max 1024px and convert to base64
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
          const dataUrl = canvas.toDataURL('image/jpeg', 0.82)
          resolve(dataUrl.split(',')[1]) // base64 only
        }
        img.onerror = reject
      }
      reader.readAsDataURL(file)
    })

    // Show user message with photo indicator
    setMessages(m => [...m, { role: 'user', content: '📸 Photo envoyée — analyse en cours…' }])

    try {
      const res = await fetch('/api/ai/vision', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image_base64: base64, mime_type: 'image/jpeg' }),
      })
      const data = await res.json()
      setMessages(m => [...m, {
        role: 'assistant',
        content: data.response ?? data.error ?? 'Impossible d\'analyser l\'image.',
        engine: 'gemini-vision',
      }])
    } catch {
      setMessages(m => [...m, { role: 'assistant', content: 'Erreur lors de l\'analyse photo.' }])
    } finally {
      setPhotoLoading(false)
      if (photoInputRef.current) photoInputRef.current.value = ''
    }
  }, [])

  // Derive first name for greeting
  const firstName = memberName ? memberName.split(' ')[0] : ''

  return (
    <div className="flex flex-col h-full min-h-[420px] max-h-[calc(100dvh-120px)] rounded-[20px] overflow-hidden"
      style={{ background: 'linear-gradient(160deg,rgba(255,255,255,.06),rgba(255,255,255,.02))', border: '1px solid rgba(255,255,255,.08)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' }}>

      {/* ── HEADER ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2.5 px-4 py-3 border-b border-white/[0.06]"
        style={{ background: 'linear-gradient(to right, rgba(6,35,25,.80), rgba(4,30,28,.60))', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' }}>
        {/* Back button */}
        <button
          onClick={onBack}
          className="text-emerald-400 p-1 hover:text-emerald-300 transition-colors flex-shrink-0"
          aria-label="Retour"
        >
          <ArrowLeft size={18} />
        </button>

        {/* Avatar + identity */}
        <div className="flex items-center gap-2.5 flex-1 min-w-0">
          <div className="w-10 h-10 rounded-xl flex-shrink-0 flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg, #34d399, #14b8a6)' }}>
            <Bot size={20} className="text-white" />
          </div>
          <div className="min-w-0">
            <p className="font-bold text-white text-[15px] leading-none">AgriTogo IA</p>
            <p className="text-emerald-300/70 text-xs mt-0.5">Assistant agricole intelligent</p>
            <div className="flex items-center gap-1 mt-0.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-emerald-400 text-[10px]">En ligne</span>
            </div>
          </div>
        </div>

        {/* Clear button */}
        {messages.length > 0 && (
          <button
            onClick={() => { setMessages([]); try { sessionStorage.removeItem(storageKey) } catch {} }}
            className="text-white/25 text-[11px] hover:text-white/50 active:opacity-60 transition-colors flex-shrink-0"
            title="Effacer la conversation"
          >
            ✕ Effacer
          </button>
        )}
      </div>

      {/* ── MESSAGES AREA ──────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-3" ref={scrollRef}>

        {/* ── WELCOME SCREEN ── */}
        {messages.length === 0 && (
          <div className="flex flex-col items-center text-center px-2 pt-4 pb-2 gap-0">
            {/* Avatar with halo */}
            <div
              className="w-[72px] h-[72px] rounded-2xl flex items-center justify-center mb-4"
              style={{
                background: 'linear-gradient(135deg, #34d399, #14b8a6)',
                animation: 'halo-pulse 2.5s ease-in-out infinite',
              }}
            >
              <Bot size={34} className="text-white" />
            </div>

            {/* Greeting */}
            <p className="text-2xl font-bold text-white mb-1"
              style={{ animation: 'chat-fade-up 0.4s ease both', animationDelay: '100ms' }}>
              Bonjour{firstName ? ` ${firstName}` : ''} ! 👋
            </p>
            <p className="text-emerald-300/70 text-sm mb-5"
              style={{ animation: 'chat-fade-up 0.4s ease both', animationDelay: '150ms' }}>
              Je suis AgriTogo IA
            </p>

            {/* Capability cards */}
            <div className="grid grid-cols-3 gap-2 w-full max-w-[300px] mb-5"
              style={{ animation: 'chat-fade-up 0.4s ease both', animationDelay: '200ms' }}>
              {[
                { icon: '📊', label: 'Prix Marchés' },
                { icon: '📷', label: 'Photo Maladie' },
                { icon: '🎤', label: 'Voix Dictée' },
              ].map((cap) => (
                <div key={cap.label}
                  className="bg-white/5 border border-white/10 rounded-2xl p-3 text-center">
                  <span className="text-2xl block mb-1">{cap.icon}</span>
                  <span className="text-white/60 text-xs leading-tight block">{cap.label}</span>
                </div>
              ))}
            </div>

            {/* Suggestion pills */}
            <div className="flex flex-col gap-2 w-full max-w-[320px]"
              style={{ animation: 'chat-fade-up 0.4s ease both', animationDelay: '350ms' }}>
              {suggestions.map((s, i) => (
                <button
                  key={i}
                  className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 rounded-full px-4 py-2.5 text-sm text-left flex items-center justify-between hover:bg-emerald-500/15 active:scale-[0.98] transition-all"
                  onClick={() => {
                    setInput(s)
                    inputRef.current?.focus()
                  }}
                >
                  <span>{s}</span>
                  <span className="text-emerald-400/60 ml-2">→</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── MESSAGE LIST ── */}
        {messages.map((m, i) => {
          const isLastAssistant = m.role === 'assistant' && i === messages.length - 1 && !loading
          const followUps = isLastAssistant ? getFollowUpSuggestions(m.content) : []
          const isUser = m.role === 'user'

          return (
            <div key={i}>
              <div className={`flex gap-2 ${isUser ? 'flex-row-reverse self-end ml-auto max-w-[80%]' : 'flex-row self-start mr-auto max-w-[85%]'}`}
                style={{ animation: isUser ? 'chat-slide-left 0.25s ease both' : 'chat-slide-right 0.25s ease both' }}>

                {/* Avatar */}
                <div className={`w-7 h-7 flex-shrink-0 flex items-center justify-center text-[11px] font-semibold ${isUser ? 'rounded-full bg-white/15 text-white/80' : 'rounded-xl bg-emerald-500/20 text-emerald-300'}`}>
                  {isUser
                    ? (firstName ? firstName[0].toUpperCase() : <span>U</span>)
                    : <Bot size={13} />}
                </div>

                {/* Bubble */}
                <div>
                  <div
                    className={`px-3.5 py-2.5 text-sm leading-relaxed ${
                      isUser
                        ? 'rounded-2xl rounded-tr-sm text-emerald-50'
                        : 'rounded-2xl rounded-tl-sm text-emerald-50'
                    }`}
                    style={isUser
                      ? { background: 'linear-gradient(135deg, rgba(52,211,153,.25), rgba(20,184,166,.15))', border: '1px solid rgba(52,211,153,.20)' }
                      : { background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.08)' }
                    }
                  >
                    {renderMd(m.content)}
                  </div>

                  {/* Engine badge */}
                  {m.role === 'assistant' && m.engine && (
                    <EngineBadge engine={m.engine} debate={m.debate} />
                  )}
                </div>
              </div>

              {/* Follow-up chips */}
              {followUps.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2 ml-9">
                  {followUps.map((s, j) => (
                    <button
                      key={j}
                      className="bg-white/5 border border-white/10 text-white/60 rounded-full px-3 py-1 text-[12px] hover:bg-emerald-500/10 hover:border-emerald-500/20 hover:text-emerald-300 active:scale-95 transition-all"
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

        {/* ── TYPING INDICATOR ── */}
        {(loading || photoLoading) && (
          <div className="flex gap-2 self-start max-w-[85%]"
            style={{ animation: 'chat-slide-right 0.25s ease both' }}>
            <div className="w-7 h-7 flex-shrink-0 flex items-center justify-center rounded-xl bg-emerald-500/20 text-emerald-300">
              <Bot size={13} />
            </div>
            <div className="rounded-2xl rounded-tl-sm px-3.5 py-2.5 flex flex-col gap-1"
              style={{ background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.08)' }}>
              <TypingDots />
              <span className="text-emerald-300/50 text-[11px]">
                {photoLoading ? 'Analyse de la photo…' : 'AgriTogo réfléchit…'}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* ── INPUT BAR ──────────────────────────────────────────────────────── */}
      <div className="flex gap-2 px-3 py-3 items-center border-t border-white/[0.08]"
        style={{ background: 'rgba(0,0,0,.30)' }}>

        {/* Hidden file input for photo capture */}
        <input
          ref={photoInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          style={{ display: 'none' }}
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handlePhoto(f) }}
        />

        {/* Camera button */}
        <button
          type="button"
          className="w-10 h-10 flex-shrink-0 flex items-center justify-center rounded-xl text-blue-300 transition-all disabled:opacity-40 hover:bg-blue-500/20 active:scale-95"
          style={{ background: 'rgba(59,130,246,.15)', border: '1px solid rgba(59,130,246,.25)' }}
          onClick={() => photoInputRef.current?.click()}
          disabled={loading || photoLoading || isListening}
          aria-label="Photographier une plante malade"
          title="Analyser une plante (photo)"
        >
          {photoLoading ? <Loader2 size={16} className="animate-spin" /> : '📷'}
        </button>

        {/* Mic button */}
        <button
          type="button"
          className={`w-10 h-10 flex-shrink-0 flex items-center justify-center rounded-xl text-[17px] transition-all disabled:opacity-40 ${
            isListening
              ? 'text-red-300 ring-2 ring-red-500/30 animate-pulse'
              : 'text-white/60 hover:bg-white/12 active:scale-95'
          }`}
          style={isListening
            ? { background: 'rgba(239,68,68,.20)', border: '1px solid rgba(239,68,68,.40)' }
            : { background: 'rgba(255,255,255,.08)', border: '1px solid rgba(255,255,255,.12)' }
          }
          onClick={toggleVoice}
          disabled={loading || photoLoading}
          aria-label={isListening ? 'Arrêter l\'écoute' : 'Dicter un message'}
        >
          {isListening ? '🔴' : '🎤'}
        </button>

        {/* Text input */}
        <input
          ref={inputRef}
          type="text"
          className="flex-1 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-white/30 focus:outline-none transition-colors"
          style={{
            background: 'rgba(255,255,255,.06)',
            border: '1px solid rgba(255,255,255,.10)',
          }}
          onFocus={e => (e.currentTarget.style.borderColor = 'rgba(52,211,153,.40)')}
          onBlur={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,.10)')}
          placeholder="Posez votre question…"
          value={input}
          maxLength={1000}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && send()}
          disabled={loading || photoLoading}
        />

        {/* Send button */}
        <button
          className={`w-10 h-10 flex-shrink-0 flex items-center justify-center rounded-xl transition-all ${
            input.trim() && !loading && !photoLoading
              ? 'text-white active:scale-95'
              : 'text-white/25 cursor-default'
          }`}
          style={input.trim() && !loading && !photoLoading
            ? { background: '#10b981', boxShadow: '0 4px 14px rgba(16,185,129,.25)' }
            : { background: 'rgba(255,255,255,.08)' }
          }
          onClick={send}
          disabled={loading || photoLoading || !input.trim()}
          aria-label="Envoyer"
        >
          <Send size={18} />
        </button>
      </div>

      {/* ── GLOBAL ANIMATIONS ─────────────────────────────────────────────── */}
      <style>{`
        @keyframes typing-bounce {
          0%, 60%, 100% { transform: translateY(0); opacity: 1; }
          30% { transform: translateY(-6px); opacity: 0.7; }
        }
        @keyframes chat-fade-up {
          from { opacity: 0; transform: translateY(12px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes chat-slide-left {
          from { opacity: 0; transform: translateX(16px); }
          to   { opacity: 1; transform: translateX(0); }
        }
        @keyframes chat-slide-right {
          from { opacity: 0; transform: translateX(-16px); }
          to   { opacity: 1; transform: translateX(0); }
        }
        @keyframes halo-pulse {
          0%, 100% { box-shadow: 0 0 0 8px rgba(52,211,153,.15), 0 0 0 16px rgba(52,211,153,.07); }
          50% { box-shadow: 0 0 0 12px rgba(52,211,153,.20), 0 0 0 22px rgba(52,211,153,.08); }
        }
        .ai-inline-code { background: rgba(0,0,0,.18); padding: 1px 5px; border-radius: 4px; font-size: .88em; font-family: monospace; }
        .ai-md-li { padding-left: .8em; text-indent: -.8em; }
      `}</style>
    </div>
  )
}

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
  if (picks.length === 0) picks.push('Expliquez-moi davantage', 'D\'autres conseils ?')
  return picks.slice(0, 3)
}

/** Lightweight markdown → JSX (bold, italic, code, lists) */
function renderMd(text: string) {
  return text.split('\n').map((line, i) => {
    const trimmed = line.trim()
    // Empty line → spacer
    if (!trimmed) return <br key={i} />
    // Bullet list item
    const isBullet = /^[-*•]\s+/.test(trimmed)
    const content = isBullet ? trimmed.replace(/^[-*•]\s+/, '') : trimmed
    // Inline formatting: **bold**, *italic*, `code`
    const parts: React.ReactNode[] = []
    const regex = /(\*\*(.+?)\*\*|\*(.+?)\*|`(.+?)`)/g
    let last = 0
    let match: RegExpExecArray | null
    let key = 0
    const src = content
    while ((match = regex.exec(src)) !== null) {
      if (match.index > last) parts.push(src.slice(last, match.index))
      if (match[2]) parts.push(<strong key={`b${i}-${key++}`} className="font-semibold text-emerald-200">{match[2]}</strong>)
      else if (match[3]) parts.push(<em key={`i${i}-${key++}`} className="italic text-emerald-300">{match[3]}</em>)
      else if (match[4]) parts.push(<code key={`c${i}-${key++}`} className="ai-inline-code">{match[4]}</code>)
      last = match.index + match[0].length
    }
    if (last < src.length) parts.push(src.slice(last))
    if (isBullet) return <p key={i} className="ai-md-li">{'• '}{parts}</p>
    return <p key={i} className="m-0 last:mb-0 mb-1">{parts}</p>
  })
}
