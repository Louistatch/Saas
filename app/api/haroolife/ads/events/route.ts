// Statistiques agrégées des panneaux : expositions et clics volontaires, sans donnée personnelle.
// Débit limité par adresse ; plafonds par envoi appliqués aussi en base (haroolife_ad_record).
import { PLACEMENTS } from '@/lib/haroolife/ads/campaigns'
import { createClient } from '@/lib/supabase/server'
import { clientKeyFromHeaders, rateLimit } from '@/lib/utils/rate-limit'
import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

export const dynamic = 'force-dynamic'
const ids = PLACEMENTS.map((p) => p.id) as [string, ...string[]]
const body = z.object({
  items: z
    .array(
      z.object({
        campaign: z.string().regex(/^(internal-[a-z-]{2,30}|[0-9a-f-]{36})$/),
        placement: z.enum(ids),
        impressions: z.number().int().min(0).max(30),
        clicks: z.number().int().min(0).max(3),
      }),
    )
    .min(1)
    .max(8),
})

export async function POST(request: NextRequest) {
  if (process.env.HAROOLIFE_ENABLED !== 'true' || process.env.HAROOLIFE_ADS_DISABLED === 'true')
    return new NextResponse(null, { status: 204 })
  const origin = request.headers.get('origin')
  if (origin && origin !== request.nextUrl.origin)
    return NextResponse.json({ error: 'Origine invalide' }, { status: 403 })
  if (!rateLimit(`haroolife-ads:${clientKeyFromHeaders(request.headers)}`, 20, 600_000).ok)
    return NextResponse.json({ error: 'Trop d’envois' }, { status: 429 })
  const parsed = body.safeParse(await request.json().catch(() => null))
  if (!parsed.success)
    return NextResponse.json({ error: 'Statistiques invalides' }, { status: 400 })
  try {
    const supabase = await createClient()
    const { error } = await supabase.rpc('haroolife_ad_record', { p_items: parsed.data.items })
    if (error) return NextResponse.json({ error: 'Statistiques non enregistrées' }, { status: 503 })
  } catch {
    return NextResponse.json({ error: 'Statistiques non enregistrées' }, { status: 503 })
  }
  return new NextResponse(null, { status: 204 })
}
