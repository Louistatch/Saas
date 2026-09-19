/**
 * Génération du code public d'un Partenaire — même approche que
 * lib/utils/card-number.ts : crypto.randomInt() plutôt que Math.random(),
 * vérification d'unicité avant retour, plusieurs tentatives en cas de
 * collision.
 *
 * Format : TG-<préfecture>-<séquence>, ex. TG-KA-004 (Kara). Jamais l'UUID de
 * la ligne, qui ne doit pas fuiter dans une URL ou un badge public.
 */
import 'server-only'
import { randomInt } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'

const MAX_RETRIES = 5
const SEQ_MIN = 1
const SEQ_MAX = 999

/**
 * Dérive un code de préfecture à 2 lettres à partir de son nom. Retombe sur
 * 'XX' si le nom ne fournit aucune lettre exploitable — un compte peut se
 * porter candidat avant que sa préfecture ne soit connue.
 */
export function prefectureCode(name: string | null | undefined): string {
  const cleaned = (name ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z]/g, '')
    .toUpperCase()
  return (cleaned.slice(0, 2) || 'XX').padEnd(2, 'X')
}

/**
 * Génère un `partner_code` unique au format TG-<préfecture>-<séquence>.
 *
 * @param supabase       client capable de lire `partners` (admin ou RLS-scopé)
 * @param prefCode       code de préfecture, cf. prefectureCode()
 * @returns              un code garanti unique au moment de la génération
 * @throws               si aucun code unique n'a pu être trouvé après MAX_RETRIES
 */
export async function generateUniquePartnerCode(
  supabase: SupabaseClient,
  prefCode: string,
): Promise<string> {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const seq = randomInt(SEQ_MIN, SEQ_MAX + 1)
    const candidate = `TG-${prefCode}-${String(seq).padStart(3, '0')}`

    const { data, error } = await supabase
      .from('partners')
      .select('id')
      .eq('partner_code', candidate)
      .limit(1)
      .maybeSingle()

    if (error) {
      throw new Error(`Partner code uniqueness check failed: ${error.message}`)
    }
    if (!data) {
      return candidate
    }
  }

  throw new Error(
    `Could not generate a unique partner code for prefecture "${prefCode}" after ${MAX_RETRIES} attempts`,
  )
}
