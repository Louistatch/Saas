// Solde et relevé du portefeuille PAYG du compte courant — lecture seule.

import { NextResponse } from 'next/server'
import { getPartnerContext } from '@/lib/security/assert-partner-access'

export async function GET() {
  const ctx = await getPartnerContext()
  if (!ctx) {
    return NextResponse.json({ error: 'Aucune adhésion Partenaire active' }, { status: 403 })
  }

  // Un compte peut appartenir à plusieurs Partenaires (§6 du plan) ; PR 1/2
  // n'exposent qu'un sélecteur implicite sur le premier — le sélecteur
  // d'espace explicite (§19) est un chantier PR 4.
  const partnerId = ctx.partnerIds[0]

  const { data: wallet } = await ctx.supabase
    .from('partner_wallets')
    .select('balance_fcfa, updated_at')
    .eq('partner_id', partnerId)
    .maybeSingle<{ balance_fcfa: number; updated_at: string }>()

  const { data: ledger } = await ctx.supabase
    .from('partner_wallet_ledger')
    .select('id, entry_type, amount_fcfa, balance_after, note, created_at')
    .eq('partner_id', partnerId)
    .order('created_at', { ascending: false })
    .limit(20)

  return NextResponse.json({
    balance_fcfa: wallet?.balance_fcfa ?? 0,
    updated_at: wallet?.updated_at ?? null,
    ledger: ledger ?? [],
  })
}
