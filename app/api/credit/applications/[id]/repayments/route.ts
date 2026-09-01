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

  const { data, error } = await supabase
    .from('credit_repayments')
    .select('*')
    .eq('application_id', id)
    .order('due_date')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ repayments: data ?? [] })
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const { repayment_id, amount_paid } = await request.json()
  if (!repayment_id || !amount_paid) return NextResponse.json({ error: 'Champs manquants' }, { status: 400 })

  const { data: rep } = await supabase.from('credit_repayments').select('amount_due_fcfa, amount_paid_fcfa').eq('id', repayment_id).single()
  if (!rep) return NextResponse.json({ error: 'Échéance introuvable' }, { status: 404 })

  const totalPaid = (rep.amount_paid_fcfa ?? 0) + Number(amount_paid)
  const newStatus = totalPaid >= rep.amount_due_fcfa ? 'paid' : 'partial'

  const { data, error } = await supabase
    .from('credit_repayments')
    .update({ amount_paid_fcfa: totalPaid, status: newStatus, paid_at: newStatus === 'paid' ? new Date().toISOString() : null })
    .eq('id', repayment_id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  // Check if all repayments paid — update application status
  void Promise.resolve(
    supabase.from('credit_repayments').select('status').eq('application_id', id).then(({ data: reps }) => {
      if (reps && reps.every(r => r.status === 'paid')) {
        return supabase.from('credit_applications').update({ status: 'closed', updated_at: new Date().toISOString() }).eq('id', id)
      }
    })
  )

  return NextResponse.json({ repayment: data })
}
