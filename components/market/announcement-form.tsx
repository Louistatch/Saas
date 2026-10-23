'use client'

/**
 * Publier sur le marché ou pour le travail. Le formulaire change avec ce que l'on publie : une
 * offre de travail demande un salaire par jour, un nombre d'ouvriers, une date et une durée ;
 * une récolte, une culture, une quantité (en sacs ou en kilos) et un prix au kilo. Trois
 * parties, dans l'ordre où on y pense : quoi, les détails, où et comment vous joindre.
 */
import { EMPTY_ZONE, ZoneSelect, type ZoneValue } from '@/components/market/zone-select'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { type AnnouncementType, BAG_KG, formatFcfa, toKg } from '@/lib/market/work'
import { createClient } from '@/lib/supabase/client'
import { Briefcase, GraduationCap, Minus, Plus, Sprout, Wrench } from 'lucide-react'
import { useEffect, useState } from 'react'

const KINDS: {
  value: AnnouncementType
  label: string
  hint: string
  icon: typeof Sprout
}[] = [
  { value: 'prevente', label: 'Je vends une récolte', hint: 'Récoltée ou à venir', icon: Sprout },
  {
    value: 'job',
    label: 'Je cherche des ouvriers',
    hint: 'Travail payé à la journée',
    icon: Briefcase,
  },
  {
    value: 'mission',
    label: 'Je cherche un agronome',
    hint: 'Conseil, diagnostic',
    icon: GraduationCap,
  },
  { value: 'autre', label: 'Autre service', hint: 'Matériel, transport…', icon: Wrench },
]

const TITLE_HINT: Record<AnnouncementType, string> = {
  prevente: 'Ex. : Maïs blanc, récolte de novembre',
  job: 'Ex. : Désherbage d’un champ de maïs de 2 ha',
  mission: 'Ex. : Diagnostic d’une parcelle de soja malade',
  autre: 'Ex. : Tricycle à louer pour le transport des récoltes',
}

/** Cultures courantes au Togo, proposées à la saisie (on peut écrire autre chose). */
const CROPS = [
  'Maïs',
  'Soja',
  'Riz',
  'Sorgho',
  'Mil',
  'Igname',
  'Manioc',
  'Arachide',
  'Niébé',
  'Haricot',
  'Tomate',
  'Piment',
  'Oignon',
  'Gombo',
  'Cajou',
  'Café',
  'Cacao',
  'Coton',
  'Ananas',
  'Karité',
]

const FIELD = 'h-11'

export interface PublishedAnnouncement {
  id: string
  type: AnnouncementType
}

/** Le canton du profil suffit : la préfecture et la région s'en déduisent pour la liste. */
async function zoneOfCanton(cantonId: string): Promise<ZoneValue> {
  const supabase = createClient()
  const { data: canton } = await supabase
    .from('cantons')
    .select('prefecture_id')
    .eq('id', cantonId)
    .maybeSingle<{ prefecture_id: string | null }>()
  if (!canton?.prefecture_id) return EMPTY_ZONE
  const { data: prefecture } = await supabase
    .from('prefectures')
    .select('region_id')
    .eq('id', canton.prefecture_id)
    .maybeSingle<{ region_id: string | null }>()
  return {
    regionId: prefecture?.region_id ?? '',
    prefectureId: canton.prefecture_id,
    cantonId,
  }
}

export function AnnouncementForm({
  defaultType = 'prevente',
  defaultPhone,
  defaultCantonId,
  onPublished,
  onCancel,
}: {
  defaultType?: AnnouncementType
  defaultPhone?: string | null
  defaultCantonId?: string | null
  onPublished: (published: PublishedAnnouncement) => void
  onCancel?: () => void
}) {
  const [type, setType] = useState<AnnouncementType>(defaultType)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [culture, setCulture] = useState('')
  const [quantity, setQuantity] = useState('')
  const [unit, setUnit] = useState<'sac' | 'kg'>('sac')
  const [price, setPrice] = useState('')
  const [wage, setWage] = useState('')
  const [positions, setPositions] = useState(1)
  const [startsOn, setStartsOn] = useState('')
  const [workDays, setWorkDays] = useState('1')
  const [phone, setPhone] = useState(defaultPhone ?? '')
  const [zone, setZone] = useState<ZoneValue>(EMPTY_ZONE)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<{ field: string | null; message: string } | null>(null)

  useEffect(() => setType(defaultType), [defaultType])
  // Le profil arrive après le premier rendu : le numéro et le canton se remplissent alors.
  useEffect(() => {
    if (defaultPhone) setPhone((current) => current || defaultPhone)
  }, [defaultPhone])
  useEffect(() => {
    if (!defaultCantonId) return
    let alive = true
    void zoneOfCanton(defaultCantonId).then((z) => {
      if (alive && z.cantonId) setZone((current) => (current.regionId ? current : z))
    })
    return () => {
      alive = false
    }
  }, [defaultCantonId])

  const isJob = type === 'job'
  const isSale = type === 'prevente'
  const wageValue = Number(wage.replace(/\s/g, ''))
  const daysValue = Number(workDays)
  const total = isJob && wageValue > 0 && daysValue > 0 ? wageValue * daysValue * positions : null
  const today = new Date().toISOString().slice(0, 10)

  const fail = (field: string | null, message: string) => {
    setError({ field, message })
    if (field) document.getElementById(`pub-${field}`)?.focus()
  }

  const submit = async () => {
    setError(null)
    if (title.trim().length < 3) return fail('title', 'Donnez un titre d’au moins 3 caractères.')
    if (isJob && !(wageValue >= 100)) return fail('wage', 'Indiquez le salaire par jour, en FCFA.')
    const quantityValue = Number(quantity.replace(',', '.'))
    const priceValue = Number(price.replace(',', '.').replace(/\s/g, ''))
    if (quantity && !(quantityValue > 0)) return fail('quantity', 'Quantité invalide.')
    if (price && !(priceValue > 0)) return fail('price', 'Prix invalide.')

    setSaving(true)
    const res = await fetch('/api/market/announcements', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type,
        title: title.trim(),
        description: description.trim() || undefined,
        culture: culture.trim() || undefined,
        quantity_kg: isSale && quantityValue > 0 ? toKg(quantityValue, unit) : undefined,
        price_per_kg_fcfa: !isJob && priceValue > 0 ? priceValue : undefined,
        wage_per_day_fcfa: isJob ? Math.round(wageValue) : undefined,
        positions: isJob ? positions : undefined,
        starts_on: (isJob || isSale) && startsOn ? startsOn : undefined,
        work_days: isJob && daysValue > 0 ? Math.round(daysValue) : undefined,
        contact_phone: phone.trim() || undefined,
        canton_id: zone.cantonId || undefined,
        prefecture_id: zone.prefectureId || undefined,
        region_id: zone.regionId || undefined,
      }),
    }).catch(() => null)
    setSaving(false)

    if (!res) return fail(null, 'Pas de connexion. Réessayez quand le réseau revient.')
    const body = (await res.json().catch(() => ({}))) as {
      id?: string
      error?: string
      field?: string | null
    }
    if (!res.ok || !body.id) {
      if (res.status === 401) return fail(null, 'Connectez-vous pour publier.')
      if (res.status === 429) {
        return fail(null, 'Trop de publications récentes. Réessayez dans quelques minutes.')
      }
      const field = body.field === 'wage_per_day_fcfa' ? 'wage' : null
      return fail(field, body.error ?? 'Publication impossible. Vérifiez les informations.')
    }
    onPublished({ id: body.id, type })
  }

  const fieldError = (field: string) =>
    error?.field === field ? (
      <p id={`pub-${field}-error`} className="text-sm text-destructive">
        {error.message}
      </p>
    ) : null

  return (
    <form
      noValidate
      className="space-y-8"
      onSubmit={(e) => {
        e.preventDefault()
        void submit()
      }}
    >
      <fieldset className="space-y-3">
        <legend className="mb-3 flex items-center gap-2 text-base font-bold">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-foreground text-xs text-background">
            1
          </span>
          Ce que vous publiez
        </legend>
        <div className="grid grid-cols-2 gap-2">
          {KINDS.map(({ value, label, hint, icon: Icon }) => {
            const active = type === value
            return (
              <label
                key={value}
                className={`flex min-h-20 cursor-pointer flex-col gap-1 rounded-xl border p-3 transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring ${
                  active
                    ? value === 'job'
                      ? 'border-amber-600 bg-amber-50 dark:bg-amber-950/30'
                      : 'border-primary bg-primary/5'
                    : 'border-border hover:border-foreground/30'
                }`}
              >
                <input
                  type="radio"
                  name="announcement-type"
                  value={value}
                  checked={active}
                  onChange={() => setType(value)}
                  className="sr-only"
                />
                <Icon
                  aria-hidden="true"
                  className={`h-5 w-5 ${active ? (value === 'job' ? 'text-amber-700' : 'text-primary') : 'text-muted-foreground'}`}
                />
                <span className="text-sm font-semibold leading-tight">{label}</span>
                <span className="text-xs text-muted-foreground">{hint}</span>
              </label>
            )
          })}
        </div>
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="mb-3 flex items-center gap-2 text-base font-bold">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-foreground text-xs text-background">
            2
          </span>
          {isJob ? 'Le travail' : isSale ? 'La récolte' : 'Les détails'}
        </legend>

        <div className="space-y-1.5">
          <Label htmlFor="pub-title">{isJob ? 'Le travail à faire' : 'Titre'}</Label>
          <Input
            id="pub-title"
            className={FIELD}
            maxLength={120}
            placeholder={TITLE_HINT[type]}
            value={title}
            aria-invalid={error?.field === 'title'}
            aria-describedby={error?.field === 'title' ? 'pub-title-error' : undefined}
            onChange={(e) => {
              setTitle(e.target.value)
              if (error?.field === 'title') setError(null)
            }}
          />
          {fieldError('title')}
        </div>

        {isJob && (
          <>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="pub-wage">Salaire par jour (FCFA)</Label>
                <Input
                  id="pub-wage"
                  className={`${FIELD} tabular-nums`}
                  inputMode="numeric"
                  placeholder="2500"
                  value={wage}
                  aria-invalid={error?.field === 'wage'}
                  aria-describedby={error?.field === 'wage' ? 'pub-wage-error' : 'pub-wage-hint'}
                  onChange={(e) => {
                    setWage(e.target.value.replace(/[^\d\s]/g, ''))
                    if (error?.field === 'wage') setError(null)
                  }}
                />
                {fieldError('wage') ?? (
                  <p id="pub-wage-hint" className="text-xs text-muted-foreground">
                    Ce que reçoit chaque ouvrier pour une journée.
                  </p>
                )}
              </div>
              <fieldset className="space-y-1.5">
                <legend className="text-sm font-medium">Nombre d’ouvriers</legend>
                <div className="flex h-11 items-center justify-between rounded-lg border border-input">
                  <button
                    type="button"
                    aria-label="Un ouvrier de moins"
                    className="flex h-full w-12 items-center justify-center text-muted-foreground disabled:opacity-40"
                    disabled={positions <= 1}
                    onClick={() => setPositions((p) => Math.max(1, p - 1))}
                  >
                    <Minus aria-hidden="true" className="h-4 w-4" />
                  </button>
                  <output aria-live="polite" className="text-base font-semibold tabular-nums">
                    {positions}
                  </output>
                  <button
                    type="button"
                    aria-label="Un ouvrier de plus"
                    className="flex h-full w-12 items-center justify-center text-muted-foreground disabled:opacity-40"
                    disabled={positions >= 200}
                    onClick={() => setPositions((p) => Math.min(200, p + 1))}
                  >
                    <Plus aria-hidden="true" className="h-4 w-4" />
                  </button>
                </div>
              </fieldset>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="pub-start">Premier jour</Label>
                <Input
                  id="pub-start"
                  type="date"
                  min={today}
                  className={FIELD}
                  value={startsOn}
                  onChange={(e) => setStartsOn(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pub-days">Nombre de jours</Label>
                <Input
                  id="pub-days"
                  type="number"
                  min={1}
                  max={120}
                  inputMode="numeric"
                  className={`${FIELD} tabular-nums`}
                  value={workDays}
                  onChange={(e) => setWorkDays(e.target.value)}
                />
              </div>
            </div>
            {total && (
              <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-950 dark:bg-amber-950/30 dark:text-amber-100">
                Paie prévue : <strong className="tabular-nums">{formatFcfa(total)}</strong> en tout,
                pour {`${positions} ouvrier${positions > 1 ? 's' : ''}`} pendant{' '}
                {`${daysValue} jour${daysValue > 1 ? 's' : ''}`}.
              </p>
            )}
          </>
        )}

        {(isSale || type === 'mission' || type === 'autre') && (
          <div className="space-y-1.5">
            <Label htmlFor="pub-culture">Culture {isSale ? '' : '(facultatif)'}</Label>
            <Input
              id="pub-culture"
              className={FIELD}
              list="pub-crops"
              maxLength={80}
              placeholder="Maïs"
              value={culture}
              onChange={(e) => setCulture(e.target.value)}
            />
            <datalist id="pub-crops">
              {CROPS.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </div>
        )}

        {isSale && (
          <>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="pub-quantity">Quantité</Label>
                <div className="flex gap-2">
                  <Input
                    id="pub-quantity"
                    className={`${FIELD} tabular-nums`}
                    inputMode="decimal"
                    placeholder={unit === 'sac' ? '20' : '2000'}
                    value={quantity}
                    aria-invalid={error?.field === 'quantity'}
                    onChange={(e) => {
                      setQuantity(e.target.value)
                      if (error?.field === 'quantity') setError(null)
                    }}
                  />
                  <div className="flex shrink-0 rounded-lg border border-input p-0.5">
                    {(['sac', 'kg'] as const).map((u) => (
                      <button
                        key={u}
                        type="button"
                        aria-pressed={unit === u}
                        onClick={() => setUnit(u)}
                        className={`min-w-14 rounded-md px-3 text-sm font-medium ${unit === u ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}
                      >
                        {u === 'sac' ? 'sacs' : 'kg'}
                      </button>
                    ))}
                  </div>
                </div>
                {fieldError('quantity') ?? (
                  <p className="text-xs text-muted-foreground">Un sac = {BAG_KG} kg.</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pub-price">Prix au kilo (FCFA)</Label>
                <Input
                  id="pub-price"
                  className={`${FIELD} tabular-nums`}
                  inputMode="numeric"
                  placeholder="250"
                  value={price}
                  aria-invalid={error?.field === 'price'}
                  onChange={(e) => {
                    setPrice(e.target.value)
                    if (error?.field === 'price') setError(null)
                  }}
                />
                {fieldError('price') ?? (
                  <p className="text-xs text-muted-foreground">
                    Laissez vide pour en discuter avec l’acheteur.
                  </p>
                )}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pub-harvest">Disponible à partir du (facultatif)</Label>
              <Input
                id="pub-harvest"
                type="date"
                className={FIELD}
                value={startsOn}
                onChange={(e) => setStartsOn(e.target.value)}
              />
            </div>
          </>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="pub-description">Précisions (facultatif)</Label>
          <Textarea
            id="pub-description"
            rows={3}
            maxLength={1000}
            placeholder={
              isJob
                ? 'Horaires, repas, outils fournis, lieu exact…'
                : 'Qualité, conditionnement, conditions…'
            }
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="mb-3 flex items-center gap-2 text-base font-bold">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-foreground text-xs text-background">
            3
          </span>
          Où, et comment vous joindre
        </legend>
        <ZoneSelect value={zone} onChange={setZone} idPrefix="pub-zone" />
        <p className="text-xs text-muted-foreground">
          Avec le canton, votre annonce passe en tête pour vos voisins.
        </p>
        <div className="space-y-1.5">
          <Label htmlFor="pub-phone">Téléphone (facultatif)</Label>
          <Input
            id="pub-phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            className={FIELD}
            placeholder="90 00 00 00"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            Donné à qui le demande sur l’annonce, et à ceux que vous retenez. Sans numéro, on vous
            répond seulement depuis le site.
          </p>
        </div>
      </fieldset>

      {error && !error.field && (
        <p role="alert" className="text-sm text-destructive">
          {error.message}
        </p>
      )}

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        {onCancel && (
          <Button type="button" variant="outline" className="h-12" onClick={onCancel}>
            Annuler
          </Button>
        )}
        <Button
          type="submit"
          className={`h-12 text-base ${isJob ? 'bg-amber-700 text-white hover:bg-amber-800' : ''}`}
          disabled={saving}
        >
          {saving ? 'Publication…' : isJob ? 'Publier l’offre de travail' : 'Publier l’annonce'}
        </Button>
      </div>
    </form>
  )
}
