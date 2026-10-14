'use client'

// « Faire connaître la formation » : un opérateur qui l'a suivie la recommande à ses pairs.
// Au Togo le lien circule sur WhatsApp ; le partage natif du téléphone (navigator.share)
// ouvre directement la liste des contacts, sinon wa.me prépare le message, et le lien se
// copie pour tout autre canal. Aucun compteur, aucun code de parrainage : la certification
// ne se gagne pas en recrutant (§24 du plan).
import { Check, Copy, MessageCircle } from 'lucide-react'
import { useEffect, useState } from 'react'

/** Page publique d'inscription des opérateurs, celle que reçoit la personne intéressée. */
export const OPERATOR_SIGNUP_PATH = '/auth/signup/operator'

export function trainingShareMessage(link: string): string {
  return `Deviens opérateur certifié FaîtiereHub : formation gratuite en ligne, puis évaluation pratique sur le terrain. Inscription ici : ${link}`
}

export function whatsappShareUrl(text: string): string {
  return `https://wa.me/?text=${encodeURIComponent(text)}`
}

export function ShareTraining({ className = '' }: { className?: string }) {
  const [link, setLink] = useState(`https://www.faitierehub.com${OPERATOR_SIGNUP_PATH}`)
  const [copied, setCopied] = useState(false)
  const [canShare, setCanShare] = useState(false)

  useEffect(() => {
    setLink(`${window.location.origin}${OPERATOR_SIGNUP_PATH}`)
    setCanShare(typeof navigator !== 'undefined' && typeof navigator.share === 'function')
  }, [])

  const text = trainingShareMessage(link)

  const share = async () => {
    if (canShare) {
      try {
        await navigator.share({ title: 'Formation opérateur FaîtiereHub', text, url: link })
        return
      } catch {
        /* partage annulé : WhatsApp reste proposé ci-dessous */
      }
    }
    window.open(whatsappShareUrl(text), '_blank', 'noopener,noreferrer')
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      window.prompt('Copiez ce lien :', link)
    }
  }

  return (
    <section className={className} aria-labelledby="share-training-title">
      <h2 id="share-training-title" className="text-base font-semibold text-foreground">
        Faire connaître la formation
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Quelqu'un autour de vous veut devenir opérateur ? Envoyez-lui le lien d'inscription : la
        formation en ligne est gratuite.
      </p>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <a
          href={whatsappShareUrl(text)}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => {
            e.preventDefault()
            void share()
          }}
          className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-full bg-[#25d366] px-5 text-sm font-semibold text-[#073b1c] transition-transform duration-150 ease-out active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          <MessageCircle className="h-4 w-4" aria-hidden />
          Partager sur WhatsApp
        </a>
        <button
          type="button"
          onClick={copy}
          aria-live="polite"
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-border bg-background px-5 text-sm font-medium text-foreground transition-colors duration-150 hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          {copied ? (
            <>
              <Check className="h-4 w-4 text-primary" aria-hidden /> Lien copié
            </>
          ) : (
            <>
              <Copy className="h-4 w-4" aria-hidden /> Copier le lien
            </>
          )}
        </button>
      </div>
    </section>
  )
}
