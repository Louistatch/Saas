import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { assertAuthenticated } from '@/lib/security/assert-access'

const schema = z.object({metric:z.enum(['members','parcelles','surface_ha']).default('members'),
  cooperative_id:z.string().uuid().optional()})
export async function GET(request: NextRequest) {
  const guard = await assertAuthenticated()
  if (!guard.ok) return guard.response
  const parsed = schema.safeParse(Object.fromEntries(request.nextUrl.searchParams))
  if (!parsed.success) return NextResponse.json({error:'Paramètres invalides'},{status:400})
  const {data,error} = await guard.ctx.supabase.rpc('get_map_statistics',{
    p_metric:parsed.data.metric,...(parsed.data.cooperative_id ? {p_cooperative_id:parsed.data.cooperative_id}:{}),
  })
  if(error) return NextResponse.json({error:'Statistiques indisponibles'},{status:503})
  return NextResponse.json(data,{headers:{'Cache-Control':'private, no-store'}})
}
