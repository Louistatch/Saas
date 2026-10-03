import 'server-only'
import { type MarketAnnouncement, searchAnnouncements } from '@/lib/market/announcements'
import { createClient as createAdminClient } from '@/lib/supabase/admin'

/**
 * Missions du Marché de proximité pour un agronome : annonces « mission »
 * actives, les plus proches de sa zone d'abord (canton, préfecture, région).
 */
export async function marketMissionsFor(
  agronomeId: string,
  limit = 10,
): Promise<MarketAnnouncement[]> {
  const admin = createAdminClient()
  const { data: ag } = await admin
    .from('haroo_agronome_profiles')
    .select('canton_id')
    .eq('id', agronomeId)
    .maybeSingle<{ canton_id: string | null }>()
  let zone: { cantonId?: string | null; prefectureId?: string | null; regionId?: string | null } =
    {}
  if (ag?.canton_id) {
    const { data: c } = await admin
      .from('cantons')
      .select('prefecture_id, prefectures(region_id)')
      .eq('id', ag.canton_id)
      .maybeSingle<{ prefecture_id: string; prefectures: { region_id: string } | null }>()
    zone = {
      cantonId: ag.canton_id,
      prefectureId: c?.prefecture_id,
      regionId: c?.prefectures?.region_id,
    }
  }
  return searchAnnouncements(admin, { zone, type: 'mission', limit })
}

/**
 * L'agronome PREND une annonce « mission » du marché : l'annonce est fermée
 * (une seule prise possible, contrôle atomique sur status = 'active') et une
 * mission EN_COURS est créée à son nom. Appelée APRÈS vérification carte + PIN.
 */
export async function takeMarketMission(
  agronomeId: string,
  announcementId: string,
): Promise<{ ok: true; missionId: string } | { ok: false; error: string; status: number }> {
  const admin = createAdminClient()
  const { data: ann } = await admin
    .from('producer_announcements')
    .update({ status: 'closed', updated_at: new Date().toISOString() })
    .eq('id', announcementId)
    .eq('type', 'mission')
    .eq('status', 'active')
    .select('id, author_id, title, description, culture, contact_phone')
    .maybeSingle<{
      id: string
      author_id: string | null
      title: string
      description: string | null
      culture: string | null
      contact_phone: string | null
    }>()
  if (!ann) return { ok: false, error: 'Cette annonce n’est plus disponible.', status: 409 }

  let name = 'Annonce du marché'
  if (ann.author_id) {
    const { data: p } = await admin
      .from('profiles')
      .select('first_name, last_name')
      .eq('id', ann.author_id)
      .maybeSingle<{ first_name: string | null; last_name: string | null }>()
    name = `${p?.first_name ?? ''} ${p?.last_name ?? ''}`.trim() || name
  }
  const now = new Date().toISOString()
  const { data: mission, error } = await admin
    .from('haroo_missions')
    .insert({
      agronome_id: agronomeId,
      requester_user_id: ann.author_id,
      requester_phone: ann.contact_phone,
      exploitant_name: name,
      description: [ann.title, ann.description].filter(Boolean).join(' — '),
      culture: ann.culture,
      statut: 'EN_COURS',
      accepted_at: now,
    })
    .select('id')
    .single()
  if (error || !mission) {
    // Rien de perdu : l'annonce redevient visible.
    await admin.from('producer_announcements').update({ status: 'active' }).eq('id', ann.id)
    return { ok: false, error: 'Prise de la mission impossible.', status: 502 }
  }
  return { ok: true, missionId: mission.id }
}
