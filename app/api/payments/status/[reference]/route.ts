import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ reference: string }> },
): Promise<NextResponse> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { reference } = await params

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, cooperative_id')
    .eq('id', user.id)
    .single()

  const { data: payment, error } = await supabase
    .from('payments')
    .select('*')
    .eq('reference', reference)
    .single()

  if (error || !payment) {
    return NextResponse.json({ error: 'Payment not found' }, { status: 404 })
  }

  const isSuperAdmin = profile?.role === 'super_admin'
  const isCoopAdmin = profile?.role === 'cooperative_admin' && profile?.cooperative_id === payment.cooperative_id
  const isMemberOwner = payment.member_id === user.id

  if (!isSuperAdmin && !isCoopAdmin && !isMemberOwner) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  return NextResponse.json({ payment })
}
