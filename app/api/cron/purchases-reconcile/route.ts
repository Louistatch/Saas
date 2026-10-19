import { timingSafeEqual } from 'node:crypto'
import { settlePurchaseDetailed } from '@/lib/fiches/purchases'
import { createClient } from '@/lib/supabase/admin'
import { type NextRequest, NextResponse } from 'next/server'

export const maxDuration = 60

const SECOND = 1000
const MINUTE = 60 * SECOND
const HOUR = 60 * MINUTE
const BATCH = 50
/** Laisse au webhook et au retour navigateur le temps d'agir. */
const MIN_AGE_MS = 10 * MINUTE
/** Au-delà, l'achat n'est plus relu (FedaPay l'aura expiré depuis longtemps). */
const MAX_AGE_MS = 7 * 24 * HOUR
/** Encore « pending » chez FedaPay après ce délai : abandon, l'achat passe en échec. */
const STALE_PENDING_MS = 48 * HOUR
/** Achat sans transaction FedaPay (création interrompue) : échec après ce délai. */
const ORPHAN_MS = HOUR
/**
 * Achats en échec AVEC transaction relus pendant ce délai après leur passage
 * en échec (updated_at), et non après leur création : FedaPay peut approuver
 * une transaction déjà « declined » / « canceled » (statuts non définitifs).
 * Compté depuis l'échec, un achat abandonné par l'étape 2 (créé il y a 48 à
 * 72 h) est encore relu aux trois passages quotidiens suivants.
 */
const LATE_APPROVAL_WINDOW_MS = 72 * HOUR
/** Borne de sécurité sur la création des achats en échec relus. */
const FAILED_MAX_AGE_MS = MAX_AGE_MS + LATE_APPROVAL_WINDOW_MS
/** Durée totale de travail (maxDuration = 60 s, une relecture FedaPay peut prendre 20 s). */
const RUN_BUDGET_MS = 45 * SECOND
/** Part toujours gardée pour relire les échecs, même si les achats en attente débordent. */
const FAILED_RESERVE_MS = 10 * SECOND
/** Échecs relus au plus par passage (les plus récents d'abord). */
const FAILED_RECHECK_MAX = 40

function verifyCronSecret(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  const authHeader = request.headers.get('authorization')
  if (!secret || !authHeader?.startsWith('Bearer ')) return false
  const actual = Buffer.from(authHeader.slice(7))
  const expected = Buffer.from(secret)
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}

interface ScanRow {
  id: string
  created_at: string
  updated_at: string | null
}

type AdminClient = ReturnType<typeof createClient>

interface ScanOptions {
  status: 'pending' | 'failed'
  /** Colonne de parcours (et de reprise d'un lot à l'autre). */
  by: 'created_at' | 'updated_at'
  ascending: boolean
  /** Bornes exclusives de `by`. */
  after: string
  before: string
  /** Bornes exclusives de created_at. */
  createdAfter: string
  createdBefore: string
  deadline: number
  /** Nombre maximal de lignes rendues. */
  max?: number
}

/**
 * Parcourt, par lots, les achats FedaPay d'un statut donné qui ont une
 * transaction. S'arrête à `deadline` ou après `max` lignes ; `stopped` dit
 * alors que des lignes ont pu rester sans relecture.
 */
async function* scan(
  sb: AdminClient,
  o: ScanOptions,
  stopped: { early: boolean },
): AsyncGenerator<ScanRow> {
  let cursor = o.ascending ? o.after : o.before
  let given = 0
  while (true) {
    if (Date.now() >= o.deadline) {
      stopped.early = true
      return
    }
    let q = sb
      .from('purchases')
      .select('id, created_at, updated_at')
      .eq('payment_status', o.status)
      .eq('provider', 'fedapay')
      .not('provider_transaction_id', 'is', null)
      .gt('created_at', o.createdAfter)
      .lt('created_at', o.createdBefore)
    q = o.ascending ? q.gt(o.by, cursor).lt(o.by, o.before) : q.lt(o.by, cursor).gt(o.by, o.after)
    const { data, error } = await q.order(o.by, { ascending: o.ascending }).limit(BATCH)
    if (error) throw new Error(`${o.status} purchases read failed`)
    const rows = (data ?? []) as ScanRow[]
    for (const row of rows) {
      if (Date.now() >= o.deadline || (o.max !== undefined && given >= o.max)) {
        stopped.early = true
        return
      }
      given++
      yield row
    }
    if (rows.length < BATCH) return
    cursor = String((rows[rows.length - 1] as ScanRow)[o.by] ?? '')
  }
}

/**
 * GET /api/cron/purchases-reconcile — rapprochement quotidien des achats
 * (horaire dans vercel.json). Sans lui, un achat dont le webhook s'est perdu
 * et dont l'acheteur a fermé la fenêtre restait « pending » pour toujours,
 * même payé.
 *
 *   1. Achats « pending » avec transaction, créés il y a 10 min à 7 jours,
 *      les plus anciens d'abord : settlePurchase (même règle que le webhook,
 *      decidePurchaseTransition). Passent EN PREMIER : c'est l'argent encaissé
 *      sans accès ouvert. Ils ont tout le budget sauf FAILED_RESERVE_MS.
 *   2. Toujours « pending » chez FedaPay après 48 h : passés en « failed ».
 *   3. Achats « failed » avec transaction, passés en échec dans les 72
 *      dernières heures et AVANT ce passage (les échecs que les étapes 1-2
 *      viennent d'écrire ne sont pas relus), les plus récents d'abord, au plus
 *      FAILED_RECHECK_MAX : paiement approuvé après un refus → « completed »,
 *      une seule fois, si montant, devise et fiche correspondent.
 *   4. « pending » sans transaction depuis plus d'une heure : « failed ».
 * Chaque écriture est gardée par .eq('payment_status', <statut lu>).
 * `unfinished` liste les étapes arrêtées avant la fin (délai ou plafond) :
 * leurs lignes restantes passent au rapprochement suivant.
 */
export async function GET(request: NextRequest) {
  if (!verifyCronSecret(request))
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const now = Date.now()
  const runStart = new Date(now).toISOString()
  const deadline = now + RUN_BUDGET_MS
  const counters = {
    checked: 0,
    transitions: {} as Record<string, number>,
    stale_failed: 0,
    orphan_failed: 0,
    lookup_failed: 0,
    failed_rechecked: 0,
    unfinished: [] as string[],
  }
  const bump = (key: string) => {
    counters.transitions[key] = (counters.transitions[key] ?? 0) + 1
  }

  try {
    const sb = createClient()
    const until = new Date(now - MIN_AGE_MS).toISOString()

    // 1-2. Achats en attente (les plus anciens d'abord).
    const pendingStop = { early: false }
    for await (const row of scan(
      sb,
      {
        status: 'pending',
        by: 'created_at',
        ascending: true,
        after: new Date(now - MAX_AGE_MS).toISOString(),
        before: until,
        createdAfter: new Date(now - MAX_AGE_MS).toISOString(),
        createdBefore: until,
        deadline: deadline - FAILED_RESERVE_MS,
      },
      pendingStop,
    )) {
      counters.checked++
      const outcome = await settlePurchaseDetailed(row.id)
      if (outcome.changed) {
        bump(`${outcome.changed.from}→${outcome.changed.to}`)
        continue
      }
      if (outcome.txStatus === null) {
        counters.lookup_failed++
        continue
      }
      const age = now - new Date(row.created_at).getTime()
      if (outcome.txStatus === 'pending' && age > STALE_PENDING_MS) {
        const { data: failed } = await sb
          .from('purchases')
          .update({ payment_status: 'failed', updated_at: new Date().toISOString() })
          .eq('id', row.id)
          .eq('payment_status', 'pending')
          .select('id')
        if (failed?.length) counters.stale_failed++
      }
    }
    if (pendingStop.early) counters.unfinished.push('pending')

    // 3. Paiements approuvés après un échec (les échecs les plus récents d'abord).
    const failedStop = { early: false }
    for await (const row of scan(
      sb,
      {
        status: 'failed',
        by: 'updated_at',
        ascending: false,
        after: new Date(now - LATE_APPROVAL_WINDOW_MS).toISOString(),
        before: runStart,
        createdAfter: new Date(now - FAILED_MAX_AGE_MS).toISOString(),
        createdBefore: until,
        deadline,
        max: FAILED_RECHECK_MAX,
      },
      failedStop,
    )) {
      counters.failed_rechecked++
      const outcome = await settlePurchaseDetailed(row.id)
      if (outcome.changed) bump(`${outcome.changed.from}→${outcome.changed.to}`)
      else if (outcome.txStatus === null) counters.lookup_failed++
    }
    if (failedStop.early) counters.unfinished.push('failed')

    const { data: orphans, error: orphanError } = await sb
      .from('purchases')
      .update({ payment_status: 'failed', updated_at: new Date().toISOString() })
      .eq('payment_status', 'pending')
      .is('provider_transaction_id', null)
      .lt('created_at', new Date(now - ORPHAN_MS).toISOString())
      .select('id')
    if (orphanError) throw new Error('Orphan purchases update failed')
    counters.orphan_failed = orphans?.length ?? 0

    if (counters.unfinished.length)
      console.warn('[purchases-reconcile] Run stopped early', {
        unfinished: counters.unfinished,
        checked: counters.checked,
        failed_rechecked: counters.failed_rechecked,
      })
    return NextResponse.json(counters)
  } catch (error) {
    console.error(
      '[purchases-reconcile] Worker failed',
      error instanceof Error ? error.message : 'Unknown error',
    )
    return NextResponse.json({ error: 'Reconciliation failed', ...counters }, { status: 500 })
  }
}
