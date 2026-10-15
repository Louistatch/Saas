import { calculateEnterpriseBudget } from '@/lib/agronomy/enterprise-budget'
import { assertRole } from '@/lib/security/assert-access'
import { createClient as createAdminClient } from '@/lib/supabase/admin'
import { createLogger } from '@/lib/utils/logger'
import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

const log = createLogger('api:admin:agronomic-referential')

const createSource = z.object({
  action: z.literal('create_source'),
  code: z
    .string()
    .trim()
    .min(2)
    .max(80)
    .regex(/^[A-Z0-9_-]+$/),
  name: z.string().trim().min(3).max(200),
  owner: z.string().trim().min(2).max(200),
  url: z.string().url().max(1000).optional(),
  source_type: z.enum(['official', 'research', 'international', 'field', 'internal']),
  rights_status: z.enum(['open', 'authorized', 'to_confirm', 'restricted']),
  published_at: z.string().date().optional(),
  notes: z.string().trim().max(2000).optional(),
})

const createTemplate = z.object({
  action: z.literal('create_template'),
  culture_id: z.string().uuid(),
  variety_name: z.string().trim().max(120).optional(),
  zone_id: z.string().uuid().optional(),
  production_system: z.enum(['rainfed', 'irrigated']).default('rainfed'),
  title: z.string().trim().min(3).max(200),
  description: z.string().trim().max(2000).optional(),
})

const createVersion = z
  .object({
    action: z.literal('create_version'),
    template_id: z.string().uuid(),
    valid_from: z.string().date().optional(),
    valid_until: z.string().date().optional(),
    seed_rate_kg_ha: z.number().nonnegative().max(10000).optional(),
    yield_low_t_ha: z.number().nonnegative().max(1000),
    yield_typical_t_ha: z.number().nonnegative().max(1000),
    yield_high_t_ha: z.number().nonnegative().max(1000),
    loss_rate_percent: z.number().min(0).max(99).default(0),
    source_ids: z.array(z.string().uuid()).min(1).max(30),
  })
  .refine(
    (x) => x.yield_low_t_ha <= x.yield_typical_t_ha && x.yield_typical_t_ha <= x.yield_high_t_ha,
    {
      message: 'Les rendements doivent être ordonnés du prudent vers l’intensif',
    },
  )

const reviewVersion = z.object({
  action: z.literal('review_version'),
  version_id: z.string().uuid(),
  decision: z.enum(['approved', 'rejected']),
  review_note: z.string().trim().min(3).max(2000),
})

const createBudget = z.object({
  action: z.literal('create_budget'),
  area_ha: z.number().positive().max(100000),
  campaign: z.string().trim().max(50).optional(),
  metadata: z.object({
    culture: z.string().trim().min(1).max(100),
    variety: z.string().trim().max(120).optional(),
    region: z.string().trim().max(120),
  }),
  costs: z
    .array(
      z.object({
        id: z.string().min(1).max(80),
        label: z.string().min(1).max(200),
        category: z.enum([
          'land',
          'seed',
          'fertilizer',
          'crop_protection',
          'labour',
          'mechanization',
          'harvest',
          'post_harvest',
          'transport',
          'other',
        ]),
        quantity: z.number().nonnegative(),
        unitPrice: z.number().nonnegative(),
        scaling: z.enum(['per_hectare', 'per_farm', 'per_tonne', 'per_kg']),
      }),
    )
    .min(1)
    .max(100),
  scenarios: z
    .array(
      z.object({
        id: z.string().min(1).max(80),
        label: z.string().min(1).max(120),
        yieldTonnesPerHa: z.number().nonnegative(),
        salePricePerTonne: z.number().nonnegative(),
        lossRatePercent: z.number().min(0).max(99),
      }),
    )
    .min(1)
    .max(10),
})

const schema = z.union([createSource, createTemplate, createVersion, reviewVersion, createBudget])

export async function GET() {
  const guard = await assertRole('super_admin')
  if (!guard.ok) return guard.response
  const admin = createAdminClient()
  const [sources, zones, cultures, templates, versions] = await Promise.all([
    admin.from('agronomic_sources').select('*').order('name'),
    admin.from('agro_ecological_zones').select('id, code, name').order('name'),
    admin.from('cultures').select('id, name, category').order('name'),
    admin
      .from('agronomic_templates')
      .select('*, cultures(name), agro_ecological_zones(name)')
      .order('updated_at', { ascending: false }),
    admin
      .from('agronomic_template_versions')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(500),
  ])
  const error = [sources, zones, cultures, templates, versions].find((r) => r.error)?.error
  if (error) {
    log.error('Referential load failed', error)
    return NextResponse.json(
      { error: 'Référentiel indisponible. Vérifiez que la migration est appliquée.' },
      { status: 503 },
    )
  }
  return NextResponse.json(
    {
      sources: sources.data ?? [],
      zones: zones.data ?? [],
      cultures: cultures.data ?? [],
      templates: templates.data ?? [],
      versions: versions.data ?? [],
    },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}

export async function POST(request: NextRequest) {
  const guard = await assertRole('super_admin')
  if (!guard.ok) return guard.response
  const parsed = schema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Données invalides', details: parsed.error.flatten() },
      { status: 400 },
    )
  }
  const admin = createAdminClient()
  const payload = parsed.data
  try {
    if (payload.action === 'create_source') {
      const { action: _, ...fields } = payload
      const { data, error } = await admin
        .from('agronomic_sources')
        .insert({ ...fields, checked_at: new Date().toISOString() })
        .select()
        .single()
      if (error) throw error
      return NextResponse.json({ source: data }, { status: 201 })
    }
    if (payload.action === 'create_template') {
      const { action: _, ...fields } = payload
      const { data, error } = await admin
        .from('agronomic_templates')
        .insert({ ...fields, created_by: guard.ctx.userId })
        .select()
        .single()
      if (error) throw error
      return NextResponse.json({ template: data }, { status: 201 })
    }
    if (payload.action === 'create_version') {
      const { action: _, template_id, ...fields } = payload
      const { data: last } = await admin
        .from('agronomic_template_versions')
        .select('version')
        .eq('template_id', template_id)
        .order('version', { ascending: false })
        .limit(1)
        .maybeSingle()
      const { data, error } = await admin
        .from('agronomic_template_versions')
        .insert({
          ...fields,
          template_id,
          version: (last?.version ?? 0) + 1,
          created_by: guard.ctx.userId,
        })
        .select()
        .single()
      if (error) throw error
      await admin
        .from('agronomic_templates')
        .update({ status: 'in_review', updated_at: new Date().toISOString() })
        .eq('id', template_id)
      return NextResponse.json({ version: data }, { status: 201 })
    }
    if (payload.action === 'create_budget') {
      const results = calculateEnterpriseBudget({
        areaHa: payload.area_ha,
        costs: payload.costs,
        scenarios: payload.scenarios,
      })
      const { data, error } = await admin
        .from('enterprise_budget_snapshots')
        .insert({
          user_id: guard.ctx.userId,
          area_ha: payload.area_ha,
          campaign: payload.campaign || null,
          inputs: {
            metadata: payload.metadata,
            costs: payload.costs,
            scenarios: payload.scenarios,
          },
          results,
          source_manifest: [],
          completeness_score: 60,
          status: 'draft',
        })
        .select('id, status, created_at')
        .single()
      if (error) throw error
      return NextResponse.json({ budget: data }, { status: 201 })
    }
    const { data: version, error } = await admin
      .from('agronomic_template_versions')
      .update({
        review_status: payload.decision,
        review_note: payload.review_note,
        reviewed_by: guard.ctx.userId,
        reviewed_at: new Date().toISOString(),
      })
      .eq('id', payload.version_id)
      .select('id, template_id, review_status')
      .single()
    if (error) throw error
    if (payload.decision === 'approved') {
      await admin
        .from('agronomic_templates')
        .update({
          status: 'published',
          current_version_id: version.id,
          updated_at: new Date().toISOString(),
        })
        .eq('id', version.template_id)
    }
    return NextResponse.json({ version })
  } catch (error) {
    log.error('Referential mutation failed', error)
    return NextResponse.json({ error: 'Enregistrement impossible' }, { status: 500 })
  }
}
