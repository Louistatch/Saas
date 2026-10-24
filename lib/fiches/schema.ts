import { TYPE_AGRICULTURE_KEYS } from '@/lib/fiches/types'
/**
 * Schémas de saisie d'un compte d'exploitation, PARTAGÉS par les routes
 * (POST /api/fiches, PATCH /api/fiches/[id]) et les écrans d'administration :
 * mêmes limites et mêmes messages des deux côtés. Sans `server-only`.
 */
import { z } from 'zod'

export const FICHE_LIMITS = {
  titleMin: 3,
  titleMax: 200,
  descriptionMax: 2000,
  cultureMax: 100,
  campaignMax: 50,
  priceMax: 1_000_000,
  filesMax: 20,
} as const

const COVER_PREFIX = () =>
  `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/fiches-covers/`

export const ficheFileSchema = z.object({
  name: z.string().min(1, 'Nom de fichier manquant').max(300, 'Nom de fichier trop long'),
  // Chemin dans le bucket privé, jamais une URL publique : le fichier n'est
  // servi que par URL signée (voir app/api/fiches/[id]/access). Le chemin, sa
  // présence et son contenu sont recontrôlés côté serveur (lib/fiches/files.ts).
  url: z.string().min(1, 'Chemin de fichier manquant').max(500, 'Chemin de fichier trop long'),
  type: z.string().max(120).default(''),
  size: z.number().int().nonnegative().optional(),
})

const title = z
  .string()
  .trim()
  .min(FICHE_LIMITS.titleMin, `Le titre doit compter au moins ${FICHE_LIMITS.titleMin} caractères`)
  .max(FICHE_LIMITS.titleMax, `Le titre ne doit pas dépasser ${FICHE_LIMITS.titleMax} caractères`)
const description = z
  .string()
  .trim()
  .max(
    FICHE_LIMITS.descriptionMax,
    `La description ne doit pas dépasser ${FICHE_LIMITS.descriptionMax} caractères`,
  )
const culture = z
  .string()
  .trim()
  .min(1, 'Indiquez la culture')
  .max(FICHE_LIMITS.cultureMax, 'Nom de culture trop long')
const typeAgriculture = z.enum(TYPE_AGRICULTURE_KEYS as [string, ...string[]], {
  error: 'Système de production inconnu',
})
const campaign = z
  .string()
  .trim()
  .max(
    FICHE_LIMITS.campaignMax,
    `La campagne ne doit pas dépasser ${FICHE_LIMITS.campaignMax} caractères`,
  )
const zone = z.string().uuid('Zone invalide')
const coverUrl = z
  .string()
  .url('Image invalide')
  .max(500, 'Adresse d’image trop longue')
  .refine((u) => u.startsWith(COVER_PREFIX()), 'Image hors du stockage FaîtiereHub')
const price = z
  .number({ error: 'Le prix doit être un nombre' })
  .int('Le prix doit être un nombre entier de FCFA')
  .nonnegative('Le prix ne peut pas être négatif')
  .max(FICHE_LIMITS.priceMax, 'Le prix ne doit pas dépasser 1 000 000 FCFA')
const files = z
  .array(ficheFileSchema)
  .max(FICHE_LIMITS.filesMax, `${FICHE_LIMITS.filesMax} fichiers au maximum`)

export const PUBLISH_NEEDS_FILE = 'Ajoutez au moins un fichier avant de mettre en vente'

export const createFicheSchema = z
  .object({
    title,
    description: description.optional(),
    culture,
    type_agriculture: typeAgriculture,
    campaign: campaign.optional(),
    region_id: zone.optional(),
    prefecture_id: zone.optional(),
    canton_id: zone.optional(),
    // Un brouillon peut être créé SANS fichier : les fichiers s'ajoutent
    // ensuite (PATCH files), après que les champs ont été validés.
    files: files.default([]),
    cover_url: coverUrl.optional(),
    // 0 = accès libre. C'est ce que lit /access pour ouvrir la fiche sans carte
    // ni achat — la gratuité du lancement est portée par la donnée.
    price_non_member: price.default(0),
    is_free_for_members: z.boolean().default(true),
    status: z.enum(['draft', 'published']).default('published'),
    // Super-admin : fiche de la plateforme FaîtiereHub (sans coopérative), vendue en ligne.
    platform: z.boolean().optional(),
    // Super-admin : faîtière propriétaire de la fiche (sélecteur de /dashboard/marketplace).
    // Refusé pour tout autre rôle, et recontrôlé côté serveur (niveau « faitiere »).
    cooperative_id: zone.optional(),
  })
  .superRefine((v, ctx) => {
    if (v.status === 'published' && v.files.length === 0)
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['files'], message: PUBLISH_NEEDS_FILE })
    if (v.platform === true && v.cooperative_id)
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['cooperative_id'],
        message: 'Une fiche de la plateforme n’appartient à aucune faîtière',
      })
  })

export const patchFicheSchema = z
  .object({
    title: title.optional(),
    description: description.nullable().optional(),
    culture: culture.optional(),
    type_agriculture: typeAgriculture.optional(),
    campaign: campaign.nullable().optional(),
    region_id: zone.nullable().optional(),
    prefecture_id: zone.nullable().optional(),
    canton_id: zone.nullable().optional(),
    cover_url: coverUrl.nullable().optional(),
    price_non_member: price.optional(),
    is_free_for_members: z.boolean().optional(),
    status: z.enum(['draft', 'published', 'archived']).optional(),
    /** Remplace la liste des fichiers (contrôlés côté serveur). */
    files: files.optional(),
    /** Confirmation explicite exigée pour passer un compte payant à 0 FCFA. */
    confirm_free: z.boolean().optional(),
  })
  .superRefine((v, ctx) => {
    if (v.status === 'published' && v.files && v.files.length === 0)
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['files'], message: PUBLISH_NEEDS_FILE })
  })

export type CreateFicheInput = z.infer<typeof createFicheSchema>
export type PatchFicheInput = z.infer<typeof patchFicheSchema>

/** Erreurs par champ, en français, pour la réponse 400. */
export function fieldErrors(error: z.ZodError): Record<string, string[]> {
  return error.flatten().fieldErrors as Record<string, string[]>
}

export const CONFIRM_FREE_REQUIRED =
  'Ce compte est vendu : confirmez explicitement le passage à la gratuité (confirm_free).'
