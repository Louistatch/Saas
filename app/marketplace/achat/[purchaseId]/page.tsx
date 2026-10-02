'use client'

import { Spinner } from '@/components/shared/loading'
import { MarketingLayout } from '@/components/shared/marketing-layout'
import { Button } from '@/components/ui/button'
import { AlertCircle, CheckCircle2, Clock, Download } from 'lucide-react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'

interface PurchaseStatus {
  id: string
  fiche_id: string
  title: string | null
  amount: number
  status: 'pending' | 'completed' | 'failed' | 'refunded'
  access_granted: boolean
}

interface AccessFile {
  name: string
  type: string
  url: string
}

/**
 * Retour de paiement FedaPay. Le statut affiché vient du serveur, qui le revérifie
 * auprès de FedaPay (?refresh=1) — jamais des paramètres de l'URL de retour.
 */
export default function PurchasePage() {
  const { purchaseId } = useParams<{ purchaseId: string }>()
  const [purchase, setPurchase] = useState<PurchaseStatus | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [files, setFiles] = useState<AccessFile[] | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/purchases/${purchaseId}?refresh=1`, { cache: 'no-store' })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) setError(json.error ?? 'Achat introuvable')
      else setPurchase(json)
    } catch {
      setError('Erreur réseau. Réessayez.')
    } finally {
      setBusy(false)
    }
  }, [purchaseId])

  useEffect(() => {
    void load()
  }, [load])

  const download = async () => {
    if (!purchase) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/fiches/${purchase.fiche_id}/access`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ purchase_id: purchase.id }),
      })
      const json = await res.json().catch(() => ({}))
      if (res.ok && Array.isArray(json.files)) setFiles(json.files)
      else setError(json.error ?? 'Accès refusé')
    } catch {
      setError('Erreur réseau. Réessayez.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <MarketingLayout>
      <div className="mx-auto max-w-lg px-4 py-12">
        <h1 className="mb-6 text-2xl font-bold text-foreground">Votre achat</h1>

        {!purchase && busy ? <Spinner className="h-6 w-6" /> : null}

        {purchase ? (
          <div className="space-y-4 rounded-lg border border-border p-5">
            <p className="font-medium text-foreground">
              {purchase.title ?? "Compte d'exploitation"}
            </p>
            <p className="text-sm text-muted-foreground">
              {purchase.amount.toLocaleString('fr-FR')} FCFA · vendu par FaîtiereHub
            </p>

            {purchase.status === 'completed' && purchase.access_granted ? (
              <>
                <p className="flex items-center gap-2 text-sm text-green-800">
                  <CheckCircle2 className="h-4 w-4" /> Paiement confirmé.
                </p>
                {files ? (
                  <ul className="space-y-2">
                    {files.length === 0 ? (
                      <li className="text-sm text-muted-foreground">Aucun fichier disponible.</li>
                    ) : (
                      files.map((f) => (
                        <li key={f.url}>
                          <a
                            href={f.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-2 rounded-lg border border-border p-3 text-sm hover:bg-accent/10"
                          >
                            <Download className="h-4 w-4 shrink-0 text-primary" />
                            <span className="truncate">{f.name}</span>
                          </a>
                        </li>
                      ))
                    )}
                    <li className="text-xs text-muted-foreground">
                      Liens valables 1 h. Revenez sur cette page pour en générer de nouveaux.
                    </li>
                  </ul>
                ) : (
                  <Button onClick={download} disabled={busy} className="w-full gap-2">
                    <Download className="h-4 w-4" /> Télécharger
                  </Button>
                )}
              </>
            ) : purchase.status === 'pending' ? (
              <>
                <p className="flex items-center gap-2 text-sm text-amber-800">
                  <Clock className="h-4 w-4" /> Paiement en cours de vérification…
                </p>
                <Button variant="outline" onClick={load} disabled={busy} className="w-full">
                  Vérifier à nouveau
                </Button>
              </>
            ) : (
              <p className="flex items-center gap-2 text-sm text-destructive">
                <AlertCircle className="h-4 w-4" />
                {purchase.status === 'refunded' ? 'Paiement remboursé.' : 'Paiement non abouti.'}
              </p>
            )}
          </div>
        ) : null}

        {error ? <p className="mt-4 text-sm text-destructive">{error}</p> : null}

        <Link
          href="/marketplace"
          className="mt-6 inline-block text-sm text-primary hover:underline"
        >
          ← Retour aux comptes d'exploitation
        </Link>
      </div>
    </MarketingLayout>
  )
}
