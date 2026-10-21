// Relecture quotidienne des paiements PAYG (packs de crédits, formation, FaîtièreHub Print).
// Filet de sécurité derrière la notification FedaPay : chaque intention en attente est relue
// chez FedaPay et réglée une seule fois (settlePaygIntent), un effet interrompu est rejoué
// (idempotent), une création restée sans transaction est abandonnée. Rien n'est saisi à la
// main : FedaPay est la seule source d'un paiement.

import { timingSafeEqual } from 'node:crypto'
import { PAYG_PURPOSES, settlePaygIntent } from '@/lib/payg/payments'
import {
  RECONCILE_MAX_AGE_MS,
  RECONCILE_MIN_AGE_MS,
  RECONCILE_REAPPLY_MS,
  reconcileAction,
} from '@/lib/payg/reconcile-policy'
import { claimPartnerIntentForSettlement } from '@/lib/payments/settle-partner-intent'
import { createClient } from '@/lib/supabase/admin'
import { type NextRequest, NextResponse } from 'next/server'

export const maxDuration = 60

/** Durée de travail (maxDuration = 60 s, une relecture FedaPay peut être lente). */
const RUN_BUDGET_MS = 45_000
const BATCH = 200

function verifyCronSecret(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  const authHeader = request.headers.get('authorization')
  if (!secret || !authHeader?.startsWith('Bearer ')) return false
  const actual = Buffer.from(authHeader.slice(7))
  const expected = Buffer.from(secret)
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}

export async function GET(request: NextRequest) {
  if (!verifyCronSecret(request))
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const started = Date.now()
  const admin = createClient()
  const read = (statuses: ('pending' | 'processing' | 'success')[], maxAgeMs: number) =>
    admin
      .from('partner_payment_intents')
      .select('id, status, provider_reference, created_at')
      .eq('provider', 'fedapay')
      .in('purpose', [...PAYG_PURPOSES])
      .in('status', statuses)
      .gte('created_at', new Date(started - maxAgeMs).toISOString())
      .lte('created_at', new Date(started - RECONCILE_MIN_AGE_MS).toISOString())
      .order('created_at', { ascending: true })
      .limit(BATCH)
  // En attente d'abord (de l'argent peut-être reçu), puis les effets récents à rejouer.
  const [waiting, confirmed] = await Promise.all([
    read(['pending', 'processing'], RECONCILE_MAX_AGE_MS),
    read(['success'], RECONCILE_REAPPLY_MS),
  ])
  if (waiting.error || confirmed.error)
    return NextResponse.json({ error: 'Lecture impossible' }, { status: 502 })
  const data = [...(waiting.data ?? []), ...(confirmed.data ?? [])]

  const counts = { settled: 0, failed: 0, still_pending: 0, reapplied: 0, orphans: 0, skipped: 0 }
  let stoppedEarly = false
  for (const intent of data) {
    if (Date.now() - started > RUN_BUDGET_MS) {
      stoppedEarly = true
      break
    }
    const action = reconcileAction(intent, Date.now())
    if (action === 'skip') {
      counts.skipped += 1
    } else if (action === 'orphan') {
      const claim = await claimPartnerIntentForSettlement(admin, intent.id, {
        status: 'failed',
        updated_at: new Date().toISOString(),
      })
      if (claim.claimed) counts.orphans += 1
    } else {
      const state = await settlePaygIntent(admin, intent.id)
      if (action === 'reapply') counts.reapplied += state === 'success' ? 1 : 0
      else if (state === 'success') counts.settled += 1
      else if (state === 'failed') counts.failed += 1
      else counts.still_pending += 1
    }
  }

  return NextResponse.json({
    ok: true,
    scanned: data.length,
    ...counts,
    stopped_early: stoppedEarly,
  })
}
