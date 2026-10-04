import { createCheckout, createDirectPayment, isFedaPayConfigured } from '@/lib/payments/fedapay'
import { FEDAPAY_PROVIDER_IDS, FedaPayConfigError } from '@/lib/payments/fedapay-providers'
import { createClient as createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { createLogger } from '@/lib/utils/logger'
import { applyRateLimit } from '@/lib/utils/rate-limit-persistent'
import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

const log = createLogger('api:fiches:purchase')

const schema = z.object({
  name: z.string().trim().min(2).max(120),
  phone: z.string().trim().min(8).max(20),
  country: z.enum(['tg', 'bj']).default('tg'),
  email: z.string().trim().email().max(200).optional().or(z.literal('')),
  // Opérateur choisi : paiement direct sur le téléphone, sans quitter le site.
  // Absent → page de paiement FedaPay (cartes et autres moyens).
  provider: z.enum(FEDAPAY_PROVIDER_IDS).optional(),
})

/**
 * POST /api/fiches/[id]/purchase — acheter un compte d'exploitation.
 *
 * Crée l'achat (en attente) puis la transaction FedaPay, et renvoie le lien de
 * paiement. L'achat n'ouvre l'accès qu'après vérification du paiement auprès de
 * FedaPay (lib/fiches/purchases.ts). Compte connecté (SaaS ou Haroo) : l'achat
 * lui est rattaché et reste retrouvable dans « Mes achats ».
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
    return NextResponse.json(
      { error: 'Nom et téléphone requis', details: parsed.error.flatten().fieldErrors },
      { status: 400 },
    )
  }

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

  const { name, phone, country } = parsed.data
  const email = parsed.data.email || user?.email || null
  const { data: purchase, error } = await admin
    .from('purchases')
    .insert({
      fiche_id: fiche.id,
      amount: fiche.price_non_member,
      currency: 'XOF',
      payment_status: 'pending',
      access_granted: false,
      buyer_name: name,
      buyer_phone: phone,
      buyer_email: email,
      user_id: user?.id ?? null,
      provider: 'fedapay',
    })
    .select('id')
    .single<{ id: string }>()
  if (error || !purchase) {
    log.error('Purchase insert failed', error)
    return NextResponse.json({ error: 'Achat impossible pour le moment' }, { status: 500 })
  }

  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin).replace(/\/$/, '')
  const description = `Compte d'exploitation — ${fiche.title}`
  const callbackUrl = `${appUrl}/api/payments/fedapay/return?purchase=${purchase.id}`
  if (parsed.data.provider) {
    try {
      // Montant : toujours celui de la fiche en base, jamais celui du client.
      const direct = await createDirectPayment({
        amount: fiche.price_non_member,
        description,
        callbackUrl,
        provider: parsed.data.provider,
        customer: { name, email, phone, country },
      })
      await admin
        .from('purchases')
        .update({
          provider_transaction_id: String(direct.transactionId),
          updated_at: new Date().toISOString(),
        })
        .eq('id', purchase.id)
      log.info('FedaPay direct payment requested', {
        purchaseId: purchase.id,
        userProvider: parsed.data.provider,
        resolvedMode: direct.mode,
      })
      return NextResponse.json({ purchase_id: purchase.id, direct: true })
    } catch (e) {
      const config = e instanceof FedaPayConfigError
      log.error('FedaPay direct payment failed', { error: (e as Error).message })
      await admin.from('purchases').update({ payment_status: 'failed' }).eq('id', purchase.id)
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

  try {
    const checkout = await createCheckout({
      amount: fiche.price_non_member,
      description,
      callbackUrl,
      customer: { name, email, phone, country },
    })
    await admin
      .from('purchases')
      .update({
        provider_transaction_id: String(checkout.transactionId),
        updated_at: new Date().toISOString(),
      })
      .eq('id', purchase.id)
    return NextResponse.json({ url: checkout.url, purchase_id: purchase.id })
  } catch (e) {
    log.error('FedaPay checkout failed', { error: (e as Error).message })
    await admin.from('purchases').update({ payment_status: 'failed' }).eq('id', purchase.id)
    return NextResponse.json(
      { error: 'Le service de paiement ne répond pas. Réessayez.' },
      { status: 502 },
    )
  }
}
