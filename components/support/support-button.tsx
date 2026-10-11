'use client'

// « Écrire à l'équipe » : bouton toujours accessible depuis les tableaux de bord. Le message
// part au super_admin et aux opérateurs de la zone ; la réponse arrive par e-mail.
import { useAuth } from '@/app/context/auth-context'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { SUPPORT_CATEGORIES, type SupportCategory } from '@/lib/support'
import { MessageCircle } from 'lucide-react'
import { usePathname } from 'next/navigation'
import { useState } from 'react'

const field =
  'w-full rounded-md border border-border bg-background p-2 text-sm text-foreground focus-visible:outline-2 focus-visible:outline-offset-2'

export function SupportButton() {
  const { user } = useAuth()
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const [category, setCategory] = useState<SupportCategory>('assistance')
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [sentTo, setSentTo] = useState<string | null | undefined>(undefined)

  // Le super_admin reçoit ces messages : pas de bouton pour s'écrire à lui-même.
  if (!user || user.role === 'super_admin') return null

  function close(next: boolean) {
    setOpen(next)
    if (!next && sentTo !== undefined) {
      setSentTo(undefined)
      setSubject('')
      setMessage('')
    }
  }

  async function send() {
    setBusy(true)
    setError('')
    const res = await fetch('/api/support', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ category, subject, message, page: pathname }),
    }).catch(() => null)
    const data: { error?: string; reply_to?: string | null } = res
      ? await res.json().catch(() => ({}))
      : {}
    setBusy(false)
    if (!res?.ok) {
      setError(data.error ?? 'Connexion interrompue : votre message n’est pas parti, réessayez.')
      return
    }
    setSentTo(data.reply_to ?? null)
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-5 right-5 z-40 inline-flex items-center gap-2 rounded-full bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground shadow-lg hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 print:hidden"
      >
        <MessageCircle aria-hidden="true" className="h-5 w-5" />
        Écrire à l’équipe
      </button>
      <Dialog open={open} onOpenChange={close}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Écrire à l’équipe FaîtiereHub</DialogTitle>
          </DialogHeader>
          {sentTo !== undefined ? (
            <div className="space-y-3 py-2">
              <p className="text-sm text-foreground">
                Message envoyé à l’équipe et aux opérateurs de votre zone.
                {sentTo ? ` La réponse arrivera par e-mail à ${sentTo}.` : ''}
              </p>
              <button
                type="button"
                onClick={() => close(false)}
                className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
              >
                Fermer
              </button>
            </div>
          ) : (
            <div className="space-y-4 py-2">
              <div className="flex flex-wrap gap-2" aria-label="Type de message">
                {(Object.keys(SUPPORT_CATEGORIES) as SupportCategory[]).map((c) => (
                  <button
                    key={c}
                    type="button"
                    aria-pressed={category === c}
                    onClick={() => setCategory(c)}
                    className={`rounded-full border px-3 py-1.5 text-sm ${
                      category === c
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-border bg-background'
                    }`}
                  >
                    {SUPPORT_CATEGORIES[c]}
                  </button>
                ))}
              </div>
              <label className="block space-y-1 text-sm font-medium">
                Objet
                <input
                  className={field}
                  value={subject}
                  maxLength={120}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="Ex. : ma carte n’est pas arrivée"
                />
              </label>
              <label className="block space-y-1 text-sm font-medium">
                Votre message
                <textarea
                  className={`${field} min-h-32`}
                  value={message}
                  maxLength={2000}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Décrivez la situation : ce que vous faisiez, ce qui s’est passé, ce que vous attendez."
                />
              </label>
              {error && (
                <p role="alert" className="text-sm text-destructive">
                  {error}
                </p>
              )}
              <button
                type="button"
                disabled={busy || subject.trim().length < 3 || message.trim().length < 10}
                onClick={() => void send()}
                className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
              >
                {busy ? 'Envoi…' : 'Envoyer le message'}
              </button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
