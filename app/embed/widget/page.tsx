'use client'

import { Suspense, useEffect, useState, useMemo } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { ProductCard } from '@/components/marketplace/product-card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Search, CheckCircle2, XCircle, CreditCard, FileText, Users, ShoppingCart } from 'lucide-react'

interface EmbedTheme {
  primaryColor?: string
  borderRadius?: string
  fontFamily?: string
}

function useEmbedData(cooperativeId: string, widget: string) {
  const supabase = useMemo(() => createClient(), [])
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [cooperative, setCooperative] = useState<any>(null)

  useEffect(() => {
    if (!cooperativeId) return

    const load = async () => {
      setLoading(true)

      // Load cooperative info
      const { data: coop } = await supabase
        .from('cooperatives')
        .select('id, name, description, logo_url, primary_color, faitiere_name')
        .eq('id', cooperativeId)
        .single()
      setCooperative(coop)

      // Load widget data
      switch (widget) {
        case 'marketplace': {
          const { data: products } = await supabase
            .from('marketplace_products')
            .select('id, name, description, category, culture, price, currency, unit, images, certification, season, producer_type, views_count, orders_count, created_at')
            .eq('cooperative_id', cooperativeId)
            .eq('available', true)
            .order('created_at', { ascending: false })
            .limit(20)
          setData({ products: products ?? [] })
          break
        }
        case 'fiches': {
          const { data: fiches } = await supabase
            .from('fiches_techniques')
            .select('id, title, description, culture, type_agriculture, price_non_member, download_count, created_at')
            .eq('cooperative_id', cooperativeId)
            .eq('status', 'published')
            .order('title')
            .limit(50)
          setData({ fiches: fiches ?? [] })
          break
        }
        case 'dashboard': {
          const [membersRes, productsRes] = await Promise.all([
            supabase.from('members').select('id', { count: 'exact', head: true }).eq('cooperative_id', cooperativeId),
            supabase.from('marketplace_products').select('id', { count: 'exact', head: true }).eq('cooperative_id', cooperativeId).eq('available', true),
          ])
          setData({ members: membersRes.count ?? 0, products: productsRes.count ?? 0 })
          break
        }
        default:
          setData({})
      }
      setLoading(false)
    }
    load()
  }, [cooperativeId, widget, supabase])

  return { data, loading, cooperative }
}

function MemberVerifyWidget({ cooperativeId }: { cooperativeId: string }) {
  const [cardNumber, setCardNumber] = useState('')
  const [result, setResult] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const verify = async () => {
    if (!cardNumber.trim()) return
    setLoading(true)
    setError('')
    setResult(null)

    try {
      const res = await fetch('/api/member-access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ card_number: cardNumber.trim() }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Carte non trouvée')
      } else {
        setResult(data)
      }
    } catch {
      setError('Erreur de connexion')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card className="border-border">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <CreditCard className="h-5 w-5" />
          Vérification carte membre
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <Input
            placeholder="Numéro de carte membre"
            value={cardNumber}
            onChange={(e) => setCardNumber(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && verify()}
          />
          <Button onClick={verify} disabled={loading || !cardNumber.trim()}>
            {loading ? '...' : 'Vérifier'}
          </Button>
        </div>

        {error && (
          <div className="flex items-center gap-2 p-3 bg-destructive/10 rounded-lg">
            <XCircle className="h-5 w-5 text-destructive" />
            <span className="text-sm text-destructive">{error}</span>
          </div>
        )}

        {result && (
          <div className="p-4 bg-green-50 border border-green-200 rounded-lg space-y-2">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-green-600" />
              <span className="font-semibold text-green-800">Carte valide</span>
            </div>
            <div className="text-sm text-green-700 space-y-1">
              <p><strong>Membre :</strong> {result.member?.first_name} {result.member?.last_name}</p>
              <p><strong>Coopérative :</strong> {result.cooperative?.name}</p>
              <p><strong>Expire :</strong> {result.card?.expiry ? new Date(result.card.expiry).toLocaleDateString('fr-FR') : 'N/A'}</p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function EmbedWidgetContent() {
  const searchParams = useSearchParams()
  const cooperativeId = searchParams.get('cooperative_id') ?? ''
  const widget = searchParams.get('widget') ?? 'marketplace'
  const themeParam = searchParams.get('theme')
  const theme: EmbedTheme = themeParam ? JSON.parse(themeParam) : {}

  const { data, loading, cooperative } = useEmbedData(cooperativeId, widget)

  // Notify parent of height changes
  useEffect(() => {
    const observer = new ResizeObserver(() => {
      const height = document.body.scrollHeight
      window.parent.postMessage(
        JSON.stringify({ type: 'faitierehub:resize', height }),
        '*',
      )
    })
    observer.observe(document.body)
    return () => observer.disconnect()
  }, [])

  // Apply theme
  useEffect(() => {
    if (theme.primaryColor) {
      document.documentElement.style.setProperty('--primary', theme.primaryColor)
    }
    if (theme.fontFamily) {
      document.body.style.fontFamily = theme.fontFamily
    }
  }, [theme])

  if (!cooperativeId) {
    return <div className="p-4 text-center text-muted-foreground">Configuration manquante</div>
  }

  if (loading) {
    return (
      <div className="p-6 space-y-4">
        <div className="h-6 bg-secondary/40 rounded w-1/3 animate-pulse" />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="h-48 bg-secondary/30 rounded-lg animate-pulse" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="p-4 space-y-4" style={{ borderRadius: theme.borderRadius }}>
      {/* Header */}
      {cooperative && (
        <div className="flex items-center gap-3 pb-3 border-b border-border">
          {cooperative.logo_url && (
            <img src={cooperative.logo_url} alt="" className="h-8 w-8 rounded-full object-cover" />
          )}
          <div>
            <h2 className="font-semibold text-foreground text-sm">{cooperative.name}</h2>
            {cooperative.faitiere_name && (
              <p className="text-xs text-muted-foreground">{cooperative.faitiere_name}</p>
            )}
          </div>
        </div>
      )}

      {/* Widget content */}
      {widget === 'marketplace' && data?.products && (
        <div className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {data.products.map((product: any) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
          {data.products.length === 0 && (
            <p className="text-center text-muted-foreground py-8">Aucun produit disponible</p>
          )}
        </div>
      )}

      {widget === 'member_verify' && (
        <MemberVerifyWidget cooperativeId={cooperativeId} />
      )}

      {widget === 'fiches' && data?.fiches && (
        <div className="space-y-2">
          {data.fiches.map((fiche: any) => (
            <Card key={fiche.id} className="border-border">
              <CardContent className="p-3 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <FileText className="h-5 w-5 text-primary" />
                  <div>
                    <p className="font-medium text-sm text-foreground">{fiche.title}</p>
                    <p className="text-xs text-muted-foreground">{fiche.culture} • {fiche.type_agriculture}</p>
                  </div>
                </div>
                <Badge variant="secondary" className="text-xs">
                  {fiche.price_non_member} FCFA
                </Badge>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {widget === 'dashboard' && data && (
        <div className="grid grid-cols-2 gap-4">
          <Card className="border-border">
            <CardContent className="p-4 text-center">
              <Users className="h-8 w-8 text-primary mx-auto mb-2" />
              <p className="text-2xl font-bold text-foreground">{data.members}</p>
              <p className="text-xs text-muted-foreground">Membres</p>
            </CardContent>
          </Card>
          <Card className="border-border">
            <CardContent className="p-4 text-center">
              <ShoppingCart className="h-8 w-8 text-primary mx-auto mb-2" />
              <p className="text-2xl font-bold text-foreground">{data.products}</p>
              <p className="text-xs text-muted-foreground">Produits</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Footer */}
      <div className="pt-3 border-t border-border text-center">
        <a
          href="https://app.faitierehub.com"
          target="_blank"
          rel="noopener noreferrer"
          className="text-[10px] text-muted-foreground hover:text-foreground"
        >
          Propulsé par FaîtiereHub
        </a>
      </div>
    </div>
  )
}

export default function EmbedWidgetPage() {
  return (
    <Suspense fallback={<div className="p-4 animate-pulse"><div className="h-48 bg-secondary/30 rounded" /></div>}>
      <EmbedWidgetContent />
    </Suspense>
  )
}
