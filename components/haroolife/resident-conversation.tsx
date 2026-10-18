'use client'
import { type CityAction, type CityLife, actionsFor } from '@/lib/haroolife/city/life'
import { type Resident, converse } from '@/lib/haroolife/city/social'
import { useEffect, useRef, useState } from 'react'

/** Fictional dialogue stays local. Real players continue to use the existing private chat. */
export default function ResidentConversation({
  resident,
  state,
  onChange,
  onAction,
}: {
  resident: Resident
  state: CityLife
  onChange: (reduce: (s: CityLife) => CityLife) => void
  onAction?: (a: CityAction) => void
}) {
  const [draft, setDraft] = useState('')
  const contact = state.social?.[resident.key]
  const history = contact?.history ?? []
  const log = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (log.current && history.length) log.current.scrollTop = log.current.scrollHeight
  }, [history])
  const say = (text: string) => {
    onChange((s) => converse(s, resident, text))
    setDraft('')
  }
  const actions = resident.lot
    ? actionsFor(resident.lot.type, resident.lot.service)
        .filter((a) => a.id !== 'socialize' && a.id !== 'buy-meal')
        .slice(0, 3)
    : []
  return (
    <div className="space-y-3" data-testid="resident-conversation">
      <div className="flex items-center gap-3">
        <span
          aria-hidden
          className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-emerald-100 text-xl"
        >
          {resident.name.startsWith('Agent') ? '👮🏿' : '💬'}
        </span>
        <div>
          <h3 className="text-lg font-black text-slate-900">{resident.name}</h3>
          <p className="text-xs text-slate-500">Personnage fictif · dialogue scénarisé</p>
        </div>
      </div>
      <div className="rounded-2xl bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
        <strong>
          {(contact?.affinity ?? 0) >= 20 ? 'Voisin de confiance' : 'Faire connaissance'}
        </strong>{' '}
        · proximité {contact?.affinity ?? 0}/100
        <p>Parler améliore le social une fois par jour avec cet habitant.</p>
      </div>
      <div
        ref={log}
        role="log"
        aria-label={`Discussion avec ${resident.name}`}
        className="max-h-[29vh] min-h-20 space-y-2 overflow-y-auto overscroll-contain rounded-2xl bg-slate-50 p-3"
      >
        {!history.length && (
          <p className="py-3 text-center text-sm text-slate-500">
            Dis bonjour, puis demande un conseil sur le lieu ou le quartier.
          </p>
        )}
        {history.map((m, i) => (
          <div
            key={`${i}-${m.from}`}
            className={`flex ${m.from === 'me' ? 'justify-end' : 'justify-start'}`}
          >
            <p
              className={`max-w-[90%] rounded-2xl px-3 py-2 text-sm ${m.from === 'me' ? 'bg-emerald-700 text-white' : 'bg-white text-slate-800 shadow-sm'}`}
            >
              {m.text}
            </p>
          </div>
        ))}
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1" aria-label="Sujets de discussion">
        {[
          'Bonjour !',
          ...(resident.lot?.type === 'townhall'
            ? ['Les feux en panne ?', 'Les promesses du maire ?']
            : []),
          'Quoi de neuf ?',
          'Comment travailler ?',
          'Que peut-on acheter ?',
          'Essence et entretien ?',
          'Sécurité et police ?',
        ].map((text) => (
          <button
            key={text}
            type="button"
            onClick={() => say(text)}
            className="shrink-0 rounded-full bg-slate-100 px-3 py-2 text-xs font-bold text-slate-700"
          >
            {text}
          </button>
        ))}
      </div>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          if (draft.trim()) say(draft)
        }}
      >
        <input
          aria-label={`Écrire à ${resident.name}`}
          maxLength={200}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Parler du quartier…"
          className="min-w-0 flex-1 rounded-2xl border border-slate-200 px-3 py-3 text-sm"
        />
        <button
          type="submit"
          disabled={!draft.trim()}
          className="rounded-2xl bg-emerald-700 px-4 text-sm font-bold text-white disabled:opacity-50"
        >
          Envoyer
        </button>
      </form>
      {onAction && actions.length > 0 && (
        <div className="grid gap-2">
          {actions.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => onAction(a.id)}
              className="rounded-2xl border border-emerald-200 px-3 py-2 text-left text-sm font-bold text-emerald-900"
            >
              {a.label}
              <span className="block text-xs font-normal text-slate-500">{a.hint}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
