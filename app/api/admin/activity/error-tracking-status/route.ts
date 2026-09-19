import { assertRole } from '@/lib/security/assert-access'
import { NextResponse } from 'next/server'

/**
 * Sentry est déjà intégré au code (sentry.{client,server,edge}.config.ts) —
 * il ne fait rien tant que NEXT_PUBLIC_SENTRY_DSN n'est pas configuré côté
 * Vercel (variable optionnelle, cf. .env.example). Cette route dit juste à
 * l'admin si c'est branché, jamais la valeur du DSN.
 */
export async function GET() {
  const guard = await assertRole('super_admin')
  if (!guard.ok) return guard.response

  const configured = Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN)
  const org = process.env.SENTRY_ORG ?? null
  const project = process.env.SENTRY_PROJECT ?? null
  const dashboardUrl =
    org && project ? `https://sentry.io/organizations/${org}/issues/?project=${project}` : null

  return NextResponse.json({ configured, dashboardUrl })
}
