'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useCooperative } from '@/app/context/cooperative-context'
import { useReferenceData } from '@/hooks/use-reference-data'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useToast } from '@/hooks/use-toast'
import { PhoneCall, Trash2, Plus, UserCog, Save } from 'lucide-react'

interface Technicien {
  id: string
  canton_id: string
  name: string
  phone: string
  canton?: { name: string } | { name: string }[] | null
}

function cantonName(t: Technicien): string {
  if (!t.canton) return '—'
  return Array.isArray(t.canton) ? (t.canton[0]?.name ?? '—') : t.canton.name
}

export default function TechniciensPage() {
  const supabase = useMemo(() => createClient(), [])
  const { currentCooperative } = useCooperative()
  const { referenceData, isLoading: refLoading } = useReferenceData()
  const { toast } = useToast()

  // The faîtière is the current cooperative (admins manage their own faîtière).
  const faitiereId = currentCooperative?.id ?? null

  const [techs, setTechs] = useState<Technicien[]>([])
  const [loading, setLoading] = useState(true)

  // Cascade selection
  const [regionId, setRegionId] = useState('')
  const [prefectureId, setPrefectureId] = useState('')
  const [cantonId, setCantonId] = useState('')
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [saving, setSaving] = useState(false)

  // Coordo
  const [coordoName, setCoordoName] = useState('')
  const [coordoPhone, setCoordoPhone] = useState('')
  const [savingCoordo, setSavingCoordo] = useState(false)

  const prefectures = referenceData.prefectures.filter((p) => p.region_id === regionId)
  const cantons = referenceData.cantons.filter((c) => c.prefecture_id === prefectureId)

  const loadTechs = useMemo(
    () => async () => {
      if (!faitiereId) return
      setLoading(true)
      const { data } = await supabase
        .from('techniciens')
        .select('id, canton_id, name, phone, canton:cantons(name)')
        .eq('faitiere_id', faitiereId)
        .order('created_at', { ascending: false })
      setTechs((data as Technicien[]) ?? [])
      setLoading(false)
    },
    [faitiereId, supabase],
  )

  useEffect(() => {
    loadTechs()
  }, [loadTechs])

  // Load existing coordo info
  useEffect(() => {
    if (!faitiereId) return
    supabase
      .from('cooperatives')
      .select('coordo_name, coordo_phone')
      .eq('id', faitiereId)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setCoordoName(data.coordo_name ?? '')
          setCoordoPhone(data.coordo_phone ?? '')
        }
      })
  }, [faitiereId, supabase])

  const handleAdd = async () => {
    if (!faitiereId) return
    if (!cantonId || !name.trim() || !phone.trim()) {
      toast({ title: 'Canton, nom et téléphone sont requis', variant: 'destructive' })
      return
    }
    setSaving(true)
    const { error } = await supabase.from('techniciens').upsert(
      {
        faitiere_id: faitiereId,
        canton_id: cantonId,
        name: name.trim(),
        phone: phone.trim(),
      },
      { onConflict: 'faitiere_id,canton_id' },
    )
    setSaving(false)
    if (error) {
      toast({ title: 'Erreur', description: error.message, variant: 'destructive' })
      return
    }
    toast({ title: 'Technicien enregistré' })
    setName('')
    setPhone('')
    setCantonId('')
    loadTechs()
  }

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from('techniciens').delete().eq('id', id)
    if (error) {
      toast({ title: 'Erreur', description: error.message, variant: 'destructive' })
      return
    }
    setTechs((t) => t.filter((x) => x.id !== id))
  }

  const handleSaveCoordo = async () => {
    if (!faitiereId) return
    setSavingCoordo(true)
    const { error } = await supabase
      .from('cooperatives')
      .update({ coordo_name: coordoName.trim() || null, coordo_phone: coordoPhone.trim() || null })
      .eq('id', faitiereId)
    setSavingCoordo(false)
    toast(
      error
        ? { title: 'Erreur', description: error.message, variant: 'destructive' }
        : { title: 'Coordonnateur enregistré' },
    )
  }

  if (!currentCooperative) {
    return <div className="p-8 text-muted-foreground">Chargement de la coopérative…</div>
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8 py-2">
      <div className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center">
          <UserCog className="h-6 w-6 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-foreground">Techniciens</h1>
          <p className="text-sm text-muted-foreground">
            Un technicien par canton. Les producteurs de ce canton pourront l&apos;appeler depuis leur carte.
          </p>
        </div>
      </div>

      {/* SE / Coordonnateur */}
      <section className="rounded-xl border border-border bg-card p-5 space-y-4">
        <h2 className="font-semibold text-foreground flex items-center gap-2">
          <PhoneCall className="h-4 w-4 text-primary" /> SE / Coordonnateur de la faîtière
        </h2>
        <p className="text-sm text-muted-foreground">
          Joignable par <strong>tous</strong> les producteurs de la faîtière, quel que soit leur canton.
        </p>
        <div className="grid sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>Nom</Label>
            <Input value={coordoName} onChange={(e) => setCoordoName(e.target.value)} placeholder="Ex: M. Komla, SE FENOMAT" />
          </div>
          <div className="space-y-1.5">
            <Label>Téléphone</Label>
            <Input value={coordoPhone} onChange={(e) => setCoordoPhone(e.target.value)} placeholder="92548838" />
          </div>
        </div>
        <Button onClick={handleSaveCoordo} disabled={savingCoordo} className="gap-2">
          <Save className="h-4 w-4" /> {savingCoordo ? 'Enregistrement…' : 'Enregistrer le coordonnateur'}
        </Button>
      </section>

      {/* Ajouter un technicien (cascade) */}
      <section className="rounded-xl border border-border bg-card p-5 space-y-4">
        <h2 className="font-semibold text-foreground flex items-center gap-2">
          <Plus className="h-4 w-4 text-primary" /> Ajouter un technicien
        </h2>
        <div className="grid sm:grid-cols-3 gap-4">
          <div className="space-y-1.5">
            <Label>Région</Label>
            <select
              className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
              value={regionId}
              onChange={(e) => { setRegionId(e.target.value); setPrefectureId(''); setCantonId('') }}
              disabled={refLoading}
            >
              <option value="">Choisir…</option>
              {referenceData.regions.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label>Préfecture</Label>
            <select
              className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm disabled:opacity-50"
              value={prefectureId}
              onChange={(e) => { setPrefectureId(e.target.value); setCantonId('') }}
              disabled={!regionId}
            >
              <option value="">Choisir…</option>
              {prefectures.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label>Canton</Label>
            <select
              className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm disabled:opacity-50"
              value={cantonId}
              onChange={(e) => setCantonId(e.target.value)}
              disabled={!prefectureId}
            >
              <option value="">Choisir…</option>
              {cantons.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>Nom du technicien</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Koffi MENSAH" />
          </div>
          <div className="space-y-1.5">
            <Label>Téléphone</Label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="90 12 34 56" />
          </div>
        </div>
        <Button onClick={handleAdd} disabled={saving} className="gap-2">
          <Plus className="h-4 w-4" /> {saving ? 'Enregistrement…' : 'Ajouter le technicien'}
        </Button>
      </section>

      {/* Liste */}
      <section className="rounded-xl border border-border bg-card p-5 space-y-3">
        <h2 className="font-semibold text-foreground">Techniciens enregistrés ({techs.length})</h2>
        {loading ? (
          <p className="text-sm text-muted-foreground">Chargement…</p>
        ) : techs.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucun technicien enregistré pour le moment.</p>
        ) : (
          <div className="divide-y divide-border">
            {techs.map((t) => (
              <div key={t.id} className="flex items-center justify-between py-3">
                <div>
                  <p className="font-medium text-foreground">{t.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {cantonName(t)} · <span className="font-mono">{t.phone}</span>
                  </p>
                </div>
                <Button variant="ghost" size="icon" onClick={() => handleDelete(t.id)} className="text-destructive hover:text-destructive">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
