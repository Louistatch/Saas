import { pinSchema } from './schema'

export interface AccessProof {
  grant_id: string
  token: string
}
export interface FreeAccessDeps {
  verifyPin: (card: string, pin: string) => Promise<{ ok: true; memberId: string } | { ok: false }>
  issueGrant: (product: string, card: string, member: string) => Promise<AccessProof>
}
/** Deliberately no session/account shortcut: the supplied PIN must pass before grant creation. */
export async function acquireFreeAccess(
  raw: unknown,
  deps: FreeAccessDeps,
): Promise<AccessProof | null> {
  const input = pinSchema.parse(raw)
  const verified = await deps.verifyPin(input.card_number, input.pin)
  if (!verified.ok) return null
  return deps.issueGrant(input.product_id, input.card_number, verified.memberId)
}
