// Rapports CSV d'un opérateur (gérant ou propriétaire) : cartes émises, crédits, formations,
// activité. Lisibles dans Excel (séparateur « ; », UTF-8).

import { csvResponse } from '@/lib/payg/http'
import { ACTIVITY_LABEL, CARD_FORMAT_LABEL, type CardFormat, toCsv } from '@/lib/payg/model'
import { deny, profileNames, requirePaygMember } from '@/lib/payg/server'
import type { NextRequest } from 'next/server'

const TYPES = ['cards', 'credits', 'training', 'activity'] as const

export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const type = url.searchParams.get('type') as (typeof TYPES)[number] | null
  if (!type || !TYPES.includes(type)) return deny(400, 'Type de rapport inconnu')
  const guard = await requirePaygMember(url.searchParams.get('partner_id'), 'manager')
  if (!guard.ok) return guard.response
  const { ctx, membership } = guard
  const admin = ctx.admin
  const partnerId = membership.partnerId
  const file = (name: string) =>
    `${name}-${membership.partnerCode}-${new Date().toISOString().slice(0, 10)}.csv`

  if (type === 'cards') {
    const { data } = await admin
      .from('card_issuance_requests')
      .select(
        'member_card_id, mode, actor_id, created_at, member_cards(card_number, status, cooperatives(name)), members(first_name, last_name, region)',
      )
      .eq('partner_id', partnerId)
      .order('created_at', { ascending: false })
      .returns<
        {
          member_card_id: string
          mode: string
          actor_id: string | null
          created_at: string
          member_cards: {
            card_number: string
            status: string
            cooperatives: { name: string } | null
          } | null
          members: { first_name: string; last_name: string; region: string | null } | null
        }[]
      >()
    const rows = data ?? []
    const ids = rows.map((r) => r.member_card_id)
    const { data: commissions } = ids.length
      ? await admin
          .from('card_commissions')
          .select(
            'member_card_id, source, card_format, status, commission_fcfa, producer_price_fcfa',
          )
          .in('member_card_id', ids)
      : { data: [] }
    const c = new Map((commissions ?? []).map((x) => [x.member_card_id, x]))
    const names = await profileNames(
      admin,
      rows.map((r) => r.actor_id).filter((x): x is string => !!x),
    )
    return csvResponse(
      toCsv(
        [
          'Date',
          'Numéro',
          'Producteur',
          'Région',
          'Coopérative',
          'Type',
          'Format',
          'Crédit',
          'Commission FCFA',
          'Prix producteur FCFA',
          'Statut',
          'Émise par',
        ],
        rows.map((r) => {
          const k = c.get(r.member_card_id)
          return [
            r.created_at,
            r.member_cards?.card_number,
            [r.members?.first_name, r.members?.last_name].filter(Boolean).join(' '),
            r.members?.region,
            r.member_cards?.cooperatives?.name,
            r.mode === 'commercial' ? 'Commerciale' : 'Gratuite (quota)',
            CARD_FORMAT_LABEL[(k?.card_format ?? 'digital') as CardFormat],
            k
              ? k.status === 'released'
                ? 'Rendu'
                : k.source === 'welcome'
                  ? 'Offert'
                  : 'Acheté'
              : '',
            k?.commission_fcfa ?? 0,
            k?.producer_price_fcfa,
            r.member_cards?.status,
            r.actor_id ? names.get(r.actor_id)?.name : '',
          ]
        }),
      ),
      file('cartes'),
    )
  }

  if (type === 'credits') {
    const { data } = await admin
      .from('payg_credit_ledger')
      .select(
        'created_at, entry_type, credits, welcome_delta, balance_after, amount_fcfa, actor_id, note',
      )
      .eq('partner_id', partnerId)
      .order('created_at', { ascending: false })
    const rows = data ?? []
    const names = await profileNames(
      admin,
      rows.map((r) => r.actor_id).filter((x): x is string => !!x),
    )
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
        rows.map((r) => [
          r.created_at,
          r.entry_type,
          r.credits,
          r.welcome_delta,
          r.balance_after,
          r.amount_fcfa,
          r.actor_id ? names.get(r.actor_id)?.name : '',
          r.note,
        ]),
      ),
      file('credits'),
    )
  }

  if (type === 'training') {
    const { data } = await admin
      .from('training_fee_accounts')
      .select('user_id, total_fcfa, paid_fcfa, payer, status, paid_at')
      .eq('partner_id', partnerId)
    const rows = data ?? []
    const names = await profileNames(
      admin,
      rows.map((r) => r.user_id),
    )
    return csvResponse(
      toCsv(
        ['Personne', 'Payeur', 'Total FCFA', 'Payé FCFA', 'Reste FCFA', 'Statut', 'Soldé le'],
        rows.map((r) => [
          names.get(r.user_id)?.name,
          r.payer === 'institution' ? 'Institution' : 'La personne',
          r.total_fcfa,
          r.paid_fcfa,
          r.total_fcfa - r.paid_fcfa,
          r.status,
          r.paid_at,
        ]),
      ),
      file('formations'),
    )
  }

  const { data } = await admin
    .from('partner_activity_log')
    .select('created_at, actor_id, action, details, cooperatives(name)')
    .eq('partner_id', partnerId)
    .order('created_at', { ascending: false })
    .limit(5000)
    .returns<
      {
        created_at: string
        actor_id: string | null
        action: string
        details: unknown
        cooperatives: { name: string } | null
      }[]
    >()
  const rows = data ?? []
  const names = await profileNames(
    admin,
    rows.map((r) => r.actor_id).filter((x): x is string => !!x),
  )
  return csvResponse(
    toCsv(
      ['Date', 'Par', 'Action', 'Coopérative', 'Détails'],
      rows.map((r) => [
        r.created_at,
        r.actor_id ? names.get(r.actor_id)?.name : '',
        ACTIVITY_LABEL[r.action] ?? r.action,
        r.cooperatives?.name,
        JSON.stringify(r.details),
      ]),
    ),
    file('activite'),
  )
}
