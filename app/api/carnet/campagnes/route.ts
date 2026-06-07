import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createLogger } from '@/lib/utils/logger'
import { assertTenantAccess } from '@/lib/security/assert-access'

const log = createLogger('api:carnet:campagnes')

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const cooperativeId = searchParams.get('cooperative_id')
    const status = searchParams.get('status')

    if (cooperativeId) {
      const tenantCheck = await assertTenantAccess(cooperativeId)
      if (!tenantCheck.ok) return tenantCheck.response
    }

    let query = supabase
      .from('campagnes')
      .select('id, cooperative_id, name, culture, start_date, end_date, target_yield_kg, status, created_at')
      .order('created_at', { ascending: false })

    if (cooperativeId) query = query.eq('cooperative_id', cooperativeId)
    if (status) query = query.eq('status', status)

    const { data, error } = await query

    if (error) {
      log.error('Campagnes query error', error)
      return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
    }

    return NextResponse.json({ campagnes: data ?? [] })
  } catch (err) {
    log.error('Campagnes GET error', err)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}

interface CampagneBody {
  cooperative_id: string
  name: string
  culture: string
  start_date?: string
  end_date?: string
  target_yield_kg?: number
  status?: string
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
    }

    const raw: unknown = await request.json()
    const body = raw as CampagneBody

    const tenantCheck = await assertTenantAccess(body.cooperative_id)
    if (!tenantCheck.ok) return tenantCheck.response

    if (!body.cooperative_id || !body.name || !body.culture) {
      return NextResponse.json({ error: 'Champs requis manquants' }, { status: 400 })
    }

    const validStatuses = ['planned', 'active', 'closed']
    const status = body.status ?? 'active'
    if (!validStatuses.includes(status)) {
      return NextResponse.json({ error: 'Statut invalide' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('campagnes')
      .insert({
        cooperative_id: body.cooperative_id,
        name: body.name,
        culture: body.culture,
        start_date: body.start_date ?? null,
        end_date: body.end_date ?? null,
        target_yield_kg: body.target_yield_kg ?? null,
        status,
      })
      .select()
      .single()

    if (error) {
      log.error('Campagne insert error', error)
      return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
    }

    return NextResponse.json({ campagne: data }, { status: 201 })
  } catch (err) {
    log.error('Campagnes POST error', err)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
