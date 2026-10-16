'use client'

/**
 * « Inviter » in the phone: the player's link, shared on WhatsApp (or any app through the phone's
 * share sheet), and the friends who came. The bonuses are added by use-invites.ts.
 */
import { inviteLink, inviteMessage, whatsappHref } from '@/lib/haroolife/invite'
import { useEffect, useState } from 'react'

type Mine = { code: string; friends: number; pending: number }

export default function InvitePanel({ onOpen }: { onOpen: () => void }) {
  const [mine, setMine] = useState<Mine | null>(null)
  const [error, setError] = useState(false)
  const [copied, setCopied] = useState(false)
  const [canShare, setCanShare] = useState(false)
  // biome-ignore lint/correctness/useExhaustiveDependencies: once, when the app opens
  useEffect(() => {
    onOpen()
    setCanShare(typeof navigator.share === 'function')
    let alive = true
    void import('@/lib/supabase/client')
      .then(({ createClient }) => createClient().rpc('haroolife_invite_code'))
      .then(({ data, error: e }) => {
        if (!alive) return
        if (e || !data) setError(true)
        else setMine(data as Mine)
      })
      .catch(() => alive && setError(true))
    return () => {
      alive = false
    }
  }, [])

  if (error)
    return (
      <p role="alert" className="rounded-2xl bg-amber-50 p-3 text-sm text-amber-900">
        Ton lien d’invitation n’est pas disponible pour le moment. Réessaie dans un instant.
      </p>
    )
  if (!mine) return <p className="text-sm text-slate-500">Préparation de ton lien…</p>
  const link = inviteLink(window.location.origin, mine.code)
  const text = inviteMessage(link)

  return (
    <div className="space-y-4" data-testid="invite">
      <section className="rounded-3xl bg-[#14532d] p-4 text-white">
        <p className="text-lg font-black leading-snug">Invite tes amis à jouer avec toi.</p>
        <p className="mt-1 text-sm text-emerald-100">
          Quand un ami arrive par ton lien et choisit sa maison, vous gagnez chacun 2 000 FCFA de
          jeu.
        </p>
      </section>
      <a
        href={whatsappHref(text)}
        target="_blank"
        rel="noopener noreferrer"
        className="flex min-h-14 w-full items-center justify-center rounded-2xl bg-[#1f9d55] px-4 text-base font-black text-white"
      >
        Inviter sur WhatsApp
      </a>
      <div className="flex gap-2">
        {canShare && (
          <button
            type="button"
            onClick={() => void navigator.share({ text, url: link }).catch(() => {})}
            className="flex-1 rounded-xl bg-slate-100 px-3 py-3 text-sm font-bold text-slate-800"
          >
            Partager…
          </button>
        )}
        <button
          type="button"
          onClick={() =>
            void navigator.clipboard
              ?.writeText(link)
              .then(() => setCopied(true))
              .catch(() => {})
          }
          className="flex-1 rounded-xl bg-slate-100 px-3 py-3 text-sm font-bold text-slate-800"
        >
          {copied ? 'Lien copié' : 'Copier le lien'}
        </button>
      </div>
      <p
        className="break-all rounded-xl bg-slate-50 p-3 font-mono text-xs text-slate-600"
        data-testid="invite-link"
      >
        {link}
      </p>
      <p className="text-sm text-slate-700">
        {mine.friends === 0
          ? 'Aucun ami venu par ton lien pour l’instant.'
          : `${mine.friends} ami${mine.friends > 1 ? 's' : ''} venu${mine.friends > 1 ? 's' : ''} par ton lien.`}
      </p>
      <p className="text-[11px] text-slate-500">
        Argent du jeu uniquement. Les invitations comptent pour les nouveaux joueurs ; au plus 5
        bonus par semaine pour celui qui invite.
      </p>
    </div>
  )
}
