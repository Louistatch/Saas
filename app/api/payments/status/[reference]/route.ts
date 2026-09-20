import { assertTenantAccess } from '@/lib/security/assert-access'
import { createClient } from '@/lib/supabase/server'
import { type NextRequest, NextResponse } from 'next/server'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ reference: string }> },
): Promise<NextResponse> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { reference } = await params

  const { data: payment, error } = await supabase
    .from('payments')
    .select('*')
    .eq('reference', reference)
    .single()

  if (error || !payment) {
    return NextResponse.json({ error: 'Payment not found' }, { status: 404 })
  }

  const tenant = await assertTenantAccess(payment.cooperative_id)
  if (!tenant.ok) {
    const { data: member } = await supabase
      .from('members')
      .select('email, cooperative_id')
      .eq('id', payment.member_id ?? '')
      .maybeSingle()
    const { data: profile } = await supabase
      .from('profiles')
      .select('role, cooperative_id')
      .eq('id', user.id)
      .maybeSingle()
    const ownMember =
      profile?.role === 'member' &&
      !!user.email_confirmed_at &&
      !!user.email &&
      !!member?.email &&
      member.email.toLowerCase() === user.email.toLowerCase() &&
      member.cooperative_id === profile.cooperative_id
    if (!ownMember) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  return NextResponse.json({ payment })
}
