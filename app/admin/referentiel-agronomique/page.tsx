'use client'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  BookOpen,
  CheckCircle2,
  Database,
  FileText,
  Loader2,
  Plus,
  ShieldCheck,
} from 'lucide-react'
import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'

type Source = {
  id: string
  code: string
  name: string
  owner: string
  rights_status: string
  source_type: string
  checked_at: string | null
}
type Zone = { id: string; name: string }
type Culture = { id: string; name: string }
type Template = {
  id: string
  title: string
  variety_name: string | null
  status: string
  cultures: { name: string } | null
  agro_ecological_zones: { name: string } | null
}
type Version = {
  id: string
  template_id: string
  version: number
  review_status: string
  yield_low_t_ha: number
  yield_typical_t_ha: number
  yield_high_t_ha: number
  created_at: string
}
type Data = {
  sources: Source[]
  zones: Zone[]
  cultures: Culture[]
  templates: Template[]
  versions: Version[]
}

const empty: Data = { sources: [], zones: [], cultures: [], templates: [], versions: [] }

async function mutate(body: Record<string, unknown>) {
  const response = await fetch('/api/admin/agronomic-referential', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.error ?? 'Enregistrement impossible')
}

export default function AgronomicReferentialPage() {
  const [data, setData] = useState<Data>(empty)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const [source, setSource] = useState({
    code: '',
    name: '',
    owner: '',
    url: '',
    source_type: 'official',
    rights_status: 'to_confirm',
  })
  const [template, setTemplate] = useState({
    culture_id: '',
    variety_name: '',
    zone_id: '',
    title: '',
    description: '',
  })
  const [version, setVersion] = useState({
    template_id: '',
    source_id: '',
    seed_rate_kg_ha: '25',
    low: '2.5',
    typical: '3.75',
    high: '6',
    loss: '5',
  })

  const load = useCallback(async () => {
    setLoading(true)
    const response = await fetch('/api/admin/agronomic-referential', { cache: 'no-store' })
    const json = await response.json().catch(() => ({}))
    if (response.ok) setData(json)
    else setMessage({ ok: false, text: json.error ?? 'Chargement impossible' })
    setLoading(false)
  }, [])
  useEffect(() => {
    load()
  }, [load])

  const versionsByTemplate = useMemo(
    () =>
      new Map(
        data.templates.map((t) => [t.id, data.versions.filter((v) => v.template_id === t.id)]),
      ),
    [data],
  )
  const submit = async (body: Record<string, unknown>, success: string) => {
    setBusy(true)
    setMessage(null)
    try {
      await mutate(body)
      setMessage({ ok: true, text: success })
      await load()
    } catch (error) {
      setMessage({ ok: false, text: (error as Error).message })
    } finally {
      setBusy(false)
    }
  }

  if (loading && data.sources.length === 0)
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-7 w-7 animate-spin" />
      </div>
    )

  return (
    <div className="max-w-6xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Référentiel agronomique</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Sources, modèles culturaux, versions et validation scientifique avant publication.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href="/admin/comptes-exploitation">
            <FileText className="mr-2 h-4 w-4" />
            Documents et ventes
          </Link>
        </Button>
      </div>
      {message && (
        <output
          className={`block rounded-md px-3 py-2 text-sm ${message.ok ? 'bg-green-50 text-green-800' : 'bg-destructive/10 text-destructive'}`}
        >
          {message.text}
        </output>
      )}

      <div className="grid gap-3 sm:grid-cols-4">
        {(
          [
            ['Sources', data.sources.length, Database],
            ['Modèles', data.templates.length, BookOpen],
            [
              'À valider',
              data.versions.filter(
                (v) => v.review_status === 'draft' || v.review_status === 'in_review',
              ).length,
              ShieldCheck,
            ],
            [
              'Publiés',
              data.templates.filter((t) => t.status === 'published').length,
              CheckCircle2,
            ],
          ] as const
        ).map(([label, value, Icon]) => (
          <Card key={label}>
            <CardContent className="flex items-center justify-between pt-5">
              <div>
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="text-2xl font-bold">{value}</p>
              </div>
              <Icon className="h-5 w-5 text-primary" />
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Ajouter une source</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Code stable</Label>
                <Input
                  value={source.code}
                  onChange={(e) => setSource({ ...source, code: e.target.value.toUpperCase() })}
                  placeholder="ITRA-MAIS-2026"
                />
              </div>
              <div>
                <Label>Institution</Label>
                <Input
                  value={source.owner}
                  onChange={(e) => setSource({ ...source, owner: e.target.value })}
                  placeholder="ITRA / ICAT"
                />
              </div>
            </div>
            <div>
              <Label>Nom du document ou flux</Label>
              <Input
                value={source.name}
                onChange={(e) => setSource({ ...source, name: e.target.value })}
              />
            </div>
            <div>
              <Label>URL</Label>
              <Input
                type="url"
                value={source.url}
                onChange={(e) => setSource({ ...source, url: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Nature</Label>
                <select
                  className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                  value={source.source_type}
                  onChange={(e) => setSource({ ...source, source_type: e.target.value })}
                >
                  <option value="official">Officielle</option>
                  <option value="research">Recherche</option>
                  <option value="international">Internationale</option>
                  <option value="field">Terrain</option>
                  <option value="internal">Interne</option>
                </select>
              </div>
              <div>
                <Label>Droits</Label>
                <select
                  className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                  value={source.rights_status}
                  onChange={(e) => setSource({ ...source, rights_status: e.target.value })}
                >
                  <option value="to_confirm">À confirmer</option>
                  <option value="open">Ouverts</option>
                  <option value="authorized">Autorisés</option>
                  <option value="restricted">Restreints</option>
                </select>
              </div>
            </div>
            <Button
              disabled={busy || !source.code || !source.name || !source.owner}
              onClick={() =>
                submit(
                  { action: 'create_source', ...source, url: source.url || undefined },
                  'Source ajoutée.',
                )
              }
            >
              <Plus className="mr-2 h-4 w-4" />
              Ajouter
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Créer un modèle cultural</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Culture</Label>
                <select
                  className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                  value={template.culture_id}
                  onChange={(e) => setTemplate({ ...template, culture_id: e.target.value })}
                >
                  <option value="">Choisir</option>
                  {data.cultures.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label>Zone</Label>
                <select
                  className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                  value={template.zone_id}
                  onChange={(e) => setTemplate({ ...template, zone_id: e.target.value })}
                >
                  <option value="">National</option>
                  {data.zones.map((z) => (
                    <option key={z.id} value={z.id}>
                      {z.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <Label>Variété</Label>
              <Input
                value={template.variety_name}
                onChange={(e) => setTemplate({ ...template, variety_name: e.target.value })}
                placeholder="Obatanpa"
              />
            </div>
            <div>
              <Label>Titre</Label>
              <Input
                value={template.title}
                onChange={(e) => setTemplate({ ...template, title: e.target.value })}
                placeholder="Maïs pluvial — Littoral"
              />
            </div>
            <div>
              <Label>Description</Label>
              <Textarea
                value={template.description}
                onChange={(e) => setTemplate({ ...template, description: e.target.value })}
              />
            </div>
            <Button
              disabled={busy || !template.culture_id || !template.title}
              onClick={() =>
                submit(
                  {
                    action: 'create_template',
                    ...template,
                    variety_name: template.variety_name || undefined,
                    zone_id: template.zone_id || undefined,
                    production_system: 'rainfed',
                  },
                  'Modèle créé en brouillon.',
                )
              }
            >
              <Plus className="mr-2 h-4 w-4" />
              Créer le modèle
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Nouvelle version technique</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-7">
          <div className="md:col-span-2">
            <Label>Modèle</Label>
            <select
              className="h-9 w-full rounded-md border bg-background px-3 text-sm"
              value={version.template_id}
              onChange={(e) => setVersion({ ...version, template_id: e.target.value })}
            >
              <option value="">Choisir</option>
              {data.templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label>Source principale</Label>
            <select
              className="h-9 w-full rounded-md border bg-background px-3 text-sm"
              value={version.source_id}
              onChange={(e) => setVersion({ ...version, source_id: e.target.value })}
            >
              <option value="">Choisir</option>
              {data.sources
                .filter((source) => source.rights_status !== 'restricted')
                .map((source) => (
                  <option key={source.id} value={source.id}>
                    {source.name}
                  </option>
                ))}
            </select>
          </div>
          {(
            [
              ['Semence kg/ha', 'seed_rate_kg_ha'],
              ['Prudent t/ha', 'low'],
              ['Central t/ha', 'typical'],
              ['Intensif t/ha', 'high'],
            ] as const
          ).map(([label, key]) => (
            <div key={key}>
              <Label>{label}</Label>
              <Input
                inputMode="decimal"
                value={version[key]}
                onChange={(e) => setVersion({ ...version, [key]: e.target.value })}
              />
            </div>
          ))}
          <div>
            <Label>Pertes %</Label>
            <Input
              inputMode="decimal"
              value={version.loss}
              onChange={(e) => setVersion({ ...version, loss: e.target.value })}
            />
          </div>
          <div className="flex items-end">
            <Button
              disabled={busy || !version.template_id || !version.source_id}
              onClick={() =>
                submit(
                  {
                    action: 'create_version',
                    template_id: version.template_id,
                    seed_rate_kg_ha: Number(version.seed_rate_kg_ha),
                    yield_low_t_ha: Number(version.low),
                    yield_typical_t_ha: Number(version.typical),
                    yield_high_t_ha: Number(version.high),
                    loss_rate_percent: Number(version.loss),
                    source_ids: [version.source_id],
                  },
                  'Version créée et envoyée en validation.',
                )
              }
            >
              Créer
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Modèles et validations</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {data.templates.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Aucun modèle. Commencez par créer le modèle maïs.
            </p>
          ) : (
            data.templates.map((t) => (
              <div key={t.id} className="rounded-lg border p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-medium">{t.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {t.cultures?.name} · {t.variety_name || 'toutes variétés'} ·{' '}
                      {t.agro_ecological_zones?.name || 'national'}
                    </p>
                  </div>
                  <Badge variant={t.status === 'published' ? 'default' : 'secondary'}>
                    {t.status}
                  </Badge>
                </div>
                <div className="mt-3 space-y-2">
                  {(versionsByTemplate.get(t.id) ?? []).map((v) => (
                    <div
                      key={v.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-muted/40 px-3 py-2 text-sm"
                    >
                      <span>
                        v{v.version} · {v.yield_low_t_ha} / {v.yield_typical_t_ha} /{' '}
                        {v.yield_high_t_ha} t/ha
                      </span>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">{v.review_status}</Badge>
                        {v.review_status !== 'approved' && (
                          <Button
                            size="sm"
                            disabled={busy}
                            onClick={() =>
                              submit(
                                {
                                  action: 'review_version',
                                  version_id: v.id,
                                  decision: 'approved',
                                  review_note:
                                    'Valeurs et sources contrôlées par le super-administrateur.',
                                },
                                'Version approuvée et publiée.',
                              )
                            }
                          >
                            Approuver
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  )
}
