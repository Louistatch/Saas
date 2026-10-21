import 'server-only'
import { randomBytes } from 'node:crypto'
import { createClient } from '@/lib/supabase/admin'
import { z } from 'zod'
import { digest } from './server'

const receipt = z
  .object({
    productId: z.string().uuid(),
    versionId: z.string().uuid(),
    purchaseId: z.string().uuid(),
    buyerUserId: z.string().uuid(),
    providerTransactionId: z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/),
    amount: z.literal(1500),
    currency: z.literal('XOF'),
  })
  .strict()
/**
 * Claude's server-only integration point AFTER a fresh FedaPay verification.
 * Never pass a browser callback/body here as a verified receipt. SQL activation is off.
 * No card commission, wallet debit or transfer is performed. Buyer authentication is
 * required for later downloads; the receipt ID is never a bearer download token.
 */
export async function settleVerifiedCeItPurchase(input: z.infer<typeof receipt>): Promise<string> {
  const v = receipt.parse(input)
  const result = await createClient().rpc('ceit_confirm_purchase', {
    product: v.productId,
    version: v.versionId,
    purchase: v.purchaseId,
    buyer: v.buyerUserId,
    paid_amount: v.amount,
    paid_currency: v.currency,
    proof_hash: digest(randomBytes(32)),
    provider_reference: `fedapay:${v.providerTransactionId}`,
  })
  if (result.error) throw result.error
  return String(result.data)
}
