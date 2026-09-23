'use client'

/**
 * Publication d'une annonce sur le marché de proximité.
 *
 * Jusqu'ici, seul un administrateur pouvait faire exister une offre d'emploi
 * ou une prévente : `haroo_jobs` et `haroo_presales` n'ont aucune policy
 * d'écriture publique. Un ouvrier ou un acheteur ne pouvait donc que consulter.
 * `producer_announcements` accepte désormais un `author_id`, ce qui ouvre la
 * publication à tout compte connecté, fiche membre ou non.
 *
 * L'auteur n'est jamais envoyé par le client : la route le prend de la session.
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
import { Textarea } from '@/components/ui/textarea'
import { createClient } from '@/lib/supabase/client'
import { Megaphone } from 'lucide-react'
import { useEffect, useState } from 'react'

type AnnouncementType = 'job' | 'prevente' | 'mission' | 'autre'

const TYPES: { value: AnnouncementType; label: string; hint: string }[] = [
  { value: 'prevente', label: 'Prévente de récolte', hint: 'Je vends une production à venir' },
  { value: 'job', label: "Offre d'emploi", hint: 'Je cherche de la main-d’œuvre' },
  { value: 'mission', label: 'Mission de conseil', hint: 'Je cherche un agronome' },
  { value: 'autre', label: 'Autre', hint: 'Matériel, transport, service' },
]

interface Canton {
  id: string
  name: string
  prefecture_id: string | null
}

const SELECT_CLASS =
  'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50'

export function PublishAnnouncement({
  defaultType = 'prevente',
  defaultPhone,
  defaultCantonId,
  onPublished,
}: {
  defaultType?: AnnouncementType
  defaultPhone?: string | null
  defaultCantonId?: string | null
  onPublished?: () => void
}) {
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [cantons, setCantons] = useState<Canton[]>([])

  const [type, setType] = useState<AnnouncementType>(defaultType)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [culture, setCulture] = useState('')
  const [quantity, setQuantity] = useState('')
  const [price, setPrice] = useState('')
  const [phone, setPhone] = useState(defaultPhone ?? '')
  const [cantonId, setCantonId] = useState(defaultCantonId ?? '')

  useEffect(() => {
    if (!open || cantons.length > 0) return
    const supabase = createClient()
    void supabase
      .from('cantons')
      .select('id, name, prefecture_id')
      .order('name')
      .returns<Canton[]>()
      .then(({ data }) => setCantons(data ?? []))
  }, [open, cantons.length])

  const reset = () => {
    setType(defaultType)
    setTitle('')
    setDescription('')
    setCulture('')
    setQuantity('')
    setPrice('')
    setPhone(defaultPhone ?? '')
    setCantonId(defaultCantonId ?? '')
    setError(null)
  }

  const submit = async () => {
    if (title.trim().length < 3) {
      setError('Donnez un titre d’au moins 3 caractères.')
      return
    }
    setSaving(true)
    setError(null)

    // La préfecture est déduite du canton : l'auteur ne saisit qu'un niveau,
    // le tri de proximité a besoin des deux.
    const canton = cantons.find((c) => c.id === cantonId)
    const quantityValue = Number(quantity.replace(',', '.'))
    const priceValue = Number(price.replace(',', '.'))

    const res = await fetch('/api/market/announcements', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type,
        title: title.trim(),
        description: description.trim() || undefined,
        culture: culture.trim() || undefined,
        quantity_kg: quantity && quantityValue > 0 ? quantityValue : undefined,
        price_per_kg_fcfa: price && priceValue > 0 ? priceValue : undefined,
        contact_phone: phone.trim() || undefined,
        canton_id: cantonId || undefined,
        prefecture_id: canton?.prefecture_id ?? undefined,
      }),
    })

    setSaving(false)
    if (!res.ok) {
      setError(
        res.status === 429
          ? 'Trop de publications récentes. Réessayez dans quelques minutes.'
          : 'Publication impossible. Vérifiez les informations et réessayez.',
      )
      return
    }
    setOpen(false)
    reset()
    onPublished?.()
  }

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <Megaphone className="mr-1.5 h-4 w-4" /> Publier une annonce
      </Button>

      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next)
          if (!next) reset()
        }}
      >
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Publier sur le marché de proximité</DialogTitle>
            <DialogDescription>
              Votre annonce apparaîtra sur la page Marché, en priorité auprès des personnes de votre
              canton, puis de votre préfecture et de votre région.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5 py-2">
            <div className="space-y-2">
              <Label htmlFor="ann-type">Type d&apos;annonce</Label>
              <select
                id="ann-type"
                className={SELECT_CLASS}
                value={type}
                onChange={(e) => setType(e.target.value as AnnouncementType)}
              >
                {TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground">
                {TYPES.find((t) => t.value === type)?.hint}
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="ann-title">Titre</Label>
              <Input
                id="ann-title"
                placeholder="Ex. : 2 tonnes de maïs à récolter en novembre"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={120}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="ann-description">Description</Label>
              <Textarea
                id="ann-description"
                rows={3}
                placeholder="Précisez les conditions, les dates, ce que vous attendez…"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                maxLength={1000}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="ann-culture">Culture</Label>
                <Input
                  id="ann-culture"
                  placeholder="Maïs"
                  value={culture}
                  onChange={(e) => setCulture(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ann-quantity">Quantité (kg)</Label>
                <Input
                  id="ann-quantity"
                  inputMode="decimal"
                  placeholder="2000"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ann-price">Prix (FCFA/kg)</Label>
                <Input
                  id="ann-price"
                  inputMode="decimal"
                  placeholder="250"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="ann-canton">Canton</Label>
              <select
                id="ann-canton"
                className={SELECT_CLASS}
                value={cantonId}
                onChange={(e) => setCantonId(e.target.value)}
              >
                <option value="">— Non précisé —</option>
                {cantons.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground">
                Sans canton, votre annonce reste visible mais n&apos;est jamais classée comme
                proche.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="ann-phone">Téléphone de contact</Label>
              <Input
                id="ann-phone"
                type="tel"
                inputMode="tel"
                placeholder="90 00 00 00"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Sans numéro, personne ne pourra vous joindre depuis l&apos;annonce.
              </p>
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>
              Annuler
            </Button>
            <Button onClick={submit} disabled={saving}>
              {saving ? <Spinner className="h-4 w-4" /> : 'Publier'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
