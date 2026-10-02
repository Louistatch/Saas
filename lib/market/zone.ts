import 'server-only'
import type { Database } from '@/types/supabase'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Zone administrative d'une annonce : région → préfecture → canton.
 *
 * Une annonce se classe par proximité (même canton, puis même préfecture, puis
 * même région — voir lib/market/announcements.ts), donc elle doit porter les
 * niveaux qu'on peut établir. Or aucun appelant ne les connaît tous :
 *   - la fiche membre n'a souvent que le canton (10 sur 16 aujourd'hui) ou
 *     seulement des NOMS en texte libre (« Dankpen », « lama_kara ») sans
 *     identifiant ;
 *   - le formulaire Haroo n'en saisit qu'un niveau ;
 *   - un client malveillant pourrait envoyer un canton de la Kara avec une
 *     préfecture du Maritime.
 *
 * Cette fonction est la seule à décider. Elle accepte des identifiants OU des
 * noms, et REMONTE la hiérarchie depuis la base : le parent d'un canton est
 * celui que la base déclare, jamais celui qu'un appelant affirme. Les deux
 * routes de publication (Exploitation et Haroo) passent par elle, de sorte
 * qu'une même annonce reçoit la même zone quel que soit l'écran qui l'a créée.
 *
 * La PRÉFECTURE est le niveau de référence : les 37 préfectures sont en base,
 * alors que 21 d'entre elles n'ont aucun canton (dont Dankpen). Exiger un
 * canton rendrait la publication impossible dans la moitié du pays.
 */

export interface ResolvedZone {
  cantonId: string | null
  cantonName: string | null
  prefectureId: string | null
  prefectureName: string | null
  regionId: string | null
  regionName: string | null
}

export interface ZoneInput {
  cantonId?: string | null
  prefectureId?: string | null
  regionId?: string | null
  /** Noms en texte libre, utilisés seulement à défaut d'identifiant. */
  cantonName?: string | null
  prefectureName?: string | null
  regionName?: string | null
}

export const EMPTY_ZONE: ResolvedZone = {
  cantonId: null,
  cantonName: null,
  prefectureId: null,
  prefectureName: null,
  regionId: null,
  regionName: null,
}

/**
 * « lama_kara », « Lama-Kara » et « LAMA KARA » désignent le même canton ;
 * « Kévé » et « Keve » aussi. Les fiches issues de Kobo et celles saisies à la
 * main ne s'écrivent pas pareil, et c'est la comparaison qui doit absorber ça,
 * pas la donnée.
 */
export function normalizeName(value: string | null | undefined): string {
  return (value ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[_\-’']/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

type Db = SupabaseClient<Database>

export async function resolveZone(supabase: Db, input: ZoneInput): Promise<ResolvedZone> {
  const zone: ResolvedZone = {
    ...EMPTY_ZONE,
    cantonId: input.cantonId ?? null,
    prefectureId: input.prefectureId ?? null,
    regionId: input.regionId ?? null,
  }

  // ── Canton ────────────────────────────────────────────────────────────────
  if (zone.cantonId) {
    const { data } = await supabase
      .from('cantons')
      .select('name, prefecture_id')
      .eq('id', zone.cantonId)
      .maybeSingle<{ name: string; prefecture_id: string | null }>()
    if (data) {
      zone.cantonName = data.name
      // Le parent déclaré par la base l'emporte sur celui de l'appelant.
      zone.prefectureId = data.prefecture_id ?? zone.prefectureId
    } else {
      // Identifiant inconnu : le stocker ferait pointer l'annonce dans le vide.
      zone.cantonId = null
    }
  }

  // ── Préfecture : identifiant, sinon nom ───────────────────────────────────
  if (!zone.prefectureId && input.prefectureName) {
    const wanted = normalizeName(input.prefectureName)
    const { data } = await supabase
      .from('prefectures')
      .select('id, name')
      .returns<{ id: string; name: string }[]>()
    zone.prefectureId = data?.find((p) => normalizeName(p.name) === wanted)?.id ?? null
  }
  if (zone.prefectureId) {
    const { data } = await supabase
      .from('prefectures')
      .select('name, region_id')
      .eq('id', zone.prefectureId)
      .maybeSingle<{ name: string; region_id: string | null }>()
    if (data) {
      zone.prefectureName = data.name
      zone.regionId = data.region_id ?? zone.regionId
    } else {
      zone.prefectureId = null
    }
  }

  // ── Canton par nom, une fois la préfecture connue ─────────────────────────
  // Le restreindre à sa préfecture évite d'attribuer « Kpalimé » à un autre
  // canton homonyme d'une autre région.
  if (!zone.cantonId && input.cantonName && zone.prefectureId) {
    const wanted = normalizeName(input.cantonName)
    const { data } = await supabase
      .from('cantons')
      .select('id, name')
      .eq('prefecture_id', zone.prefectureId)
      .returns<{ id: string; name: string }[]>()
    const match = data?.find((c) => normalizeName(c.name) === wanted)
    if (match) {
      zone.cantonId = match.id
      zone.cantonName = match.name
    }
  }

  // ── Région : identifiant, sinon nom ───────────────────────────────────────
  if (!zone.regionId && input.regionName) {
    const wanted = normalizeName(input.regionName)
    const { data } = await supabase
      .from('regions')
      .select('id, name')
      .returns<{ id: string; name: string }[]>()
    zone.regionId = data?.find((r) => normalizeName(r.name) === wanted)?.id ?? null
  }
  if (zone.regionId) {
    const { data } = await supabase
      .from('regions')
      .select('name')
      .eq('id', zone.regionId)
      .maybeSingle<{ name: string }>()
    if (data) zone.regionName = data.name
    else zone.regionId = null
  }

  return zone
}

/** « Lama-Kara · Kozah · Kara » : où l'annonce sera publiée, du plus fin au plus large. */
export function describeZone(zone: ResolvedZone): string | null {
  const parts = [zone.cantonName, zone.prefectureName, zone.regionName].filter(Boolean)
  return parts.length > 0 ? parts.join(' · ') : null
}
