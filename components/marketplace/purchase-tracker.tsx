'use client'

import { Spinner } from '@/components/shared/loading'
import { Button } from '@/components/ui/button'
import { type PurchaseInfo, usePurchaseStatus } from '@/hooks/use-marketplace-purchase-status'
import {
  SUPPORT_CONTACT,
  feeNote,
  purchaseReference,
  supportWhatsappUrl,
} from '@/lib/fiches/payment-tracking'
import type { PurchaseTrackingMode } from '@/lib/fiches/purchase-submit'
import { formatFcfa } from '@/lib/fiches/types'
import {
  CheckCircle2,
  Clock,
  Download,
  RefreshCw,
  RotateCcw,
  Send,
  Smartphone,
  Undo2,
  XCircle,
} from 'lucide-react'
import Link from 'next/link'
import { type ReactNode, useEffect, useRef } from 'react'
import { KeepLink } from './keep-link'

/** Numéro et opérateur de l'envoi, pour que l'acheteur sache où regarder. */
export interface Payer {
  /** Opérateur choisi ; null si inconnu (paiement repris). */
  operator: string | null
  /** Numéro masqué (maskMobileMoneyPhone). */
  phone: string
}

export type PanelState = 'pending' | 'timeout' | 'completed' | 'failed' | 'expired' | 'refunded'

export type SettledState = 'completed' | 'failed' | 'expired' | 'refunded'

/** « Réessayer » : dans la fenêtre (bouton) ou depuis la page de l'achat (lien). */
export type RetryAction = { onClick: () => void } | { href: string }

interface PaymentStatusPanelProps {
  state: PanelState
  purchaseId: string
  title: string
  amount: number
  /** Dernière réponse de GET /api/purchases/[id] (frais, référence). */
  info: PurchaseInfo | null
  payer?: Payer | null
  /** Paiement repris : aucune nouvelle demande n'est partie. */
  resumed?: boolean
  /** Message du serveur (ex. opérateur sans confirmation). */
  note?: string | null
  checking: boolean
  lastCheckedAt: number | null
  onCheck: () => void
  retry?: RetryAction
  /** Refus ou expiration : l'achat est encore relu en arrière-plan. */
  lateWatching?: boolean
  onDownload?: () => void
  downloading?: boolean
  /** Paiement repris : ce n'est pas l'achat de la personne devant l'écran. */
  onNotMine?: () => void
}

const timeOf = (ms: number) =>
  new Date(ms).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })

/**
 * Écran d'un paiement Mobile Money, sur le site : attente de la validation au
 * téléphone, confirmation, refus, expiration, attente prolongée. Partagé par
 * la fenêtre d'achat et la page de l'achat. L'acheteur ne quitte jamais le
 * site : aucun lien ni cadre FedaPay.
 */
export function PaymentStatusPanel({
  state,
  purchaseId,
  title,
  amount,
  info,
  payer,
  resumed,
  note,
  checking,
  lastCheckedAt,
  onCheck,
  retry,
  lateWatching,
  onDownload,
  downloading,
  onNotMine,
}: PaymentStatusPanelProps) {
  const reference = purchaseReference({ id: purchaseId, reference: info?.reference })
  const fees = feeNote({
    amount,
    amount_debited: info?.amount_debited ?? null,
    fees: info?.fees ?? null,
  })

  if (state === 'completed')
    return (
      <div className="space-y-3">
        <StatusCard
          tone="success"
          icon={<CheckCircle2 className="h-5 w-5" />}
          title="Paiement confirmé"
        >
          Votre compte d’exploitation est débloqué. Un reçu part à votre e-mail si vous l’avez
          donné.
        </StatusCard>
        {info?.amount_debited != null ? (
          <p className="text-xs text-muted-foreground">{fees}</p>
        ) : null}
        {onDownload ? (
          <Button className="w-full gap-2" onClick={onDownload} disabled={downloading}>
            {downloading ? <Spinner className="h-4 w-4" /> : <Download className="h-4 w-4" />}
            {downloading ? 'Ouverture des fichiers…' : 'Télécharger'}
          </Button>
        ) : null}
        <KeepLink purchaseId={purchaseId} title={title} />
      </div>
    )

  if (state === 'failed' || state === 'expired') {
    const expired = state === 'expired'
    return (
      <div className="space-y-3">
        <StatusCard
          tone={expired ? 'neutral' : 'danger'}
          role="alert"
          icon={expired ? <Clock className="h-5 w-5" /> : <XCircle className="h-5 w-5" />}
          title={expired ? 'La demande a expiré' : 'Le paiement n’a pas abouti'}
        >
          {expired
            ? 'Elle n’a pas été validée à temps sur le téléphone. Recommencez pour recevoir une nouvelle demande.'
            : `La demande de ${formatFcfa(amount)} a été refusée ou annulée sur le téléphone : solde insuffisant, code incorrect ou demande ignorée.`}
        </StatusCard>
        {retry ? (
          <div className="space-y-1.5">
            <RetryButton retry={retry} variant="default">
              <RotateCcw className="h-4 w-4" />
              {expired ? 'Recommencer' : 'Réessayer'}
            </RetryButton>
            <p className="text-center text-xs text-muted-foreground">
              Vous pourrez changer de numéro ou d’opérateur.
            </p>
          </div>
        ) : null}
        {lateWatching ? (
          <p className="flex items-start gap-2 text-xs text-muted-foreground" aria-live="polite">
            <Spinner className="mt-px h-3 w-3 shrink-0" />
            Si le paiement est finalement accepté dans les prochaines minutes, vos fichiers
            s’afficheront ici.
          </p>
        ) : null}
        <SupportLine
          reference={reference}
          title={title}
          lead="Débité sans recevoir vos fichiers ?"
        />
      </div>
    )
  }

  if (state === 'refunded')
    return (
      <div className="space-y-3">
        <StatusCard
          tone="neutral"
          role="alert"
          icon={<Undo2 className="h-5 w-5" />}
          title="Paiement remboursé"
        >
          Le montant vous a été rendu et l’accès à ce compte d’exploitation est fermé.
        </StatusCard>
        <SupportLine reference={reference} title={title} lead="Une question ?" />
        {retry ? (
          <RetryButton retry={retry} variant="outline">
            Acheter à nouveau
          </RetryButton>
        ) : null}
      </div>
    )

  if (state === 'timeout')
    return (
      <div className="space-y-3">
        <StatusCard tone="waiting" icon={<Clock className="h-5 w-5" />} title="Toujours en attente">
          L’opérateur n’a pas encore répondu. Si vous avez validé sur votre téléphone, votre achat
          se débloquera tout seul, même plus tard.
        </StatusCard>
        <Button className="w-full gap-2" onClick={onCheck} disabled={checking}>
          {checking ? <Spinner className="h-4 w-4" /> : <RefreshCw className="h-4 w-4" />}
          Vérifier le paiement
        </Button>
        {lastCheckedAt && !checking ? (
          <output className="block text-center text-xs text-muted-foreground">
            Vérifié à {timeOf(lastCheckedAt)} : toujours en attente.
          </output>
        ) : null}
        {retry ? (
          <div className="space-y-1.5">
            <RetryButton retry={retry} variant="outline">
              <Send className="h-4 w-4" />
              Recevoir une nouvelle demande
            </RetryButton>
            <p className="text-center text-xs text-muted-foreground">
              Vous pourrez changer de numéro ou d’opérateur.
            </p>
          </div>
        ) : null}
        <KeepLink
          purchaseId={purchaseId}
          title={title}
          lead="Gardez ce lien : il ouvre votre achat dès que le paiement est confirmé"
        />
        <SupportLine reference={reference} title={title} lead="Besoin d’aide ?" />
      </div>
    )

  // En attente de la validation sur le téléphone.
  return (
    <div className="space-y-4">
      {note ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          {note}
        </p>
      ) : null}

      <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
        <div className="flex items-start gap-3">
          <span className="relative mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
            <span
              aria-hidden
              className="absolute inset-1 rounded-full bg-primary/20 motion-safe:animate-ping"
            />
            <Smartphone className="relative h-5 w-5" />
          </span>
          <div className="min-w-0 space-y-1">
            <p className="font-semibold leading-snug text-foreground">
              Validez le paiement sur votre téléphone
            </p>
            <p className="text-sm text-muted-foreground">
              {resumed
                ? 'Entrez votre code secret Mobile Money pour accepter la demande déjà envoyée.'
                : 'Une demande s’affiche sur ce numéro : entrez votre code secret Mobile Money pour l’accepter.'}
            </p>
          </div>
        </div>
        {payer ? (
          <div className="mt-3 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 rounded-lg bg-background/80 px-3 py-2 text-sm">
            <span className="text-muted-foreground">{payer.operator ?? 'Mobile Money'}</span>
            <span className="font-medium tabular-nums text-foreground">{payer.phone}</span>
          </div>
        ) : null}
      </div>

      <div className="space-y-1">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-sm text-muted-foreground">Montant</span>
          <span className="text-lg font-semibold tabular-nums text-foreground">
            {formatFcfa(amount)}
          </span>
        </div>
        <p className="text-xs text-muted-foreground">{fees}</p>
      </div>

      <div className="space-y-2">
        <Button variant="outline" className="w-full gap-2" onClick={onCheck} disabled={checking}>
          {checking ? <Spinner className="h-4 w-4" /> : <RefreshCw className="h-4 w-4" />}
          Vérifier le paiement
        </Button>
        <p
          className="flex items-center justify-center gap-2 text-center text-xs text-muted-foreground"
          aria-live="polite"
        >
          {lastCheckedAt && !checking
            ? `Vérifié à ${timeOf(lastCheckedAt)} : en attente de votre validation.`
            : 'Cette page se met à jour dès que vous validez.'}
        </p>
      </div>

      {retry && info?.can_retry ? (
        <div className="space-y-2 rounded-lg border border-border p-3">
          <p className="text-sm text-foreground">
            Rien reçu sur votre téléphone ? Envoyez une nouvelle demande, au même numéro ou à un
            autre.
          </p>
          <RetryButton retry={retry} variant="outline">
            <Send className="h-4 w-4" />
            Envoyer une nouvelle demande
          </RetryButton>
        </div>
      ) : null}

      {onNotMine ? (
        <Button variant="ghost" size="sm" className="w-full" onClick={onNotMine}>
          Ce n’est pas moi / nouvel achat
        </Button>
      ) : null}
    </div>
  )
}

const TONES = {
  success: { box: 'border-green-200 bg-green-50', icon: 'text-green-600' },
  danger: { box: 'border-destructive/25 bg-destructive/5', icon: 'text-destructive' },
  waiting: { box: 'border-amber-200 bg-amber-50', icon: 'text-amber-700' },
  neutral: { box: 'border-border bg-muted/40', icon: 'text-muted-foreground' },
} as const

function StatusCard({
  tone,
  icon,
  title,
  role,
  children,
}: {
  tone: keyof typeof TONES
  icon: ReactNode
  title: string
  role?: 'alert'
  children: ReactNode
}) {
  return (
    <div role={role} className={`flex items-start gap-3 rounded-xl border p-4 ${TONES[tone].box}`}>
      <span className={`mt-0.5 shrink-0 ${TONES[tone].icon}`}>{icon}</span>
      <div className="min-w-0 space-y-1">
        <p className="font-semibold leading-snug text-foreground">{title}</p>
        <p className="text-sm text-foreground/80">{children}</p>
      </div>
    </div>
  )
}

function RetryButton({
  retry,
  variant,
  children,
}: {
  retry: RetryAction
  variant: 'default' | 'outline' | 'ghost'
  children: ReactNode
}) {
  if ('href' in retry)
    return (
      <Button asChild variant={variant} className="w-full gap-2">
        <Link href={retry.href}>{children}</Link>
      </Button>
    )
  return (
    <Button variant={variant} className="w-full gap-2" onClick={retry.onClick}>
      {children}
    </Button>
  )
}

/** Contact du support (WhatsApp), avec la référence de l'achat. */
function SupportLine({
  reference,
  title,
  lead,
}: { reference: string; title: string; lead: string }) {
  return (
    <p className="text-xs leading-relaxed text-muted-foreground">
      {lead}{' '}
      <a
        href={supportWhatsappUrl(reference, title)}
        target="_blank"
        rel="noopener noreferrer"
        className="font-medium text-primary underline underline-offset-2"
      >
        Écrivez-nous sur WhatsApp
      </a>{' '}
      ({SUPPORT_CONTACT.phone}) en donnant la référence{' '}
      <span className="font-mono text-foreground">{reference}</span>.
    </p>
  )
}

interface PurchaseTrackerProps {
  purchaseId: string
  title: string
  amount: number
  mode: PurchaseTrackingMode
  payer?: Payer | null
  /** Message d'information du serveur (ex. opérateur sans confirmation). */
  note?: string | null
  /** Paiement confirmé : la fenêtre ouvre le téléchargement (avec la référence FedaPay connue). */
  onDownload: (reference: string | null) => void
  downloading?: boolean
  /**
   * Nouvelle demande explicite : retour au formulaire (autre numéro, autre
   * opérateur, nouvel essai), SANS reprise de cet achat.
   */
  onRetry: () => void
  /** Mode « repris » : ce n'est pas l'achat de la personne devant l'écran. */
  onNotMine?: () => void
  /** Appelé une fois par état définitif atteint. */
  onSettled?: (state: SettledState, info: PurchaseInfo | null) => void
  /** Refus ou expiration encore surveillés en arrière-plan (useLateApprovalWatch). */
  lateWatching?: boolean
}

/**
 * Suivi d'un paiement en cours dans la fenêtre d'achat. L'état vient du
 * serveur ; le suivi s'arrête après 5 minutes et laisse l'acheteur relancer
 * une vérification ou recommencer.
 */
export function PurchaseTracker({
  purchaseId,
  title,
  amount,
  mode,
  payer,
  note,
  onDownload,
  downloading,
  onRetry,
  onNotMine,
  onSettled,
  lateWatching,
}: PurchaseTrackerProps) {
  const { state, info, checking, lastCheckedAt, checkNow } = usePurchaseStatus(purchaseId, {
    poll: true,
  })

  const settledRef = useRef<string | null>(null)
  useEffect(() => {
    if (
      (state === 'completed' ||
        state === 'failed' ||
        state === 'expired' ||
        state === 'refunded') &&
      settledRef.current !== state
    ) {
      settledRef.current = state
      onSettled?.(state, info)
    }
  }, [state, info, onSettled])

  // Achat introuvable ou lecture impossible : l'acheteur garde la main (vérifier, contacter).
  const shown: PanelState =
    state === 'loading' ? 'pending' : state === 'not-found' || state === 'error' ? 'timeout' : state

  return (
    <PaymentStatusPanel
      state={shown}
      purchaseId={purchaseId}
      title={title}
      amount={amount}
      info={info}
      payer={payer}
      resumed={mode === 'resumed'}
      note={note}
      checking={checking}
      lastCheckedAt={lastCheckedAt}
      onCheck={() => void checkNow()}
      retry={{ onClick: onRetry }}
      lateWatching={lateWatching}
      onDownload={() => onDownload(info?.reference ?? null)}
      downloading={downloading}
      onNotMine={onNotMine}
    />
  )
}
