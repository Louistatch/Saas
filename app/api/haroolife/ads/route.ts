// Campagnes en cours pour les panneaux 3D d'une localité. Toujours au moins les annonces
// internes FaîtiereHub (aussi hors ligne, côté client). Coupure : HAROOLIFE_ADS_DISABLED=true.
import { type AdCampaign, INTERNAL_CAMPAIGNS, safeHref } from '@/lib/haroolife/ads/campaigns'
import { createClient } from '@/lib/supabase/server'
import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

const campaign = z.object({
  id: z.string().uuid(),
  advertiser: z.object({ name: z.string().max(80), kind: z.enum(['internal', 'partner']) }),
  creative: z.object({
    title: z.string().min(1).max(60),
    body: z.string().min(1).max(140),
    cta: z.string().min(1).max(30),
    href: z.string().max(300),
    palette: z.tuple([z.string(), z.string(), z.string()]),
    image: z.string().max(300).nullish(),
  }),
  status: z.enum(['approved', 'active']),
  locality: z.enum(['lome', 'kara', 'all']),
  placements: z.array(z.string().max(40)).max(20),
  startsAt: z.string(),
  endsAt: z.string(),
  weight: z.number().int().min(1).max(5),
  version: z.number().int().min(1),
})
const hex = /^#[0-9a-f]{3,8}$/i

export async function GET(request: NextRequest) {
  const locality = request.nextUrl.searchParams.get('locality') === 'kara' ? 'kara' : 'lome'
  if (process.env.HAROOLIFE_ENABLED !== 'true' || process.env.HAROOLIFE_ADS_DISABLED === 'true')
    return NextResponse.json(
      { enabled: false, campaigns: [] },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  let partners: AdCampaign[] = []
  try {
    const supabase = await createClient()
    const { data } = await supabase.rpc('haroolife_ads_live', { p_locality: locality })
    const parsed = z.array(campaign).safeParse(data ?? [])
    if (parsed.success)
      partners = parsed.data.filter(
        (c) => safeHref(c.creative.href) && c.creative.palette.every((h) => hex.test(h)),
      ) as AdCampaign[]
  } catch {
    // Base indisponible : les annonces internes suffisent.
  }
  return NextResponse.json(
    { enabled: true, campaigns: [...INTERNAL_CAMPAIGNS, ...partners] },
    // Cache CDN court : une campagne mise en pause disparaît en moins d'une minute, et le client
    // masque de lui-même une campagne dont la fenêtre est passée.
    { headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120' } },
  )
}
