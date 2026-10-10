import { z } from 'zod'

export const ACTIVITIES = { recolte: 'Récolte', semis: 'Semis', desherbage: 'Désherbage' } as const
export type Kind = 'team' | 'work'
export interface Group {
  id: string
  kind: Kind
  title: string
  activity: keyof typeof ACTIVITIES
  starts_on: string
  ends_on: string
  target: number
  total: number
  people: number
  expires_at: string
  is_owner: boolean
  joined: boolean
  state: 'open' | 'ready' | 'expired' | 'cancelled'
}
export interface Board {
  access: { can_team: boolean; can_work: boolean }
  pilot: {
    canton: string
    cooperative: string
    team_target: number
    area_target: number
    formation_hours: number
  }
  groups: Group[]
  parcels: { id: string; culture: string | null; area: number }[]
}

const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((s) => {
    const d = new Date(`${s}T00:00:00Z`)
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s
  }, 'Date invalide')
const contribution = {
  parcel_id: z.string().uuid().optional(),
  amount: z.number().finite().positive().max(999999).optional(),
}
export const commandSchema = z.discriminatedUnion('action', [
  z
    .object({
      request_id: z.string().uuid(),
      action: z.literal('create'),
      payload: z
        .object({
          kind: z.enum(['team', 'work']),
          title: z.string().trim().min(3).max(100),
          activity: z.enum(['recolte', 'semis', 'desherbage']),
          starts_on: date,
          ends_on: date,
          ...contribution,
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      request_id: z.string().uuid(),
      action: z.literal('join'),
      payload: z.object({ group_id: z.string().uuid(), ...contribution }).strict(),
    })
    .strict(),
  z
    .object({
      request_id: z.string().uuid(),
      action: z.enum(['leave', 'cancel']),
      payload: z.object({ group_id: z.string().uuid() }).strict(),
    })
    .strict(),
])
export type Command = z.infer<typeof commandSchema>

export function displayState(group: Group, now: number): Group['state'] {
  if (group.state === 'cancelled') return 'cancelled'
  return new Date(group.expires_at).getTime() <= now ? 'expired' : group.state
}
export function progress(group: Pick<Group, 'total' | 'target'>) {
  return group.target > 0
    ? Math.min(100, Math.max(0, (Number(group.total) / Number(group.target)) * 100))
    : 0
}
