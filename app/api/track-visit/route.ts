import { createHash } from 'node:crypto'
import { createClient as createAdminClient } from '@/lib/supabase/admin'
import { rateLimit } from '@/lib/utils/rate-limit'
import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

/**
 * Trafic du site, suivi maison (§ demande admin : « je veux mon propre code
 * plutôt que dépendre d'un service tiers »). Route publique — appelée par
 * tout visiteur, connecté ou non, jamais gardée par assertRole.
 *
 * visitor_hash = sha256(ip + sel quotidien) : jamais l'IP en clair stockée,
 * jamais de cookie posé. Le sel change chaque jour (date UTC), donc la même
 * IP produit un hash différent d'un jour à l'autre — assez pour compter des
 * « visiteurs uniques par jour » sans pouvoir reconstituer un historique de
 * navigation par IP après coup.
 */

const bodySchema = z.object({
  path: z.string().trim().min(1).max(300),
  referrer: z.string().trim().max(300).optional(),
})

export async function POST(request: NextRequest) {
  const forwardedFor = request.headers.get('x-forwarded-for')
  const ip = forwardedFor ? forwardedFor.split(',')[0]?.trim() : 'unknown'

  const limit = rateLimit(`track-visit:${ip}`, 60, 60_000)
  if (!limit.ok) return new NextResponse(null, { status: 204 })

  const parsed = bodySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return new NextResponse(null, { status: 204 })

  const daysSalt = new Date().toISOString().slice(0, 10)
  const visitorHash = createHash('sha256').update(`${ip}:${daysSalt}`).digest('hex')

  const admin = createAdminClient()
  await admin.from('site_visits').insert({
    path: parsed.data.path,
    referrer: parsed.data.referrer ?? null,
    visitor_hash: visitorHash,
  })

  return new NextResponse(null, { status: 204 })
}
