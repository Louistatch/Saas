// Types et validation partagés entre les routes /api/haroolife/world, /home et l'interface.
// Aucune donnée de contact ne transite ici : nom affiché, pagne, rôles, effectifs.
import { z } from 'zod'

export const ROLE_LABELS = {
  producteur: 'Producteur',
  ouvrier: 'Ouvrier agricole',
  acheteur: 'Acheteur',
  agronome: 'Agronome',
  operateur: 'Opérateur de zone',
  admin_coop: 'Coopérative',
  union: 'Union',
  faitiere: 'Faîtière',
  equipe: 'Équipe FaîtiereHub',
} as const
export type Role = keyof typeof ROLE_LABELS

export interface PlaceRef {
  canton_id: string
  canton: string
  prefecture: string
  region: string
  region_code: string
}
export interface Resident {
  display_name: string
  pagne: number
  roles: Role[]
  is_me: boolean
}
export interface CantonNode {
  id: string
  name: string
  residents: number
}
export interface PrefectureNode {
  id: string
  name: string
  residents: number
  cantons: CantonNode[]
}
export interface RegionNode {
  id: string
  name: string
  code: string
  residents: number
  prefectures: PrefectureNode[]
}
export interface HereGroup {
  id: string
  kind: 'team' | 'work'
  title: string
  activity: string
  starts_on: string
  ends_on: string
  target: number
  people: number
  total: number
  expires_at: string
  is_owner: boolean
}
export interface MarketLine {
  culture: string
  icon: string | null
  price: number
  unit: string
  market: string | null
  observed_at: string
}
export interface SkyDay {
  date: string
  temperature_max: number
  temperature_min: number
  precipitation_mm: number
  precipitation_probability: number
}
export interface World {
  me: {
    roles: Role[]
    display_name: string | null
    pagne: number | null
    visible: boolean | null
    home: PlaceRef | null
    suggested_canton: string | null
  }
  territory: RegionNode[]
  here: {
    canton: PlaceRef
    residents: Resident[]
    cooperatives: { id: string; name: string; level: string | null; members: number }[]
    groups: HereGroup[]
    market: MarketLine[]
    sky: SkyDay[]
  } | null
}

export const homeSchema = z
  .object({
    canton_id: z.string().uuid(),
    display_name: z.string().trim().min(1).max(40),
    pagne: z.number().int().min(1).max(8).default(1),
    visible: z.boolean().default(true),
  })
  .strict()
export type HomeInput = z.infer<typeof homeSchema>

/** Initiales pour l'avatar : « Kossi A. » → « KA ». */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  return (
    parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : name.slice(0, 2)
  ).toUpperCase()
}

/** Garde la dernière observation par culture, les plus récentes d'abord. */
export function latestPerCulture(lines: MarketLine[], max = 8): MarketLine[] {
  const seen = new Set<string>()
  const out: MarketLine[] = []
  for (const line of [...lines].sort((a, b) => b.observed_at.localeCompare(a.observed_at))) {
    if (seen.has(line.culture)) continue
    seen.add(line.culture)
    out.push(line)
    if (out.length >= max) break
  }
  return out
}
