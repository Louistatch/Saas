import { BUCKET } from '@/lib/ce-it/schema'
import { enabled, failure, json, unavailable } from '@/lib/ce-it/server'
import { assertAuthenticated } from '@/lib/security/assert-access'
import { createClient } from '@/lib/supabase/admin'
import type { NextRequest } from 'next/server'
import { z } from 'zod'

export async function POST(request: NextRequest) {
  if (!enabled()) return unavailable()
  const guard = await assertAuthenticated()
  if (!guard.ok) return guard.response
  const parsed = z
    .object({ version: z.string().uuid() })
    .strict()
    .safeParse(await request.json().catch(() => null))
  if (!parsed.success) return json({ error: 'Version invalide.' }, 400)
  const { data: v, error } = await guard.ctx.supabase
    .from('ceit_versions')
    .select('id,product_id,ce_key,it_key')
    .eq('id', parsed.data.version)
    .maybeSingle<{ id: string; product_id: string; ce_key: string; it_key: string }>()
  if (error || !v) return json({ error: 'Lecture non autorisée.' }, 403)
  try {
    const files = await Promise.all(
      (['ce', 'it'] as const).map(async (kind) => {
        const key = kind === 'ce' ? v.ce_key : v.it_key
        if (key !== `${v.product_id}/${v.id}/${kind}.pdf`) throw new Error('invalid key')
        const signed = await createClient()
          .storage.from(BUCKET)
          .createSignedUrl(key, 300, { download: `${kind}.pdf` })
        if (signed.error || !signed.data?.signedUrl)
          throw signed.error ?? new Error('file unavailable')
        return { kind, url: signed.data.signedUrl }
      }),
    )
    return json({ files })
  } catch (e) {
    return failure(e)
  }
}
