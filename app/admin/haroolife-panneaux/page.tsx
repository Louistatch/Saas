'use client'

/**
 * Console des panneaux HarooLife (super_admin, D4+ M2). Préparer une campagne, la faire relire,
 * l'approuver seulement avec les droits d'image confirmés et, pour un partenaire, une référence
 * de contrat issue d'une validation commerciale hors du jeu ; la mettre en pause, revenir à une
 * version. Aucun paiement ici, aucune facturation. Toutes les règles sont vérifiées en base.
 */
import { EmptyState } from '@/components/shared/empty-state'
import { PageHeader } from '@/components/shared/page-header'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  type AdCampaign,
  type CampaignStatus,
  INTERNAL_CAMPAIGNS,
  PLACEMENTS,
  TRANSITIONS,
  safeHref,
} from '@/lib/haroolife/ads/campaigns'
import { drawPoster } from '@/lib/haroolife/ads/poster'
import { createClient } from '@/lib/supabase/client'
import { useCallback, useEffect, useRef, useState } from 'react'

type Row = AdCampaign & { rightsConfirmed: boolean; contractRef: string | null; versions: number }
type Stat = { campaign: string; placement: string; impressions: number; clicks: number }
const STATUS_LABEL: Record<CampaignStatus, string> = {
  draft: 'Brouillon',
  pending: 'En revue',
  approved: 'Approuvée',
  active: 'En cours',
  paused: 'En pause',
  expired: 'Expirée',
}
const MOVE_LABEL: Record<CampaignStatus, string> = {
  draft: 'Renvoyer en brouillon',
  pending: 'Soumettre à la revue',
  approved: 'Approuver',
  active: 'Mettre en ligne',
  paused: 'Mettre en pause',
  expired: 'Clore',
}
const TOGO = new Intl.DateTimeFormat('fr-FR', {
  dateStyle: 'short',
  timeStyle: 'short',
  timeZone: 'Africa/Lome',
})
const toInput = (d: Date) => d.toISOString().slice(0, 16)
const fromTogo = (v: string) => {
  const d = new Date(`${v}:00Z`)
  return Number.isFinite(d.getTime()) ? d.toISOString() : new Date().toISOString()
}

function Preview({ campaign }: { campaign: AdCampaign }) {
  const ref = useRef<HTMLCanvasElement | null>(null)
  useEffect(() => {
    if (ref.current) drawPoster(ref.current, campaign)
  }, [campaign])
  return (
    <figure className="space-y-2">
      <div className="flex justify-center rounded-xl bg-gradient-to-b from-sky-100 to-emerald-50 p-6 [perspective:700px]">
        <div className="relative [transform:rotateY(-18deg)_rotateX(4deg)]">
          <canvas
            ref={ref}
            role="img"
            aria-label={`Aperçu de l'affiche : ${campaign.creative.title}`}
            className="block h-auto w-64 rounded-sm border-4 border-slate-700 shadow-xl"
          />
          <span className="absolute -bottom-16 left-6 h-16 w-1.5 bg-slate-600" />
          <span className="absolute -bottom-16 right-6 h-16 w-1.5 bg-slate-600" />
        </div>
      </div>
      <figcaption className="pt-14 text-center text-xs text-muted-foreground">
        Aperçu en perspective de l’affiche telle que dessinée dans la rue (même rendu que le jeu).
      </figcaption>
    </figure>
  )
}

const blank = () => {
  const now = new Date()
  return {
    advertiser: '',
    kind: 'partner' as 'partner' | 'internal',
    title: '',
    body: '',
    cta: 'En savoir plus',
    href: '/contact?sujet=haroolife-partenaire',
    palette: ['#0f5132', '#ffffff', '#f5c518'] as [string, string, string],
    locality: 'lome' as 'lome' | 'kara' | 'all',
    placements: [] as string[],
    startsAt: toInput(now),
    endsAt: toInput(new Date(now.getTime() + 7 * 86400e3)),
    weight: 1,
    rightsConfirmed: false,
    contractRef: '',
  }
}

export default function HarooLifeBillboardsAdmin() {
  const [rows, setRows] = useState<Row[] | null>(null)
  const [stats, setStats] = useState<Stat[]>([])
  const [error, setError] = useState('')
  const [form, setForm] = useState(blank)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const { data, error: e } = await createClient().rpc('haroolife_ad_admin_list')
    if (e) {
      setError(e.message)
      setRows([])
      return
    }
    setRows((data?.campaigns ?? []) as Row[])
    setStats((data?.stats ?? []) as Stat[])
  }, [])
  useEffect(() => {
    void load()
  }, [load])

  const draft: AdCampaign = {
    id: 'apercu',
    advertiser: { name: form.advertiser || 'Annonceur', kind: form.kind },
    creative: {
      title: form.title || 'Titre de l’affiche',
      body: form.body || 'Texte court de l’annonce.',
      cta: form.cta,
      href: form.href,
      palette: form.palette,
    },
    status: 'draft',
    locality: form.locality,
    placements: form.placements,
    // The fields are Togo time, which is GMT all year: read them as UTC, whatever the browser zone.
    startsAt: fromTogo(form.startsAt),
    endsAt: fromTogo(form.endsAt),
    weight: form.weight,
    version: 1,
  }

  async function save() {
    setError('')
    if (!safeHref(form.href)) {
      setError('Lien refusé : une page du site (/...) ou https://www.faitierehub.com.')
      return
    }
    setBusy(true)
    const { error: e } = await createClient().rpc('haroolife_ad_admin_save', {
      p: {
        advertiser: form.advertiser,
        kind: form.kind,
        creative: draft.creative,
        locality: form.locality,
        placements: form.placements,
        startsAt: draft.startsAt,
        endsAt: draft.endsAt,
        weight: form.weight,
        rightsConfirmed: form.rightsConfirmed,
        contractRef: form.kind === 'partner' ? form.contractRef : '',
      },
    })
    setBusy(false)
    if (e) setError(e.message)
    else {
      setForm(blank())
      void load()
    }
  }
  async function move(id: string, status: CampaignStatus) {
    setError('')
    const { error: e } = await createClient().rpc('haroolife_ad_admin_move', {
      p_id: id,
      p_status: status,
    })
    if (e) setError(e.message)
    void load()
  }
  async function rollback(id: string, version: number) {
    setError('')
    const { error: e } = await createClient().rpc('haroolife_ad_admin_rollback', {
      p_id: id,
      p_version: version,
    })
    if (e) setError(e.message)
    void load()
  }
  const set = <K extends keyof ReturnType<typeof blank>>(k: K, v: ReturnType<typeof blank>[K]) =>
    setForm((f) => ({ ...f, [k]: v }))
  const nameOf = (id: string) =>
    INTERNAL_CAMPAIGNS.find((c) => c.id === id)?.creative.title ??
    rows?.find((r) => r.id === id)?.creative.title ??
    id

  return (
    <div className="space-y-6">
      <PageHeader
        title="Panneaux HarooLife"
        description="Campagnes des panneaux 3D de Lomé et Kara : préparation, revue, mise en ligne et statistiques. Aucune vente ni facturation depuis cette page."
      />
      {error && (
        <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm font-medium text-rose-800">
          {error}
        </p>
      )}

      <Card>
        <CardContent className="grid gap-6 p-6 lg:grid-cols-[1fr_320px]">
          <form
            className="grid gap-3 sm:grid-cols-2"
            onSubmit={(e) => {
              e.preventDefault()
              void save()
            }}
          >
            <h2 className="text-lg font-semibold sm:col-span-2">Nouvelle campagne (brouillon)</h2>
            <label htmlFor="ad-field-1" className="space-y-1 text-sm">
              <span>Annonceur</span>
              <Input
                id="ad-field-1"
                required
                maxLength={80}
                value={form.advertiser}
                onChange={(e) => set('advertiser', e.target.value)}
              />
            </label>
            <label className="space-y-1 text-sm">
              <span>Type</span>
              <select
                className="h-10 w-full rounded-md border px-2"
                value={form.kind}
                onChange={(e) => set('kind', e.target.value as 'partner' | 'internal')}
              >
                <option value="partner">Partenaire (marqué « Promotion »)</option>
                <option value="internal">Service FaîtiereHub</option>
              </select>
            </label>
            <label htmlFor="ad-field-2" className="space-y-1 text-sm sm:col-span-2">
              <span>Titre (60 caractères)</span>
              <Input
                id="ad-field-2"
                required
                maxLength={60}
                value={form.title}
                onChange={(e) => set('title', e.target.value)}
              />
            </label>
            <label htmlFor="ad-field-3" className="space-y-1 text-sm sm:col-span-2">
              <span>Texte (140 caractères)</span>
              <Input
                id="ad-field-3"
                required
                maxLength={140}
                value={form.body}
                onChange={(e) => set('body', e.target.value)}
              />
            </label>
            <label htmlFor="ad-field-4" className="space-y-1 text-sm">
              <span>Bouton</span>
              <Input
                id="ad-field-4"
                required
                maxLength={30}
                value={form.cta}
                onChange={(e) => set('cta', e.target.value)}
              />
            </label>
            <label htmlFor="ad-field-5" className="space-y-1 text-sm">
              <span>Lien (page du site ou faitierehub.com)</span>
              <Input
                id="ad-field-5"
                required
                value={form.href}
                onChange={(e) => set('href', e.target.value)}
              />
            </label>
            <fieldset className="flex items-end gap-3 text-sm sm:col-span-2">
              <legend className="mb-1">Couleurs : fond, texte, accent</legend>
              {form.palette.map((c, i) => (
                <input
                  // biome-ignore lint/suspicious/noArrayIndexKey: three fixed colour slots
                  key={i}
                  type="color"
                  aria-label={['Fond', 'Texte', 'Accent'][i]}
                  value={c}
                  onChange={(e) => {
                    const p = [...form.palette] as [string, string, string]
                    p[i] = e.target.value
                    set('palette', p)
                  }}
                  className="h-10 w-14 rounded border"
                />
              ))}
            </fieldset>
            <label className="space-y-1 text-sm">
              <span>Ville</span>
              <select
                className="h-10 w-full rounded-md border px-2"
                value={form.locality}
                onChange={(e) => set('locality', e.target.value as 'lome' | 'kara' | 'all')}
              >
                <option value="lome">Lomé</option>
                <option value="kara">Kara</option>
                <option value="all">Toutes</option>
              </select>
            </label>
            <fieldset className="space-y-1 text-sm">
              <legend>Supports (aucun coché = tous ceux de la ville)</legend>
              {PLACEMENTS.filter(
                (p) => form.locality === 'all' || p.locality === form.locality,
              ).map((p) => (
                <label key={p.id} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={form.placements.includes(p.id)}
                    onChange={(e) =>
                      set(
                        'placements',
                        e.target.checked
                          ? [...form.placements, p.id]
                          : form.placements.filter((x) => x !== p.id),
                      )
                    }
                  />
                  {p.label}
                </label>
              ))}
            </fieldset>
            <label htmlFor="ad-field-6" className="space-y-1 text-sm">
              <span>Début (heure du Togo, GMT)</span>
              <Input
                id="ad-field-6"
                type="datetime-local"
                required
                value={form.startsAt}
                onChange={(e) => set('startsAt', e.target.value)}
              />
            </label>
            <label htmlFor="ad-field-7" className="space-y-1 text-sm">
              <span>Fin (heure du Togo, GMT)</span>
              <Input
                id="ad-field-7"
                type="datetime-local"
                required
                value={form.endsAt}
                onChange={(e) => set('endsAt', e.target.value)}
              />
            </label>
            <label className="flex items-start gap-2 text-sm sm:col-span-2">
              <input
                type="checkbox"
                checked={form.rightsConfirmed}
                onChange={(e) => set('rightsConfirmed', e.target.checked)}
                className="mt-1"
              />
              J’ai vérifié que nous avons le droit d’utiliser ces textes, logos et images.
            </label>
            {form.kind === 'partner' && (
              <label htmlFor="ad-field-8" className="space-y-1 text-sm sm:col-span-2">
                <span>Référence de contrat (après validation commerciale, hors du jeu)</span>
                <Input
                  id="ad-field-8"
                  maxLength={80}
                  value={form.contractRef}
                  onChange={(e) => set('contractRef', e.target.value)}
                />
              </label>
            )}
            <div className="sm:col-span-2">
              <Button type="submit" disabled={busy}>
                Enregistrer le brouillon
              </Button>
            </div>
          </form>
          <Preview campaign={draft} />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 p-6">
          <h2 className="text-lg font-semibold">Campagnes</h2>
          {rows === null ? (
            <p className="text-sm text-muted-foreground">Chargement…</p>
          ) : rows.length === 0 ? (
            <EmptyState
              title="Aucune campagne partenaire"
              description="Les panneaux affichent les services FaîtiereHub."
            />
          ) : (
            <ul className="divide-y">
              {rows.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center gap-3 py-3 text-sm">
                  <span className="min-w-48 flex-1">
                    <strong>{r.creative.title}</strong> · {r.advertiser.name}
                    <span className="block text-xs text-muted-foreground">
                      {STATUS_LABEL[r.status]} · v{r.version} · {TOGO.format(new Date(r.startsAt))}{' '}
                      → {TOGO.format(new Date(r.endsAt))} ·{' '}
                      {r.rightsConfirmed ? 'droits confirmés' : 'droits à confirmer'}
                      {r.advertiser.kind === 'partner'
                        ? ` · contrat ${r.contractRef ?? 'absent'}`
                        : ''}
                    </span>
                  </span>
                  {TRANSITIONS[r.status].map((to) => (
                    <Button
                      key={to}
                      size="sm"
                      variant="outline"
                      onClick={() => void move(r.id, to)}
                    >
                      {MOVE_LABEL[to]}
                    </Button>
                  ))}
                  {r.versions > 1 && (
                    <Button size="sm" variant="ghost" onClick={() => void rollback(r.id, 1)}>
                      Revenir à la v1
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 p-6">
          <h2 className="text-lg font-semibold">Statistiques des 30 derniers jours</h2>
          <p className="text-xs text-muted-foreground">
            Exposition : panneau devant la caméra, à moins de 16 cases, vu de face, au moins 1
            seconde ; une fois par 30 s et par joueur. Approximation sans test d’occlusion. Clic :
            seulement le bouton « En savoir plus ». Aucune donnée personnelle.
          </p>
          {stats.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucune statistique enregistrée.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted-foreground">
                  <th className="py-1">Campagne</th>
                  <th>Support</th>
                  <th className="text-right">Expositions</th>
                  <th className="text-right">Clics</th>
                </tr>
              </thead>
              <tbody>
                {stats.map((s) => (
                  <tr key={`${s.campaign}|${s.placement}`} className="border-t">
                    <td className="py-1">{nameOf(s.campaign)}</td>
                    <td>{PLACEMENTS.find((p) => p.id === s.placement)?.label ?? s.placement}</td>
                    <td className="text-right tabular-nums">{s.impressions}</td>
                    <td className="text-right tabular-nums">{s.clicks}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
