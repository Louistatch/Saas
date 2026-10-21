import { keySchema } from '@/lib/ce-it/schema'
import { enabled, failure, json, unavailable } from '@/lib/ce-it/server'
import { createClient } from '@/lib/supabase/server'
import type { NextRequest } from 'next/server'
import { z } from 'zod'

export async function GET(request: NextRequest) {
  if (!enabled()) return unavailable()
  const schema = z
    .object({
      culture: keySchema.optional(),
      region: z.string().uuid().optional(),
      prefecture: z.string().uuid().optional(),
      canton: z.string().uuid().optional(),
      owner: z.enum(['faitiere', 'operator', 'platform']).optional(),
    })
    .strict()
  const parsed = schema.safeParse(Object.fromEntries(request.nextUrl.searchParams))
  if (!parsed.success) return json({ error: 'Filtres invalides.' }, 400)
  try {
    const q = parsed.data
    const result = await (await createClient()).rpc('ceit_catalogue', {
      culture_filter: q.culture ?? null,
      region_filter: q.region ?? null,
      prefecture_filter: q.prefecture ?? null,
      canton_filter: q.canton ?? null,
      owner_filter: q.owner ?? null,
    })
    if (result.error) throw result.error
    return json({ items: result.data ?? [], price: 1500, payment_available: false })
  } catch (e) {
    return failure(e)
  }
}
