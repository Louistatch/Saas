import 'server-only'
import { createHash, randomBytes } from 'node:crypto'
import type { AdminClient } from '@/lib/payg/server'
import type { NextRequest } from 'next/server'

export async function readJson(request: NextRequest): Promise<unknown> {
  return request.json().catch(() => null)
}

/** Adresse publique du site (retours de paiement, liens d'invitation). */
export function appUrlOf(request: NextRequest) {
  return (process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin).replace(/\/$/, '')
}

export async function customerOf(admin: AdminClient, userId: string) {
  const { data } = await admin
    .from('profiles')
    .select('first_name, last_name, email')
    .eq('id', userId)
    .maybeSingle()
  return {
    name: [data?.first_name, data?.last_name].filter(Boolean).join(' ') || 'Client FaîtièreHub',
    email: data?.email ?? null,
  }
}

/** Jeton d'invitation : seul son empreinte est stockée, le jeton ne vit que dans le lien. */
export function newInvitationToken() {
  const token = randomBytes(24).toString('base64url')
  return { token, hash: hashToken(token) }
}

export function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex')
}

export function csvResponse(csv: string, filename: string) {
  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  })
}
