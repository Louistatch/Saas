/**
 * Lecture des correspondances de champs (kobo_field_mappings) d'un formulaire.
 * Partagée par le webhook, le pull et le répartiteur : une seule lecture, un seul sens.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { KoboFieldMappingRow } from './types'

export async function loadFieldMappings(
  db: SupabaseClient,
  cooperativeId: string,
  formId: string,
): Promise<KoboFieldMappingRow[]> {
  const { data, error } = await db
    .from('kobo_field_mappings')
    .select('*')
    .eq('cooperative_id', cooperativeId)
    .eq('form_id', formId)
  if (error) throw new Error(`Lecture des correspondances de champs impossible : ${error.message}`)
  return (data as KoboFieldMappingRow[] | null) ?? []
}
