import { DEMO_ROLES, type DemoRoleKey, generateDemoSignInLink } from '@/lib/admin/demo-accounts'
import { assertRole } from '@/lib/security/assert-access'
import { createClient as createAdminClient } from '@/lib/supabase/admin'
import { type NextRequest, NextResponse } from 'next/server'

/**
 * Lien de connexion à usage unique pour un compte de démo — jamais un vrai
 * compte utilisateur (generateDemoSignInLink revérifie is_demo en base).
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ key: string }> },
) {
  const guard = await assertRole('super_admin')
  if (!guard.ok) return guard.response

  const { key } = await params
  const isValidKey = DEMO_ROLES.some((r) => r.key === key)
  if (!isValidKey) {
    return NextResponse.json({ error: 'Rôle de démo invalide' }, { status: 400 })
  }

  const admin = createAdminClient()
  const result = await generateDemoSignInLink(admin, key as DemoRoleKey)
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 })
  }
  return NextResponse.json({ url: result.url })
}
