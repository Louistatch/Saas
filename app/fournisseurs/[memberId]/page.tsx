'use client'

import { useEffect, useState, useMemo } from 'react'
import { useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { MarketingLayout } from '@/components/shared/marketing-layout'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { MapPin, Leaf, User, CheckCircle, ArrowLeft, Send } from 'lucide-react'
import Link from 'next/link'

interface SupplierProfile {
  id: string
  first_name: string
  last_name: string
  village: string | null
  canton: string | null
  prefecture: string | null
  region: string | null
  photo_url: string | null
  cooperative: string | null
  cultures: string[]
  superficie_totale: number
}

export default function SupplierProfilePage() {
  const params = useParams()
  const memberId = params.memberId as string
  const supabase = useMemo(() => createClient(), [])

  const [supplier, setSupplier] = useState<SupplierProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [formData, setFormData] = useState({ buyer_name: '', message: '', buyer_phone: '' })
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from('members')
        .select(`
          id, first_name, last_name, village, canton, prefecture, region, photo_url,
          cooperatives(name),
          parcelles(culture_principale, superficie_ha)
        `)
        .eq('id', memberId)
        .eq('status', 'active')
        .single()

      if (data) {
        const parcelles = (data.parcelles as { culture_principale: string; superficie_ha: number }[] | null) ?? []
        setSupplier({
          id: data.id,
          first_name: data.first_name,
          last_name: data.last_name,
          village: data.village,
          canton: data.canton,
          prefecture: data.prefecture,
          region: data.region,
          photo_url: data.photo_url,
          cooperative: (data.cooperatives as { name: string }[] | null)?.[0]?.name ?? null,
          cultures: [...new Set(parcelles.map(p => p.culture_principale).filter(Boolean))],
          superficie_totale: parcelles.reduce((s, p) => s + (p.superficie_ha ?? 0), 0),
        })
      }
      setLoading(false)
    }
    load()
  }, [memberId, supabase])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (formData.buyer_name.length < 2) {
      setError('Votre nom est requis (min 2 caractères)')
      return
    }
    if (formData.message.length < 10) {
      setError('Message trop court (min 10 caractères)')
      return
    }

    setSending(true)
    try {
      const res = await fetch('/api/contact-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          member_id: memberId,
          buyer_name: formData.buyer_name,
          message: formData.message,
          buyer_phone: formData.buyer_phone || undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || data.issues?.join(', ') || 'Erreur')
      } else {
        setSent(true)
      }
    } catch {
      setError('Erreur réseau')
    } finally {
      setSending(false)
    }
  }

  if (loading) {
    return (
      <MarketingLayout>
        <div className="mx-auto max-w-3xl px-4 py-16 animate-pulse space-y-6">
          <div className="h-8 w-48 bg-secondary/40 rounded" />
          <div className="h-32 bg-secondary/30 rounded-xl" />
        </div>
      </MarketingLayout>
    )
  }

  if (!supplier) {
    return (
      <MarketingLayout>
        <div className="mx-auto max-w-3xl px-4 py-16 text-center space-y-4">
          <h1 className="text-2xl font-bold text-foreground">Fournisseur non trouvé</h1>
          <Link href="/fournisseurs">
            <Button variant="outline" className="gap-2">
              <ArrowLeft className="h-4 w-4" /> Retour à la liste
            </Button>
          </Link>
        </div>
      </MarketingLayout>
    )
  }

  const locality = [supplier.village, supplier.canton, supplier.prefecture, supplier.region].filter(Boolean).join(', ')

  return (
    <MarketingLayout>
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 space-y-6">
        {/* Back */}
        <Link href="/fournisseurs" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Tous les fournisseurs
        </Link>

        {/* Profile card */}
        <Card className="border-border">
          <CardContent className="p-6">
            <div className="flex items-start gap-5">
              <div className="w-20 h-20 rounded-full overflow-hidden border-2 border-primary/20 shrink-0 bg-secondary/30">
                {supplier.photo_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={supplier.photo_url} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <User className="h-8 w-8 text-muted-foreground" />
                  </div>
                )}
              </div>
              <div className="space-y-2">
                <h1 className="text-xl font-bold text-foreground">
                  {supplier.first_name} {supplier.last_name}
                </h1>
                {supplier.cooperative && (
                  <p className="text-sm text-primary font-medium">{supplier.cooperative}</p>
                )}
                {locality && (
                  <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    <MapPin className="h-4 w-4" />
                    {locality}
                  </div>
                )}
                {supplier.cultures.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {supplier.cultures.map((c) => (
                      <Badge key={c} variant="secondary" className="gap-1 text-xs">
                        <Leaf className="h-3 w-3" /> {c}
                      </Badge>
                    ))}
                  </div>
                )}
                {supplier.superficie_totale > 0 && (
                  <p className="text-xs text-muted-foreground">{supplier.superficie_totale.toFixed(1)} hectares cultivés</p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Contact form */}
        <Card className="border-border">
          <CardHeader>
            <CardTitle className="text-lg">Contacter ce fournisseur</CardTitle>
          </CardHeader>
          <CardContent>
            {sent ? (
              <div className="text-center py-6 space-y-3">
                <CheckCircle className="h-12 w-12 text-green-600 mx-auto" />
                <h3 className="font-semibold text-foreground">Message envoyé !</h3>
                <p className="text-sm text-muted-foreground">
                  Le fournisseur recevra votre demande via sa coopérative.
                </p>
                <Link href="/fournisseurs">
                  <Button variant="outline" className="gap-2">
                    <ArrowLeft className="h-4 w-4" /> Retour
                  </Button>
                </Link>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                {error && (
                  <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-3 text-sm text-destructive">
                    {error}
                  </div>
                )}
                <div className="space-y-2">
                  <Label htmlFor="buyer_name">Votre nom *</Label>
                  <Input
                    id="buyer_name"
                    placeholder="Votre nom complet"
                    value={formData.buyer_name}
                    onChange={(e) => setFormData(f => ({ ...f, buyer_name: e.target.value }))}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="buyer_phone">Téléphone (optionnel)</Label>
                  <Input
                    id="buyer_phone"
                    placeholder="90 XX XX XX"
                    value={formData.buyer_phone}
                    onChange={(e) => setFormData(f => ({ ...f, buyer_phone: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="message">Message *</Label>
                  <textarea
                    id="message"
                    className="w-full border border-border rounded-lg p-3 bg-background text-foreground text-sm min-h-[100px] resize-y"
                    placeholder="Bonjour, je suis intéressé par vos produits..."
                    value={formData.message}
                    onChange={(e) => setFormData(f => ({ ...f, message: e.target.value }))}
                    required
                  />
                  <p className="text-xs text-muted-foreground">Minimum 10 caractères</p>
                </div>
                <Button type="submit" className="w-full gap-2 bg-primary hover:bg-primary/90" disabled={sending}>
                  {sending ? 'Envoi...' : <><Send className="h-4 w-4" /> Envoyer la demande</>}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </MarketingLayout>
  )
}
