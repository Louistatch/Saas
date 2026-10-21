// Historique des crédits d'un opérateur (gérant ou propriétaire), en JSON ou en CSV.

import { csvResponse } from '@/lib/payg/http'
import { toCsv } from '@/lib/payg/model'
import { profileNames, requirePaygMember } from '@/lib/payg/server'
import { type NextRequest, NextResponse } from 'next/server'

const ENTRY_LABEL: Record<string, string> = {
  WELCOME: 'Crédits offerts',
  PURCHASE: 'Achat',
  CONSUME: 'Carte émise',
  RELEASE: 'Crédit rendu',
  ADJUSTMENT: 'Correction',
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const guard = await requirePaygMember(url.searchParams.get('partner_id'), 'manager')
  if (!guard.ok) return guard.response
  const { ctx, membership } = guard
  const { data } = await ctx.admin
    .from('payg_credit_ledger')
    .select(
      'id, entry_type, credits, welcome_delta, balance_after, amount_fcfa, actor_id, note, created_at',
    )
    .eq('partner_id', membership.partnerId)
    .order('created_at', { ascending: false })
    .limit(1000)
  const rows = data ?? []
  const names = await profileNames(
    ctx.admin,
    rows.map((r) => r.actor_id).filter((x): x is string => !!x),
  )
  const entries = rows.map((r) => ({
    ...r,
    label: ENTRY_LABEL[r.entry_type] ?? r.entry_type,
    actor: r.actor_id ? (names.get(r.actor_id)?.name ?? '') : '',
  }))
  if (url.searchParams.get('format') === 'csv') {
    return csvResponse(
      toCsv(
        [
          'Date',
          'Opération',
          'Crédits',
          'Dont offerts',
          'Solde après',
          'Montant FCFA',
          'Par',
          'Note',
        ],
        entries.map((e) => [
          e.created_at,
          e.label,
          e.credits,
          e.welcome_delta,
          e.balance_after,
          e.amount_fcfa,
          e.actor,
          e.note,
        ]),
      ),
      `credits-${membership.partnerCode}.csv`,
    )
  }
  return NextResponse.json({ entries: entries.slice(0, 200) })
}
