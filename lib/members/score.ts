/**
 * @deprecated — DEAD CODE PATH
 *
 * This module calls `get_member_score` RPC which does NOT exist in the database.
 * All calls silently return null (error path). The canonical scoring system is
 * `calculate_member_ats` (SQL) exposed via /api/members/[id]/ats and persisted
 * by `upsert_member_ats` into `member_ats_scores`.
 *
 * Components still importing from here (score-badge.tsx, agri-score-widget.tsx via
 * use-member-score.ts) must be migrated to the ATS API before this file can be removed.
 *
 * DO NOT add new imports of this module.
 */

import { createClient } from '@/lib/supabase/client'

export type MemberLevel = 'Bronze' | 'Argent' | 'Or'

export interface ScoreDetails {
  paid_cotisations_12m: number
  parcelle_count: number
  production_count: number
  consecutive_campaigns: number
  criteria: {
    bronze: boolean
    argent: boolean
    or: boolean
  }
}

export interface MemberScore {
  level: MemberLevel | null
  score_details: ScoreDetails | null
  error?: string
}

/**
 * Fetch the member's score level from the database.
 * Calls the `get_member_score` RPC which calculates on-the-fly.
 */
export async function getMemberScore(memberId: string): Promise<MemberScore> {
  const supabase = createClient()

  const { data, error } = await supabase.rpc('get_member_score', {
    target_member_id: memberId,
  })

  if (error) {
    return { level: null, score_details: null, error: error.message }
  }

  const result = data as MemberScore
  return {
    level: result.level as MemberLevel | null,
    score_details: result.score_details,
    error: result.error,
  }
}

/**
 * Get the color for a member level.
 */
export function getLevelColor(level: MemberLevel | null): string {
  switch (level) {
    case 'Or': return 'var(--level-or, #FFD700)'
    case 'Argent': return 'var(--level-argent, #A8A9AD)'
    case 'Bronze': return 'var(--level-bronze, #CD7F32)'
    default: return 'var(--muted-foreground, #6b7280)'
  }
}

/**
 * Get the label for a member level.
 */
export function getLevelLabel(level: MemberLevel | null): string {
  switch (level) {
    case 'Or': return 'Membre Or'
    case 'Argent': return 'Membre Argent'
    case 'Bronze': return 'Membre Bronze'
    default: return 'Non classé'
  }
}
