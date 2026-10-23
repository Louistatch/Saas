'use client'

/**
 * « Je suis intéressé / disponible » : une réponse par annonce. Elle part à l'auteur, qui la
 * retient ou la décline dans « Mon suivi » ; les numéros ne s'échangent qu'une fois retenue.
 */
import { useAuth } from '@/app/context/auth-context'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { type ResponseStatus, isError, respond } from '@/lib/market/client'
import { type AnnouncementType, RESPOND_LABEL, toKg } from '@/lib/market/work'
import { CheckCircle2, Clock, Hand, Lock } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'

const PLACEHOLDER: Record<AnnouncementType, string> = {
  prevente: 'Ex. : Je peux venir chercher le maïs samedi à Notsè.',
  job: 'Ex. : J’ai déjà fait la récolte du maïs, je peux commencer lundi.',
  mission: 'Ex. : Je suis agronome à Kpalimé, je peux passer cette semaine.',
  autre: 'Ex. : Je suis intéressé, quand peut-on se voir ?',
}

const STATUS_NOTE: Partial<Record<ResponseStatus, { text: string; tone: string }>> = {
  envoyee: { text: 'Réponse envoyée : en attente de l’auteur', tone: 'text-muted-foreground' },
  retenue: { text: 'Vous êtes retenu : le numéro est dans Mon suivi', tone: 'text-primary' },
  invitee: { text: 'Vous êtes invité : répondez dans Mon suivi', tone: 'text-amber-800' },
  declinee: { text: 'L’auteur a décliné votre réponse', tone: 'text-muted-foreground' },
}

export function RespondButton({
  announcement,
  status,
  onResponded,
}: {
  announcement: { id: string; type: AnnouncementType; title: string }
  /** Ce que le compte a déjà fait sur cette annonce, s'il a déjà répondu ou été invité. */
  status?: ResponseStatus
  onResponded?: (status: ResponseStatus) => void
}) {
  const { user, isLoading } = useAuth()
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const [message, setMessage] = useState('')
  const [quantity, setQuantity] = useState('')
  const [unit, setUnit] = useState<'kg' | 'sac'>('sac')
  const [phone, setPhone] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState<ResponseStatus | null>(null)

  const close = () => {
    setOpen(false)
    if (sent) onResponded?.(sent)
  }

  const note = status ? STATUS_NOTE[status] : undefined
  if (note) {
    return (
      <Link
        href="/marche/suivi"
        className={`flex min-h-11 items-center gap-2 rounded-lg border border-dashed border-border px-3 text-sm font-medium ${note.tone}`}
      >
        {status === 'retenue' ? (
          <CheckCircle2 aria-hidden="true" className="h-4 w-4 shrink-0" />
        ) : (
          <Clock aria-hidden="true" className="h-4 w-4 shrink-0" />
        )}
        {note.text}
      </Link>
    )
  }

  const label = RESPOND_LABEL[announcement.type]
  const isSale = announcement.type === 'prevente'

  const submit = async () => {
    setError(null)
    const value = Number(quantity.replace(',', '.'))
    if (isSale && quantity && !(value > 0)) {
      setError('Indiquez une quantité valable, ou laissez vide.')
      return
    }
    setSending(true)
    const result = await respond(announcement.id, {
      message,
      quantityKg: isSale && value > 0 ? toKg(value, unit) : null,
      phone,
    })
    setSending(false)
    if (isError(result)) {
      setError(result.error)
      return
    }
    // La carte ne change qu'à la fermeture : la remplacer maintenant fermerait la fenêtre.
    setSent(result.status)
  }

  return (
    <>
      <Button
        type="button"
        className={`h-11 w-full gap-2 ${announcement.type === 'job' ? 'bg-amber-700 text-white hover:bg-amber-800' : ''}`}
        disabled={isLoading}
        onClick={() => {
          setSent(null)
          setError(null)
          setOpen(true)
        }}
      >
        <Hand aria-hidden="true" className="h-4 w-4" />
        {label}
      </Button>

      <Dialog open={open} onOpenChange={(next) => (next ? setOpen(true) : close())}>
        <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{label}</DialogTitle>
            <DialogDescription className="line-clamp-2">{announcement.title}</DialogDescription>
          </DialogHeader>

          {!user ? (
            <div className="space-y-4">
              <p className="flex items-center gap-2 text-sm font-medium">
                <Lock aria-hidden="true" className="h-4 w-4" /> Connectez-vous pour répondre
              </p>
              <p className="text-sm text-muted-foreground">
                L’auteur verra votre prénom et pourra vous retenir. Votre numéro ne lui est donné
                qu’à ce moment-là.
              </p>
              <div className="grid grid-cols-2 gap-2">
                <Button variant="outline" className="h-11" asChild>
                  <Link href={`/auth/login?redirect=${encodeURIComponent(pathname || '/marche')}`}>
                    Se connecter
                  </Link>
                </Button>
                <Button className="h-11" asChild>
                  <Link href="/auth/signup/haroo">Créer un compte</Link>
                </Button>
              </div>
            </div>
          ) : sent ? (
            <div className="space-y-4 py-2">
              <p className="flex items-start gap-2 text-sm font-medium text-primary">
                <CheckCircle2 aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0" />
                Réponse envoyée. L’auteur la retient ou la décline dans son suivi.
              </p>
              <p className="text-sm text-muted-foreground">
                Sa décision s’affiche dans Mon suivi, avec son numéro s’il vous retient.
              </p>
              <DialogFooter className="gap-2 sm:gap-2">
                <Button variant="outline" className="h-11" onClick={close}>
                  Fermer
                </Button>
                <Button className="h-11" asChild>
                  <Link href="/marche/suivi">Voir mon suivi</Link>
                </Button>
              </DialogFooter>
            </div>
          ) : (
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault()
                void submit()
              }}
            >
              <div className="space-y-1.5">
                <Label htmlFor={`msg-${announcement.id}`}>Votre message (facultatif)</Label>
                <Textarea
                  id={`msg-${announcement.id}`}
                  rows={3}
                  maxLength={280}
                  placeholder={PLACEHOLDER[announcement.type]}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                />
              </div>

              {isSale && (
                <fieldset className="space-y-1.5">
                  <legend className="text-sm font-medium">Quantité voulue (facultatif)</legend>
                  <div className="flex gap-2">
                    <Input
                      aria-label="Quantité voulue"
                      inputMode="decimal"
                      className="h-11"
                      placeholder={unit === 'sac' ? '10' : '1000'}
                      value={quantity}
                      onChange={(e) => setQuantity(e.target.value)}
                    />
                    <div className="flex shrink-0 rounded-lg border border-input p-0.5">
                      {(['sac', 'kg'] as const).map((u) => (
                        <button
                          key={u}
                          type="button"
                          aria-pressed={unit === u}
                          onClick={() => setUnit(u)}
                          className={`min-w-14 rounded-md px-3 text-sm font-medium ${unit === u ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}
                        >
                          {u === 'sac' ? 'sacs' : 'kg'}
                        </button>
                      ))}
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">Un sac = 100 kg.</p>
                </fieldset>
              )}

              <div className="space-y-1.5">
                <Label htmlFor={`phone-${announcement.id}`}>Numéro pour vous rappeler</Label>
                <Input
                  id={`phone-${announcement.id}`}
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  className="h-11"
                  placeholder="90 00 00 00"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Laissez vide pour utiliser celui de votre profil Haroo. Il n’est donné à l’auteur
                  que s’il vous retient.
                </p>
              </div>

              {error && (
                <p role="alert" className="text-sm text-destructive">
                  {error}
                </p>
              )}

              <DialogFooter className="gap-2 sm:gap-2">
                <Button type="button" variant="outline" className="h-11" onClick={close}>
                  Annuler
                </Button>
                <Button type="submit" className="h-11" disabled={sending}>
                  {sending ? 'Envoi…' : 'Envoyer ma réponse'}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
