'use client'

/**
 * Inviter un ouvrier disponible sur une de ses offres de travail ouvertes. L'ouvrier accepte ou
 * décline dans son suivi ; s'il accepte, chacun reçoit le numéro de l'autre.
 */
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { type AvailableWorker, type MyAnnouncement, invite, isError } from '@/lib/market/client'
import { formatWorkDates } from '@/lib/market/work'
import { CheckCircle2, Send } from 'lucide-react'
import Link from 'next/link'
import { useState } from 'react'

export function InviteWorker({
  worker,
  offers,
  onInvited,
}: {
  worker: AvailableWorker
  /** Les offres de travail ouvertes du compte. */
  offers: MyAnnouncement[]
  onInvited?: () => void
}) {
  const [open, setOpen] = useState(false)
  const [offerId, setOfferId] = useState(offers[0]?.id ?? '')
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)

  const submit = async () => {
    if (!offerId) return
    setSending(true)
    setError(null)
    const result = await invite(offerId, worker.ref, message)
    setSending(false)
    if (isError(result)) {
      setError(result.error)
      return
    }
    // La base rend la réponse existante quand l'ouvrier est déjà sur cette offre.
    setDone(
      result.status === 'retenue'
        ? `${worker.name} est déjà retenu sur cette offre : son numéro est dans Mon suivi.`
        : result.status === 'envoyee'
          ? `${worker.name} a déjà répondu à cette offre : retenez-le dans Mon suivi.`
          : 'Invitation envoyée. Sa réponse arrive dans Mon suivi.',
    )
    onInvited?.()
  }

  return (
    <>
      <Button
        type="button"
        className="h-11 w-full gap-2 bg-amber-700 text-white hover:bg-amber-800"
        onClick={() => {
          setDone(null)
          setError(null)
          setOfferId((current) => current || offers[0]?.id || '')
          setOpen(true)
        }}
      >
        <Send aria-hidden="true" className="h-4 w-4" /> Inviter sur mon offre
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Inviter {worker.name}</DialogTitle>
            <DialogDescription>
              {worker.name} voit votre offre et l’accepte ou la décline. S’il accepte, vous recevez
              son numéro, et lui le vôtre.
            </DialogDescription>
          </DialogHeader>

          {offers.length === 0 ? (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Publiez d’abord une offre de travail : le salaire par jour, le nombre d’ouvriers et
                les dates. Vous pourrez ensuite y inviter des ouvriers.
              </p>
              <Button asChild className="h-11 w-full bg-amber-700 text-white hover:bg-amber-800">
                <Link href="/marche/publier?type=job">Publier une offre de travail</Link>
              </Button>
            </div>
          ) : done ? (
            <div className="space-y-4 py-2">
              <p className="flex items-start gap-2 text-sm font-medium text-primary">
                <CheckCircle2 aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0" />
                {done}
              </p>
              <DialogFooter className="gap-2 sm:gap-2">
                <Button variant="outline" className="h-11" onClick={() => setOpen(false)}>
                  Fermer
                </Button>
                <Button asChild className="h-11">
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
              <fieldset className="space-y-2">
                <legend className="text-sm font-medium">Sur quelle offre ?</legend>
                {offers.map((o) => (
                  <label
                    key={o.id}
                    className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring ${
                      offerId === o.id
                        ? 'border-amber-600 bg-amber-50 dark:bg-amber-950/30'
                        : 'border-border'
                    }`}
                  >
                    <input
                      type="radio"
                      name="offer"
                      value={o.id}
                      checked={offerId === o.id}
                      onChange={() => setOfferId(o.id)}
                      className="mt-1 accent-amber-700"
                    />
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold">{o.title}</span>
                      <span className="block text-xs text-muted-foreground">
                        {[
                          o.wage_per_day_fcfa
                            ? `${o.wage_per_day_fcfa.toLocaleString('fr-FR')} FCFA/jour`
                            : null,
                          formatWorkDates(o.starts_on, o.work_days),
                          o.place,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </span>
                    </span>
                  </label>
                ))}
              </fieldset>
              <div className="space-y-1.5">
                <Label htmlFor={`invite-${worker.ref}`}>Un mot (facultatif)</Label>
                <Textarea
                  id={`invite-${worker.ref}`}
                  rows={2}
                  maxLength={280}
                  placeholder="Ex. : Rendez-vous lundi 7 h au champ, après le marché."
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                />
              </div>
              {error && (
                <p role="alert" className="text-sm text-destructive">
                  {error}
                </p>
              )}
              <DialogFooter className="gap-2 sm:gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="h-11"
                  onClick={() => setOpen(false)}
                >
                  Annuler
                </Button>
                <Button
                  type="submit"
                  className="h-11 bg-amber-700 text-white hover:bg-amber-800"
                  disabled={sending || !offerId}
                >
                  {sending ? 'Envoi…' : 'Envoyer l’invitation'}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
