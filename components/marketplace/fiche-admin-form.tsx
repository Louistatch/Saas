'use client'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import type { PublicFiche } from '@/hooks/use-fiches-public'
import { useReferenceData } from '@/hooks/use-reference-data'
import { firstInvalidTarget, followOffset, unplacedErrors } from '@/lib/fiches/admin-form'
import { FICHE_LIMITS } from '@/lib/fiches/schema'
import { TYPES_AGRICULTURE, formatFileSize, labelFileType } from '@/lib/fiches/types'
import { type FicheDraftValues, UPLOAD_ACCEPT, checkUploadFile } from '@/lib/fiches/upload'
import { compressImage } from '@/lib/utils/compress-image'
import { AlertCircle, ExternalLink, FileUp, ImagePlus, Loader2, RefreshCw, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { FicheCard } from './fiche-card'
import { FieldError } from './field-error'

export interface FicheFormValues extends FicheDraftValues {
  status: 'draft' | 'published'
}

export interface ExistingFicheFile {
  name: string
  url: string
  type: string
  size?: number
}

export interface ExistingItem {
  kind: 'existing'
  file: ExistingFicheFile
  /** Lien signé (10 min) pour ouvrir le fichier déposé. */
  openUrl?: string | null
}

export type FormFileItem = ExistingItem | { kind: 'new'; file: File; replaces?: ExistingItem }

export interface FicheFormSubmit {
  values: FicheFormValues
  items: FormFileItem[]
  /** Nouvelle image choisie, ou null (inchangée / aucune). */
  cover: Blob | null
  /** Image existante retirée sans remplacement. */
  coverRemoved: boolean
}

interface FicheAdminFormProps {
  mode: 'create' | 'edit'
  initialValues: FicheFormValues
  initialCoverUrl?: string | null
  initialItems?: FormFileItem[]
  /** Erreurs par champ (validation locale ou `details` du serveur). */
  errors: Record<string, string>
  saving: boolean
  /** Étape en cours, ex. « Envoi 2/3 : budget.xlsx ». */
  progress: string | null
  /** Échec de l'enregistrement (réseau, serveur), affiché près du bouton. */
  formError?: string | null
  sellerName?: string
  submitLabel: string
  onSubmit: (s: FicheFormSubmit) => void
  onCancel?: () => void
}

export const EMPTY_FICHE_VALUES: FicheFormValues = {
  title: '',
  description: '',
  culture: '',
  type_agriculture: 'conventionnel',
  campaign: '',
  price: '2000',
  region_id: '',
  prefecture_id: '',
  canton_id: '',
  status: 'published',
}

const selectClass =
  'w-full h-9 rounded-md border border-input bg-background px-3 text-sm aria-[invalid=true]:border-destructive'

/** Défilement doux, sauf si l'utilisateur a demandé moins d'animations. */
function smoothScroll(): ScrollBehavior {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'
}

/**
 * Formulaire d'un compte d'exploitation (création et modification) : mêmes
 * champs, mêmes limites que le serveur, erreurs sous chaque champ, gestion des
 * fichiers (ouvrir, remplacer, retirer) et aperçu de la carte vue par l'acheteur.
 */
export function FicheAdminForm({
  mode,
  initialValues,
  initialCoverUrl,
  initialItems,
  errors,
  saving,
  progress,
  formError,
  sellerName,
  submitLabel,
  onSubmit,
  onCancel,
}: FicheAdminFormProps) {
  const [values, setValues] = useState<FicheFormValues>(initialValues)
  const [items, setItems] = useState<FormFileItem[]>(initialItems ?? [])
  const [cover, setCover] = useState<{ blob: Blob; preview: string } | null>(null)
  const [coverRemoved, setCoverRemoved] = useState(false)
  const [fileError, setFileError] = useState<string | null>(null)
  const { referenceData: ref } = useReferenceData()
  const replaceInput = useRef<HTMLInputElement>(null)
  const replaceTarget = useRef<ExistingItem | null>(null)
  const previewRef = useRef<HTMLElement>(null)
  const actionsRef = useRef<HTMLDivElement>(null)

  // Erreurs reçues (validation locale ou serveur) : on amène au premier champ
  // en erreur, quel que soit l'endroit où l'on a cliqué « Enregistrer ».
  useEffect(() => {
    const id = firstInvalidTarget(errors, mode)
    const el = id ? document.getElementById(id) : null
    if (!el) return
    el.focus({ preventScroll: true })
    el.scrollIntoView({ block: 'center', behavior: smoothScroll() })
  }, [errors, mode])

  // Échec sans champ fautif : le message, près du bouton, reste sous les yeux.
  useEffect(() => {
    if (formError && !firstInvalidTarget(errors, mode))
      actionsRef.current?.scrollIntoView({ block: 'nearest', behavior: smoothScroll() })
  }, [formError, errors, mode])

  // Grand écran : l'aperçu suit la saisie. `position: sticky` ne prend pas
  // ici (le <main> du shell admin est en overflow-auto, c'est la fenêtre qui
  // défile) : on décale l'aperçu, borné au formulaire (lib/fiches/admin-form).
  useEffect(() => {
    const box = previewRef.current
    const track = box?.parentElement
    if (mode !== 'create' || !box || !track) return
    const wide = window.matchMedia('(min-width: 1024px)')
    let frame = 0
    const place = () => {
      frame = 0
      const offset = wide.matches
        ? followOffset({
            trackTop: track.getBoundingClientRect().top,
            trackHeight: track.offsetHeight,
            boxHeight: box.offsetHeight,
            gap: 16,
          })
        : 0
      box.style.transform = offset > 0 ? `translateY(${offset}px)` : ''
    }
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(place)
    }
    // Capture : reçoit aussi le défilement d'un conteneur, pas seulement de la fenêtre.
    window.addEventListener('scroll', schedule, { passive: true, capture: true })
    window.addEventListener('resize', schedule)
    wide.addEventListener('change', schedule)
    const resize = new ResizeObserver(schedule)
    resize.observe(track)
    place()
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('scroll', schedule, { capture: true })
      window.removeEventListener('resize', schedule)
      wide.removeEventListener('change', schedule)
      resize.disconnect()
      box.style.transform = ''
    }
  }, [mode])

  // Liens signés arrivés après l'ouverture : on les rattache aux fichiers existants.
  useEffect(() => {
    if (!initialItems) return
    setItems((prev) =>
      prev.map((it) => {
        if (it.kind !== 'existing') return it
        const fresh = initialItems.find(
          (x): x is ExistingItem => x.kind === 'existing' && x.file.url === it.file.url,
        )
        return fresh ? { ...it, openUrl: fresh.openUrl } : it
      }),
    )
  }, [initialItems])

  useEffect(
    () => () => {
      if (cover) URL.revokeObjectURL(cover.preview)
    },
    [cover],
  )

  const set = <K extends keyof FicheFormValues>(key: K, v: FicheFormValues[K]) =>
    setValues((f) => ({ ...f, [key]: v }))

  const prefectures = useMemo(
    () => ref.prefectures.filter((p) => !values.region_id || p.region_id === values.region_id),
    [ref.prefectures, values.region_id],
  )
  const cantons = useMemo(() => {
    const allowed = new Set(prefectures.map((p) => p.id))
    return ref.cantons.filter((c) =>
      values.prefecture_id
        ? c.prefecture_id === values.prefecture_id
        : allowed.has(c.prefecture_id),
    )
  }, [ref.cantons, prefectures, values.prefecture_id])

  // Une culture héritée absente du référentiel reste sélectionnable telle quelle.
  const cultureOptions = useMemo(() => {
    const names = ref.cultures.map((c) => c.name)
    return values.culture && !names.includes(values.culture) ? [values.culture, ...names] : names
  }, [ref.cultures, values.culture])

  const pickCanton = (id: string) => {
    const c = ref.cantons.find((x) => x.id === id)
    const p = c ? ref.prefectures.find((x) => x.id === c.prefecture_id) : undefined
    setValues((f) => ({
      ...f,
      canton_id: id,
      prefecture_id: p?.id ?? f.prefecture_id,
      region_id: p?.region_id ?? f.region_id,
    }))
  }

  const accept = (list: FileList | null): File[] => {
    const picked = Array.from(list ?? [])
    const problems = picked.map(checkUploadFile).filter((m): m is string => m !== null)
    setFileError(problems.length > 0 ? problems.join(' ') : null)
    return picked.filter((f) => checkUploadFile(f) === null)
  }

  const addFiles = (list: FileList | null) => {
    const ok = accept(list)
    setItems((prev) => [
      ...prev,
      ...ok
        .filter((n) => !prev.some((p) => p.kind === 'new' && p.file.name === n.name))
        .map((file) => ({ kind: 'new' as const, file })),
    ])
  }

  const replaceWith = (list: FileList | null) => {
    const target = replaceTarget.current
    const [file] = accept(list)
    if (!target || !file) return
    setItems((prev) =>
      prev.map((it) => (it === target ? { kind: 'new' as const, file, replaces: target } : it)),
    )
  }

  // Retirer un remplacement rend le fichier d'origine ; retirer un fichier l'enlève.
  const removeItem = (item: FormFileItem) =>
    setItems((prev) =>
      prev.flatMap((it) => {
        if (it !== item) return [it]
        return it.kind === 'new' && it.replaces ? [it.replaces] : []
      }),
    )

  const pickCover = async (file: File | undefined) => {
    if (!file) return
    try {
      const blob = await compressImage(file)
      setCover({ blob, preview: URL.createObjectURL(blob) })
      setCoverRemoved(false)
    } catch {
      setFileError('Image illisible. Choisissez une photo JPG ou PNG.')
    }
  }

  const coverUrl = cover?.preview ?? (coverRemoved ? null : (initialCoverUrl ?? null))
  const region = ref.regions.find((r) => r.id === values.region_id)
  const prefecture = ref.prefectures.find((p) => p.id === values.prefecture_id)
  const canton = ref.cantons.find((c) => c.id === values.canton_id)
  const previewFiche: PublicFiche = {
    id: 'apercu',
    title: values.title.trim(),
    description: values.description.trim() || null,
    culture: values.culture,
    type_agriculture: values.type_agriculture,
    campaign: values.campaign.trim() || null,
    price_non_member: Number.parseInt(values.price || '0', 10) || 0,
    download_count: 0,
    created_at: '',
    cooperative_id: null,
    is_free_for_members: false,
    cover_url: coverUrl,
    canton_id: values.canton_id || null,
    prefecture_id: values.prefecture_id || null,
    region_id: values.region_id || null,
    cooperatives: sellerName ? { name: sellerName, faitiere_name: null } : null,
    region: region ? { id: region.id, name: region.name } : null,
    prefecture: prefecture ? { id: prefecture.id, name: prefecture.name } : null,
    canton: canton ? { id: canton.id, name: canton.name } : null,
    files_count: items.length,
    files_summary: items.map((it) =>
      it.kind === 'new'
        ? { type: it.file.name.split('.').pop() ?? '', size: it.file.size }
        : { type: it.file.type, size: it.file.size ?? null },
    ),
  }

  const err = (field: string) => errors[field]
  const invalid = (field: string) => (errors[field] ? true : undefined)
  /** aria-describedby seulement quand le message existe. */
  const described = (field: string, id: string) => (errors[field] ? id : undefined)
  const filesError = fileError ?? err('files')
  const zoneError = err('region_id') ?? err('prefecture_id') ?? err('canton_id')
  const otherErrors = unplacedErrors(errors)

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        onSubmit({ values, items, cover: cover?.blob ?? null, coverRemoved })
      }}
      className={`grid grid-cols-1 gap-6 ${mode === 'create' ? 'lg:grid-cols-[1fr_260px]' : ''}`}
      noValidate
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 content-start">
        <div className="space-y-1.5 md:col-span-2">
          <Label htmlFor={`${mode}-title`}>Titre</Label>
          <Input
            id={`${mode}-title`}
            value={values.title}
            onChange={(e) => set('title', e.target.value)}
            placeholder="Compte d’exploitation Maïs, 1 hectare, Kara"
            maxLength={FICHE_LIMITS.titleMax}
            aria-invalid={invalid('title')}
            aria-describedby={described('title', `${mode}-title-err`)}
          />
          <FieldError id={`${mode}-title-err`} text={err('title')} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${mode}-culture`}>Culture</Label>
          <select
            id={`${mode}-culture`}
            value={values.culture}
            onChange={(e) => set('culture', e.target.value)}
            className={selectClass}
            aria-invalid={invalid('culture')}
            aria-describedby={described('culture', `${mode}-culture-err`)}
          >
            <option value="">Choisir une culture</option>
            {cultureOptions.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
          <FieldError id={`${mode}-culture-err`} text={err('culture')} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${mode}-type`}>Système de production</Label>
          <select
            id={`${mode}-type`}
            value={values.type_agriculture}
            onChange={(e) => set('type_agriculture', e.target.value)}
            className={selectClass}
            aria-invalid={invalid('type_agriculture')}
            aria-describedby={described('type_agriculture', `${mode}-type-err`)}
          >
            {Object.entries(TYPES_AGRICULTURE).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
          <FieldError id={`${mode}-type-err`} text={err('type_agriculture')} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${mode}-campaign`}>Campagne</Label>
          <Input
            id={`${mode}-campaign`}
            value={values.campaign}
            onChange={(e) => set('campaign', e.target.value)}
            placeholder="2026-2027"
            maxLength={FICHE_LIMITS.campaignMax}
            aria-invalid={invalid('campaign')}
            aria-describedby={described('campaign', `${mode}-campaign-err`)}
          />
          <FieldError id={`${mode}-campaign-err`} text={err('campaign')} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${mode}-price`}>Prix (FCFA)</Label>
          <Input
            id={`${mode}-price`}
            inputMode="numeric"
            value={values.price}
            onChange={(e) => set('price', e.target.value.replace(/\D/g, '').slice(0, 7))}
            aria-invalid={invalid('price_non_member')}
            aria-describedby={`${mode}-price-hint`}
          />
          {err('price_non_member') ? (
            <FieldError id={`${mode}-price-hint`} text={err('price_non_member')} />
          ) : (
            <p id={`${mode}-price-hint`} className="text-xs text-muted-foreground">
              0 = téléchargement gratuit pour tous. 1 000 000 FCFA au plus.
            </p>
          )}
        </div>
        <div className="space-y-1.5 md:col-span-2">
          <Label htmlFor={`${mode}-desc`}>Description</Label>
          <Textarea
            id={`${mode}-desc`}
            rows={3}
            value={values.description}
            onChange={(e) => set('description', e.target.value)}
            placeholder="Ce que contient le document : charges, rendement, marge, calendrier…"
            maxLength={FICHE_LIMITS.descriptionMax}
            aria-invalid={invalid('description')}
            aria-describedby={described('description', `${mode}-desc-err`)}
          />
          <div className="flex justify-between gap-2">
            <FieldError id={`${mode}-desc-err`} text={err('description')} />
            <span className="ml-auto text-xs tabular-nums text-muted-foreground">
              {values.description.length}/{FICHE_LIMITS.descriptionMax}
            </span>
          </div>
        </div>
        <div className="space-y-1.5 md:col-span-2">
          <Label>Zone concernée (facultatif)</Label>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <select
              id={`${mode}-region`}
              aria-label="Région"
              aria-invalid={invalid('region_id')}
              aria-describedby={zoneError ? `${mode}-zone-err` : undefined}
              value={values.region_id}
              onChange={(e) =>
                setValues((f) => ({
                  ...f,
                  region_id: e.target.value,
                  prefecture_id: '',
                  canton_id: '',
                }))
              }
              className={selectClass}
            >
              <option value="">Toutes les régions</option>
              {ref.regions.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
            <select
              id={`${mode}-prefecture`}
              aria-label="Préfecture"
              aria-invalid={invalid('prefecture_id')}
              aria-describedby={zoneError ? `${mode}-zone-err` : undefined}
              value={values.prefecture_id}
              onChange={(e) => {
                const p = ref.prefectures.find((x) => x.id === e.target.value)
                setValues((f) => ({
                  ...f,
                  prefecture_id: e.target.value,
                  region_id: p?.region_id ?? f.region_id,
                  canton_id: '',
                }))
              }}
              className={selectClass}
            >
              <option value="">Toutes les préfectures</option>
              {prefectures.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <select
              id={`${mode}-canton`}
              aria-label="Canton"
              aria-invalid={invalid('canton_id')}
              aria-describedby={zoneError ? `${mode}-zone-err` : undefined}
              value={values.canton_id}
              onChange={(e) => pickCanton(e.target.value)}
              className={selectClass}
            >
              <option value="">Tous les cantons</option>
              {cantons.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <p className="text-xs text-muted-foreground">
            Choisir un canton remplit automatiquement la préfecture et la région.
          </p>
          <FieldError id={`${mode}-zone-err`} text={zoneError} />
        </div>

        <div className="space-y-1.5 md:col-span-2">
          <Label htmlFor={`${mode}-cover`}>Image d’illustration (compressée automatiquement)</Label>
          <div className="flex items-center gap-3">
            {coverUrl ? (
              <div className="relative">
                <img src={coverUrl} alt="" className="h-20 w-28 rounded-md object-cover border" />
                <button
                  type="button"
                  onClick={() => {
                    setCover(null)
                    setCoverRemoved(true)
                  }}
                  className="absolute -top-2 -right-2 rounded-full bg-background border p-0.5"
                  aria-label="Retirer l’image"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ) : (
              <div className="flex h-20 w-28 items-center justify-center rounded-md border border-dashed text-muted-foreground">
                <ImagePlus className="h-6 w-6" />
              </div>
            )}
            <div className="flex-1 space-y-1">
              <Input
                id={`${mode}-cover`}
                type="file"
                accept="image/*"
                aria-invalid={invalid('cover_url')}
                aria-describedby={described('cover_url', `${mode}-cover-err`)}
                onChange={(e) => {
                  void pickCover(e.target.files?.[0])
                  e.target.value = ''
                }}
              />
              {cover ? (
                <p className="text-xs text-muted-foreground">
                  {formatFileSize(cover.blob.size)} après compression
                </p>
              ) : null}
            </div>
          </div>
          <FieldError id={`${mode}-cover-err`} text={err('cover_url')} />
        </div>

        <div className="space-y-2 md:col-span-2">
          <Label htmlFor={`${mode}-files`}>
            Fichiers vendus (PDF, Excel, Word, 20 Mo max chacun)
          </Label>
          {items.length > 0 ? (
            <ul className="space-y-1.5">
              {items.map((it) => (
                <li
                  key={it.kind === 'new' ? `new:${it.file.name}` : `old:${it.file.url}`}
                  className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-md border px-2 py-1.5 text-xs"
                >
                  <span className="min-w-0 flex-1 truncate">
                    <span className="font-medium text-foreground">{it.file.name}</span>{' '}
                    <span className="text-muted-foreground">
                      {[
                        labelFileType(
                          it.kind === 'new' ? (it.file.name.split('.').pop() ?? '') : it.file.type,
                        ),
                        formatFileSize(it.file.size),
                      ]
                        .filter(Boolean)
                        .join(', ')}
                    </span>
                    {it.kind === 'new' && it.replaces ? (
                      <span className="block text-amber-700">
                        Remplace « {it.replaces.file.name} » à l’enregistrement
                      </span>
                    ) : it.kind === 'new' && mode === 'edit' ? (
                      <span className="block text-primary">Ajouté à l’enregistrement</span>
                    ) : null}
                  </span>
                  {it.kind === 'existing' && it.openUrl ? (
                    <a
                      href={it.openUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 rounded px-1.5 py-1 text-primary hover:bg-primary/10"
                    >
                      <ExternalLink className="h-3.5 w-3.5" /> Ouvrir
                    </a>
                  ) : null}
                  {it.kind === 'existing' ? (
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 rounded px-1.5 py-1 text-foreground hover:bg-muted"
                      onClick={() => {
                        replaceTarget.current = it
                        replaceInput.current?.click()
                      }}
                      disabled={saving}
                    >
                      <RefreshCw className="h-3.5 w-3.5" /> Remplacer
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => removeItem(it)}
                    aria-label={
                      it.kind === 'new' && it.replaces
                        ? `Annuler le remplacement de ${it.replaces.file.name}`
                        : `Retirer ${it.file.name}`
                    }
                    className="rounded p-1 hover:bg-muted"
                    disabled={saving}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          <Input
            id={`${mode}-files`}
            type="file"
            multiple
            accept={UPLOAD_ACCEPT}
            onChange={(e) => {
              addFiles(e.target.files)
              e.target.value = ''
            }}
            aria-invalid={filesError ? true : undefined}
            aria-describedby={filesError ? `${mode}-files-err` : undefined}
          />
          <input
            ref={replaceInput}
            type="file"
            accept={UPLOAD_ACCEPT}
            className="sr-only"
            tabIndex={-1}
            aria-hidden="true"
            onChange={(e) => {
              replaceWith(e.target.files)
              e.target.value = ''
            }}
          />
          {mode === 'edit' ? (
            <p className="text-xs text-muted-foreground">
              Les acheteurs existants recevront la nouvelle version d’un fichier remplacé.
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">
              Ajoutez les fichiers un par un ou ensemble (ex. le Excel puis le Word).
            </p>
          )}
          <FieldError id={`${mode}-files-err`} text={filesError} />
        </div>

        {mode === 'create' ? (
          <label className="flex items-center gap-2 text-sm md:col-span-2">
            <input
              type="checkbox"
              checked={values.status === 'published'}
              onChange={(e) => set('status', e.target.checked ? 'published' : 'draft')}
            />
            Mettre en vente tout de suite
          </label>
        ) : null}

        {formError || otherErrors.length > 0 ? (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-md border border-destructive/20 bg-destructive/10 px-3 py-2 md:col-span-2"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
            <div className="space-y-1 text-sm text-destructive">
              {formError ? <p>{formError}</p> : null}
              {otherErrors.map((t) => (
                <p key={t}>{t}</p>
              ))}
            </div>
          </div>
        ) : null}

        <div
          ref={actionsRef}
          className="flex flex-wrap items-center justify-end gap-3 scroll-mb-4 md:col-span-2"
        >
          {progress ? (
            <output className="block mr-auto text-sm text-muted-foreground">{progress}</output>
          ) : null}
          {onCancel ? (
            <Button type="button" variant="outline" onClick={onCancel} disabled={saving}>
              Annuler
            </Button>
          ) : null}
          <Button type="submit" disabled={saving} className="gap-2">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileUp className="h-4 w-4" />}
            {submitLabel}
          </Button>
        </div>
      </div>

      <aside
        ref={previewRef}
        className={mode === 'create' ? 'space-y-2 self-start will-change-transform' : 'space-y-2'}
      >
        <p className="text-sm font-medium text-foreground">Aperçu dans la boutique</p>
        <div className={mode === 'create' ? '' : 'max-w-[280px]'}>
          <FicheCard fiche={previewFiche} onAccess={() => {}} preview />
        </div>
      </aside>
    </form>
  )
}
