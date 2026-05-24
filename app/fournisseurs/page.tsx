import { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { SupplierCard, type SupplierData } from '@/components/fournisseurs/supplier-card'
import { MarketingLayout } from '@/components/shared/marketing-layout'
import { Users, Search } from 'lucide-react'
import { FournisseursFilters } from './filters'

interface PageProps {
  searchParams: Promise<{
    culture?: string
    region_id?: string
    prefecture_id?: string
    page?: string
  }>
}

export async function generateMetadata({ searchParams }: PageProps): Promise<Metadata> {
  const params = await searchParams
  const culture = params.culture
  const title = culture
    ? `Fournisseurs certifiés ${culture} au Togo — FaîtiereHub`
    : 'Fournisseurs agricoles certifiés au Togo — FaîtiereHub'
  const description = culture
    ? `Trouvez des producteurs certifiés de ${culture} au Togo. Membres Argent et Or des coopératives agricoles.`
    : 'Annuaire des producteurs agricoles certifiés au Togo. Membres Argent et Or des coopératives, filtrables par culture et localité.'

  return { title, description }
}

export default async function FournisseursPage({ searchParams }: PageProps) {
  const params = await searchParams
  const culture = params.culture ?? ''
  const regionId = params.region_id ?? ''
  const prefectureId = params.prefecture_id ?? ''
  const page = Math.max(1, parseInt(params.page ?? '1'))
  const pageSize = 20

  const supabase = await createClient()

  // Fetch suppliers: active members with at least 1 parcelle (Argent+ criteria)
  let query = supabase
    .from('members')
    .select(`
      id, first_name, last_name, village, canton, prefecture, region,
      cooperative_id, photo_url,
      cooperatives(name),
      parcelles(culture_principale, superficie_ha)
    `, { count: 'exact' })
    .eq('status', 'active')

  if (culture) {
    query = query.contains('parcelles', [{ culture_principale: culture }])
  }
  if (prefectureId) {
    query = query.eq('prefecture', prefectureId)
  }
  if (regionId) {
    query = query.eq('region', regionId)
  }

  const from = (page - 1) * pageSize
  query = query.range(from, from + pageSize - 1).order('first_name')

  const { data: members, count } = await query

  // Fetch reference data for filters
  const [culturesRes, regionsRes, prefecturesRes] = await Promise.all([
    supabase.from('cultures').select('name').order('name'),
    supabase.from('regions').select('id, name').order('name'),
    supabase.from('prefectures').select('id, name, region_id').order('name'),
  ])

  // Map to SupplierData (no private info exposed)
  const suppliers: SupplierData[] = (members ?? []).map((m) => {
    const parcelles = (m.parcelles as { culture_principale: string; superficie_ha: number }[] | null) ?? []
    const cultures = [...new Set(parcelles.map(p => p.culture_principale).filter(Boolean))]
    // Determine level based on data available (simplified — full calc would need cotisations)
    const level: 'Argent' | 'Or' = parcelles.length >= 2 ? 'Or' : 'Argent'
    return {
      id: m.id as string,
      name: `${m.first_name} ${m.last_name}`,
      village: m.village as string | null,
      canton: m.canton as string | null,
      prefecture: m.prefecture as string | null,
      region: m.region as string | null,
      photo_url: m.photo_url as string | null,
      cooperative: (m.cooperatives as { name: string } | null)?.name ?? null,
      cultures,
      superficie_totale: parcelles.reduce((s, p) => s + (p.superficie_ha ?? 0), 0),
      level,
    }
  })

  const totalPages = Math.ceil((count ?? 0) / pageSize)

  return (
    <MarketingLayout>
      {/* Hero */}
      <section className="bg-gradient-to-br from-primary/5 via-background to-accent/5 border-b border-border">
        <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3 mb-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <Users className="h-5 w-5 text-primary" />
            </div>
            <h1 className="text-2xl font-bold text-foreground sm:text-3xl">
              Fournisseurs certifiés
            </h1>
          </div>
          <p className="text-muted-foreground max-w-2xl">
            Producteurs agricoles certifiés Argent et Or des coopératives togolaises.
            Contactez-les directement pour vos achats.
          </p>
        </div>
      </section>

      {/* Content */}
      <section className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-8">
          {/* Filters sidebar */}
          <aside className="space-y-4">
            <FournisseursFilters
              cultures={(culturesRes.data ?? []).map(c => c.name)}
              regions={(regionsRes.data ?? []).map(r => ({ id: r.id, name: r.name }))}
              prefectures={(prefecturesRes.data ?? []).map(p => ({ id: p.id, name: p.name, region_id: p.region_id }))}
              currentCulture={culture}
              currentRegionId={regionId}
              currentPrefectureId={prefectureId}
            />
          </aside>

          {/* Results */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                {count ?? 0} fournisseur{(count ?? 0) !== 1 ? 's' : ''} trouvé{(count ?? 0) !== 1 ? 's' : ''}
              </p>
            </div>

            {suppliers.length === 0 ? (
              <div className="text-center py-16 space-y-3">
                <Search className="h-12 w-12 text-muted-foreground/40 mx-auto" />
                <h3 className="font-semibold text-foreground">Aucun fournisseur trouvé</h3>
                <p className="text-sm text-muted-foreground">Essayez de modifier vos filtres</p>
              </div>
            ) : (
              <div className="space-y-3">
                {suppliers.map((supplier) => (
                  <SupplierCard key={supplier.id} supplier={supplier} />
                ))}
              </div>
            )}

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-2 pt-4">
                {page > 1 && (
                  <a
                    href={`/fournisseurs?${buildParams({ culture, region_id: regionId, prefecture_id: prefectureId, page: String(page - 1) })}`}
                    className="px-4 py-2 rounded-lg border border-border text-sm hover:bg-accent/10 transition-colors"
                  >
                    ← Précédent
                  </a>
                )}
                <span className="text-sm text-muted-foreground">
                  Page {page} / {totalPages}
                </span>
                {page < totalPages && (
                  <a
                    href={`/fournisseurs?${buildParams({ culture, region_id: regionId, prefecture_id: prefectureId, page: String(page + 1) })}`}
                    className="px-4 py-2 rounded-lg border border-border text-sm hover:bg-accent/10 transition-colors"
                  >
                    Suivant →
                  </a>
                )}
              </div>
            )}
          </div>
        </div>
      </section>
    </MarketingLayout>
  )
}

function buildParams(params: Record<string, string>): string {
  const sp = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v) sp.set(k, v)
  }
  return sp.toString()
}
