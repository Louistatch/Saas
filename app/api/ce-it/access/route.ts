import { grantSchema, missionSchema, pinSchema } from '@/lib/ce-it/schema'
import {
  digest,
  downloadLinks,
  enabled,
  failure,
  json,
  memberAccess,
  unavailable,
} from '@/lib/ce-it/server'
import { assertAuthenticated } from '@/lib/security/assert-access'
import { createClient } from '@/lib/supabase/admin'
import { applyRateLimit } from '@/lib/utils/rate-limit-persistent'
import type { NextRequest } from 'next/server'
import { z } from 'zod'

const schema = z.discriminatedUnion('action', [
  pinSchema.extend({ action: z.literal('card') }),
  grantSchema.extend({ action: z.literal('download') }),
  grantSchema.extend({ action: z.literal('candidates') }),
  missionSchema.extend({ action: z.literal('propose') }),
  z.object({ action: z.literal('purchased'), grant_id: z.string().uuid() }).strict(),
  z
    .object({
      action: z.literal('propose-purchased'),
      grant_id: z.string().uuid(),
      agronome_id: z.string().uuid(),
      scope: z.string().trim().min(20).max(2000),
      acknowledged: z.literal(true),
    })
    .strict(),
])
export async function POST(request: NextRequest) {
  if (!enabled()) return unavailable()
  const limited = await applyRateLimit(request, 'verify')
  if (limited) return limited
  const parsed = schema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return json({ error: 'Demande invalide.' }, 400)
  try {
    const { action, ...input } = parsed.data
    if ((action === 'purchased' || action === 'propose-purchased') && 'grant_id' in input) {
      const guard = await assertAuthenticated()
      if (!guard.ok) return guard.response
      const actor = guard.ctx.userId
      const args = { grant_uuid: input.grant_id, proof_hash: '', actor }
      if (action === 'purchased') {
        const files = await downloadLinks(input.grant_id, '', actor)
        const candidates = await createClient().rpc('ceit_candidates', args)
        if (candidates.error) throw candidates.error
        return json({ files, candidates: candidates.data ?? [], expires_in: 300 })
      }
      if (!('agronome_id' in input)) return json({ error: 'Mission invalide.' }, 400)
      const mission = await createClient().rpc('ceit_propose_mission', {
        ...args,
        agronome: input.agronome_id,
        scope_text: input.scope,
        acknowledged: input.acknowledged,
      })
      if (mission.error) throw mission.error
      return json({ mission_id: mission.data, status: 'proposed' })
    }
    if (action === 'card' && 'pin' in input) {
      const proof = await memberAccess(input)
      if (!proof)
        return json(
          { error: 'Carte ou PIN non reconnu, ou carte temporairement verrouillée.' },
          403,
        )
      const { data, error } = await createClient().rpc('ceit_candidates', {
        grant_uuid: proof.grant_id,
        proof_hash: digest(proof.token),
        actor: null,
      })
      if (error) throw error
      return json({ ...proof, candidates: data ?? [], expires_in: 900 })
    }
    if (!('grant_id' in input) || !('token' in input))
      return json({ error: 'Accès invalide.' }, 400)
    if (action === 'download')
      return json({ files: await downloadLinks(input.grant_id, input.token), expires_in: 300 })
    const rpc = action === 'candidates' ? 'ceit_candidates' : 'ceit_propose_mission'
    const args = {
      grant_uuid: input.grant_id,
      proof_hash: digest(input.token),
      actor: null,
      ...('agronome_id' in input
        ? { agronome: input.agronome_id, scope_text: input.scope, acknowledged: input.acknowledged }
        : {}),
    }
    const result = await createClient().rpc(rpc, args)
    if (result.error) throw result.error
    return json(
      action === 'candidates'
        ? { candidates: result.data ?? [] }
        : { mission_id: result.data, status: 'proposed' },
    )
  } catch (e) {
    return failure(e)
  }
}
