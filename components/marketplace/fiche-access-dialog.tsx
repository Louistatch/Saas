'use client'

import { Skeleton, Spinner } from '@/components/shared/loading'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { CardLoginPanel } from '@/components/verify/card-login-panel'
import { vfpStyles } from '@/components/verify/vfp-styles'
import type { PublicFiche } from '@/hooks/use-fiches-public'
import {
  type LateWatchEntry,
  type PurchaseInfo,
  useLateApprovalWatch,
} from '@/hooks/use-marketplace-purchase-status'
import { accessErrorText } from '@/lib/fiches/access-error'
import {
  dismissLocalPurchase,
  readLocalPurchases,
  rememberPurchase,
  resumableFor,
} from '@/lib/fiches/local-purchases'
import { memberFreeDialogHint } from '@/lib/fiches/member-label'
import {
  SUPPORT_CONTACT,
  maskMobileMoneyPhone,
  purchaseReference,
  supportBuyWhatsappUrl,
} from '@/lib/fiches/payment-tracking'
import {
  type BuyError,
  type BuyerCountry,
  type ProviderOption,
  type ProvidersState,
  type PurchaseTrackingMode,
  SANDBOX_TEST_NUMBERS,
  buyErrorOf,
  createSubmitLock,
  phoneSample,
  pickProvider,
  providersFromReply,
  providersOf,
  replyStillShown,
  sandboxTestBuyer,
  trackingFromReply,
} from '@/lib/fiches/purchase-submit'
import { formatFcfa, labelTypeAgriculture, summarizeFiles } from '@/lib/fiches/types'
import {
  AlertCircle,
  CheckCircle2,
  CreditCard,
  Download,
  FileText,
  FlaskConical,
  MessageCircle,
  RotateCcw,
  ShoppingCart,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { type AccessFile, FicheFilesList } from './fiche-files-list'
import { KeepLink } from './keep-link'
import { type Payer, PurchaseTracker, type SettledState } from './purchase-tracker'

interface FicheAccessDialogProps {
  fiche: PublicFiche | null
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Achat réglé déjà connu (compte connecté ou appareil) : ouvre « déjà acheté ». */
  ownedPurchaseId?: string | null
  /**
   * Nouvelle demande explicite (lien « nouvel_achat=1 » de la page d'un
   * achat) : formulaire direct, aucun paiement en cours repris.
   */
  startFresh?: boolean
}

type View =
  | { kind: 'checking' }
  | { kind: 'form' }
  | {
      kind: 'tracking'
      purchaseId: string
      /** Fiche de CET achat (gardée à l'envoi) : téléchargement et appareil visent celle-ci. */
      ficheId: string
      title: string
      amount: number
      mode: PurchaseTrackingMode
      /** Numéro (masqué) et opérateur de l'envoi ; null pour un paiement repris au chargement. */
      payer: Payer | null
      note: string | null
    }
  /** `note` : paiement accepté après un refus (remplace « déjà acheté »). */
  | { kind: 'owned'; purchaseId: string; note?: string | null }
  | {
      kind: 'files'
      files: AccessFile[]
      reason: 'free' | 'member' | 'purchase'
      purchaseId?: string
      reference?: string | null
      note?: string | null
    }
  | { kind: 'card-login'; cardNumber: string }

/**
 * Opérateurs proposés : ceux que renvoie GET /api/payments/fedapay/providers,
 * et eux seuls (jamais de liste de secours, un opérateur masqué côté serveur
 * ne doit pas réapparaître). Une lecture réussie sert toute la page ; un échec
 * est relu à la prochaine ouverture ou au clic sur « Réessayer ».
 */
let providersRequest: Promise<ProvidersState> | null = null
function loadProviders(): Promise<ProvidersState> {
  providersRequest ??= fetch('/api/payments/fedapay/providers')
    .then(async (r) => providersFromReply(r.status, await r.json().catch(() => null)))
    .catch((): ProvidersState => ({ kind: 'error' }))
    .then((state) => {
      if (state.kind !== 'ready') providersRequest = null
      return state
    })
  return providersRequest
}

const COUNTRIES: readonly { id: BuyerCountry; name: string; dial: string }[] = [
  { id: 'tg', name: 'Togo', dial: '+228' },
  { id: 'bj', name: 'Bénin', dial: '+229' },
]

/** Paiement accepté après un refus : l'écran passe au succès. */
const LATE_PAID_NOTE = 'Votre paiement a finalement été accepté.'
const LATE_PAID_OTHER_NOTE =
  'Votre paiement précédent a finalement été accepté. Si une nouvelle demande arrive sur votre téléphone, refusez-la.'

type LateWatch = LateWatchEntry & { ficheId: string; title: string }

export function FicheAccessDialog({
  fiche,
  open,
  onOpenChange,
  ownedPurchaseId,
  startFresh = false,
}: FicheAccessDialogProps) {
  const [view, setView] = useState<View>({ kind: 'checking' })
  const [providersState, setProvidersState] = useState<ProvidersState>({ kind: 'loading' })
  const [providersTry, setProvidersTry] = useState(0)
  const [buyer, setBuyer] = useState({
    name: '',
    phone: '',
    email: '',
    country: 'tg' as BuyerCountry,
    provider: '',
  })
  // Verrou synchrone par fiche (lib/fiches/purchase-submit.ts) : un double
  // clic n'envoie qu'une requête ; `buyingIds` ne sert qu'à l'affichage.
  const [buyLock] = useState(createSubmitLock)
  const [buyingIds, setBuyingIds] = useState<readonly string[]>([])
  const [buyError, setBuyError] = useState<BuyError | null>(null)
  const [cardNumber, setCardNumber] = useState('')
  // `buy` : carte reconnue mais pas gratuite pour elle (402) — on propose l'achat.
  const [cardError, setCardError] = useState<{ text: string; buy: boolean } | null>(null)
  const [accessBusy, setAccessBusy] = useState(false)
  const [accessError, setAccessError] = useState<string | null>(null)
  const buyErrorRef = useRef<HTMLDivElement>(null)
  const buyerNameRef = useRef<HTMLInputElement>(null)
  const buyerPhoneRef = useRef<HTMLInputElement>(null)
  // Achats refusés ou expirés encore relus en arrière-plan (paiement tardif).
  const [lateWatch, setLateWatch] = useState<LateWatch[]>([])

  const paid = (fiche?.price_non_member ?? 0) > 0
  const buying = fiche ? buyingIds.includes(fiche.id) : false
  const contents = summarizeFiles(fiche?.files_summary)

  // Lus à l'ouverture seulement : un achat qui se règle pendant que la fenêtre
  // est ouverte ne doit pas la faire changer d'écran sous les yeux de l'acheteur.
  const ownedRef = useRef(ownedPurchaseId)
  ownedRef.current = ownedPurchaseId
  const startFreshRef = useRef(startFresh)
  startFreshRef.current = startFresh
  /**
   * Nouvelle demande EXPLICITE (« Réessayer », « Recevoir une nouvelle
   * demande », « Ce n'est pas moi », lien nouvel_achat) : l'envoi ne reprend
   * aucun paiement en cours (pas de resume_purchase_id). Seule la reprise
   * automatique, à l'ouverture, retrouve le paiement gardé sur l'appareil.
   */
  const freshRef = useRef(false)
  /** Fiche dont un paiement tardif a pris l'écran pendant un envoi (voir handleBuy). */
  const lateTookOverRef = useRef<string | null>(null)
  const ficheRef = useRef(fiche)
  ficheRef.current = fiche
  const openRef = useRef(open)
  openRef.current = open
  const ficheId = fiche?.id
  /** Une réponse arrivée après coup ne s'affiche que si sa fiche est encore à l'écran. */
  const isShown = useCallback(
    (forFicheId: string) =>
      replyStillShown({ open: openRef.current, ficheId: ficheRef.current?.id }, forFicheId),
    [],
  )

  // ── À l'ouverture : achat déjà réglé, paiement à reprendre, ou formulaire ──
  useEffect(() => {
    const current = ficheRef.current
    if (!open || !ficheId || !current) return
    let cancelled = false
    setBuyError(null)
    setCardError(null)
    setAccessError(null)
    freshRef.current = startFreshRef.current
    lateTookOverRef.current = null
    if (ownedRef.current) {
      setView({ kind: 'owned', purchaseId: ownedRef.current })
      return
    }
    const pending =
      current.price_non_member > 0 && !freshRef.current
        ? resumableFor(readLocalPurchases(), ficheId)
        : null
    if (!pending) {
      setView({ kind: 'form' })
      return
    }
    setView({ kind: 'checking' })
    fetch(`/api/purchases/${pending.purchaseId}?refresh=1`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { status?: string; access_granted?: boolean } | null) => {
        if (cancelled) return
        if (j?.status === 'completed' && j.access_granted)
          setView({ kind: 'owned', purchaseId: pending.purchaseId })
        else if (j?.status === 'pending')
          setView({
            kind: 'tracking',
            purchaseId: pending.purchaseId,
            ficheId: current.id,
            title: current.title,
            amount: current.price_non_member,
            mode: 'resumed',
            payer: null,
            note: null,
          })
        else setView({ kind: 'form' })
      })
      .catch(() => {
        if (!cancelled) setView({ kind: 'form' })
      })
    return () => {
      cancelled = true
    }
  }, [open, ficheId])

  // ── Opérateurs disponibles dans l'environnement FedaPay courant ──
  // biome-ignore lint/correctness/useExhaustiveDependencies: `providersTry` relance volontairement la lecture
  useEffect(() => {
    if (!open || !paid) return
    let cancelled = false
    setProvidersState((s) => (s.kind === 'ready' ? s : { kind: 'loading' }))
    void loadProviders().then((state) => {
      if (cancelled) return
      setProvidersState(state)
      if (state.kind === 'ready')
        setBuyer((b) => ({ ...b, provider: pickProvider(state.providers, b.country, b.provider) }))
    })
    return () => {
      cancelled = true
    }
  }, [open, paid, providersTry])

  useEffect(() => {
    if (buyError) buyErrorRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [buyError])

  const providers: readonly ProviderOption[] =
    providersState.kind === 'ready' ? providersState.providers : []
  const providerOptions = useMemo(
    () => providersOf(providers, buyer.country),
    [providers, buyer.country],
  )

  const viewRef = useRef(view)
  viewRef.current = view

  const handleClose = useCallback(
    (next: boolean) => {
      onOpenChange(next)
      if (!next) {
        // Le paiement en cours reste gardé sur l'appareil : il sera repris.
        setView({ kind: 'checking' })
        setCardNumber('')
        setBuyError(null)
        setCardError(null)
        setAccessError(null)
      }
    },
    [onOpenChange],
  )

  /**
   * POST /access ; affiche les fichiers si l'accès est accordé. `forFicheId` :
   * la fiche de l'achat (par défaut celle à l'écran).
   */
  const requestAccess = useCallback(
    async (
      body: { card_number?: string; purchase_id?: string },
      onError: (text: string, status: number) => void,
      reference?: string | null,
      forFicheId?: string,
      note?: string | null,
    ): Promise<{ ok: boolean; status: number }> => {
      const targetId = forFicheId ?? fiche?.id
      if (!targetId) return { ok: false, status: 0 }
      setAccessBusy(true)
      try {
        const res = await fetch(`/api/fiches/${targetId}/access`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
        const json = await res.json().catch(() => ({}))
        // Fenêtre fermée ou autre fiche ouverte entre-temps : rien à afficher.
        if (!isShown(targetId)) return { ok: false, status: 0 }
        if (res.ok && json.access === 'granted' && Array.isArray(json.files)) {
          setView({
            kind: 'files',
            files: json.files,
            reason: json.reason ?? 'free',
            purchaseId: body.purchase_id,
            reference: reference ?? null,
            note: note ?? null,
          })
          return { ok: true, status: res.status }
        }
        // 402 : la carte ne donne pas la gratuité — le message du serveur dit pourquoi.
        if (res.status !== 401) onError(accessErrorText(res.status, json), res.status)
        return { ok: false, status: res.status }
      } catch {
        if (isShown(targetId)) onError('Pas de réseau. Vérifiez votre connexion puis réessayez.', 0)
        return { ok: false, status: 0 }
      } finally {
        setAccessBusy(false)
      }
    },
    [fiche, isShown],
  )

  const showCardError = useCallback(
    (text: string, status: number) => setCardError({ text, buy: status === 402 }),
    [],
  )

  /** « Acheter » après un refus de carte : amène au formulaire de paiement. */
  const goToPayment = useCallback(() => {
    buyerNameRef.current?.focus({ preventScroll: true })
    buyerNameRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [])

  const downloadPurchase = useCallback(
    (purchaseId: string, reference?: string | null, forFicheId?: string, note?: string | null) => {
      setAccessError(null)
      void requestAccess({ purchase_id: purchaseId }, setAccessError, reference, forFicheId, note)
    },
    [requestAccess],
  )

  // ── Paiement accepté APRÈS un refus : l'écran passe au succès ──
  const lateWatching = useLateApprovalWatch(lateWatch, (info: PurchaseInfo) => {
    const entry = lateWatch.find((e) => e.purchaseId === info.id)
    setLateWatch((list) => list.filter((e) => e.purchaseId !== info.id))
    if (!entry) return
    // Badge « Acheté » et rubrique « Achats sur cet appareil », même fenêtre fermée.
    rememberPurchase({ purchaseId: entry.purchaseId, ficheId: entry.ficheId, title: entry.title })
    if (!isShown(entry.ficheId)) return
    const current = viewRef.current
    // Fichiers déjà affichés, ou connexion par carte en cours : on ne coupe rien.
    if (current.kind === 'files' || current.kind === 'card-login') return
    // Une nouvelle demande est en suivi, ou en cours d'envoi (verrou pris) :
    // l'acheteur doit la refuser sur son téléphone.
    const note =
      (current.kind === 'tracking' && current.purchaseId !== entry.purchaseId) ||
      buyLock.isHeld(entry.ficheId)
        ? LATE_PAID_OTHER_NOTE
        : LATE_PAID_NOTE
    lateTookOverRef.current = entry.ficheId
    setView({ kind: 'owned', purchaseId: entry.purchaseId, note })
    downloadPurchase(entry.purchaseId, info.reference ?? null, entry.ficheId, note)
  })

  /** Fin d'un paiement suivi dans la fenêtre. */
  const handleSettled = useCallback(
    (
      tracked: { purchaseId: string; ficheId: string; title: string },
      state: SettledState,
      info: PurchaseInfo | null,
    ) => {
      // Rafraîchit la rubrique « Achats sur cet appareil » et le badge
      // « Acheté » — sous la fiche de CET achat, jamais celle à l'écran.
      rememberPurchase(tracked)
      if (state === 'completed') {
        // Succès : les fichiers s'ouvrent sans clic de plus.
        downloadPurchase(tracked.purchaseId, info?.reference ?? null, tracked.ficheId)
        return
      }
      if (state === 'failed' || state === 'expired')
        setLateWatch((list) =>
          list.some((e) => e.purchaseId === tracked.purchaseId)
            ? list
            : [...list, { ...tracked, since: Date.now() }],
        )
    },
    [downloadPurchase],
  )

  /**
   * Nouvelle demande explicite : retour au formulaire, nom, numéro et
   * opérateur gardés (modifiables). L'envoi suivant ne reprend rien.
   */
  const retryPurchase = useCallback(() => {
    freshRef.current = true
    setBuyError(null)
    setAccessError(null)
    setView({ kind: 'form' })
  }, [])

  const handleCard = useCallback(
    async (e?: React.FormEvent) => {
      e?.preventDefault()
      const trimmed = cardNumber.trim().toUpperCase()
      if (trimmed.length < 5) {
        setCardError({
          text: 'Numéro de carte incomplet : il figure au recto de la carte (ex. FH-2025-0001).',
          buy: false,
        })
        return
      }
      setCardError(null)
      const r = await requestAccess({ card_number: trimmed }, showCardError)
      // 401 : le numéro ne suffit pas (il est public) — connexion par carte, puis nouvel essai.
      if (r.status === 401) setView({ kind: 'card-login', cardNumber: trimmed })
    },
    [cardNumber, requestAccess, showCardError],
  )

  const handleFree = useCallback(() => {
    setAccessError(null)
    void requestAccess({}, setAccessError)
  }, [requestAccess])

  const handleBuy = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault()
      // Fiche de CET envoi : la fenêtre peut changer de fiche pendant la requête.
      const forFiche = fiche
      if (!forFiche || !buyLock.tryAcquire(forFiche.id)) return
      setBuyingIds((ids) => [...ids, forFiche.id])
      setBuyError(null)
      // Numéro (masqué) et opérateur de CET envoi, pour l'écran d'attente.
      const payer: Payer = {
        operator: providers.find((p) => p.id === buyer.provider)?.label ?? null,
        phone: maskMobileMoneyPhone(buyer.country, buyer.phone),
      }
      // Reprise seulement hors relance explicite (sinon : toujours une nouvelle demande).
      const resume = freshRef.current ? null : resumableFor(readLocalPurchases(), forFiche.id)
      lateTookOverRef.current = null
      try {
        const res = await fetch(`/api/fiches/${forFiche.id}/purchase`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: buyer.name.trim(),
            phone: buyer.phone.trim(),
            country: buyer.country,
            email: buyer.email.trim() || undefined,
            provider: buyer.provider,
            resume_purchase_id: resume?.purchaseId,
          }),
        })
        const json = await res.json().catch(() => ({}))
        const purchaseId: string | null =
          typeof json.purchase_id === 'string' ? json.purchase_id : null

        // L'achat existe côté serveur : il est gardé sur l'appareil, sous SA
        // fiche, AVANT tout affichage — retrouvé même si la fenêtre se ferme.
        if (purchaseId)
          rememberPurchase({ purchaseId, ficheId: forFiche.id, title: forFiche.title })

        // Fenêtre fermée ou autre fiche ouverte entre-temps : l'écran ne
        // change pas (l'achat sera repris à la réouverture de sa fiche).
        if (!isShown(forFiche.id)) return
        // Le paiement précédent a été accepté PENDANT l'envoi : ses fichiers
        // restent à l'écran (avec « refusez la nouvelle demande »), jamais
        // remplacés par une demande de second paiement.
        if (lateTookOverRef.current === forFiche.id) return

        if (json.already && purchaseId) {
          setView({ kind: 'owned', purchaseId })
          return
        }
        const tracking = {
          kind: 'tracking' as const,
          ficheId: forFiche.id,
          title: forFiche.title,
          amount: forFiche.price_non_member,
          payer,
        }
        // 502 avec purchase_id : la transaction existe, la demande a pu partir
        // sur le téléphone — on suit l'achat au lieu d'afficher une erreur.
        if (res.status === 502 && purchaseId) {
          setView({ ...tracking, purchaseId, mode: 'direct', note: json.error ?? null })
          return
        }
        // Erreur sans achat à suivre : message, champ en cause et, si
        // l'opérateur n'a pas pu lancer la demande, un autre opérateur proposé.
        if (!res.ok || !purchaseId) {
          setBuyError(buyErrorOf(res.status, json))
          return
        }
        // Repris (`resumed`) : même numéro (vérifié par le serveur), mais
        // l'opérateur du premier envoi peut différer — on ne l'affiche pas.
        const reply = trackingFromReply(json)
        setView({
          ...tracking,
          purchaseId,
          ...reply,
          payer: reply.mode === 'resumed' ? { operator: null, phone: payer.phone } : payer,
        })
      } catch {
        if (isShown(forFiche.id))
          setBuyError({
            text: 'Pas de réseau. Vérifiez votre connexion puis réessayez.',
            field: null,
            tryOther: false,
          })
      } finally {
        buyLock.release(forFiche.id)
        setBuyingIds((ids) => ids.filter((id) => id !== forFiche.id))
      }
    },
    [buyer, fiche, buyLock, isShown, providers],
  )

  if (!fiche) return null

  const meta = [
    fiche.culture,
    labelTypeAgriculture(fiche.type_agriculture),
    fiche.campaign ? `Campagne ${fiche.campaign}` : null,
  ]
    .filter(Boolean)
    .join(' · ')
  const seller = fiche.cooperative_id ? (fiche.cooperatives?.name ?? 'Faîtière') : 'FaîtiereHub'
  // Qui a la gratuité : membres de la faîtière vendeuse, ou toute carte active (FaîtiereHub).
  const memberHint = memberFreeDialogHint(fiche)
  const busy = buying || accessBusy
  const countryInfo = COUNTRIES.find((c) => c.id === buyer.country) ?? COUNTRIES[0]
  const sandbox = providersState.kind === 'ready' && providersState.environment === 'sandbox'
  // Pays sans opérateur (liste lue) : pas de formulaire, seulement le message.
  const countryOpen = providersState.kind !== 'ready' || providerOptions.length > 0
  const alternatives = providerOptions.filter((p) => p.id !== buyer.provider)
  /** Autre opérateur proposé après un échec d'envoi : souvent un autre numéro aussi. */
  const switchProvider = (id: string) => {
    setBuyError(null)
    setBuyer((b) => ({ ...b, provider: id }))
    buyerPhoneRef.current?.focus()
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="pr-6 leading-snug">{fiche.title}</DialogTitle>
          <DialogDescription>{meta}</DialogDescription>
        </DialogHeader>

        {view.kind === 'checking' ? (
          <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
            <Spinner className="h-4 w-4" /> Vérification de vos achats…
          </div>
        ) : view.kind === 'tracking' ? (
          <div className="space-y-3">
            {accessError ? <ErrorLine text={accessError} /> : null}
            <PurchaseTracker
              key={view.purchaseId}
              purchaseId={view.purchaseId}
              title={view.title}
              amount={view.amount}
              mode={view.mode}
              payer={view.payer}
              note={view.note}
              downloading={accessBusy}
              onDownload={(reference) => downloadPurchase(view.purchaseId, reference, view.ficheId)}
              onRetry={retryPurchase}
              onNotMine={
                view.mode === 'resumed'
                  ? () => {
                      dismissLocalPurchase(view.purchaseId)
                      freshRef.current = true
                      setView({ kind: 'form' })
                    }
                  : undefined
              }
              onSettled={(state, info) =>
                handleSettled(
                  { purchaseId: view.purchaseId, ficheId: view.ficheId, title: view.title },
                  state,
                  info,
                )
              }
              lateWatching={lateWatching.has(view.purchaseId)}
            />
          </div>
        ) : view.kind === 'owned' ? (
          <div className="space-y-3">
            <div className="flex items-start gap-3 rounded-lg border border-green-200 bg-green-50 p-3">
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-green-600" />
              <p className="text-sm font-medium text-green-900">
                {view.note ?? 'Vous avez déjà acheté ce compte d’exploitation.'}
              </p>
            </div>
            {accessError ? <ErrorLine text={accessError} /> : null}
            <Button
              className="w-full gap-2"
              onClick={() => downloadPurchase(view.purchaseId, null, undefined, view.note)}
              disabled={accessBusy}
            >
              {accessBusy ? <Spinner className="h-4 w-4" /> : <Download className="h-4 w-4" />}
              Télécharger
            </Button>
            <KeepLink purchaseId={view.purchaseId} title={fiche.title} />
          </div>
        ) : view.kind === 'files' ? (
          <div className="space-y-3">
            <div className="flex items-start gap-3 rounded-lg border border-green-200 bg-green-50 p-3">
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-green-600" />
              {view.reason === 'purchase' ? (
                <div className="space-y-0.5">
                  <p className="text-sm font-medium text-green-900">
                    {view.note ?? 'Paiement confirmé.'}
                  </p>
                  <p className="text-xs text-green-800">Touchez un fichier pour le télécharger.</p>
                </div>
              ) : (
                <p className="text-sm font-medium text-green-900">
                  {view.reason === 'member'
                    ? 'Carte reconnue : téléchargement gratuit.'
                    : 'Touchez un fichier pour le télécharger.'}
                </p>
              )}
            </div>
            <FicheFilesList
              files={view.files}
              title={fiche.title}
              reference={
                view.purchaseId
                  ? purchaseReference({ id: view.purchaseId, reference: view.reference })
                  : undefined
              }
            />
            {view.purchaseId ? <KeepLink purchaseId={view.purchaseId} title={fiche.title} /> : null}
          </div>
        ) : view.kind === 'card-login' ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Le numéro de carte ne suffit pas : confirmez que vous êtes le titulaire de la carte{' '}
              <span className="font-medium text-foreground">{view.cardNumber}</span>.
            </p>
            {/* Panneau de connexion par carte (thème sombre des écrans « carte »). */}
            <style>{vfpStyles}</style>
            <div className="rounded-2xl bg-[#071a12] p-1">
              <CardLoginPanel
                cardNumber={view.cardNumber}
                onConnected={async () => {
                  const r = await requestAccess({ card_number: view.cardNumber }, (t, status) => {
                    showCardError(t, status)
                    setView({ kind: 'form' })
                  })
                  if (r.status === 401) {
                    setCardError({ text: 'La connexion n’a pas abouti. Réessayez.', buy: false })
                    setView({ kind: 'form' })
                  }
                }}
              />
            </div>
            <Button variant="ghost" className="w-full" onClick={() => setView({ kind: 'form' })}>
              Retour
            </Button>
          </div>
        ) : paid ? (
          <div className="space-y-5">
            <div className="space-y-1 border-b border-border pb-3">
              <p className="text-2xl font-bold tabular-nums text-foreground">
                {formatFcfa(fiche.price_non_member)}
              </p>
              <p className="text-xs text-muted-foreground">Vendu par {seller}</p>
              {contents ? (
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <FileText className="h-3.5 w-3.5 shrink-0" />
                  <span>{contents}</span>
                </p>
              ) : null}
            </div>

            {providersState.kind === 'unavailable' ? (
              <PaymentUnavailable message={providersState.message} title={fiche.title} />
            ) : (
              <form onSubmit={handleBuy} className="space-y-4">
                <fieldset disabled={busy} className="min-w-0">
                  <legend className="mb-1.5 text-sm font-medium text-foreground">
                    Pays de votre numéro
                  </legend>
                  <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1">
                    {COUNTRIES.map((c) => (
                      <label
                        key={c.id}
                        className="flex cursor-pointer items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors has-[:checked]:bg-background has-[:checked]:text-foreground has-[:checked]:shadow-sm has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring/50"
                      >
                        <input
                          type="radio"
                          name="buyer_country"
                          value={c.id}
                          checked={buyer.country === c.id}
                          onChange={() => {
                            setBuyError(null)
                            setBuyer((b) => ({
                              ...b,
                              country: c.id,
                              provider: pickProvider(providers, c.id, b.provider),
                            }))
                          }}
                          className="sr-only"
                        />
                        {c.name}
                        <span className="font-normal tabular-nums text-muted-foreground">
                          {c.dial}
                        </span>
                      </label>
                    ))}
                  </div>
                </fieldset>

                <fieldset disabled={busy} className="min-w-0">
                  <legend className="mb-1.5 text-sm font-medium text-foreground">
                    Opérateur Mobile Money
                  </legend>
                  {providersState.kind === 'loading' ? (
                    <div className="flex gap-2" aria-busy="true">
                      <Skeleton className="h-10 w-40" />
                      <Skeleton className="h-10 w-36" />
                    </div>
                  ) : providersState.kind === 'error' ? (
                    <div
                      role="alert"
                      className="flex items-center justify-between gap-3 rounded-lg border border-border bg-muted/40 p-3"
                    >
                      <p className="text-sm text-foreground">
                        Les opérateurs n’ont pas pu être chargés. Vérifiez votre connexion.
                      </p>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="gap-1.5"
                        onClick={() => setProvidersTry((n) => n + 1)}
                      >
                        <RotateCcw className="h-3.5 w-3.5" /> Réessayer
                      </Button>
                    </div>
                  ) : providerOptions.length === 0 ? (
                    <div className="space-y-1 rounded-lg border border-border bg-muted/40 p-3 text-sm">
                      <p className="font-medium text-foreground">
                        Aucun opérateur du {countryInfo.name} n’est disponible pour le moment.
                      </p>
                      <p className="text-muted-foreground">
                        Choisissez l’autre pays si votre numéro y est enregistré, ou contactez-nous
                        sur{' '}
                        <a
                          href={supportBuyWhatsappUrl(fiche.title)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-medium text-primary underline underline-offset-2"
                        >
                          WhatsApp
                        </a>{' '}
                        ({SUPPORT_CONTACT.phone}) ou à {SUPPORT_CONTACT.email}.
                      </p>
                    </div>
                  ) : (
                    <div className="grid gap-2">
                      {buyer.provider ? null : (
                        <p className="text-xs text-muted-foreground">
                          Choisissez l’opérateur de votre numéro.
                        </p>
                      )}
                      {providerOptions.map((p) => (
                        <label
                          key={p.id}
                          className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-input bg-background px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted/60 has-[:checked]:border-primary has-[:checked]:bg-primary/5 has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring/50 has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60 aria-invalid:border-destructive"
                          aria-invalid={buyError?.field === 'provider' || undefined}
                        >
                          <input
                            type="radio"
                            name="buyer_provider"
                            value={p.id}
                            checked={buyer.provider === p.id}
                            onChange={() => {
                              setBuyError(null)
                              setBuyer((b) => ({ ...b, provider: p.id }))
                            }}
                            className="h-4 w-4 shrink-0 accent-primary"
                          />
                          {p.label}
                        </label>
                      ))}
                    </div>
                  )}
                </fieldset>

                {countryOpen ? (
                  <>
                    <div className="space-y-1.5">
                      <Label htmlFor="buyer_phone">Numéro Mobile Money</Label>
                      <div className="flex">
                        <span className="inline-flex h-9 items-center rounded-l-md border border-r-0 border-input bg-muted px-3 text-sm tabular-nums text-muted-foreground">
                          {countryInfo.dial}
                        </span>
                        <Input
                          ref={buyerPhoneRef}
                          id="buyer_phone"
                          type="tel"
                          inputMode="tel"
                          autoComplete="tel-national"
                          placeholder={phoneSample(buyer.country, buyer.provider)}
                          value={buyer.phone}
                          onChange={(e) => setBuyer((b) => ({ ...b, phone: e.target.value }))}
                          disabled={busy}
                          required
                          maxLength={20}
                          aria-invalid={buyError?.field === 'phone' || undefined}
                          aria-describedby={sandbox ? 'buyer_phone_test' : undefined}
                          className="flex-1 rounded-l-none"
                        />
                      </div>
                      {sandbox ? (
                        <SandboxNote
                          disabled={busy}
                          onPick={(n) => {
                            setBuyError(null)
                            setBuyer((b) => sandboxTestBuyer(b, providers, n))
                          }}
                        />
                      ) : null}
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="buyer_name">Nom complet</Label>
                      <Input
                        ref={buyerNameRef}
                        id="buyer_name"
                        autoComplete="name"
                        value={buyer.name}
                        onChange={(e) => setBuyer((b) => ({ ...b, name: e.target.value }))}
                        disabled={busy}
                        required
                        minLength={2}
                        maxLength={120}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="buyer_email">E-mail (recommandé)</Label>
                      <Input
                        id="buyer_email"
                        type="email"
                        autoComplete="email"
                        value={buyer.email}
                        onChange={(e) => setBuyer((b) => ({ ...b, email: e.target.value }))}
                        disabled={busy}
                        maxLength={200}
                        aria-describedby="buyer_email_hint"
                      />
                      <p id="buyer_email_hint" className="text-xs text-muted-foreground">
                        Vous recevrez le reçu et le lien pour retélécharger.
                      </p>
                    </div>

                    {buyError ? (
                      <div ref={buyErrorRef} className="space-y-2">
                        <ErrorLine text={buyError.text} />
                        {buyError.tryOther && alternatives.length > 0 ? (
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="w-full text-xs text-muted-foreground">
                              Ou payez avec un autre opérateur :
                            </span>
                            {alternatives.map((p) => (
                              <Button
                                key={p.id}
                                type="button"
                                size="sm"
                                variant="outline"
                                onClick={() => switchProvider(p.id)}
                              >
                                {p.label}
                              </Button>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    ) : null}

                    <Button
                      type="submit"
                      className="w-full gap-2"
                      disabled={
                        busy ||
                        !buyer.provider ||
                        buyer.name.trim().length < 2 ||
                        buyer.phone.trim().length < 8
                      }
                      aria-busy={buying || undefined}
                    >
                      {buying ? (
                        <Spinner className="h-4 w-4" />
                      ) : (
                        <ShoppingCart className="h-4 w-4" />
                      )}
                      {buying
                        ? 'Envoi de la demande…'
                        : `Payer ${formatFcfa(fiche.price_non_member)}`}
                    </Button>
                    <p className="text-center text-xs text-muted-foreground">
                      Vous validez sur votre téléphone, sans quitter cette page. Des frais
                      d’opérateur peuvent s’ajouter.
                    </p>
                  </>
                ) : null}
              </form>
            )}

            {fiche.is_free_for_members ? (
              <form onSubmit={handleCard} className="space-y-2 border-t border-border pt-4">
                <div className="flex items-start gap-2">
                  <CreditCard className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <p className="text-sm">
                    <span className="font-medium text-foreground">{memberHint.lead}</span>{' '}
                    <span className="text-muted-foreground">{memberHint.rest}</span>
                  </p>
                </div>
                <Label htmlFor="card_number" className="sr-only">
                  Numéro de carte membre
                </Label>
                <div className="flex gap-2">
                  <Input
                    id="card_number"
                    placeholder="FH-2025-0001"
                    value={cardNumber}
                    onChange={(e) => setCardNumber(e.target.value)}
                    disabled={busy}
                    autoComplete="off"
                    maxLength={40}
                    aria-invalid={cardError ? true : undefined}
                    aria-describedby={cardError ? 'card_number_error' : undefined}
                    className="flex-1"
                  />
                  <Button
                    type="submit"
                    variant="outline"
                    disabled={busy || cardNumber.trim().length < 5}
                  >
                    {accessBusy ? <Spinner className="h-4 w-4" /> : null}
                    Utiliser ma carte
                  </Button>
                </div>
                {cardError ? (
                  <div id="card_number_error" className="space-y-2">
                    <ErrorLine text={cardError.text} />
                    {cardError.buy ? (
                      <Button
                        type="button"
                        variant="outline"
                        className="w-full gap-2"
                        onClick={goToPayment}
                      >
                        <ShoppingCart className="h-4 w-4" />
                        Acheter pour {formatFcfa(fiche.price_non_member)}
                      </Button>
                    ) : null}
                  </div>
                ) : null}
              </form>
            ) : (
              <p className="border-t border-border pt-4 text-xs text-muted-foreground">
                Cette fiche est payante pour tous.
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-1 border-b border-border pb-3">
              <p className="text-2xl font-bold text-foreground">Gratuit</p>
              <p className="text-xs text-muted-foreground">Proposé par {seller}</p>
              {contents ? (
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <FileText className="h-3.5 w-3.5 shrink-0" />
                  <span>{contents}</span>
                </p>
              ) : null}
            </div>
            {accessError ? <ErrorLine text={accessError} /> : null}
            <Button className="w-full gap-2" onClick={handleFree} disabled={accessBusy}>
              {accessBusy ? <Spinner className="h-4 w-4" /> : <Download className="h-4 w-4" />}
              Télécharger gratuitement
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

/**
 * Sandbox FedaPay seulement (jamais en live) : numéros de test officiels, pour
 * que le propriétaire puisse essayer le parcours. Un clic remplit le numéro et
 * passe au Bénin (FedaPay les associe au pays « bj »).
 */
function SandboxNote({ onPick, disabled }: { onPick: (n: string) => void; disabled?: boolean }) {
  return (
    <p
      id="buyer_phone_test"
      className="rounded-md border border-dashed border-border px-2.5 py-1.5 text-xs leading-6 text-muted-foreground"
    >
      <FlaskConical className="mr-1 inline h-3.5 w-3.5 align-[-2px] text-foreground" aria-hidden />
      <span className="font-medium text-foreground">Mode test :</span> paiement accepté avec les
      numéros du Bénin{' '}
      <TestNumber n={SANDBOX_TEST_NUMBERS[0]} onPick={onPick} disabled={disabled} /> ou{' '}
      <TestNumber n={SANDBOX_TEST_NUMBERS[1]} onPick={onPick} disabled={disabled} />, refusé avec
      tout autre numéro.
    </p>
  )
}

function TestNumber({
  n,
  onPick,
  disabled,
}: {
  n: string
  onPick: (n: string) => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onPick(n)}
      className="rounded bg-muted px-1.5 py-0.5 font-mono tabular-nums text-foreground hover:bg-muted/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
      aria-label={`Utiliser le numéro de test ${n}`}
    >
      {n}
    </button>
  )
}

/** Aucun opérateur proposé (FedaPay indisponible ou tous masqués) : pas de formulaire. */
function PaymentUnavailable({ message, title }: { message: string; title: string }) {
  return (
    <div className="space-y-3 rounded-xl border border-border bg-muted/40 p-4">
      <div className="flex items-start gap-3">
        <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
        <div className="space-y-1">
          <p className="font-semibold leading-snug text-foreground">{message}</p>
          <p className="text-sm text-muted-foreground">
            Pour acheter ce compte d’exploitation dès maintenant, contactez-nous : nous vous aidons
            à payer.
          </p>
        </div>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button asChild className="flex-1 gap-2">
          <a href={supportBuyWhatsappUrl(title)} target="_blank" rel="noopener noreferrer">
            <MessageCircle className="h-4 w-4" /> WhatsApp {SUPPORT_CONTACT.phone}
          </a>
        </Button>
        <Button asChild variant="outline" className="flex-1">
          <a href={`mailto:${SUPPORT_CONTACT.email}`}>{SUPPORT_CONTACT.email}</a>
        </Button>
      </div>
    </div>
  )
}

function ErrorLine({ text }: { text: string }) {
  return (
    <div
      role="alert"
      className="flex items-start gap-2 rounded-lg border border-destructive/20 bg-destructive/10 p-2.5"
    >
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
      <p className="text-sm text-destructive">{text}</p>
    </div>
  )
}
