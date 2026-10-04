'use client'

import { Spinner } from '@/components/shared/loading'
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
import type { PublicFiche } from '@/hooks/use-fiches-public'
import { AlertCircle, CheckCircle2, CreditCard, Download, ShoppingCart } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'

interface AccessFile {
  name: string
  type: string
  url: string
}

interface FicheAccessDialogProps {
  fiche: PublicFiche | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function FicheAccessDialog({ fiche, open, onOpenChange }: FicheAccessDialogProps) {
  const [cardNumber, setCardNumber] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [files, setFiles] = useState<AccessFile[]>([])
  const [success, setSuccess] = useState(false)
  const [buyer, setBuyer] = useState({
    name: '',
    phone: '',
    email: '',
    country: 'tg' as 'tg' | 'bj',
  })
  const [buying, setBuying] = useState(false)
  // Paiement intégré : la page FedaPay s'affiche DANS la fenêtre, l'acheteur
  // ne quitte jamais le site. L'état est relu côté serveur (jamais d'après
  // l'iframe) jusqu'à confirmation ou refus.
  const [checkout, setCheckout] = useState<{ url: string; purchaseId: string } | null>(null)
  const [payState, setPayState] = useState<'pending' | 'completed' | 'failed'>('pending')

  useEffect(() => {
    if (!checkout || payState !== 'pending') return
    let stop = false
    const poll = async () => {
      try {
        const res = await fetch(`/api/purchases/${checkout.purchaseId}?refresh=1`, {
          cache: 'no-store',
        })
        const json = await res.json().catch(() => ({}))
        if (stop) return
        if (json.status === 'completed') setPayState('completed')
        else if (json.status === 'failed' || json.status === 'refunded') setPayState('failed')
      } catch {
        // Réseau instable : on réessaie au prochain tour.
      }
    }
    const timer = setInterval(poll, 4000)
    return () => {
      stop = true
      clearInterval(timer)
    }
  }, [checkout, payState])

  const reset = useCallback(() => {
    setCardNumber('')
    setError(null)
    setFiles([])
    setSuccess(false)
    setLoading(false)
    setCheckout(null)
    setPayState('pending')
  }, [])

  const handleClose = useCallback(
    (next: boolean) => {
      onOpenChange(next)
      if (!next) reset()
    },
    [onOpenChange, reset],
  )

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault()
      if (!fiche) return

      const trimmed = cardNumber.trim().toUpperCase()
      if (trimmed.length < 5) {
        setError('Numéro de carte invalide')
        return
      }

      setLoading(true)
      setError(null)

      try {
        const res = await fetch(`/api/fiches/${fiche.id}/access`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ card_number: trimmed }),
        })

        const json = await res.json()

        if (res.status === 402) {
          setError(
            json.message ?? `Cette fiche coûte ${fiche.price_non_member} FCFA pour les non-membres`,
          )
          return
        }
        if (!res.ok) {
          setError(json.error ?? 'Accès refusé')
          return
        }

        if (json.access === 'granted' && Array.isArray(json.files)) {
          setFiles(json.files)
          setSuccess(true)
        } else {
          setError('Réponse inattendue du serveur')
        }
      } catch {
        setError('Erreur réseau. Réessayez.')
      } finally {
        setLoading(false)
      }
    },
    [cardNumber, fiche],
  )

  const handleBuy = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault()
      if (!fiche) return
      setBuying(true)
      setError(null)
      try {
        const res = await fetch(`/api/fiches/${fiche.id}/purchase`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: buyer.name.trim(),
            phone: buyer.phone.trim(),
            country: buyer.country,
            email: buyer.email.trim() || undefined,
          }),
        })
        const json = await res.json().catch(() => ({}))
        if (!res.ok || typeof json.url !== 'string') {
          setError(json.error ?? 'Paiement indisponible pour le moment.')
          return
        }
        setPayState('pending')
        setCheckout({ url: json.url, purchaseId: json.purchase_id })
      } catch {
        setError('Erreur réseau. Réessayez.')
      } finally {
        setBuying(false)
      }
    },
    [buyer, fiche],
  )

  if (!fiche) return null
  const paid = fiche.price_non_member > 0
  const busy = loading || buying

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{fiche.title}</DialogTitle>
          <DialogDescription>
            {fiche.culture} • {fiche.type_agriculture}
            {fiche.campaign ? ` • ${fiche.campaign}` : ''}
          </DialogDescription>
        </DialogHeader>

        {checkout ? (
          <div className="space-y-3">
            {payState === 'completed' ? (
              <div className="space-y-3 py-2">
                <div className="flex items-start gap-3 rounded-lg border border-green-200 bg-green-50 p-3">
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-green-600" />
                  <p className="text-sm font-medium text-green-900">
                    Paiement confirmé. Votre fiche est débloquée.
                  </p>
                </div>
                <Button asChild className="w-full gap-2">
                  <a href={`/marketplace/achat/${checkout.purchaseId}`}>
                    <Download className="h-4 w-4" /> Télécharger ma fiche
                  </a>
                </Button>
              </div>
            ) : payState === 'failed' ? (
              <div className="space-y-3 py-2">
                <div className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/10 p-3">
                  <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
                  <p className="text-sm text-destructive">
                    Le paiement a été refusé. Aucun montant n’a été prélevé.
                  </p>
                </div>
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => {
                    setCheckout(null)
                    setPayState('pending')
                  }}
                >
                  Réessayer
                </Button>
              </div>
            ) : (
              <>
                <iframe
                  src={checkout.url}
                  title="Paiement sécurisé FedaPay"
                  className="h-[70vh] max-h-[640px] w-full rounded-lg border border-border"
                  allow="payment"
                />
                <p className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Spinner className="h-3 w-3" /> Validez le paiement sur votre téléphone : cette
                  fenêtre se met à jour toute seule.
                </p>
                <a
                  href={checkout.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block text-center text-xs text-primary underline"
                >
                  La page de paiement ne s’affiche pas ? Ouvrez-la ici
                </a>
              </>
            )}
          </div>
        ) : success ? (
          <div className="space-y-4 py-2">
            <div className="flex items-start gap-3 p-3 bg-green-50 border border-green-200 rounded-lg">
              <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-green-900">Accès accordé</p>
                <p className="text-xs text-green-800 mt-0.5">
                  Cliquez sur un fichier pour le télécharger (lien valide 1h)
                </p>
              </div>
            </div>
            <div className="space-y-2">
              {files.length === 0 ? (
                <p className="text-sm text-muted-foreground">Aucun fichier disponible.</p>
              ) : (
                files.map((f) => (
                  <a
                    key={f.url}
                    href={f.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-between p-3 border border-border rounded-lg hover:bg-accent/10 transition-colors"
                  >
                    <span className="flex items-center gap-2 min-w-0">
                      <Download className="h-4 w-4 text-primary shrink-0" />
                      <span className="text-sm font-medium text-foreground truncate">{f.name}</span>
                    </span>
                    <span className="text-xs uppercase text-muted-foreground ml-2 shrink-0">
                      {f.type}
                    </span>
                  </a>
                ))
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-5 py-2">
            {paid ? (
              <form onSubmit={handleBuy} className="space-y-3">
                <div className="flex items-start gap-3 p-3 bg-green-50 border border-green-200 rounded-lg">
                  <ShoppingCart className="h-5 w-5 text-green-700 shrink-0 mt-0.5" />
                  <div className="text-xs text-green-900 space-y-1">
                    <p className="font-medium">
                      Acheter — {fiche.price_non_member.toLocaleString('fr-FR')} FCFA
                    </p>
                    <p>
                      Vendu par {fiche.cooperatives?.name ?? 'FaîtiereHub'}. Paiement sécurisé
                      FedaPay (Mobile Money ou carte). Le téléchargement s'ouvre après paiement.
                    </p>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="buyer_name">Nom complet</Label>
                  <Input
                    id="buyer_name"
                    value={buyer.name}
                    onChange={(e) => setBuyer((b) => ({ ...b, name: e.target.value }))}
                    disabled={busy}
                    required
                    minLength={2}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="buyer_phone">Téléphone (Mobile Money)</Label>
                  <div className="flex gap-2">
                    <select
                      aria-label="Pays du numéro"
                      value={buyer.country}
                      onChange={(e) =>
                        setBuyer((b) => ({ ...b, country: e.target.value as 'tg' | 'bj' }))
                      }
                      disabled={busy}
                      className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                    >
                      <option value="tg">🇹🇬 Togo</option>
                      <option value="bj">🇧🇯 Bénin</option>
                    </select>
                    <Input
                      id="buyer_phone"
                      type="tel"
                      inputMode="tel"
                      placeholder="90 00 00 00"
                      value={buyer.phone}
                      onChange={(e) => setBuyer((b) => ({ ...b, phone: e.target.value }))}
                      disabled={busy}
                      required
                      className="flex-1"
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="buyer_email">E-mail (facultatif)</Label>
                  <Input
                    id="buyer_email"
                    type="email"
                    value={buyer.email}
                    onChange={(e) => setBuyer((b) => ({ ...b, email: e.target.value }))}
                    disabled={busy}
                  />
                </div>
                <Button
                  type="submit"
                  className="w-full gap-2 bg-primary hover:bg-primary/90"
                  disabled={busy || buyer.name.trim().length < 2 || buyer.phone.trim().length < 8}
                >
                  {buying ? <Spinner className="h-4 w-4" /> : <ShoppingCart className="h-4 w-4" />}
                  Payer {fiche.price_non_member.toLocaleString('fr-FR')} FCFA
                </Button>
              </form>
            ) : null}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="flex items-start gap-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <CreditCard className="h-5 w-5 text-blue-600 shrink-0 mt-0.5" />
                <div className="text-xs text-blue-900 space-y-1">
                  <p className="font-medium">
                    {fiche.is_free_for_members ? 'Membres : accès gratuit' : 'Déjà membre ?'}
                  </p>
                  <p>Entrez le numéro de votre carte membre pour télécharger cette fiche.</p>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="card_number">Numéro de carte membre</Label>
                <Input
                  id="card_number"
                  placeholder="FH-2025-0001"
                  value={cardNumber}
                  onChange={(e) => setCardNumber(e.target.value)}
                  disabled={busy}
                  autoComplete="off"
                />
              </div>

              {error ? (
                <div className="flex items-start gap-2 p-2 bg-destructive/10 border border-destructive/20 rounded-lg">
                  <AlertCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                  <p className="text-xs text-destructive">{error}</p>
                </div>
              ) : null}

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => handleClose(false)}
                  disabled={busy}
                >
                  Annuler
                </Button>
                <Button
                  type="submit"
                  className="bg-primary hover:bg-primary/90 gap-2"
                  disabled={loading || cardNumber.trim().length < 5}
                >
                  {loading ? <Spinner className="h-4 w-4" /> : <Download className="h-4 w-4" />}
                  Vérifier et accéder
                </Button>
              </DialogFooter>
            </form>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
