'use client'

import { useState, useEffect, useMemo } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { CheckCircle } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useCooperative } from '@/app/context/cooperative-context'
import { useAuth } from '@/app/context/auth-context'
import { useToast } from '@/hooks/use-toast'
import { Spinner } from '@/components/shared/loading'
import { PageHeader } from '@/components/shared/page-header'
import { errorMessage } from '@/lib/utils/errors'
import { cooperativeSchema, flattenZodErrors } from '@/lib/validators/schemas'
import { roleLabel } from '@/lib/utils/permissions'

export default function SettingsPage() {
  const { currentCooperative, refreshCooperatives, updateCooperative } = useCooperative()
  const { user } = useAuth()
  const { toast } = useToast()
  const supabase = useMemo(() => createClient(), [])

  const [coopForm, setCoopForm] = useState({ name: '', description: '', primary_color: '#16a34a' })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [memberCount, setMemberCount] = useState<number | null>(null)
  const [savingPart, setSavingPart] = useState<'general' | 'branding' | null>(null)

  useEffect(() => {
    if (currentCooperative) {
      setCoopForm({
        name: currentCooperative.name || '',
        description: currentCooperative.description || '',
        primary_color: currentCooperative.primaryColor || '#16a34a',
      })
    }
  }, [currentCooperative])

  useEffect(() => {
    if (!currentCooperative) return
    supabase
      .from('members')
      .select('id', { count: 'exact', head: true })
      .eq('cooperative_id', currentCooperative.id)
      .then(({ count }) => setMemberCount(count ?? 0))
  }, [currentCooperative, supabase])

  const handleSavePart = async (part: 'general' | 'branding') => {
    if (!currentCooperative) return
    const parsed = cooperativeSchema.safeParse(coopForm)
    if (!parsed.success) {
      setErrors(flattenZodErrors(parsed.error))
      return
    }
    setErrors({})
    setSaving(true)
    setSavingPart(part)
    try {
      await updateCooperative({
        id: currentCooperative.id,
        name: parsed.data.name,
        description: parsed.data.description || undefined,
        primaryColor: parsed.data.primary_color,
        logo: currentCooperative.logo,
      })
      toast({
        title: 'Enregistré',
        description: part === 'general' ? 'Informations de la coopérative mises à jour.' : 'Image de marque mise à jour.',
      })
      refreshCooperatives()
    } catch (e) {
      toast({ title: 'Échec de la sauvegarde', description: errorMessage(e), variant: 'destructive' })
    } finally {
      setSaving(false)
      setSavingPart(null)
    }
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title="Paramètres"
        description="Gérer votre compte coopératif et vos préférences"
      />

      <Tabs defaultValue="general" className="w-full">
        <TabsList className="grid w-full max-w-md grid-cols-3 border-b border-border bg-transparent">
          <TabsTrigger value="general" className="border-b-2 border-transparent data-[state=active]:border-primary">Général</TabsTrigger>
          <TabsTrigger value="branding" className="border-b-2 border-transparent data-[state=active]:border-primary">Image de marque</TabsTrigger>
          <TabsTrigger value="billing" className="border-b-2 border-transparent data-[state=active]:border-primary">Facturation</TabsTrigger>
        </TabsList>

        <TabsContent value="general" className="space-y-6 mt-6">
          <Card className="border-border">
            <CardHeader>
              <CardTitle className="text-foreground">Informations de la coopérative</CardTitle>
              <CardDescription>Mettre à jour les détails de votre coopérative</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label className="text-foreground">Nom de la coopérative</Label>
                  <Input
                    value={coopForm.name}
                    onChange={(e) => setCoopForm((f) => ({ ...f, name: e.target.value }))}
                    placeholder="Your Cooperative"
                    aria-invalid={!!errors.name}
                  />
                  {errors.name ? <p className="text-xs text-destructive">{errors.name}</p> : null}
                </div>
                <div className="space-y-2">
                  <Label className="text-foreground">ID de la coopérative</Label>
                  <Input
                    value={currentCooperative?.id ?? ''}
                    disabled
                    className="border-border bg-background text-foreground opacity-70 font-mono text-xs"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-foreground">Description</Label>
                <textarea
                  value={coopForm.description}
                  onChange={(e) => setCoopForm((f) => ({ ...f, description: e.target.value }))}
                  placeholder="Décrivez votre coopérative…"
                  className="border border-border rounded-lg px-3 py-2 bg-background text-foreground w-full min-h-24 text-sm"
                  rows={4}
                />
              </div>
              {memberCount != null ? (
                <div className="p-3 bg-secondary/30 rounded-lg flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Membres actuels</span>
                  <span className="font-bold text-foreground">{memberCount}</span>
                </div>
              ) : null}
              <Button
                className="bg-primary hover:bg-primary/90 gap-2"
                onClick={() => handleSavePart('general')}
                disabled={saving}
              >
                {savingPart === 'general' ? <Spinner className="h-4 w-4" /> : <CheckCircle className="h-4 w-4" />}
                Enregistrer
              </Button>
            </CardContent>
          </Card>

          <Card className="border-border">
            <CardHeader>
              <CardTitle className="text-foreground">Votre profil</CardTitle>
              <CardDescription>Vos informations personnelles</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Prénom</Label>
                  <Input value={user?.firstName ?? ''} disabled className="opacity-70" />
                </div>
                <div className="space-y-2">
                  <Label>Nom</Label>
                  <Input value={user?.lastName ?? ''} disabled className="opacity-70" />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Email</Label>
                <Input value={user?.email ?? ''} disabled className="opacity-70" />
              </div>
              <div className="space-y-2">
                <Label>Rôle</Label>
                <Input value={user?.role ? roleLabel(user.role) : ''} disabled className="opacity-70" />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="branding" className="space-y-6 mt-6">
          <Card className="border-border">
            <CardHeader>
              <CardTitle className="text-foreground">Personnalisation de la marque</CardTitle>
              <CardDescription>Personnalisez l'apparence du marketplace de votre coopérative</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label>Couleur principale</Label>
                <div className="flex gap-3 items-center">
                  <input
                    type="color"
                    value={coopForm.primary_color}
                    onChange={(e) => setCoopForm((f) => ({ ...f, primary_color: e.target.value }))}
                    className="h-10 w-16 border border-border rounded-lg cursor-pointer"
                    aria-label="Primary color picker"
                  />
                  <Input
                    value={coopForm.primary_color}
                    onChange={(e) => setCoopForm((f) => ({ ...f, primary_color: e.target.value }))}
                    placeholder="#16a34a"
                    className="font-mono w-36"
                    aria-invalid={!!errors.primary_color}
                  />
                  <div className="h-10 w-10 rounded-lg border border-border" style={{ backgroundColor: coopForm.primary_color }} />
                </div>
                {errors.primary_color ? (
                  <p className="text-xs text-destructive">{errors.primary_color}</p>
                ) : null}
              </div>
              <div className="bg-secondary/30 p-4 rounded-lg space-y-2">
                <Label className="text-xs uppercase tracking-wide opacity-70">Aperçu</Label>
                <div className="flex items-center gap-3">
                  <div
                    className="h-10 w-10 rounded-lg flex items-center justify-center text-white font-bold"
                    style={{ backgroundColor: coopForm.primary_color }}
                  >
                    {coopForm.name?.charAt(0).toUpperCase() || 'C'}
                  </div>
                  <div>
                    <p className="font-semibold text-foreground">{coopForm.name || 'Votre coopérative'}</p>
                    <p className="text-xs text-muted-foreground">{coopForm.description || 'Aperçu de la description'}</p>
                  </div>
                </div>
              </div>
              <Button
                className="bg-primary hover:bg-primary/90 gap-2"
                onClick={() => handleSavePart('branding')}
                disabled={saving}
              >
                {savingPart === 'branding' ? <Spinner className="h-4 w-4" /> : <CheckCircle className="h-4 w-4" />}
                Enregistrer
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="billing" className="space-y-6 mt-6">
          <Card className="border-border">
            <CardHeader>
              <CardTitle className="text-foreground">Facturation &amp; Abonnement</CardTitle>
              <CardDescription>Gérer votre abonnement et vos informations de facturation</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-lg border border-border p-4 space-y-2">
                <div className="flex justify-between">
                  <span className="text-foreground font-medium">Plan actuel</span>
                  <span className="text-primary font-medium">Starter (Gratuit)</span>
                </div>
                <p className="text-sm text-muted-foreground">Essai gratuit de 30 jours. Passez à un plan supérieur à tout moment.</p>
              </div>
              {memberCount != null ? (
                <div className="rounded-lg border border-border p-4 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Membres utilisés</span>
                    <span className="text-foreground font-medium">{memberCount} / 500</span>
                  </div>
                  <div className="h-2 bg-secondary rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary rounded-full transition-all"
                      style={{ width: `${Math.min(100, (memberCount / 500) * 100)}%` }}
                    />
                  </div>
                </div>
              ) : null}
              <Button variant="outline" className="w-full border-border" disabled>
                Passer au plan supérieur (bientôt disponible)
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
