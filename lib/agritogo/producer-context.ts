/**
 * Builds the full AgriTogo system prompt with maximum producer context.
 * Used by both /api/ai/chat and /api/ai/voice to ensure consistent,
 * data-rich responses regardless of input modality.
 */
import type { SupabaseClient } from '@supabase/supabase-js'

export interface ProducerContext {
  systemPrompt: string
  memberName: string
  cooperativeId: string | null
  memberId: string | null
}

export async function buildProducerContext(
  cardNumber: string,
  supabase: SupabaseClient,
  supabaseAdmin: SupabaseClient,
): Promise<ProducerContext> {
  // ── Card + member + cooperative ──────────────────────────────────
  const { data: card } = await supabase
    .from('member_cards')
    .select('member_id, cooperative_id')
    .eq('card_number', cardNumber)
    .eq('status', 'active')
    .maybeSingle()

  const [memberRes, coopRes] = await Promise.all([
    card?.member_id
      ? supabaseAdmin.from('members')
          .select('first_name, last_name, region, canton, prefecture, village, phone, status')
          .eq('id', card.member_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    card?.cooperative_id
      ? supabaseAdmin.from('cooperatives')
          .select('name, faitiere_name, level')
          .eq('id', card.cooperative_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ])

  const member = memberRes.data
  const coop = coopRes.data
  const memberId = card?.member_id ?? null
  const cooperativeId = card?.cooperative_id ?? null
  const regionName = member?.region ?? null

  // ── Parallel data fetch ───────────────────────────────────────────
  const [
    parcellesRes,
    cotisationsRes,
    paymentsRes,
    pricesRes,
    fichesRes,
    weatherRes,
    listingsRes,
  ] = await Promise.all([
    // Parcelles
    memberId
      ? supabaseAdmin.from('parcelles')
          .select('name, culture_principale, superficie_ha, canton, prefecture')
          .eq('member_id', memberId)
          .limit(10)
      : Promise.resolve({ data: null }),

    // Cotisations (dernières 5)
    memberId
      ? supabaseAdmin.from('cotisations')
          .select('campaign, status, amount, due_date, paid_date')
          .eq('member_id', memberId)
          .order('created_at', { ascending: false })
          .limit(5)
      : Promise.resolve({ data: null }),

    // Paiements récents
    memberId
      ? supabaseAdmin.from('payments')
          .select('amount_fcfa, provider, status, reference, created_at')
          .eq('member_id', memberId)
          .order('created_at', { ascending: false })
          .limit(5)
      : Promise.resolve({ data: null }),

    // Prix du marché pour la région
    regionName
      ? (async () => {
          const { data: regionRow } = await supabase
            .from('regions').select('id').eq('name', regionName).maybeSingle()
          if (!regionRow) return { data: null }
          return supabase
            .from('market_prices')
            .select('market_name, price, unit, currency, created_at, culture:cultures(name)')
            .eq('region_id', regionRow.id)
            .order('created_at', { ascending: false })
            .limit(25)
        })()
      : Promise.resolve({ data: null }),

    // Fiches techniques de la coopérative
    cooperativeId
      ? supabaseAdmin.from('fiches_techniques')
          .select('title, culture, type_agriculture, campaign, status')
          .eq('cooperative_id', cooperativeId)
          .eq('status', 'published')
          .order('created_at', { ascending: false })
          .limit(10)
      : Promise.resolve({ data: null }),

    // Météo récente pour la région
    regionName
      ? supabase
          .from('weather_data')
          .select('date, temperature_max, temperature_min, precipitation_mm, et0_mm, humidity_pct')
          .eq('region', regionName)
          .order('date', { ascending: false })
          .limit(7)
      : Promise.resolve({ data: null }),

    // Annonces AgriMarket du membre
    memberId
      ? supabaseAdmin.from('market_listings')
          .select('culture, quantity_kg, price_per_kg_fcfa, status, quality_grade, expires_at')
          .eq('member_id', memberId)
          .order('created_at', { ascending: false })
          .limit(5)
      : Promise.resolve({ data: null }),
  ])

  // ── Format contexts ───────────────────────────────────────────────
  const parcelles = parcellesRes.data
  const parcellesCtx = parcelles && parcelles.length > 0
    ? parcelles.map(p =>
        `• ${p.name ?? 'Parcelle'}: ${p.culture_principale ?? '?'}, ${p.superficie_ha ?? '?'} ha` +
        (p.canton ? ` — ${p.canton}` : '')
      ).join('\n')
    : 'Aucune parcelle enregistrée.'

  const cotisations = cotisationsRes.data
  const cotisationsCtx = cotisations && cotisations.length > 0
    ? cotisations.map(c =>
        `• Campagne ${c.campaign ?? '?'}: ${
          c.status === 'paid' ? 'Payée ✓' :
          c.status === 'waived' ? 'Exonérée' :
          c.status === 'overdue' ? '⚠️ EN RETARD' : 'En attente'
        }${c.amount ? ` — ${Number(c.amount).toLocaleString('fr-FR')} XOF` : ''}${
          c.due_date ? ` (échéance: ${new Date(c.due_date).toLocaleDateString('fr-FR')})` : ''
        }`
      ).join('\n')
    : 'Aucune cotisation enregistrée.'

  const payments = paymentsRes.data
  const paymentsCtx = payments && payments.length > 0
    ? payments.map(p =>
        `• ${new Date(p.created_at).toLocaleDateString('fr-FR')}: ${
          Number(p.amount_fcfa).toLocaleString('fr-FR')
        } XOF via ${p.provider} — ${p.status === 'success' ? 'validé ✓' : p.status}`
      ).join('\n')
    : 'Aucun paiement récent.'

  const prices = pricesRes.data
  let pricesCtx = 'Prix non disponibles pour cette région.'
  if (prices && prices.length > 0) {
    const byMarket = new Map<string, Map<string, number>>()
    for (const p of prices) {
      const cn = Array.isArray(p.culture)
        ? (p.culture[0] as { name?: string })?.name
        : (p.culture as { name?: string } | null)?.name
      if (!cn) continue
      if (!byMarket.has(p.market_name)) byMarket.set(p.market_name, new Map())
      const marketMap = byMarket.get(p.market_name)!
      if (!marketMap.has(cn)) marketMap.set(cn, Number(p.price))
    }
    const lines: string[] = []
    for (const [market, crops] of byMarket) {
      const cropList = [...crops.entries()].map(([c, pr]) => `${c}: ${pr} XOF/kg`).join(', ')
      lines.push(`• ${market}: ${cropList}`)
    }
    pricesCtx = lines.join('\n')
  }

  const fiches = fichesRes.data
  const fichesCtx = fiches && fiches.length > 0
    ? fiches.map(f =>
        `• "${f.title}" (${f.culture}, ${f.type_agriculture ?? 'standard'}${f.campaign ? `, campagne ${f.campaign}` : ''})`
      ).join('\n')
    : 'Aucune fiche technique publiée.'

  const weather = weatherRes.data
  let weatherCtx = 'Données météo non disponibles.'
  if (weather && weather.length > 0) {
    const today = weather[0]
    const weekAvgPrecip = weather.reduce((s, w) => s + (w.precipitation_mm ?? 0), 0) / weather.length
    weatherCtx = `Aujourd'hui: Tmax ${today.temperature_max ?? '?'}°C, Tmin ${today.temperature_min ?? '?'}°C, `
      + `pluie ${today.precipitation_mm ?? 0}mm, ET0 ${today.et0_mm ?? '?'}mm, humidité ${today.humidity_pct ?? '?'}%\n`
      + `Moyenne semaine: ${weekAvgPrecip.toFixed(1)}mm/jour précipitations`
  }

  const listings = listingsRes.data
  const listingsCtx = listings && listings.length > 0
    ? listings.map(l =>
        `• ${l.culture}: ${l.quantity_kg}kg à ${l.price_per_kg_fcfa} XOF/kg (qualité ${l.quality_grade}, ${l.status})`
      ).join('\n')
    : 'Aucune annonce sur AgriMarket.'

  const memberName = member
    ? `${member.first_name ?? ''} ${member.last_name ?? ''}`.trim()
    : ''

  const systemPrompt = `Tu es AgriTogo IA, l'assistant agricole intelligent de FaîtiereHub pour les coopératives du Togo.
Tu répondras en FRANÇAIS, de façon concise (3-5 phrases max), basée sur les données réelles du producteur.
Si une cotisation est en retard, rappelle-le avec bienveillance. Sois honnête si tu ne sais pas.
Ne donne pas de conseils médicaux ou juridiques.

═══ PROFIL DU PRODUCTEUR ═══
Nom : ${memberName || 'Inconnu'}
Statut : ${member?.status ?? 'actif'}
Village : ${member?.village ?? '?'} | Canton : ${member?.canton ?? '?'} | Région : ${member?.region ?? '?'}
Coopérative : ${coop?.name ?? '?'} (${coop?.level ?? '?'}) | Faîtière : ${coop?.faitiere_name ?? '?'}

═══ SES PARCELLES (${parcelles?.length ?? 0}) ═══
${parcellesCtx}

═══ SES COTISATIONS ═══
${cotisationsCtx}

═══ SES PAIEMENTS RÉCENTS ═══
${paymentsCtx}

═══ SES ANNONCES AGRIMARKET ═══
${listingsCtx}

═══ PRIX DU MARCHÉ — ${regionName ?? 'sa région'} ═══
${pricesCtx}

═══ MÉTÉO — ${regionName ?? 'sa région'} ═══
${weatherCtx}

═══ FICHES TECHNIQUES DISPONIBLES (sa coopérative) ═══
${fichesCtx}`

  return { systemPrompt, memberName, cooperativeId, memberId }
}
