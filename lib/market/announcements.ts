import 'server-only'
import type { Database } from '@/types/supabase'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Marché de proximité — recherche et publication d'annonces.
 *
 * La proximité est ADMINISTRATIVE, pas métrique : même canton, puis même
 * préfecture, puis même région, puis le reste. Les annonces ne portent pas de
 * coordonnées GPS, et en faire saisir depuis un téléphone rural serait un
 * autre chantier ; la hiérarchie région → préfecture → canton existe déjà et
 * répond à la seule question qui compte ici : « qu'est-ce qu'il y a près de
 * chez moi ? ».
 */

export type AnnouncementType = 'job' | 'prevente' | 'mission' | 'autre'

export const ANNOUNCEMENT_TYPES: { value: AnnouncementType; label: string; hint: string }[] = [
  { value: 'prevente', label: 'Prévente de récolte', hint: 'Je vends une production à venir' },
  { value: 'job', label: "Offre d'emploi", hint: 'Je cherche de la main-d’œuvre' },
  { value: 'mission', label: 'Mission de conseil', hint: 'Je cherche un agronome' },
  { value: 'autre', label: 'Autre', hint: 'Matériel, transport, service' },
]

/** 0 = même canton, 3 = ailleurs. Sert uniquement au tri. */
export type ProximityRank = 0 | 1 | 2 | 3

export interface Zone {
  cantonId?: string | null
  prefectureId?: string | null
  regionId?: string | null
}

export interface MarketAnnouncement {
  id: string
  type: AnnouncementType
  title: string
  description: string | null
  culture: string | null
  quantity_kg: number | null
  price_per_kg_fcfa: number | null
  contact_phone: string | null
  created_at: string
  canton: string | null
  prefecture: string | null
  region: string | null
  proximity: ProximityRank
}

interface Row {
  id: string
  type: string
  title: string
  description: string | null
  culture: string | null
  quantity_kg: number | null
  price_per_kg_fcfa: number | null
  contact_phone: string | null
  created_at: string
  canton_id: string | null
  prefecture_id: string | null
  region_id: string | null
  location_canton: string | null
  cantons: { name: string } | null
  prefectures: { name: string } | null
  regions: { name: string } | null
}

const SELECT =
  'id, type, title, description, culture, quantity_kg, price_per_kg_fcfa, contact_phone, created_at, canton_id, prefecture_id, region_id, location_canton, cantons(name), prefectures(name), regions(name)'

function rankOf(row: Row, zone: Zone): ProximityRank {
  if (zone.cantonId && row.canton_id === zone.cantonId) return 0
  if (zone.prefectureId && row.prefecture_id === zone.prefectureId) return 1
  if (zone.regionId && row.region_id === zone.regionId) return 2
  return 3
}

export interface SearchParams {
  zone?: Zone
  type?: AnnouncementType
  /** Recherche plein texte simple sur le titre et la culture. */
  query?: string
  limit?: number
}

/**
 * La lecture passe par le client de session, jamais par le service_role : la
 * policy `announcements_public` (status='active', visible y compris des
 * visiteurs anonymes) reste l'autorité. Si elle change, cette fonction cesse
 * de renvoyer ce qu'elle ne devrait plus — c'est voulu.
 */
export async function searchAnnouncements(
  supabase: SupabaseClient<Database>,
  params: SearchParams = {},
): Promise<MarketAnnouncement[]> {
  const limit = Math.min(Math.max(params.limit ?? 60, 1), 100)

  let query = supabase
    .from('producer_announcements')
    .select(SELECT)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (params.type) query = query.eq('type', params.type)
  if (params.query?.trim()) {
    // `,` et `%` casseraient la syntaxe du filtre PostgREST.
    const term = params.query.trim().replace(/[,%]/g, ' ').slice(0, 60)
    query = query.or(`title.ilike.%${term}%,culture.ilike.%${term}%`)
  }

  const { data, error } = await query.returns<Row[]>()
  if (error) throw new Error('Recherche indisponible')

  const zone = params.zone ?? {}
  return (data ?? [])
    .map((row) => ({
      id: row.id,
      type: row.type as AnnouncementType,
      title: row.title,
      description: row.description,
      culture: row.culture,
      quantity_kg: row.quantity_kg,
      price_per_kg_fcfa: row.price_per_kg_fcfa,
      contact_phone: row.contact_phone,
      created_at: row.created_at,
      // `location_canton` (texte libre historique) sert de repli tant que
      // toutes les annonces ne portent pas de canton_id.
      canton: row.cantons?.name ?? row.location_canton,
      prefecture: row.prefectures?.name ?? null,
      region: row.regions?.name ?? null,
      proximity: rankOf(row, zone),
    }))
    .sort((a, b) =>
      a.proximity !== b.proximity
        ? a.proximity - b.proximity
        : b.created_at.localeCompare(a.created_at),
    )
}

/**
 * Zone de référence du compte, pour le tri « près de chez moi ». On la déduit
 * du profil Haroo quand il en porte une, sinon de la fiche membre. Un compte
 * sans zone connue voit simplement les annonces les plus récentes.
 */
export async function resolveViewerZone(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<Zone> {
  const { data: profile } = await supabase
    .from('profiles')
    .select('haroo_type, cooperative_id')
    .eq('id', userId)
    .maybeSingle<{ haroo_type: string | null; cooperative_id: string | null }>()

  if (profile?.haroo_type === 'agronome') {
    const { data } = await supabase
      .from('haroo_agronome_profiles')
      .select('canton_id, cantons(prefecture_id)')
      .eq('user_id', userId)
      .maybeSingle<{ canton_id: string | null; cantons: { prefecture_id: string | null } | null }>()
    if (data?.canton_id) {
      return { cantonId: data.canton_id, prefectureId: data.cantons?.prefecture_id ?? null }
    }
  }

  if (profile?.haroo_type === 'acheteur') {
    const { data } = await supabase
      .from('haroo_acheteur_profiles')
      .select('prefecture_id')
      .eq('user_id', userId)
      .maybeSingle<{ prefecture_id: string | null }>()
    if (data?.prefecture_id) return { prefectureId: data.prefecture_id }
  }

  if (profile?.haroo_type === 'ouvrier') {
    // `haroo_ouvrier_cantons.ouvrier_id` référence l'id du PROFIL ouvrier,
    // pas le compte : il faut passer par le profil avant d'interroger la
    // table de liaison.
    const { data: ouvrier } = await supabase
      .from('haroo_ouvrier_profiles')
      .select('id')
      .eq('user_id', userId)
      .maybeSingle<{ id: string }>()

    if (ouvrier?.id) {
      // L'ouvrier déclare plusieurs cantons ; on retient le premier comme
      // point d'ancrage du tri — le filtre manuel reste disponible.
      const { data } = await supabase
        .from('haroo_ouvrier_cantons')
        .select('canton_id, cantons(prefecture_id)')
        .eq('ouvrier_id', ouvrier.id)
        .limit(1)
        .maybeSingle<{
          canton_id: string | null
          cantons: { prefecture_id: string | null } | null
        }>()
      if (data?.canton_id) {
        return { cantonId: data.canton_id, prefectureId: data.cantons?.prefecture_id ?? null }
      }
    }
  }

  return {}
}
