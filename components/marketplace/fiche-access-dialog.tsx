'use client'

import { useState, useCallback } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Spinner } from '@/components/shared/loading'
import { CreditCard, Download, AlertCircle, CheckCircle2 } from 'lucide-react'
import type { PublicFiche } from '@/hooks/use-fiches-public'

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

  const reset = useCallback(() => {
    setCardNumber('')
    setError(null)
    setFiles([])
    setSuccess(false)
    setLoading(false)
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

  if (!fiche) return null

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

        {success ? (
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
                files.map((f, i) => (
                  <a
                    key={i}
                    href={f.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-between p-3 border border-border rounded-lg hover:bg-accent/10 transition-colors"
                  >
                    <span className="flex items-center gap-2 min-w-0">
                      <Download className="h-4 w-4 text-primary shrink-0" />
                      <span className="text-sm font-medium text-foreground truncate">
                        {f.name}
                      </span>
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
          <form onSubmit={handleSubmit} className="space-y-4 py-2">
            <div className="flex items-start gap-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <CreditCard className="h-5 w-5 text-blue-600 shrink-0 mt-0.5" />
              <div className="text-xs text-blue-900 space-y-1">
                <p className="font-medium">Membres : accès gratuit</p>
                <p>Entrez le numéro de votre carte membre pour télécharger cette fiche.</p>
                <p className="text-blue-800">
                  Non-membres : {fiche.price_non_member} FCFA — paiement à venir.
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="card_number">Numéro de carte membre</Label>
              <Input
                id="card_number"
                placeholder="FH-2025-0001"
                value={cardNumber}
                onChange={(e) => setCardNumber(e.target.value)}
                disabled={loading}
                autoComplete="off"
                autoFocus
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
                disabled={loading}
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
        )}
      </DialogContent>
    </Dialog>
  )
}
