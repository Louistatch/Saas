import { ensureAllDemoAccounts } from '@/lib/admin/demo-accounts'
import { assertRole } from '@/lib/security/assert-access'
import { createClient as createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'

/** Crée les comptes de démo manquants (idempotent). super_admin uniquement. */
export async function POST() {
  const guard = await assertRole('super_admin')
  if (!guard.ok) return guard.response

  const admin = createAdminClient()
  const results = await ensureAllDemoAccounts(admin)
  const failed = results.filter((r) => !r.ok)
  if (failed.length > 0) {
    return NextResponse.json(
      { error: 'Certains comptes de démo n’ont pas pu être créés', results },
      { status: 500 },
    )
  }
  return NextResponse.json({ ok: true, results })
}
