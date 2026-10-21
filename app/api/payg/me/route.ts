// Contexte PAYG du compte courant : ses opérateurs, son rôle, le portefeuille partagé, les
// coopératives qu'il peut servir, sa formation et la grille tarifaire en vigueur.

import { CARD_COMMISSION_FCFA, CREDIT_PACKS, INDICATIVE_CARD_PRICES } from '@/lib/payg/model'
import {
  cooperativesFor,
  ensureTrainingAccount,
  getPaygContext,
  membershipSummary,
  walletOf,
} from '@/lib/payg/server'
import { type NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const ctx = await getPaygContext()
  if (!ctx) return NextResponse.json({ error: 'Connexion requise' }, { status: 401 })
  const wanted = new URL(request.url).searchParams.get('partner_id')
  const membership =
    ctx.memberships.find((m) => m.partnerId === wanted) ??
    ctx.memberships.find((m) => m.status === 'active') ??
    ctx.memberships[0]

  const { data: rules } = await ctx.admin
    .from('billing_rules')
    .select('code, price_xof, metadata')
    .in('code', [
      'card_commission',
      'credit_pack_20',
      'credit_pack_40',
      'credit_pack_100',
      'training_fee',
    ])
    .eq('active', true)
    .is('effective_to', null)
  const rule = (code: string) => rules?.find((r) => r.code === code)
  const pricing = {
    commission_fcfa: rule('card_commission')?.price_xof ?? CARD_COMMISSION_FCFA,
    packs: CREDIT_PACKS.map((p) => ({
      code: p.code,
      credits: Number(
        (rule(p.code)?.metadata as { credits?: number } | null)?.credits ?? p.credits,
      ),
      price_fcfa: rule(p.code)?.price_xof ?? p.priceFcfa,
    })),
    training_fcfa: rule('training_fee')?.price_xof ?? 15000,
    card_prices: INDICATIVE_CARD_PRICES,
  }

  const { data: certification } = await ctx.admin
    .from('partner_certifications')
    .select('partner_id, training_completed_at, exam_passed_at, certified_at')
    .eq('user_id', ctx.userId)
    .maybeSingle()
  // Dossier ouvert par l'inscription Opérateur existante : son compte de formation est créé
  // à la première lecture (une seule fois, contrainte UNIQUE sur la personne).
  const training = certification?.partner_id
    ? await ensureTrainingAccount(ctx.admin, ctx.userId, certification.partner_id)
    : null

  if (!membership) {
    return NextResponse.json({
      user_id: ctx.userId,
      is_super_admin: ctx.isSuperAdmin,
      memberships: [],
      pricing,
      training,
      certification,
    })
  }

  const [wallet, cooperatives] = await Promise.all([
    walletOf(ctx.admin, membership.partnerId),
    cooperativesFor(ctx.admin, ctx.userId, membership),
  ])

  return NextResponse.json({
    user_id: ctx.userId,
    is_super_admin: ctx.isSuperAdmin,
    memberships: ctx.memberships.map((m) => ({
      partner_id: m.partnerId,
      display_name: m.displayName,
      kind: m.kind,
      role: m.role,
      status: m.status,
    })),
    current: membershipSummary(ctx, membership),
    wallet: {
      credit_balance: wallet.creditBalance,
      welcome_credits: wallet.welcomeCredits,
      welcome_granted: Boolean(wallet.welcomeGrantedAt),
    },
    cooperatives,
    pricing,
    training,
    certification,
  })
}
