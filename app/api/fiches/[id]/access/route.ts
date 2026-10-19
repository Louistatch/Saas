import {
  FICHES_BUCKET,
  safeDownloadName,
  storagePathOf,
  validateFichePath,
} from '@/lib/fiches/files'
import {
  cardCallerOf,
  decideMemberFree,
  isKnownInactiveCard,
  memberFreeDenialMessage,
} from '@/lib/fiches/member-scope'
import { requirePrivateCard } from '@/lib/security/card-access'
import { createClient as createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { createLogger } from '@/lib/utils/logger'
import { clientKeyFromHeaders, rateLimit } from '@/lib/utils/rate-limit'
import { type NextRequest, NextResponse } from 'next/server'

const log = createLogger('api:fiches:access')

const FICHE_COLS =
  'id, title, culture, files, cooperative_id, is_free_for_members, price_non_member, download_count, canton_id, prefecture_id, region_id'

interface AccessFiche {
  id: string
  title: string
  culture: string
  files: { name: string; url: string; type: string }[] | null
  cooperative_id: string | null
  is_free_for_members: boolean
  price_non_member: number | null
}

/**
 * Les fichiers sont dans un bucket PRIVÉ : seule une URL signée, émise ici
 * après contrôle d'accès, permet de les télécharger. Validité une heure, nom
 * de téléchargement = nom d'origine (nettoyé).
 *
 * Signé avec le client de service : l'accès a déjà été décidé ici (gratuité,
 * carte, ou achat réglé). Un chemin hors du dossier du propriétaire de la
 * fiche (`plateforme/` ou `<cooperative_id>/`) est ignoré et journalisé : la
 * clé de service ne doit jamais signer le fichier d'un autre vendeur.
 */
async function signFiles(fiche: AccessFiche) {
  const storage = createAdminClient().storage.from(FICHES_BUCKET)
  const scope = {
    platform: fiche.cooperative_id === null,
    cooperativeId: fiche.cooperative_id,
    ficheId: fiche.id,
  }
  const signed = await Promise.all(
    (fiche.files ?? []).map(async (f) => {
      const path = storagePathOf(f.url)
      if (!validateFichePath(path, scope)) {
        log.warn('Fiche file path outside owner folder, skipped', { ficheId: fiche.id, path })
        return null
      }
      const name = safeDownloadName(f.name)
      const { data, error } = await storage.createSignedUrl(path, 3600, { download: name })
      if (!data?.signedUrl) {
        log.error('Fiche file signing failed', { ficheId: fiche.id, path, message: error?.message })
        return { name: f.name, type: f.type, url: null, error: 'Fichier indisponible' }
      }
      return { name: f.name, type: f.type, url: data.signedUrl }
    }),
  )
  return signed.filter((f): f is NonNullable<typeof f> => f !== null)
}

/** Compteur atomique, appelé avec le client de service (plus exécutable par anon). */
async function countDownload(ficheId: string) {
  const { error } = await createAdminClient().rpc('increment_download_count', {
    target_fiche_id: ficheId,
  })
  if (error) log.error('Download count increment failed', { ficheId, message: error.message })
}

const granted = async (fiche: AccessFiche, reason: 'free' | 'member' | 'purchase') => {
  await countDownload(fiche.id)
  return NextResponse.json({
    access: 'granted',
    reason,
    fiche: { id: fiche.id, title: fiche.title, culture: fiche.culture },
    files: await signFiles(fiche),
  })
}

const PURCHASE_ID_RE =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/

/**
 * POST /api/fiches/[id]/access
 * - Achat réglé (purchase_id) → accès, MÊME si la fiche a depuis été retirée
 *   de la vente (archivée) : ce qui est payé reste téléchargeable.
 * - Fiche publiée gratuite → accès libre.
 * - Carte active (compte ou session de carte) → accès si la fiche est gratuite
 *   pour les membres ET que la carte y a droit : fiche d'une faîtière → carte
 *   de coopérative de son arbre ; fiche de la plateforme → toute carte active.
 *   Toujours pour son TITULAIRE seulement (pas un admin qui peut la lire).
 * - Carte connue mais suspendue, révoquée ou expirée → 402 « achetez-le ».
 * Renvoie des URL de téléchargement signées.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  // Rate limiting to prevent card_number brute-force
  const clientKey = clientKeyFromHeaders(request.headers)
  const limit = rateLimit(`fiches-access:${clientKey}`, 20, 60_000)
  if (!limit.ok) {
    return NextResponse.json({ error: 'Trop de tentatives' }, { status: 429 })
  }

  const { id: ficheId } = await params
  let body: { card_number?: string; purchase_id?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }

  try {
    // 1. Achat : vérifié AVANT la fiche, et la fiche est ensuite lue sans
    //    filtre de statut (une ligne supprimée → 404).
    //    Client de service : les achats ne sont pas lisibles par un visiteur
    //    anonyme, et l'id d'achat aléatoire sert ici de jeton.
    let purchaseRefused = false
    if (body.purchase_id) {
      const purchaseId = String(body.purchase_id).trim()
      if (!PURCHASE_ID_RE.test(purchaseId)) {
        return NextResponse.json({ error: 'ID achat invalide' }, { status: 400 })
      }
      const admin = createAdminClient()
      const { data: purchase } = await admin
        .from('purchases')
        .select('id, payment_status, access_granted')
        .eq('id', purchaseId)
        .eq('fiche_id', ficheId)
        .eq('payment_status', 'completed')
        .maybeSingle<{ id: string; payment_status: string; access_granted: boolean }>()
      if (purchase?.access_granted) {
        // Aucun filtre de statut : publiée, archivée ou repassée en brouillon,
        // une fiche payée reste téléchargeable tant que sa ligne existe.
        const { data: bought } = await admin
          .from('fiches_techniques')
          .select(FICHE_COLS)
          .eq('id', ficheId)
          .maybeSingle<AccessFiche>()
        if (!bought) return NextResponse.json({ error: 'Fiche non trouvée' }, { status: 404 })
        return granted(bought, 'purchase')
      }
      purchaseRefused = true
    }

    // 2. Gratuité et carte membre : fiche PUBLIÉE uniquement.
    const supabase = await createClient()
    const { data: fiche, error: ficheError } = await supabase
      .from('fiches_techniques')
      .select(FICHE_COLS)
      .eq('id', ficheId)
      .eq('status', 'published')
      .maybeSingle<AccessFiche>()

    if (ficheError || !fiche) {
      return NextResponse.json({ error: 'Fiche non trouvée' }, { status: 404 })
    }

    // Gratuit au lancement : un prix nul vaut accès libre, sans carte ni achat.
    // Le choix est porté par la DONNÉE (price_non_member), pas par une variable
    // d'environnement : la gratuité se lève fiche par fiche le jour où la vente
    // démarre, sans redéploiement et sans code mort à retirer.
    if ((fiche.price_non_member ?? 0) <= 0) return granted(fiche, 'free')

    // Au-delà d'ici, une fiche est payante : il faut une carte ou un achat.
    // `reason: 'not_free'` : la boutique, en cache quelques minutes, peut encore
    // montrer 0 FCFA ; la fenêtre d'achat dit alors de recharger la page.
    if (!body.card_number && !body.purchase_id) {
      return NextResponse.json(
        { error: 'card_number ou purchase_id requis', reason: 'not_free' },
        { status: 400 },
      )
    }

    let memberDenial: { reason: string; message: string } | null = null
    if (body.card_number) {
      const cardNumber = String(body.card_number).trim()
      if (cardNumber.length < 5) {
        return NextResponse.json({ error: 'Numéro de carte invalide' }, { status: 400 })
      }

      // Le numéro de carte est PUBLIC (QR, page de scan) : il ne prouve pas que
      // l'on tient la carte. Une fiche payante exige donc un compte connecté ou
      // une session de carte (PIN / code SMS) — requirePrivateCard les contrôle
      // et vérifie aussi que la carte est active et non expirée.
      const access = await requirePrivateCard(cardNumber)
      if (access.ok) {
        const card = access.card

        // Gratuité membres (lib/fiches/member-scope.ts) : fiche d'une faîtière →
        // carte de coopérative active de SON arbre ; fiche de la plateforme →
        // toute carte active ; pour son titulaire seulement. Relu par le client
        // de service ; refus au moindre doute.
        const decision = await decideMemberFree(
          fiche,
          cardNumber,
          card.member_id ?? null,
          cardCallerOf(access),
        )
        if (decision.free) {
          await access.supabase.from('member_access_logs').insert({
            card_number: cardNumber,
            member_id: card.member_id,
            cooperative_id: card.cooperative_id,
            fiche_id: ficheId,
            action: 'download',
          })
          return granted(fiche, 'member')
        }
        memberDenial = { reason: decision.reason, message: decision.message }
        if (decision.reason === 'lookup_failed') {
          log.error('Member scope lookup failed, access denied', { ficheId })
        }
      } else if (await isKnownInactiveCard(cardNumber)) {
        // requirePrivateCard ne laisse passer qu'une carte active : une carte
        // suspendue, révoquée ou expirée finirait dans une connexion par carte
        // vouée à l'échec. On dit plutôt pourquoi, et on renvoie vers l'achat.
        if (fiche.is_free_for_members) {
          memberDenial = {
            reason: 'card_inactive',
            message: memberFreeDenialMessage('card_inactive', null),
          }
        }
      } else {
        // Carte active sans preuve qu'on la tient : connexion (compte ou code SMS).
        return NextResponse.json(
          { error: 'Connectez-vous avec votre carte pour télécharger cette fiche.' },
          { status: 401 },
        )
      }
    }

    if (purchaseRefused) {
      return NextResponse.json(
        { error: 'Achat non trouvé ou paiement en attente' },
        { status: 403 },
      )
    }

    // Carte valide mais pas gratuite pour ELLE : renvoyer vers l'achat, en disant pourquoi.
    return NextResponse.json(
      {
        access: 'denied',
        reason: memberDenial?.reason ?? 'not_member_free',
        price: fiche.price_non_member,
        currency: 'XOF',
        message:
          memberDenial?.message ??
          'Cette fiche n’est pas gratuite pour les membres : achetez-la ci-dessus.',
      },
      { status: 402 },
    )
  } catch (error) {
    log.error('Fiche access error', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
