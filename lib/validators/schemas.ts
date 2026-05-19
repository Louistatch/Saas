import { z } from 'zod'
import { USER_ROLES, PRODUCT_CATEGORIES } from '@/types/domain'

const HEX_COLOR_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/
const UUID_RE =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/

export const uuidSchema = z.string().regex(UUID_RE, 'Invalid identifier')

export const hexColorSchema = z
  .string()
  .regex(HEX_COLOR_RE, 'Must be a valid hex color (e.g. #16a34a)')

export const emailSchema = z.string().email('Invalid email address')

export const memberSchema = z.object({
  first_name: z.string().min(1, 'First name is required').max(100),
  last_name: z.string().min(1, 'Last name is required').max(100),
  email: z.string().email('Invalid email').optional().or(z.literal('')),
  phone: z
    .string()
    .max(40)
    .regex(/^[+0-9 ()\-.]*$/, 'Phone may only contain digits, spaces and + - ( )')
    .optional()
    .or(z.literal('')),
  address: z.string().max(255).optional().or(z.literal('')),
})
export type MemberInput = z.infer<typeof memberSchema>

export const exploitationSchema = z.object({
  name: z.string().min(1, 'Name is required').max(120),
  description: z.string().max(1000).optional().or(z.literal('')),
  category: z.enum(PRODUCT_CATEGORIES).optional().or(z.literal('')),
  producer: z.string().max(120).optional().or(z.literal('')),
  unit: z.string().max(20).optional().or(z.literal('')),
  price: z
    .union([
      z.string().regex(/^\d+(\.\d{1,2})?$/, 'Use numbers like 3.50'),
      z.literal(''),
    ])
    .optional(),
  active: z.boolean(),
})
export type ExploitationInput = z.infer<typeof exploitationSchema>

export const cooperativeSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').max(120),
  description: z.string().max(1000).optional().or(z.literal('')),
  primary_color: hexColorSchema,
})
export type CooperativeInput = z.infer<typeof cooperativeSchema>

export const cardTemplateSchema = z.object({
  title: z.string().min(1).max(60),
  subtitle: z.string().min(1).max(60),
  bgColor: hexColorSchema,
  textColor: hexColorSchema,
})

export const cardSettingsSchema = z.object({
  defaultValidityDays: z.number().int().min(1).max(3650),
  qrCodeIncludes: z.object({
    cardNumber: z.boolean(),
    memberId: z.boolean(),
    cooperativeId: z.boolean(),
  }),
})

export const generateCardSchema = z.object({
  member_id: uuidSchema,
  validity_days: z.number().int().min(1).max(3650),
})

export const profileUpdateSchema = z.object({
  role: z.enum(USER_ROLES),
  cooperative_id: uuidSchema.nullable(),
})

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Password is required'),
})

export const signupSchema = z.object({
  firstName: z.string().min(1, 'First name is required').max(60),
  lastName: z.string().min(1, 'Last name is required').max(60),
  email: emailSchema,
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(128)
    .regex(/[a-zA-Z]/, 'Password must contain at least one letter')
    .regex(/[0-9]/, 'Password must contain at least one number'),
  cooperative: z.string().min(2, 'Cooperative name is required').max(120),
})

/**
 * Returns a flat object of `{ field: firstError }` for use with the
 * imperative form patterns already in the app.
 */
export function flattenZodErrors<T extends z.ZodTypeAny>(
  err: z.ZodError<z.infer<T>>,
): Record<string, string> {
  const out: Record<string, string> = {}
  for (const issue of err.issues) {
    const key = issue.path.join('.') || '_'
    if (!out[key]) out[key] = issue.message
  }
  return out
}
