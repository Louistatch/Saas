/**
 * Member Score — calculates Bronze/Argent/Or level on-the-fly.
 * 
 * Uses the SQL function `get_member_score` which respects RLS.
 * No stored column — always fresh data.
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
