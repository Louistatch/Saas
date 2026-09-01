import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const { data: app, error } = await supabase
    .from('credit_applications')
    .select('*, members(first_name, last_name, village), credit_repayments(*)')
    .eq('id', id)
    .single()

  if (error || !app) return NextResponse.json({ error: 'Introuvable' }, { status: 404 })
  return NextResponse.json({ application: app })
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const body = await request.json()
  const { status, amount_approved_fcfa, rejection_reason } = body

  const updates: Record<string, unknown> = { status, updated_at: new Date().toISOString(), reviewed_by: user.id, reviewed_at: new Date().toISOString() }
  if (amount_approved_fcfa) updates.amount_approved_fcfa = Number(amount_approved_fcfa)
  if (rejection_reason) updates.rejection_reason = rejection_reason
  if (status === 'disbursed') updates.disbursed_at = new Date().toISOString()

  const { data: app, error } = await supabase
    .from('credit_applications')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  // Generate repayment schedule on approval
  if (status === 'approved' && app.amount_approved_fcfa && app.duration_months) {
    const monthlyAmount = Math.ceil(
      (app.amount_approved_fcfa * (1 + (app.interest_rate_pct / 100))) / app.duration_months
    )
    const rows = Array.from({ length: app.duration_months }, (_, i) => {
      const due = new Date()
      due.setMonth(due.getMonth() + i + 1)
      return { application_id: id, due_date: due.toISOString().slice(0, 10), amount_due_fcfa: monthlyAmount }
    })
    void Promise.resolve(supabase.from('credit_repayments').insert(rows))
  }

  return NextResponse.json({ application: app })
}
