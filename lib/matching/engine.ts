export interface ListingSummary {
  id: string
  culture: string
  quantity_kg: number
  price_per_kg_fcfa: number
  quality_grade: string
  location_prefecture: string | null
  cooperative_name?: string | null
}

export interface BuyerRequest {
  culture: string
  quantity_kg_needed: number
  max_price_per_kg_fcfa?: number | null
  quality_grade_min?: string | null
  location_prefecture?: string | null
}

export interface MatchResult {
  listing_id: string
  score: number
  reasons: string[]
}

const GRADE_ORDER: Record<string, number> = { A: 3, B: 2, C: 1 }

export function scoreListingForRequest(
  listing: ListingSummary,
  request: BuyerRequest,
): MatchResult {
  let score = 0
  const reasons: string[] = []

  // Culture match (exact): +40 pts
  if (listing.culture.toLowerCase() === request.culture.toLowerCase()) {
    score += 40
    reasons.push('Culture correspondante')
  }

  // Quantity sufficient: +20 pts
  if (listing.quantity_kg >= request.quantity_kg_needed) {
    score += 20
    reasons.push('Quantité suffisante')
  }

  // Price within budget: +20 pts
  if (
    request.max_price_per_kg_fcfa == null ||
    listing.price_per_kg_fcfa <= request.max_price_per_kg_fcfa
  ) {
    score += 20
    reasons.push('Prix dans budget')
  }

  // Quality meets minimum: +10 pts
  if (
    request.quality_grade_min == null ||
    (GRADE_ORDER[listing.quality_grade] ?? 0) >= (GRADE_ORDER[request.quality_grade_min] ?? 0)
  ) {
    score += 10
    reasons.push('Qualité conforme')
  }

  // Same prefecture: +10 pts
  if (
    request.location_prefecture != null &&
    listing.location_prefecture != null &&
    listing.location_prefecture.toLowerCase() === request.location_prefecture.toLowerCase()
  ) {
    score += 10
    reasons.push('Même préfecture')
  }

  return { listing_id: listing.id, score, reasons }
}

export function rankListings(
  listings: ListingSummary[],
  request: BuyerRequest,
): MatchResult[] {
  return listings
    .map((listing) => scoreListingForRequest(listing, request))
    .filter((result) => result.score >= 40)
    .sort((a, b) => b.score - a.score)
}
