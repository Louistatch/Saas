import 'server-only'

import { foldWord, organizationSimilarity } from '@/lib/dedup/names'
import { cooperativeNameSchema } from '@/lib/validators/kobo'
import type { SupabaseClient } from '@supabase/supabase-js'

const LEGAL = new Set(
  'de du des la le les l d et a au aux en cooperative cooperatives coop coopec scoop scoops sca scaa ca societe ste simplifiee simplifie groupement gpt gie association asso'.split(
    ' ',
  ),
)
const GENERIC = new Set(
  ['espoir', 'solidarite', 'avenir', 'producteurs', 'maraichers'].map(foldWord),
)
function words(name: string) {
  return name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\bs[.\s]*c[.\s]*o[.\s]*o[.\s]*p[.\s]*s\b/g, 'scoops')
    .split(/[^a-z0-9]+/)
    .filter((w) => w && !LEGAL.has(w))
}
/** Exact normalization only: no village or distinctive word is discarded. */
export function cooperativeIdentityKey(name: string): string {
  return [...new Set(words(name))].sort().join(' ')
}
function confidence(a: string, b: string) {
  if (cooperativeIdentityKey(a) && cooperativeIdentityKey(a) === cooperativeIdentityKey(b)) return 1
  const ta = words(a).map(foldWord)
  const tb = words(b).map(foldWord)
  const [short, long] = ta.length <= tb.length ? [ta, tb] : [tb, ta]
  // A distinctive local name may be given without a generic prefix (Espoir de …).
  // A common name such as Espoir alone never becomes a location/identity anchor.
  if (short.length === 1 && short[0].length >= 5 && !GENERIC.has(short[0])) {
    const anchor = short[0]
    if (long.includes(anchor) && long.every((w) => w === anchor || GENERIC.has(w))) return 0.97
  }
  return organizationSimilarity(a, b)
}

export function decideCooperativeMatch<T extends { id: string; name: string }>(
  name: string,
  candidates: T[],
) {
  const ranked = candidates
    .map((item) => ({ item, score: confidence(name, item.name) }))
    .sort((a, b) => b.score - a.score || a.item.id.localeCompare(b.item.id))
  const best = ranked[0]
  if (!best || best.score < 0.65) return { kind: 'new' as const }
  if (best.score >= 0.93 && (!ranked[1] || best.score - ranked[1].score >= 0.08)) {
    return { kind: 'match' as const, ...best }
  }
  return { kind: 'review' as const, candidates: ranked.filter((r) => r.score >= 0.65).slice(0, 3) }
}

/** Root IDs, never the editable faitiere_name label, define the search boundary. */
export async function resolveKoboOrganization(
  supabase: SupabaseClient,
  rootId: string,
  submittedName: string,
  parentId: string,
  level: 'cooperative' | 'union' = 'cooperative',
) {
  const name = cooperativeNameSchema.parse(
    submittedName.normalize('NFC').replace(/\s+/g, ' ').trim(),
  )
  if (!cooperativeIdentityKey(name)) throw new Error('Nom de coopérative sans élément distinctif')
  const { data: descendants, error: scopeError } = await supabase.rpc(
    'get_cooperative_descendants',
    { p_root_id: rootId },
  )
  if (scopeError || !Array.isArray(descendants))
    throw new Error('Périmètre de la faîtière indisponible')
  const ids = [rootId, ...descendants.map((r) => r.id as string)]
  if (!ids.includes(parentId)) throw new Error('Organisation parente hors de cette faîtière')
  const { data, error } = await supabase
    .from('cooperatives')
    .select('id, name')
    .in('id', ids)
    .eq('level', level)
    .is('deleted_at', null)
  if (error) throw new Error('Référentiel des coopératives indisponible')
  const decision = decideCooperativeMatch(name, (data ?? []) as { id: string; name: string }[])
  if (decision.kind === 'review') {
    throw new Error(
      `Nom de coopérative à vérifier : ${decision.candidates.map((r) => r.item.name).join(' / ')}. Aucun rattachement automatique.`,
    )
  }
  const { data: resolved, error: resolveError } = await supabase.rpc('kobo_resolve_organization', {
    p_root: rootId,
    p_parent: parentId,
    p_name: name,
    p_level: level,
    p_match: decision.kind === 'match' ? decision.item.id : null,
  })
  if (resolveError || !resolved?.id)
    throw new Error(resolveError?.message ?? 'Résolution de coopérative impossible')
  return {
    id: resolved.id as string,
    name: resolved.name as string,
    method: resolved.method as string,
    score: decision.kind === 'match' ? decision.score : null,
    submitted_name: submittedName,
  }
}
