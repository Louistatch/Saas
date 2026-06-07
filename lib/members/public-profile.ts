/**
 * Public member profile — returns ONLY non-sensitive fields.
 * Used by the QR verification page and public supplier pages.
 * 
 * NEVER exposes: phone, email, address, card_number full, cotisation amounts.
 */

import { createBrowserClient } from '@supabase/ssr'

export interface PublicAgricultureProfile {
  cultures: string[]
  superficie_totale: number
  parcelle_count: number
  production_count: number
  seasons: string[]
  irrigated_count: number
}

export interface PublicMemberProfile {
  id: string
  first_name: string
  last_name: string
  photo_url: string | null
  village: string | null
  canton: string | null
  prefecture: string | null
  region: string | null
  cooperative_name: string | null
  cooperative_faitiere: string | null
  cooperative_level: string | null
  member_since: string | null
  level: 'Bronze' | 'Argent' | 'Or' | null
  agriculture: PublicAgricultureProfile
  is_certified_supplier: boolean
}

/**
 * Fetch a member's public profile by member ID.
 * Only returns non-sensitive data suitable for public display.
 */
export async function getPublicMemberProfile(
  memberId: string,
  supabase: ReturnType<typeof createBrowserClient>,
): Promise<PublicMemberProfile | null> {
  // Fetch member with cooperative and parcelles (explicit column selection)
  const { data: member } = await supabase
    .from('members')
    .select(`
      id, first_name, last_name, photo_url, village, canton, prefecture, region,
      status, created_at,
      cooperatives(name, faitiere_name, level)
    `)
    .eq('id', memberId)
    .eq('status', 'active')
    .single()

  if (!member) return null

  // Fetch parcelles for agriculture profile (all public fields)
  const { data: parcelles } = await supabase
    .from('parcelles')
    .select('id, culture_principale, culture_name, superficie_ha, surface_ha, soil_type, irrigation_type, campaign_year')
    .eq('member_id', memberId)

  const parcelleList = (parcelles ?? []) as {
    id: string
    culture_principale: string | null
    culture_name: string | null
    superficie_ha: number | null
    surface_ha: number | null
    soil_type: string | null
    irrigation_type: string | null
    campaign_year: string | null
  }[]

  // Fetch productions directly by member_id (productions now has member_id column)
  let productionData: { campaign_year: string | null }[] = []
  const { data: prods } = await supabase
    .from('productions')
    .select('campaign_year')
    .eq('member_id', memberId)
  productionData = (prods ?? []) as { campaign_year: string | null }[]

  // Calculate agriculture profile
  const cultures = [...new Set(parcelleList.map((p) => p.culture_principale ?? p.culture_name).filter((c): c is string => !!c))]
  const superficie_totale = parcelleList.reduce((sum, p) => sum + (p.superficie_ha ?? p.surface_ha ?? 0), 0)
  const seasons = [...new Set(productionData.map((p) => p.campaign_year).filter((s): s is string => !!s))]
  const irrigated_count = parcelleList.filter(p => p.irrigation_type && p.irrigation_type.toLowerCase() !== 'non').length

  // Calculate level (simplified — matches get_member_score logic)
  const { data: cotisations } = await supabase
    .from('cotisations')
    .select('status, campaign')
    .eq('member_id', memberId)
    .eq('status', 'paid')

  const paidCount = (cotisations ?? []).length
  const consecutiveCampaigns = new Set((cotisations ?? []).map((c: { campaign: string }) => c.campaign).filter(Boolean)).size
  const productionCount = productionData.length

  let level: 'Bronze' | 'Argent' | 'Or' | null = 'Bronze'
  if (paidCount >= 1 && parcelleList.length >= 1 && productionCount >= 1) {
    level = 'Argent'
  }
  if (paidCount >= 1 && parcelleList.length >= 1 && productionCount >= 2 && consecutiveCampaigns >= 2) {
    level = 'Or'
  }

  // Determine if certified supplier
  const coop = (member.cooperatives as { name: string; faitiere_name: string | null; level: string | null }[] | null)?.[0] ?? null
  const isCertified = (level === 'Argent' || level === 'Or') && coop?.level === 'faitiere'

  return {
    id: member.id as string,
    first_name: member.first_name as string,
    last_name: member.last_name as string,
    photo_url: member.photo_url as string | null,
    village: member.village as string | null,
    canton: member.canton as string | null,
    prefecture: member.prefecture as string | null,
    region: member.region as string | null,
    cooperative_name: coop?.name ?? null,
    cooperative_faitiere: coop?.faitiere_name ?? null,
    cooperative_level: coop?.level ?? null,
    member_since: member.created_at as string | null,
    level,
    agriculture: {
      cultures,
      superficie_totale,
      parcelle_count: parcelleList.length,
      production_count: productionCount,
      seasons,
      irrigated_count,
    },
    is_certified_supplier: isCertified,
  }
}
