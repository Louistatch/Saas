'use client'

/**
 * Édition du profil Haroo par son titulaire.
 *
 * Jusqu'ici un ouvrier, un acheteur ou un agronome ne pouvait rien changer :
 * son profil était écrit une fois à l'inscription puis figé, et seul le
 * service_role pouvait y toucher. Conséquence la plus visible : les cantons de
 * disponibilité n'étaient jamais renseignés, donc le tri « offres dans votre
 * canton » ne pouvait structurellement rien remonter.
 *
 * L'écriture passe par le client de session : la policy `*_own_update` et le
 * trigger `protect_haroo_privileges` restent l'autorité. Les champs de
 * confiance (numéro de carte, badge, notes) ne sont pas dans ce formulaire,
 * et le trigger les rétablirait de toute façon.
 */

import { Spinner } from '@/components/shared/loading'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { createClient } from '@/lib/supabase/client'
import { Check, Pencil, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

export type HarooRoleKey = 'ouvrier' | 'acheteur' | 'agronome'

export interface EditableHarooProfile {
  id: string
  phone: string | null
  competences?: string[]
  produits_interesses?: string[]
  specialisations?: string[]
  type_acheteur?: string | null
  prefecture_id?: string | null
  canton_id?: string | null
}

interface Canton {
  id: string
  name: string
  prefecture_id: string | null
}

interface Prefecture {
  id: string
  name: string
}

const TABLE: Record<HarooRoleKey, string> = {
  ouvrier: 'haroo_ouvrier_profiles',
  acheteur: 'haroo_acheteur_profiles',
  agronome: 'haroo_agronome_profiles',
}

/** Le libellé des « étiquettes » change de sens selon le métier. */
const TAG_FIELD: Record<HarooRoleKey, { column: string; label: string; hint: string }> = {
  ouvrier: {
    column: 'competences',
    label: 'Compétences',
    hint: 'Ex. : labour, semis, récolte, taille, traitement phytosanitaire',
  },
  acheteur: {
    column: 'produits_interesses',
    label: 'Produits recherchés',
    hint: 'Ex. : maïs, soja, café, cacao — sert à vous proposer les bonnes préventes',
  },
  agronome: {
    column: 'specialisations',
    label: 'Spécialisations',
    hint: 'Ex. : fertilité des sols, protection des cultures, irrigation',
  },
}

const SELECT_CLASS =
  'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50'

export function HarooProfileEditor({
  harooRole,
  profile,
  myCantonIds,
  onSaved,
}: {
  harooRole: HarooRoleKey
  profile: EditableHarooProfile
  /** Cantons de disponibilité actuels (ouvrier uniquement). */
  myCantonIds: string[]
  onSaved: () => void
}) {
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [cantons, setCantons] = useState<Canton[]>([])
  const [prefectures, setPrefectures] = useState<Prefecture[]>([])

  const tagField = TAG_FIELD[harooRole]
  const initialTags = useMemo(
    () =>
      (harooRole === 'ouvrier'
        ? profile.competences
        : harooRole === 'acheteur'
          ? profile.produits_interesses
          : profile.specialisations) ?? [],
    [harooRole, profile.competences, profile.produits_interesses, profile.specialisations],
  )

  const [phone, setPhone] = useState(profile.phone ?? '')
  const [tags, setTags] = useState<string[]>(initialTags)
  const [tagDraft, setTagDraft] = useState('')
  const [typeAcheteur, setTypeAcheteur] = useState(profile.type_acheteur ?? '')
  const [prefectureId, setPrefectureId] = useState(profile.prefecture_id ?? '')
  const [cantonId, setCantonId] = useState(profile.canton_id ?? '')
  const [selectedCantons, setSelectedCantons] = useState<string[]>(myCantonIds)

  // Le référentiel géographique est en lecture publique : pas besoin d'un
  // aller-retour serveur pour le charger.
  useEffect(() => {
    if (!open || cantons.length > 0) return
    const supabase = createClient()
    void Promise.all([
      supabase.from('cantons').select('id, name, prefecture_id').order('name').returns<Canton[]>(),
      supabase.from('prefectures').select('id, name').order('name').returns<Prefecture[]>(),
    ]).then(([c, p]) => {
      setCantons(c.data ?? [])
      setPrefectures(p.data ?? [])
    })
  }, [open, cantons.length])

  // Réaligner le formulaire sur le profil à chaque ouverture : un abandon ne
  // doit pas laisser d'état fantôme à la réouverture.
  useEffect(() => {
    if (!open) return
    setPhone(profile.phone ?? '')
    setTags(initialTags)
    setTagDraft('')
    setTypeAcheteur(profile.type_acheteur ?? '')
    setPrefectureId(profile.prefecture_id ?? '')
    setCantonId(profile.canton_id ?? '')
    setSelectedCantons(myCantonIds)
    setError(null)
  }, [open, profile, initialTags, myCantonIds])

  const addTag = () => {
    const value = tagDraft.trim()
    if (!value) return
    if (!tags.some((t) => t.toLowerCase() === value.toLowerCase())) setTags([...tags, value])
    setTagDraft('')
  }

  const toggleCanton = (id: string) => {
    setSelectedCantons((prev) => (prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]))
  }

  const save = async () => {
    setSaving(true)
    setError(null)
    const supabase = createClient()

    const patch: Record<string, unknown> = {
      phone: phone.trim() || null,
      [tagField.column]: tags,
    }
    if (harooRole === 'acheteur') {
      patch.type_acheteur = typeAcheteur.trim() || null
      patch.prefecture_id = prefectureId || null
    }
    if (harooRole === 'agronome') {
      patch.canton_id = cantonId || null
    }

    const { error: updateError } = await supabase
      .from(TABLE[harooRole])
      .update(patch)
      .eq('id', profile.id)

    if (updateError) {
      setError('Enregistrement impossible. Vérifiez votre connexion et réessayez.')
      setSaving(false)
      return
    }

    if (harooRole === 'ouvrier') {
      // Table de liaison sans clé métier : on remplace l'ensemble plutôt que
      // de calculer un diff, le volume étant de quelques lignes.
      const removed = myCantonIds.filter((id) => !selectedCantons.includes(id))
      const added = selectedCantons.filter((id) => !myCantonIds.includes(id))
      if (removed.length > 0) {
        await supabase
          .from('haroo_ouvrier_cantons')
          .delete()
          .eq('ouvrier_id', profile.id)
          .in('canton_id', removed)
      }
      if (added.length > 0) {
        const { error: insertError } = await supabase
          .from('haroo_ouvrier_cantons')
          .insert(added.map((canton_id) => ({ ouvrier_id: profile.id, canton_id })))
        if (insertError) {
          setError('Profil enregistré, mais les cantons n’ont pas pu être mis à jour.')
          setSaving(false)
          onSaved()
          return
        }
      }
    }

    setSaving(false)
    setOpen(false)
    onSaved()
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Pencil className="mr-1.5 h-3.5 w-3.5" /> Modifier mon profil
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Mon profil Haroo</DialogTitle>
            <DialogDescription>
              Ces informations sont visibles des personnes qui scannent votre carte et servent à
              vous proposer ce qui se passe près de chez vous.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5 py-2">
            <div className="space-y-2">
              <Label htmlFor="haroo-phone">Téléphone</Label>
              <Input
                id="haroo-phone"
                type="tel"
                inputMode="tel"
                placeholder="90 00 00 00"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Utilisé pour vous joindre par appel ou WhatsApp.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="haroo-tag">{tagField.label}</Label>
              <div className="flex gap-2">
                <Input
                  id="haroo-tag"
                  placeholder="Ajouter…"
                  value={tagDraft}
                  onChange={(e) => setTagDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      addTag()
                    }
                  }}
                />
                <Button type="button" variant="outline" onClick={addTag}>
                  Ajouter
                </Button>
              </div>
              {tags.length > 0 && (
                <div className="flex flex-wrap gap-2 pt-1">
                  {tags.map((tag) => (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => setTags(tags.filter((t) => t !== tag))}
                      className="inline-flex items-center gap-1 rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground hover:bg-muted/70"
                    >
                      {tag} <X className="h-3 w-3" />
                    </button>
                  ))}
                </div>
              )}
              <p className="text-xs text-muted-foreground">{tagField.hint}</p>
            </div>

            {harooRole === 'acheteur' && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="haroo-type-acheteur">Type d&apos;acheteur</Label>
                  <Input
                    id="haroo-type-acheteur"
                    placeholder="Grossiste, transformateur, exportateur…"
                    value={typeAcheteur}
                    onChange={(e) => setTypeAcheteur(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="haroo-prefecture">Préfecture d&apos;intervention</Label>
                  <select
                    id="haroo-prefecture"
                    className={SELECT_CLASS}
                    value={prefectureId}
                    onChange={(e) => setPrefectureId(e.target.value)}
                  >
                    <option value="">— Non renseignée —</option>
                    {prefectures.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>
              </>
            )}

            {harooRole === 'agronome' && (
              <div className="space-y-2">
                <Label htmlFor="haroo-canton">Canton de rattachement</Label>
                <select
                  id="haroo-canton"
                  className={SELECT_CLASS}
                  value={cantonId}
                  onChange={(e) => setCantonId(e.target.value)}
                >
                  <option value="">— Non renseigné —</option>
                  {cantons.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {harooRole === 'ouvrier' && (
              <div className="space-y-2">
                <Label htmlFor="haroo-canton-filter">Cantons où je suis disponible</Label>
                <select
                  id="haroo-canton-filter"
                  className={SELECT_CLASS}
                  value=""
                  onChange={(e) => {
                    if (e.target.value) toggleCanton(e.target.value)
                  }}
                >
                  <option value="">— Ajouter un canton —</option>
                  {cantons
                    .filter((c) => !selectedCantons.includes(c.id))
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                </select>
                {selectedCantons.length > 0 ? (
                  <div className="flex flex-wrap gap-2 pt-1">
                    {selectedCantons.map((id) => (
                      <button
                        key={id}
                        type="button"
                        onClick={() => toggleCanton(id)}
                        className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary hover:bg-primary/20"
                      >
                        {cantons.find((c) => c.id === id)?.name ?? 'Canton'}{' '}
                        <X className="h-3 w-3" />
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Sans canton renseigné, aucune offre ne peut vous être proposée en priorité.
                  </p>
                )}
              </div>
            )}

            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>
              Annuler
            </Button>
            <Button onClick={save} disabled={saving}>
              {saving ? (
                <Spinner className="h-4 w-4" />
              ) : (
                <>
                  <Check className="mr-1.5 h-4 w-4" /> Enregistrer
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
