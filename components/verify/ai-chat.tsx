'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowLeft, Send, Bot, User, Loader2 } from 'lucide-react'

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
}

/**
 * AgriTogo AI chat — contextual agricultural assistant.
 *
 * Uses the /api/ai/chat endpoint which calls Gemini with the producer's
 * context (region, cooperative, market prices).
 */
export function AiChat({ cardNumber, memberName, onBack }: AiChatProps) {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages])

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const send = useCallback(async () => {
    const text = input.trim()
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
        setMessages((m) => [
          ...m,
          { role: 'assistant', content: data.error ?? 'Désolé, je n\'ai pas pu répondre.' },
        ])
      }
    } catch {
      setMessages((m) => [
        ...m,
        { role: 'assistant', content: 'Erreur de connexion. Vérifiez votre réseau.' },
      ])
    } finally {
      setLoading(false)
      inputRef.current?.focus()
    }
  }, [input, loading, cardNumber])

  const suggestions = [
    'Quel est le prix du maïs dans ma zone ?',
    'Quand vendre mon soja ?',
    'Quelles cultures pour ma région ?',
  ]

  return (
    <div className="ai-chat">
      {/* Header */}
      <div className="ai-chat-header">
        <button onClick={onBack} className="ai-chat-back" aria-label="Retour">
          <ArrowLeft size={18} />
        </button>
        <div className="ai-chat-title">
          <div className="ai-chat-avatar">
            <Bot size={18} />
          </div>
          <div>
            <p className="ai-chat-name">AgriTogo IA</p>
            <p className="ai-chat-sub">Assistant agricole intelligent</p>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="ai-chat-messages" ref={scrollRef}>
        {/* Welcome message */}
        {messages.length === 0 && (
          <div className="ai-chat-welcome">
            <div className="ai-chat-welcome-icon">
              <Bot size={28} />
            </div>
            <p className="ai-chat-welcome-title">
              Bonjour{memberName ? ` ${memberName}` : ''} !
            </p>
            <p className="ai-chat-welcome-text">
              Je suis AgriTogo, votre assistant agricole. Je connais les prix
              du marché de votre zone et peux vous conseiller.
            </p>
            <div className="ai-chat-suggestions">
              {suggestions.map((s, i) => (
                <button
                  key={i}
                  className="ai-chat-suggestion"
                  onClick={() => {
                    setInput(s)
                    inputRef.current?.focus()
                  }}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, i) => (
          <div key={i} className={`ai-msg ai-msg-${m.role}`}>
            <div className="ai-msg-avatar">
              {m.role === 'assistant' ? <Bot size={14} /> : <User size={14} />}
            </div>
            <div className="ai-msg-bubble">
              {renderMd(m.content)}
              {m.role === 'assistant' && m.engine && (
                <span className="ai-msg-engine">
                  {m.engine === 'agritogo-multiagent' ? '🧠 Multi-Agent' : '⚡ Gemini'}
                  {m.debate ? ' • Débat' : ''}
                </span>
              )}
            </div>
          </div>
        ))}

        {loading && (
          <div className="ai-msg ai-msg-assistant">
            <div className="ai-msg-avatar"><Bot size={14} /></div>
            <div className="ai-msg-bubble ai-msg-typing">
              <Loader2 size={16} className="animate-spin" />
              <span>Réflexion en cours…</span>
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="ai-chat-input-bar">
        <input
          ref={inputRef}
          type="text"
          className="ai-chat-input"
          placeholder="Posez votre question…"
          value={input}
          maxLength={1000}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && send()}
          disabled={loading}
        />
        <button
          className="ai-chat-send"
          onClick={send}
          disabled={loading || !input.trim()}
          aria-label="Envoyer"
        >
          <Send size={18} />
        </button>
      </div>

      <style>{`
        .ai-chat { display:flex; flex-direction:column; height: 100%; min-height: 420px; max-height: 70vh; border-radius: 20px; overflow: hidden;
          background: linear-gradient(160deg, rgba(255,255,255,.06), rgba(255,255,255,.02));
          border: 1px solid rgba(255,255,255,.08);
          backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px);
        }
        .ai-chat-header { display:flex; align-items:center; gap:10px; padding:14px 16px;
          border-bottom: 1px solid rgba(255,255,255,.06);
          background: rgba(0,0,0,.15);
        }
        .ai-chat-back { background:none; border:none; color:#9bffc8; cursor:pointer; padding:4px; }
        .ai-chat-title { display:flex; align-items:center; gap:10px; }
        .ai-chat-avatar { width:36px; height:36px; border-radius:50%; display:grid; place-items:center;
          background: linear-gradient(135deg, #1ed760, #0f9b44); color:#04140b; font-weight:700;
        }
        .ai-chat-name { color:#eafff2; font-weight:700; font-size:15px; line-height:1; }
        .ai-chat-sub { color:#7fd9a5; font-size:11px; }
        .ai-chat-messages { flex:1; overflow-y:auto; padding:16px; display:flex; flex-direction:column; gap:12px; }
        .ai-chat-welcome { text-align:center; padding:20px 10px; }
        .ai-chat-welcome-icon { width:52px; height:52px; border-radius:50%; display:grid; place-items:center;
          background:rgba(77,255,160,.12); border:1px solid rgba(77,255,160,.3); color:#4dffa0; margin:0 auto 12px; }
        .ai-chat-welcome-title { color:#eafff2; font-weight:700; font-size:18px; margin:0 0 6px; }
        .ai-chat-welcome-text { color:#aedcbf; font-size:13px; margin:0 0 16px; max-width:320px; margin-left:auto; margin-right:auto; }
        .ai-chat-suggestions { display:flex; flex-direction:column; gap:8px; }
        .ai-chat-suggestion { background:rgba(77,255,160,.08); border:1px solid rgba(77,255,160,.2); color:#9bffc8;
          border-radius:12px; padding:10px 14px; font-size:13px; cursor:pointer; text-align:left;
          transition: background .2s; }
        .ai-chat-suggestion:active { background:rgba(77,255,160,.18); }
        .ai-msg { display:flex; gap:8px; max-width:88%; }
        .ai-msg-user { align-self:flex-end; flex-direction:row-reverse; }
        .ai-msg-assistant { align-self:flex-start; }
        .ai-msg-avatar { width:26px; height:26px; border-radius:50%; display:grid; place-items:center; shrink:0;
          font-size:11px; }
        .ai-msg-assistant .ai-msg-avatar { background:rgba(77,255,160,.15); color:#4dffa0; }
        .ai-msg-user .ai-msg-avatar { background:rgba(255,255,255,.1); color:#ccc; }
        .ai-msg-bubble { padding:10px 14px; border-radius:16px; font-size:14px; line-height:1.5; }
        .ai-msg-bubble p { margin:0 0 4px; } .ai-msg-bubble p:last-child { margin:0; }
        .ai-msg-assistant .ai-msg-bubble { background:rgba(255,255,255,.06); color:#e0f5eb; border-bottom-left-radius:4px; }
        .ai-msg-user .ai-msg-bubble { background:rgba(77,255,160,.18); color:#eafff2; border-bottom-right-radius:4px; }
        .ai-msg-typing { display:flex; align-items:center; gap:8px; color:#7fd9a5; font-size:13px; }
        .ai-msg-engine { display:block; margin-top:6px; font-size:10px; color:#6b9e80; letter-spacing:.3px; }
        .ai-chat-input-bar { display:flex; gap:8px; padding:12px 14px;
          border-top: 1px solid rgba(255,255,255,.06); background:rgba(0,0,0,.15); }
        .ai-chat-input { flex:1; background:rgba(255,255,255,.06); border:1px solid rgba(255,255,255,.1);
          border-radius:999px; padding:10px 16px; color:#eafff2; font-size:14px; outline:none; }
        .ai-chat-input::placeholder { color:#6b9e80; }
        .ai-chat-input:focus { border-color:rgba(77,255,160,.4); }
        .ai-chat-send { width:42px; height:42px; border:none; border-radius:50%; cursor:pointer;
          background:linear-gradient(135deg,#1ed760,#15a34a); color:#04140b; display:grid; place-items:center;
          transition:transform .15s, opacity .15s; }
        .ai-chat-send:disabled { opacity:.4; cursor:default; }
        .ai-chat-send:active:not(:disabled) { transform:scale(.92); }
        .ai-inline-code { background:rgba(0,0,0,.06); padding:1px 5px; border-radius:4px; font-size:.88em; font-family:monospace; }
        .ai-md-li { padding-left:.8em; text-indent:-.8em; }
        .ai-msg-bubble strong { font-weight:600; color:#b3ffd6; }
        .ai-msg-bubble em { font-style:italic; color:#a0e8c0; }
      `}
    </style>
    </div>
  )
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
      if (match[2]) parts.push(<strong key={`b${i}-${key++}`}>{match[2]}</strong>)
      else if (match[3]) parts.push(<em key={`i${i}-${key++}`}>{match[3]}</em>)
      else if (match[4]) parts.push(<code key={`c${i}-${key++}`} className="ai-inline-code">{match[4]}</code>)
      last = match.index + match[0].length
    }
    if (last < src.length) parts.push(src.slice(last))
    if (isBullet) return <p key={i} className="ai-md-li">{'• '}{parts}</p>
    return <p key={i}>{parts}</p>
  })
}


