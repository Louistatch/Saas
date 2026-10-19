import {
  PENDING_LOCK_MS,
  PENDING_ROW_COLS,
  type PendingPurchaseRow,
  UNIQUE_VIOLATION,
  isSameBuyer,
  minutesBeforeNewRequest,
  pendingAgeMs,
  pickRival,
} from '@/lib/fiches/pending-claim'
import { mobileMoneyPhoneKey, normalizeMobileMoneyPhone } from '@/lib/fiches/phone'
import {
  FedaPaySendRejectedError,
  createDirectPayment,
  fedaPayDisabledProviders,
  fedaPayEnv,
  isFedaPayConfigured,
} from '@/lib/payments/fedapay'
import {
  FEDAPAY_PROVIDER_IDS,
  FedaPayConfigError,
  resolveFedaPayMode,
} from '@/lib/payments/fedapay-providers'
import { createClient as createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { createLogger } from '@/lib/utils/logger'
import { clientKeyFromHeaders, rateLimit } from '@/lib/utils/rate-limit'
import { applyRateLimit } from '@/lib/utils/rate-limit-persistent'
import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

const log = createLogger('api:fiches:purchase')

const schema = z.object({
  name: z.string().trim().min(2).max(120),
  phone: z.string().trim().min(8).max(20),
  country: z.enum(['tg', 'bj']).default('tg'),
  email: z.string().trim().email().max(200).optional().or(z.literal('')),
  // Opérateur choisi, OBLIGATOIRE : le paiement est toujours direct, sur le
  // téléphone, sans quitter le site (plus de page de paiement FedaPay).
  provider: z.enum(FEDAPAY_PROVIDER_IDS),
  // Achat en cours gardé par la fenêtre (localStorage) : reprise sans nouvelle
  // demande de paiement. L'id d'achat sert de jeton : il n'est JAMAIS renvoyé
  // à qui ne le connaît pas déjà.
  resume_purchase_id: z.string().uuid().optional(),
})

/** Limites anti-abus (mémoire, en plus d'Upstash quand il est configuré). */
const IP_LIMIT = { max: 5, windowMs: 10 * 60_000 }
const PHONE_LIMIT = { max: 3, windowMs: 15 * 60_000 }

const tooMany = () =>
  NextResponse.json(
    { error: 'Trop de tentatives de paiement. Réessayez dans quelques minutes.' },
    { status: 429 },
  )

/**
 * Paiement déjà en cours pour ce numéro : sans l'id de l'achat (jeton
 * d'accès), mais en disant quand une nouvelle demande sera possible.
 */
const alreadyInFlight = (createdAt?: string | null) =>
  NextResponse.json(
    {
      error: `Une demande de paiement est déjà en cours pour ce numéro : validez-la sur votre téléphone. Pour en recevoir une nouvelle, réessayez dans ${minutesBeforeNewRequest(createdAt)} min ou payez avec un autre numéro.`,
    },
    { status: 409 },
  )

type AdminClient = ReturnType<typeof createAdminClient>

type Claim =
  /** Notre achat, seul en cours : lui seul envoie la demande à FedaPay. */
  | { kind: 'owner'; id: string }
  /** Un autre achat en cours passe avant : aucun appel à FedaPay. */
  | { kind: 'rival'; rival: PendingPurchaseRow }
  /** Place prise, achat gagnant introuvable : on refuse sans rien envoyer. */
  | { kind: 'busy' }
  | { kind: 'error'; error: unknown }

/**
 * Paiement déjà lancé (même fenêtre, 2e onglet) : on rend son id, sans rien
 * envoyer. PAS de `direct` : aucune NOUVELLE demande n'est partie au téléphone
 * (et un achat créé avant la fin de la page FedaPay peut encore être repris),
 * la fenêtre l'affiche en conséquence (« déjà en cours »).
 */
const resumed = (purchaseId: string) =>
  NextResponse.json({ purchase_id: purchaseId, resumed: true })

/**
 * Insère l'achat « pending » et vérifie qu'il est le SEUL en cours pour cette
 * fiche et ce numéro (lib/fiches/pending-claim.ts). Atomique grâce à l'index
 * unique purchases_one_pending_request_uidx : une 2e insertion simultanée
 * échoue (23505) et reprend l'achat gagnant. Sans l'index (migration pas
 * encore appliquée), la relecture après insertion départage au mieux.
 */
async function claimPendingPurchase(
  admin: AdminClient,
  row: { fiche_id: string; buyer_phone: string } & Record<string, unknown>,
): Promise<Claim> {
  const since = () => new Date(Date.now() - PENDING_LOCK_MS).toISOString()
  const readPending = async (): Promise<PendingPurchaseRow[]> => {
    const { data, error } = await admin
      .from('purchases')
      .select(PENDING_ROW_COLS)
      .eq('fiche_id', row.fiche_id)
      .eq('buyer_phone', row.buyer_phone)
      .eq('payment_status', 'pending')
      .gte('created_at', since())
      .order('created_at', { ascending: true })
      .limit(20)
    if (error) throw new Error(`Relecture des achats en cours impossible : ${error.message}`)
    return (data ?? []) as PendingPurchaseRow[]
  }
  const markFailed = (purchaseId: string) =>
    admin
      .from('purchases')
      .update({ payment_status: 'failed', updated_at: new Date().toISOString() })
      .eq('id', purchaseId)
      .eq('payment_status', 'pending')
      .is('provider_transaction_id', null)

  let mine: { id: string; created_at: string } | null = null
  try {
    for (let attempt = 0; attempt < 2; attempt++) {
      const { data, error } = await admin
        .from('purchases')
        .insert(row)
        .select('id, created_at')
        .single<{ id: string; created_at: string }>()
      if (error?.code === UNIQUE_VIOLATION) {
        // Une autre requête crée en ce moment la demande de paiement de ce
        // numéro : on reprend son achat, sans rien envoyer à FedaPay.
        const rival = pickRival(await readPending(), null)
        if (rival) return { kind: 'rival', rival }
        // Place tenue par un achat sans transaction de plus de 15 min : sa
        // requête n'existe plus (une fonction s'arrête bien avant) et, sans
        // transaction, il ne peut pas être payé. Il passe en échec, comme le
        // ferait le cron de rapprochement, puis on réessaie une fois.
        await admin
          .from('purchases')
          .update({ payment_status: 'failed', updated_at: new Date().toISOString() })
          .eq('fiche_id', row.fiche_id)
          .eq('buyer_phone', row.buyer_phone)
          .eq('payment_status', 'pending')
          .is('provider_transaction_id', null)
          .lt('created_at', since())
        continue
      }
      if (error || !data) return { kind: 'error', error }
      mine = data
      // Relecture APRÈS l'insertion : une requête arrivée juste après que la
      // première a enregistré sa transaction (sortie de l'index) la voit ici.
      const rival = pickRival(await readPending(), mine)
      if (!rival) return { kind: 'owner', id: mine.id }
      await markFailed(mine.id)
      return { kind: 'rival', rival }
    }
    return { kind: 'busy' }
  } catch (e) {
    // Relecture impossible : dans le doute, aucune demande de paiement.
    if (mine) await markFailed(mine.id)
    return { kind: 'error', error: e }
  }
}

/**
 * POST /api/fiches/[id]/purchase — acheter un compte d'exploitation.
 *
 * Paiement TOUJOURS direct : l'acheteur ne quitte jamais le site (ni
 * redirection, ni nouvel onglet, ni iframe FedaPay). Crée l'achat (en attente)
 * puis la transaction FedaPay, et envoie la demande de paiement sur le
 * téléphone ; la réponse ne contient jamais de lien FedaPay. La fenêtre suit
 * ensuite l'achat par GET /api/purchases/[id]. L'achat n'ouvre l'accès
 * qu'après vérification du paiement auprès de FedaPay (lib/fiches/purchases.ts).
 * Compte connecté (SaaS ou Haroo) : l'achat lui est rattaché et reste
 * retrouvable dans « Mes achats ».
 *
 * Réponses : 200 { purchase_id, direct: true } (demande envoyée),
 * { purchase_id, resumed: true } (paiement de moins de 15 min repris),
 * { purchase_id, already: true } (déjà acheté) ; 502 { error, purchase_id }
 * (demande incertaine : la fenêtre la suit) ; sinon { error, details? }.
 *
 * Avant tout enregistrement : opérateur choisi, numéro Mobile Money normalisé,
 * opérateur disponible (environnement FedaPay, FEDAPAY_DISABLED_PROVIDERS),
 * limites par IP et par numéro, et pas de double achat (achat déjà réglé
 * réutilisé, paiement en cours repris ou bloquant). Une seule demande de
 * paiement à la fois par fiche et par numéro, même pour deux requêtes
 * simultanées : voir claimPendingPurchase.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const limited = await applyRateLimit(request, 'marketplace')
  if (limited) return limited
  const { id } = await params
  if (!/^[0-9a-f-]{36}$/i.test(id))
    return NextResponse.json({ error: 'Fiche invalide' }, { status: 400 })
  if (!isFedaPayConfigured()) {
    return NextResponse.json(
      { error: 'Le paiement en ligne n’est pas encore disponible.' },
      { status: 503 },
    )
  }

  const parsed = schema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    const details = parsed.error.flatten().fieldErrors
    // Seul l'opérateur manque (ou est inconnu) : on le dit, plutôt qu'un
    // « Nom et téléphone requis » trompeur.
    const onlyProvider = Object.keys(details).every((k) => k === 'provider') && details.provider
    const providerMessage = 'Choisissez votre opérateur Mobile Money.'
    return NextResponse.json(
      {
        error: onlyProvider ? providerMessage : 'Nom et téléphone requis',
        details: details.provider ? { ...details, provider: [providerMessage] } : details,
      },
      { status: 400 },
    )
  }
  const { name, country, provider } = parsed.data

  // `phone` : numéro national CANONIQUE envoyé à FedaPay (lib/fiches/phone.ts) :
  // Bénin toujours à 10 chiffres (64000001 saisi → 0164000001 envoyé), Togo à 8.
  // `phoneKey` : la ligne, avec son pays — seule clé enregistrée et comparée :
  // 97 00 00 01 et 01 97 00 00 01 au Bénin sont la même ligne ; 97 00 00 03 au
  // Togo et au Bénin, deux lignes.
  const phone = normalizeMobileMoneyPhone(country, parsed.data.phone)
  if (!phone) {
    return NextResponse.json(
      {
        error: 'Numéro Mobile Money invalide',
        details: {
          phone: [
            country === 'bj'
              ? 'Numéro béninois : 8 chiffres, ou 10 chiffres commençant par 01, sans l’indicatif +229.'
              : 'Numéro togolais : 8 chiffres, sans l’indicatif +228.',
          ],
        },
      },
      { status: 400 },
    )
  }
  const phoneKey = mobileMoneyPhoneKey(country, phone)

  // Opérateur résolu AVANT l'insertion : un opérateur d'un autre pays ou
  // masqué (FEDAPAY_DISABLED_PROVIDERS) ne crée aucune ligne.
  let environment: ReturnType<typeof fedaPayEnv>
  try {
    environment = fedaPayEnv()
  } catch (e) {
    log.error('FedaPay environment misconfigured', { error: (e as Error).message })
    return NextResponse.json(
      { error: 'Le paiement en ligne n’est pas disponible pour le moment. Réessayez plus tard.' },
      { status: 503 },
    )
  }
  try {
    resolveFedaPayMode({
      environment,
      selectedProvider: provider,
      country,
      disabled: fedaPayDisabledProviders(),
    })
  } catch (e) {
    if (!(e instanceof FedaPayConfigError)) throw e
    return NextResponse.json(
      { error: e.message, details: { provider: [e.message] } },
      { status: 400 },
    )
  }

  // applyRateLimit ne fait rien sans Upstash : limite mémoire toujours active.
  const ip = clientKeyFromHeaders(request.headers)
  if (!rateLimit(`fiche-buy:${ip}`, IP_LIMIT.max, IP_LIMIT.windowMs).ok) return tooMany()

  const admin = createAdminClient()
  const { data: fiche } = await admin
    .from('fiches_techniques')
    .select('id, title, price_non_member, currency, status')
    .eq('id', id)
    .maybeSingle<{
      id: string
      title: string
      price_non_member: number
      currency: string
      status: string
    }>()
  if (!fiche || fiche.status !== 'published')
    return NextResponse.json({ error: 'Fiche introuvable' }, { status: 404 })
  if (!(fiche.price_non_member > 0)) {
    return NextResponse.json(
      { error: 'Cette fiche est gratuite : téléchargez-la directement.' },
      { status: 400 },
    )
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // (a) Déjà acheté par ce compte : on renvoie l'achat réglé, sans nouveau paiement.
  if (user) {
    const { data: owned } = await admin
      .from('purchases')
      .select('id')
      .eq('fiche_id', fiche.id)
      .eq('user_id', user.id)
      .eq('payment_status', 'completed')
      .eq('access_granted', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle<{ id: string }>()
    if (owned) return NextResponse.json({ purchase_id: owned.id, already: true })
  }

  // (b) Reprise d'un paiement en cours que la fenêtre connaît déjà (même
  // fiche, même numéro) : aucune nouvelle demande au téléphone. Seulement
  // pendant PENDING_LOCK_MS : au-delà (demande jamais arrivée, manquée, ou
  // achat de l'ancienne page FedaPay), l'acheteur reçoit une NOUVELLE demande
  // (étapes c-d) ; l'ancien achat reste réglé d'après FedaPay (cron).
  // La fenêtre n'envoie pas resume_purchase_id pour une relance explicite.
  if (parsed.data.resume_purchase_id) {
    const { data: previous } = await admin
      .from('purchases')
      .select('id, fiche_id, buyer_phone, payment_status, provider_transaction_id, created_at')
      .eq('id', parsed.data.resume_purchase_id)
      .maybeSingle<{
        id: string
        fiche_id: string
        buyer_phone: string | null
        payment_status: string
        provider_transaction_id: string | null
        created_at: string | null
      }>()
    if (
      previous &&
      previous.payment_status === 'pending' &&
      previous.fiche_id === fiche.id &&
      previous.buyer_phone === phoneKey &&
      previous.provider_transaction_id &&
      pendingAgeMs(previous.created_at) < PENDING_LOCK_MS
    )
      return resumed(previous.id)
  }

  // (c) Un paiement en attente récent pour ce numéro bloque une nouvelle
  // demande. On ne renvoie PAS son id : quiconque connaît le numéro le
  // récupérerait, or l'id d'achat sert de jeton d'accès.
  const { data: inFlight } = await admin
    .from('purchases')
    .select('id, created_at')
    .eq('fiche_id', fiche.id)
    .eq('buyer_phone', phoneKey)
    .eq('payment_status', 'pending')
    .gte('created_at', new Date(Date.now() - PENDING_LOCK_MS).toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle<{ id: string; created_at: string | null }>()
  if (inFlight) return alreadyInFlight(inFlight.created_at)

  // Au plus 3 demandes de paiement par numéro et par quart d'heure : sans
  // cette limite, n'importe qui pourrait inonder un téléphone de demandes USSD.
  if (!rateLimit(`fiche-buy-phone:${phoneKey}`, PHONE_LIMIT.max, PHONE_LIMIT.windowMs).ok)
    return tooMany()

  // E-mail en minuscules : c'est la clé de rapprochement de « Mes achats ».
  const email = (parsed.data.email || user?.email || '').trim().toLowerCase() || null
  // (d) Le contrôle (c) ne suffit pas : deux requêtes simultanées (double clic,
  // deux onglets) le passent toutes les deux. La base tranche : une seule
  // insertion devient l'achat en cours, l'autre le reprend sans rien envoyer.
  const claim = await claimPendingPurchase(admin, {
    fiche_id: fiche.id,
    amount: fiche.price_non_member,
    currency: 'XOF',
    payment_status: 'pending',
    access_granted: false,
    buyer_name: name,
    buyer_phone: phoneKey,
    buyer_email: email,
    user_id: user?.id ?? null,
    provider: 'fedapay',
  })
  if (claim.kind === 'error') {
    // Rien n'a été envoyé à FedaPay (achat créé repassé en échec) : réessayer est sans risque.
    log.error('Purchase insert failed', claim.error)
    return NextResponse.json(
      { error: 'Achat impossible pour le moment. Réessayez dans quelques minutes.' },
      { status: 500 },
    )
  }
  if (claim.kind === 'busy') return alreadyInFlight()
  if (claim.kind === 'rival') {
    // Même acheteur (même fenêtre ou 2e onglet) : même réponse que la reprise (b).
    if (isSameBuyer(claim.rival, { name, email, userId: user?.id ?? null })) {
      log.info('Concurrent purchase request resumed', { purchaseId: claim.rival.id })
      return resumed(claim.rival.id)
    }
    return alreadyInFlight(claim.rival.created_at)
  }
  // Seule la requête qui possède l'achat tout juste inséré parle à FedaPay.
  const purchase = { id: claim.id }

  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin).replace(/\/$/, '')
  const description = `Compte d'exploitation — ${fiche.title}`
  // callback_url (facultatif chez FedaPay) : en paiement direct l'acheteur n'y
  // est jamais envoyé. Conservé tel quel ; la route de retour reste active pour
  // les achats créés autrefois par la page FedaPay.
  const callbackUrl = `${appUrl}/api/payments/fedapay/return?purchase=${purchase.id}`
  // Objet (et non booléen) : l'écriture a lieu dans un rappel.
  const tx = { recorded: false }
  try {
    // Montant : toujours celui de la fiche en base, jamais celui du client.
    const direct = await createDirectPayment({
      amount: fiche.price_non_member,
      description,
      callbackUrl,
      provider,
      customer: { name, email, phone, country },
      // Relu au règlement : la transaction doit viser CET achat et CETTE fiche.
      metadata: { purchase_id: purchase.id, fiche_id: fiche.id },
      // L'id de transaction est écrit DÈS sa création : si l'envoi au
      // téléphone échoue ensuite, l'achat reste rattachable par le webhook,
      // le retour navigateur et le cron de rapprochement.
      onCreated: async (transactionId) => {
        const { data: linked, error: txError } = await admin
          .from('purchases')
          .update({
            provider_transaction_id: String(transactionId),
            updated_at: new Date().toISOString(),
          })
          .eq('id', purchase.id)
          .eq('payment_status', 'pending')
          .select('id')
        if (txError)
          throw new Error(`Enregistrement de la transaction impossible : ${txError.message}`)
        // Achat plus « pending » : il n'est plus à nous, rien ne part au téléphone.
        if (!linked?.length) throw new Error('Achat plus en attente : demande annulée')
        tx.recorded = true
      },
    })
    log.info('FedaPay direct payment requested', {
      purchaseId: purchase.id,
      userProvider: provider,
      resolvedMode: direct.mode,
    })
    return NextResponse.json({ purchase_id: purchase.id, direct: true })
  } catch (e) {
    log.error('FedaPay direct payment failed', {
      purchaseId: purchase.id,
      txRecorded: tx.recorded,
      error: (e as Error).message,
    })
    if (tx.recorded && e instanceof FedaPaySendRejectedError) {
      // Envoi REFUSÉ net par FedaPay (4xx) : rien n'est parti au téléphone.
      // L'achat passe en échec (il libère le numéro) ; il garde sa
      // transaction, donc reste relu (webhook, cron) si FedaPay l'approuvait.
      await admin
        .from('purchases')
        .update({ payment_status: 'failed', updated_at: new Date().toISOString() })
        .eq('id', purchase.id)
        .eq('payment_status', 'pending')
      return NextResponse.json(
        {
          error:
            'L’opérateur a refusé la demande. Vérifiez le numéro et l’opérateur choisi, puis réessayez.',
        },
        { status: 502 },
      )
    }
    if (tx.recorded) {
      // La transaction existe chez FedaPay : la demande a pu partir malgré
      // l'erreur (délai, 5xx). L'achat reste « pending » ; settlePurchase et
      // le cron trancheront d'après FedaPay, et la fenêtre continue le suivi.
      return NextResponse.json(
        {
          error:
            'L’opérateur n’a pas confirmé la demande. Si elle arrive sur votre téléphone, validez-la : le paiement sera pris en compte.',
          purchase_id: purchase.id,
        },
        { status: 502 },
      )
    }
    const config = e instanceof FedaPayConfigError
    await admin
      .from('purchases')
      .update({ payment_status: 'failed', updated_at: new Date().toISOString() })
      .eq('id', purchase.id)
      .eq('payment_status', 'pending')
    return NextResponse.json(
      {
        error: config
          ? (e as Error).message
          : 'L’opérateur n’a pas pu lancer le paiement. Vérifiez le numéro et réessayez.',
      },
      { status: config ? 400 : 502 },
    )
  }
}
