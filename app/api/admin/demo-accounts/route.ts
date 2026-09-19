import { listDemoAccountStatus } from '@/lib/admin/demo-accounts'
import { assertRole } from '@/lib/security/assert-access'
import { createClient as createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'

/** Liste des rôles de démo et si leur compte a déjà été initialisé. */
export async function GET() {
  const guard = await assertRole('super_admin')
  if (!guard.ok) return guard.response

  const admin = createAdminClient()
  const roles = await listDemoAccountStatus(admin)
  return NextResponse.json({ roles })
}
