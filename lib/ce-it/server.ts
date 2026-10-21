import 'server-only'
import { createHash, randomBytes } from 'node:crypto'
import { normalizedCardNumber } from '@/lib/security/card-number'
import { loginWithCardPin } from '@/lib/security/card-pin'
import { createClient as adminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import { acquireFreeAccess } from './access-flow'
import { BUCKET } from './schema'

export const enabled = () => process.env.CE_IT_MODULE_ENABLED === 'true'
export const json = (body: unknown, status = 200) =>
  NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' },
  })
export const unavailable = () => json({ error: 'Module CE/IT non activé.' }, 404)
export const digest = (token: string | Uint8Array) =>
  createHash('sha256').update(token).digest('hex')
export function failure(error: unknown) {
  const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : ''
  return json(
    {
      error:
        code === 'CEIT_PIN_UNAVAILABLE'
          ? 'L’accès par carte est temporairement indisponible.'
          : code === '42501'
            ? 'Action non autorisée.'
            : code === '23505'
              ? 'Une demande est déjà en cours.'
              : 'Action impossible. Vérifiez vos droits et l’état du document.',
    },
    code === 'CEIT_PIN_UNAVAILABLE' ? 503 : code === '42501' ? 403 : code === '23505' ? 409 : 400,
  )
}
export async function memberAccess(raw: unknown) {
  const admin = adminClient()
  return acquireFreeAccess(raw, {
    verifyPin: async (card, pin) => {
      const result = await loginWithCardPin(card, pin)
      if (!result.ok && result.reason === 'not_configured') throw { code: 'CEIT_PIN_UNAVAILABLE' }
      return result
    },
    issueGrant: async (product, number, member) => {
      const cardNumber = normalizedCardNumber(number)
      if (!cardNumber) throw new Error('invalid')
      const { data: card, error } = await admin
        .from('member_cards')
        .select('id')
        .eq('card_number', cardNumber)
        .eq('member_id', member)
        .maybeSingle<{ id: string }>()
      if (error || !card) throw new Error('invalid')
      const token = randomBytes(32).toString('hex')
      const result = await admin.rpc('ceit_grant_card', {
        product,
        card: card.id,
        member,
        proof_hash: digest(token),
      })
      if (result.error) throw result.error
      return { grant_id: String(result.data), token }
    },
  })
}
export interface GrantedFiles {
  grant_id: string
  version_id: string
  product_id: string
  ce_key: string
  it_key: string
}
export async function checkGrant(grant: string, token: string, actor: string | null = null) {
  const result = await adminClient().rpc('ceit_check_grant', {
    grant_uuid: grant,
    proof_hash: digest(token),
    actor,
  })
  if (result.error) throw result.error
  return result.data as GrantedFiles
}
export async function downloadLinks(grant: string, token: string, actor: string | null = null) {
  const access = await checkGrant(grant, token, actor)
  const admin = adminClient()
  const links = await Promise.all(
    (['ce', 'it'] as const).map(async (kind) => {
      const key = kind === 'ce' ? access.ce_key : access.it_key
      // Defense in depth: never sign a different product's key, absolute URL or arbitrary file.
      if (key !== `${access.product_id}/${access.version_id}/${kind}.pdf`)
        throw new Error('invalid file')
      const { data, error } = await admin.storage
        .from(BUCKET)
        .createSignedUrl(key, 300, { download: `${kind}.pdf` })
      if (error || !data?.signedUrl) throw new Error('storage unavailable')
      return { kind, url: data.signedUrl }
    }),
  )
  const audit = await admin.from('ceit_download_events').insert({ grant_id: grant })
  if (audit.error) throw audit.error
  return links
}
