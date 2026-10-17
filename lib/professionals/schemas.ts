/**
 * Schémas Zod des cartes professionnelles — sans alias '@/' pour être chargés
 * tels quels par node:test (tests/professional-cards.test.ts).
 */
import { z } from 'zod'
import { DOCUMENT_KINDS, PROFESSIONS } from './core'

const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/
const faitiereIdSchema = z.string().regex(UUID_RE, 'Faîtière invalide')

const phoneSchema = z
  .string()
  .trim()
  .min(8, 'Le téléphone est requis')
  .max(40)
  .regex(/^[+0-9 ()\-.]*$/, 'Le téléphone ne peut contenir que des chiffres, espaces et + - ( )')

const specialisationsSchema = z.array(z.string().trim().min(1).max(60)).max(10).optional()

/**
 * Inscription Haroo indépendante de l'appartenance à une organisation, comme
 * l'inscription Opérateur. Un éventuel suivi par une faîtière est facultatif
 * et n'accorde aucun rôle organisationnel. Les anciens clients peuvent encore
 * transmettre ce choix ; une valeur renseignée reste strictement validée.
 */
export const harooSignupSchema = z
  .object({
    profileType: z.enum(['OUVRIER', 'ACHETEUR', 'AGRONOME']),
    profession: z.enum(PROFESSIONS).optional(),
    faitiereId: z.preprocess(
      (value) => (value === null || value === '' ? undefined : value),
      faitiereIdSchema.optional(),
    ),
    specialisations: specialisationsSchema,
    firstName: z.string().trim().min(2, 'Le prénom est requis').max(100),
    lastName: z.string().trim().min(2, 'Le nom est requis').max(100),
    phone: phoneSchema,
    email: z.string().trim().toLowerCase().email('Invalid email address'),
    password: z.string().min(8, 'Le mot de passe doit contenir au moins 8 caractères').max(128),
  })
  .superRefine((v, ctx) => {
    if (v.profileType !== 'AGRONOME' && v.profession) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['profession'],
        message: 'Profession réservée au conseil agricole',
      })
    }
  })
export type HarooSignupInput = z.infer<typeof harooSignupSchema>

/** Inscription d'un professionnel par un Opérateur officier (ou super_admin). */
export const professionalRegisterSchema = z.object({
  profession: z.enum(PROFESSIONS),
  faitiereId: faitiereIdSchema,
  firstName: z.string().trim().min(2, 'Le prénom est requis').max(100),
  lastName: z.string().trim().min(2, 'Le nom est requis').max(100),
  phone: phoneSchema,
  email: z.string().trim().toLowerCase().email('Adresse e-mail invalide'),
  specialisations: specialisationsSchema,
})
export type ProfessionalRegisterInput = z.infer<typeof professionalRegisterSchema>

export const documentKindSchema = z.enum(DOCUMENT_KINDS)
