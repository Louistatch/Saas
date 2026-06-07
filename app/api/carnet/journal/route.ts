import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createLogger } from '@/lib/utils/logger'
import { assertTenantAccess } from '@/lib/security/assert-access'

const log = createLogger('api:carnet:journal')

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const memberId = searchParams.get('member_id')
    const campagneId = searchParams.get('campagne_id')
    const type = searchParams.get('type')
    const cooperativeId = searchParams.get('cooperative_id')

    if (cooperativeId) {
      const tenantCheck = await assertTenantAccess(cooperativeId)
      if (!tenantCheck.ok) return tenantCheck.response
    }

    let query = supabase
      .from('journal_entries')
      .select(
        'id, member_id, cooperative_id, campagne_id, parcelle_id, entry_date, type, title, body, quantity, unit, cost_fcfa, photo_url, created_at, parcelle:parcelles(id, culture_name), campagne:campagnes(id, name)',
      )
      .order('entry_date', { ascending: false })

    if (memberId) query = query.eq('member_id', memberId)
    if (campagneId) query = query.eq('campagne_id', campagneId)
    if (type) query = query.eq('type', type)
    if (cooperativeId) query = query.eq('cooperative_id', cooperativeId)

    const { data, error } = await query

    if (error) {
      log.error('Journal query error', error)
      return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
    }

    return NextResponse.json({ entries: data ?? [] })
  } catch (err) {
    log.error('Journal GET error', err)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}

interface JournalEntryBody {
  member_id: string
  cooperative_id: string
  campagne_id?: string
  parcelle_id?: string
  entry_date: string
  type: string
  title: string
  body?: string
  quantity?: number
  unit?: string
  cost_fcfa?: number
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
    }

    const raw: unknown = await request.json()
    const body = raw as JournalEntryBody

    const tenantCheck = await assertTenantAccess(body.cooperative_id)
    if (!tenantCheck.ok) return tenantCheck.response

    if (!body.member_id || !body.cooperative_id || !body.entry_date || !body.type || !body.title) {
      return NextResponse.json({ error: 'Champs requis manquants' }, { status: 400 })
    }

    const validTypes = ['travaux', 'intrant', 'météo', 'observation', 'récolte', 'vente', 'autre']
    if (!validTypes.includes(body.type)) {
      return NextResponse.json({ error: 'Type invalide' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('journal_entries')
      .insert({
        member_id: body.member_id,
        cooperative_id: body.cooperative_id,
        campagne_id: body.campagne_id ?? null,
        parcelle_id: body.parcelle_id ?? null,
        entry_date: body.entry_date,
        type: body.type,
        title: body.title,
        body: body.body ?? null,
        quantity: body.quantity ?? null,
        unit: body.unit ?? null,
        cost_fcfa: body.cost_fcfa ?? null,
      })
      .select()
      .single()

    if (error) {
      log.error('Journal insert error', error)
      return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
    }

    return NextResponse.json({ entry: data }, { status: 201 })
  } catch (err) {
    log.error('Journal POST error', err)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
