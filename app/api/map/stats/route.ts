import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const metric = searchParams.get('metric') ?? 'members'
  const cooperativeId = searchParams.get('cooperative_id')

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  if (metric === 'members') {
    let query = supabase.from('members').select('prefecture').not('prefecture', 'is', null)
    if (cooperativeId) query = query.eq('cooperative_id', cooperativeId)
    const { data, error } = await query
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const counts: Record<string, number> = {}
    for (const m of data ?? []) {
      const p = m.prefecture as string
      counts[p] = (counts[p] ?? 0) + 1
    }
    const byPrefecture = Object.entries(counts).map(([prefecture, count]) => ({ prefecture, count, value: count }))
    const max = byPrefecture.reduce((m, r) => Math.max(m, r.count), 0)
    return NextResponse.json({ byPrefecture, total: data?.length ?? 0, max })
  }

  // parcelles / surface_ha
  let query = supabase.from('parcelles').select('prefecture, surface_ha, culture_name').not('prefecture', 'is', null)
  if (cooperativeId) query = query.eq('cooperative_id', cooperativeId)
  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const agg: Record<string, { count: number; surface: number; cultures: Set<string> }> = {}
  for (const p of data ?? []) {
    const pref = p.prefecture as string
    if (!agg[pref]) agg[pref] = { count: 0, surface: 0, cultures: new Set() }
    agg[pref].count++
    agg[pref].surface += p.surface_ha ?? 0
    if (p.culture_name) agg[pref].cultures.add(p.culture_name as string)
  }
  const byPrefecture = Object.entries(agg).map(([prefecture, v]) => ({
    prefecture,
    count: v.count,
    value: metric === 'surface_ha' ? Math.round(v.surface * 10) / 10 : v.count,
    surface_ha: Math.round(v.surface * 10) / 10,
    cultures: [...v.cultures],
  }))
  const max = byPrefecture.reduce((m, r) => Math.max(m, r.value), 0)
  return NextResponse.json({ byPrefecture, total: data?.length ?? 0, max })
}
