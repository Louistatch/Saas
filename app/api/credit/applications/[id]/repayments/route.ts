import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { assertTenantAccess } from '@/lib/security/assert-access'
import { createClient } from '@/lib/supabase/server'

const paySchema = z.object({
  repayment_id: z.string().uuid(),
  amount_paid: z.coerce.number().int().positive().max(100_000_000),
})

/** Vérifie que l'appelant administre la coopérative de la demande. */
async function guardApplication(id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return { ok: false as const, response: NextResponse.json({ error: 'Introuvable' }, { status: 404 }) }
  }
  const supabase = await createClient()
  const { data } = await supabase
    .from('credit_applications')
    .select('cooperative_id')
    .eq('id', id)
    .maybeSingle()
  if (!data) {
    return { ok: false as const, response: NextResponse.json({ error: 'Introuvable' }, { status: 404 }) }
  }
  return assertTenantAccess(data.cooperative_id)
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const guard = await guardApplication(id)
  if (!guard.ok) return guard.response
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('credit_repayments')
    .select('*')
    .eq('application_id', id)
    .order('due_date')

  if (error) return NextResponse.json({ error: 'Lecture impossible' }, { status: 500 })
  return NextResponse.json({ repayments: data ?? [] })
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const guard = await guardApplication(id)
  if (!guard.ok) return guard.response
  const supabase = await createClient()

  const parsed = paySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Montant ou échéance invalide' }, { status: 400 })
  const { repayment_id, amount_paid } = parsed.data

  // L'échéance doit appartenir à CETTE demande.
  const { data: rep } = await supabase
    .from('credit_repayments')
    .select('amount_due_fcfa, amount_paid_fcfa')
    .eq('id', repayment_id)
    .eq('application_id', id)
    .single()
  if (!rep) return NextResponse.json({ error: 'Échéance introuvable' }, { status: 404 })

  const totalPaid = (rep.amount_paid_fcfa ?? 0) + Number(amount_paid)
  const newStatus = totalPaid >= rep.amount_due_fcfa ? 'paid' : 'partial'

  const { data, error } = await supabase
    .from('credit_repayments')
    .update({ amount_paid_fcfa: totalPaid, status: newStatus, paid_at: newStatus === 'paid' ? new Date().toISOString() : null })
    .eq('id', repayment_id)
    .eq('application_id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: 'Enregistrement impossible' }, { status: 400 })

  // Check if all repayments paid — update application status
  void Promise.resolve(
    supabase.from('credit_repayments').select('status').eq('application_id', id).then(({ data: reps }) => {
      if (reps?.every(r => r.status === 'paid')) {
        return supabase.from('credit_applications').update({ status: 'closed', updated_at: new Date().toISOString() }).eq('id', id)
      }
    })
  )

  return NextResponse.json({ repayment: data })
}
