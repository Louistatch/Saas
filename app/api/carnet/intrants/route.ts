import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createLogger } from '@/lib/utils/logger'

const log = createLogger('api:carnet:intrants')

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const memberId = searchParams.get('member_id')
    const cooperativeId = searchParams.get('cooperative_id')
    const campagneId = searchParams.get('campagne_id')

    let query = supabase
      .from('intrants')
      .select('id, cooperative_id, member_id, campagne_id, name, type, quantity, unit, cost_fcfa, purchase_date, supplier, created_at')
      .order('created_at', { ascending: false })

    if (memberId) query = query.eq('member_id', memberId)
    if (cooperativeId) query = query.eq('cooperative_id', cooperativeId)
    if (campagneId) query = query.eq('campagne_id', campagneId)

    const { data, error } = await query

    if (error) {
      log.error('Intrants query error', error)
      return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
    }

    return NextResponse.json({ intrants: data ?? [] })
  } catch (err) {
    log.error('Intrants GET error', err)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}

interface IntrantBody {
  cooperative_id: string
  member_id: string
  campagne_id?: string
  name: string
  type: string
  quantity: number
  unit: string
  cost_fcfa?: number
  purchase_date?: string
  supplier?: string
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
    }

    const raw: unknown = await request.json()
    const body = raw as IntrantBody

    if (!body.cooperative_id || !body.member_id || !body.name || !body.type || body.quantity == null || !body.unit) {
      return NextResponse.json({ error: 'Champs requis manquants' }, { status: 400 })
    }

    const validTypes = ['semence', 'engrais', 'pesticide', 'outil', 'autre']
    if (!validTypes.includes(body.type)) {
      return NextResponse.json({ error: 'Type invalide' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('intrants')
      .insert({
        cooperative_id: body.cooperative_id,
        member_id: body.member_id,
        campagne_id: body.campagne_id ?? null,
        name: body.name,
        type: body.type,
        quantity: body.quantity,
        unit: body.unit,
        cost_fcfa: body.cost_fcfa ?? null,
        purchase_date: body.purchase_date ?? null,
        supplier: body.supplier ?? null,
      })
      .select()
      .single()

    if (error) {
      log.error('Intrant insert error', error)
      return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
    }

    return NextResponse.json({ intrant: data }, { status: 201 })
  } catch (err) {
    log.error('Intrants POST error', err)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
