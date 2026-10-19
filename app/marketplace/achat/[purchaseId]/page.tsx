'use client'

import { type AccessFile, FicheFilesList } from '@/components/marketplace/fiche-files-list'
import { KeepLink } from '@/components/marketplace/keep-link'
import { PaymentStatusPanel } from '@/components/marketplace/purchase-tracker'
import { Spinner } from '@/components/shared/loading'
import { MarketingLayout } from '@/components/shared/marketing-layout'
import { Button } from '@/components/ui/button'
import {
  type LateWatchEntry,
  useLateApprovalWatch,
  usePurchaseStatus,
} from '@/hooks/use-marketplace-purchase-status'
import { rememberPurchase } from '@/lib/fiches/local-purchases'
import { SUPPORT_CONTACT, newPurchaseHref, purchaseReference } from '@/lib/fiches/payment-tracking'
import { formatFcfa } from '@/lib/fiches/types'
import { CheckCircle2 } from 'lucide-react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'

/**
 * Page d'un achat — lien gardé par l'acheteur, lien du reçu. Le statut
 * affiché vient du serveur, qui le revérifie auprès de FedaPay (?refresh=1),
 * jamais des paramètres de l'URL. Un achat en attente est suivi 5 minutes,
 * puis « Vérifier le paiement » prend le relais ; un refus est encore relu
 * quelques minutes (paiement accepté après coup).
 */
export default function PurchasePage() {
  const { purchaseId } = useParams<{ purchaseId: string }>()
  const { state, info, checking, lastCheckedAt, checkNow } = usePurchaseStatus(purchaseId, {
    poll: true,
    initialCheck: true,
  })
  const [files, setFiles] = useState<AccessFile[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Refus ou expiration constatés : relus en arrière-plan quelques minutes.
  const ended = state === 'failed' || state === 'expired'
  const [failedSince, setFailedSince] = useState<number | null>(null)
  useEffect(() => {
    if (ended) setFailedSince((since) => since ?? Date.now())
  }, [ended])
  const lateEntries = useMemo<LateWatchEntry[]>(
    () => (ended && failedSince !== null ? [{ purchaseId, since: failedSince }] : []),
    [ended, failedSince, purchaseId],
  )
  const lateWatching = useLateApprovalWatch(lateEntries, () => void checkNow())

  // Achat ouvert sur cet appareil : gardé dans « Achats sur cet appareil ».
  useEffect(() => {
    if (info?.id && info.fiche_id)
      rememberPurchase({
        purchaseId: info.id,
        ficheId: info.fiche_id,
        title: info.title ?? 'Compte d’exploitation',
      })
  }, [info?.id, info?.fiche_id, info?.title])

  const title = info?.title ?? 'Compte d’exploitation'
  const reference = info ? purchaseReference(info) : null

  const download = async () => {
    if (!info) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/fiches/${info.fiche_id}/access`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ purchase_id: info.id }),
      })
      const json = await res.json().catch(() => ({}))
      if (res.ok && Array.isArray(json.files)) setFiles(json.files)
      else
        setError(
          res.status === 404
            ? 'Ce compte d’exploitation n’est plus disponible. Contactez-nous avec la référence de l’achat.'
            : (json.error ?? 'Téléchargement refusé. Réessayez.'),
        )
    } catch {
      setError('Pas de réseau. Vérifiez votre connexion puis réessayez.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <MarketingLayout>
      <div className="mx-auto max-w-lg px-4 py-10 sm:py-12">
        <h1 className="mb-6 text-2xl font-bold text-foreground">Votre achat</h1>

        {state === 'loading' ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Spinner className="h-4 w-4" /> Vérification du paiement…
          </p>
        ) : state === 'not-found' ? (
          <div className="space-y-2 rounded-lg border border-border p-5 text-sm">
            <p className="font-medium text-foreground">Achat introuvable</p>
            <p className="text-muted-foreground">
              Vérifiez que le lien est complet (il se termine par une longue suite de lettres et de
              chiffres). Besoin d’aide : {SUPPORT_CONTACT.email}.
            </p>
          </div>
        ) : state === 'error' || !info ? (
          <div className="space-y-3 rounded-lg border border-border p-5">
            <p className="text-sm text-foreground">
              La vérification n’a pas pu se faire. Vérifiez votre connexion puis réessayez.
            </p>
            <Button variant="outline" onClick={() => void checkNow()} disabled={checking}>
              Réessayer
            </Button>
          </div>
        ) : (
          <div className="space-y-4 rounded-lg border border-border p-5">
            <div>
              <p className="font-medium text-foreground">{title}</p>
              <p className="text-sm text-muted-foreground">
                {formatFcfa(info.amount)} · vendu par {info.seller_name ?? 'FaîtiereHub'}
              </p>
            </div>

            {state === 'completed' && files ? (
              <>
                <p className="flex items-center gap-2 text-sm font-medium text-green-800">
                  <CheckCircle2 className="h-4 w-4" /> Paiement confirmé
                </p>
                <FicheFilesList files={files} reference={reference} title={title} />
                <KeepLink purchaseId={info.id} title={title} />
              </>
            ) : (
              <PaymentStatusPanel
                state={state}
                purchaseId={info.id}
                title={title}
                amount={info.amount}
                info={info}
                resumed
                checking={checking}
                lastCheckedAt={lastCheckedAt}
                onCheck={() => void checkNow()}
                retry={{ href: newPurchaseHref(info.fiche_id) }}
                lateWatching={lateWatching.has(info.id)}
                onDownload={download}
                downloading={busy}
              />
            )}
          </div>
        )}

        {error ? (
          <p role="alert" className="mt-4 text-sm text-destructive">
            {error}
          </p>
        ) : null}

        <Link
          href="/marketplace"
          className="mt-6 inline-block text-sm text-primary hover:underline"
        >
          Retour aux comptes d’exploitation
        </Link>
      </div>
    </MarketingLayout>
  )
}
