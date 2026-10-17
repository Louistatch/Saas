'use client'

import type { PedestrianReason } from '@/lib/haroolife/city/street-civic'
import { useEffect, useRef } from 'react'

/** Native top-layer dialog: focus stays in the stop on phones, Firefox and fullscreen. */
export default function PedestrianStop({
  reason,
  message,
  onResume,
}: {
  reason: PedestrianReason
  message: string
  onResume: () => void
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const element = dialog.current
    element?.showModal()
    return () => element?.close()
  }, [])
  return (
    <dialog
      ref={dialog}
      aria-label="Contrôle piéton"
      onCancel={(e) => {
        e.preventDefault()
        onResume()
      }}
      className="fixed inset-x-3 bottom-3 top-auto z-50 mx-auto max-h-[90dvh] w-[calc(100%-24px)] max-w-md space-y-3 overflow-y-auto rounded-3xl bg-white p-5 text-slate-900 shadow-xl backdrop:bg-slate-950/35"
    >
      <p className="text-xs font-black uppercase tracking-wider text-blue-800">
        👮🏿 Brigade fictive du quartier
      </p>
      <h2 className="text-xl font-black">Chef, doucement avec les pieds !</h2>
      <p className="text-sm text-slate-700">
        {reason === 'red-light'
          ? 'Tu as traversé au rouge piéton.'
          : 'Tu as marché sur la chaussée en dehors du passage piéton.'}{' '}
        Ici, même le raccourci doit respecter le passage !
      </p>
      <p className="rounded-xl bg-amber-50 p-3 text-sm font-bold text-amber-950">{message}</p>
      <p className="text-xs text-slate-500">
        Règle du jeu : premier contrôle gratuit, puis 500 FCFA fictifs si ton solde le permet.
        Choisis une destination et « À pied » pour suivre les trottoirs et attendre le vert
        automatiquement.
      </p>
      <button
        type="button"
        onClick={onResume}
        className="min-h-11 w-full rounded-2xl bg-emerald-700 p-3 font-bold text-white"
      >
        Rejoindre le trottoir
      </button>
    </dialog>
  )
}
