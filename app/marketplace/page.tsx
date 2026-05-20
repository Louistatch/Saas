'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Search, FileText, Download, Lock, CreditCard, CheckCircle, Leaf } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { createClient } from '@/lib/supabase/client'
import { useDebounced } from '@/hooks/use-debounced'
import { LoadingBlock, Spinner } from '@/components/shared/loading'
import { EmptyState } from '@/components/shared/empty-state'
import { PaginationBar } from '@/components/shared/pagination'
import { Logo } from '@/components/shared/logo'
import Link from 'next/link'

interface Fiche {
  id: string
  title: string
  description: string | null
  culture: string
  type_agriculture: string
  campaign: string | null
  price_non_member: number
  download_count: number
  created_at: string
  canton: { id: string; name: string } | null
  prefecture: { id: string; name: string } | null
}

interface Culture {
  id: string
  name: string
  icon: string | null
}

interface Prefecture {
  id: string
  name: string
}

const PAGE_SIZE = 12

export default function PublicMarketplacePage() {
  const supabase = useMemo(() => createClient(), [])

  const [fiches, setFiches] = useState<Fiche[]>([])
  const [cultures, setCultures] = useState<Culture[]>([])
  const [prefectures, setPrefectures] = useState<Prefecture[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [isLoading, setIsLoading] = useState(true)

  // Filters
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounced(search, 300)
  const [filterCulture, setFilterCulture] = useState('')
  const [filterPrefecture, setFilterPrefecture] = useState('')

  // Member access
  const [showCardLogin, setShowCardLogin] = useState(false)
  const [cardNumber, setCardNumber] = useState('')
  const [cardLoading, setCardLoading] = useState(false)
  const [cardError, setCardError] = useState('')
  const [memberSession, setMemberSession] = useState<{
    name: string
    card_number: string
    cooperative: string
  } | null>(null)

  // Download dialog
  const [selectedFiche, setSelectedFiche] = useState<Fiche | null>(null)
  const [downloading, setDownloading] = useState(false)

  // Load reference data
  useEffect(() => {
    supabase.from('cultures').select('id, name, icon').order('name').then(({ data }) => setCultures(data ?? []))
    supabase.from('prefectures').select('id, name').order('name').then(({ data }) => setPrefectures(data ?? []))
  }, [supabase])

  // Load fiches
  const fetchFiches = useCallback(async () => {
    setIsLoading(true)
    let query = supabase
      .from('fiches_techniques')
      .select('id, title, description, culture, type_agriculture, campaign, price_non_member, download_count, created_at, canton:cantons(id, name), prefecture:prefectures(id, name)', { count: 'exact' })
      .eq('status', 'published')
      .order('created_at', { ascending: false })

    if (debouncedSearch.trim()) {
      query = query.or(`title.ilike.%${debouncedSearch.trim()}%,culture.ilike.%${debouncedSearch.trim()}%`)
    }
    if (filterCulture) query = query.eq('culture', filterCulture)
    if (filterPrefecture) query = query.eq('prefecture_id', filterPrefecture)

    const from = (page - 1) * PAGE_SIZE
    query = query.range(from, from + PAGE_SIZE - 1)

    const { data, count } = await query
    setFiches((data ?? []) as unknown as Fiche[])
    setTotal(count ?? 0)
    setIsLoading(false)
  }, [supabase, debouncedSearch, filterCulture, filterPrefecture, page])

  useEffect(() => { fetchFiches() }, [fetchFiches])
  useEffect(() => { setPage(1) }, [debouncedSearch, filterCulture, filterPrefecture])

  // Card login
  const handleCardLogin = async () => {
    if (!cardNumber.trim()) return
    setCardLoading(true)
    setCardError('')
    try {
      const res = await fetch('/api/member-access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ card_number: cardNumber.trim() }),
      })
      const data = await res.json()
      if (!res.ok) {
        setCardError(data.error || 'Carte invalide')
        setCardLoading(false)
        return
      }
      setMemberSession({
        name: `${data.member.first_name} ${data.member.last_name}`,
        card_number: data.card.number,
        cooperative: data.cooperative?.name ?? '',
      })
      setShowCardLogin(false)
      setCardNumber('')
    } catch {
      setCardError('Erreur de connexion')
    }
    setCardLoading(false)
  }

  // Download fiche
  const handleDownload = async (fiche: Fiche) => {
    if (!memberSession) {
      setSelectedFiche(fiche)
      return
    }
    // Member → free access
    setDownloading(true)
    try {
      const res = await fetch(`/api/fiches/${fiche.id}/access`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ card_number: memberSession.card_number }),
      })
      const data = await res.json()
      if (data.access === 'granted' && data.files) {
        for (const file of data.files) {
          window.open(file.url, '_blank')
        }
      } else {
        setSelectedFiche(fiche)
      }
    } catch {
      // fallback
    }
    setDownloading(false)
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur">
        <div className="mx-auto max-w-7xl flex items-center justify-between px-4 py-3">
          <Link href="/" className="flex items-center gap-2">
            <Logo size="sm" />
          </Link>
          <div className="flex items-center gap-3">
            {memberSession ? (
              <div className="flex items-center gap-2 px-3 py-1.5 bg-green-50 border border-green-200 rounded-full">
                <CheckCircle className="h-4 w-4 text-green-600" />
                <span className="text-sm font-medium text-green-800">{memberSession.name}</span>
                <button
                  onClick={() => setMemberSession(null)}
                  className="text-xs text-green-600 hover:underline ml-1"
                >
                  Déconnexion
                </button>
              </div>
            ) : (
              <Button
                variant="outline"
                className="gap-2 border-primary text-primary hover:bg-primary/5"
                onClick={() => setShowCardLogin(true)}
              >
                <CreditCard className="h-4 w-4" />
                Accès membre
              </Button>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-8 space-y-8">
        {/* Hero */}
        <div className="text-center space-y-3">
          <h1 className="text-3xl md:text-4xl font-bold text-foreground">
            Comptes d'exploitation agricole
          </h1>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            Accédez aux itinéraires techniques et comptes d'exploitation par culture et localisation.
            {!memberSession && ' Membres : accès gratuit avec votre carte.'}
          </p>
        </div>

        {/* Filters */}
        <div className="flex flex-col md:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-10"
              placeholder="Rechercher une culture, un titre…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <select
            className="border border-border rounded-md px-3 py-2 bg-background text-foreground text-sm min-w-[160px]"
            value={filterCulture}
            onChange={(e) => setFilterCulture(e.target.value)}
          >
            <option value="">Toutes les cultures</option>
            {cultures.map((c) => (
              <option key={c.id} value={c.name}>{c.icon} {c.name}</option>
            ))}
          </select>
          <select
            className="border border-border rounded-md px-3 py-2 bg-background text-foreground text-sm min-w-[160px]"
            value={filterPrefecture}
            onChange={(e) => setFilterPrefecture(e.target.value)}
          >
            <option value="">Toutes les préfectures</option>
            {prefectures.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>

        {/* Results */}
        {isLoading ? (
          <LoadingBlock />
        ) : fiches.length === 0 ? (
          <EmptyState
            icon={FileText}
            title="Aucune fiche disponible"
            description={search || filterCulture || filterPrefecture ? 'Essayez d\'autres filtres' : 'Les fiches techniques seront bientôt disponibles'}
          />
        ) : (
          <>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {fiches.map((fiche) => {
                const icon = cultures.find((c) => c.name === fiche.culture)?.icon ?? '🌿'
                return (
                  <Card key={fiche.id} className="border-border hover:border-primary/30 hover:shadow-sm transition-all">
                    <CardContent className="pt-5 pb-4 space-y-3">
                      <div className="flex items-start gap-3">
                        <span className="text-2xl">{icon}</span>
                        <div className="flex-1 min-w-0">
                          <h3 className="font-semibold text-foreground leading-tight">{fiche.title}</h3>
                          <p className="text-xs text-muted-foreground mt-1">
                            {fiche.culture} • {fiche.type_agriculture}
                            {fiche.campaign ? ` • ${fiche.campaign}` : ''}
                          </p>
                        </div>
                      </div>

                      {fiche.description && (
                        <p className="text-sm text-muted-foreground line-clamp-2">{fiche.description}</p>
                      )}

                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>
                          {fiche.prefecture?.name ?? 'National'}
                          {fiche.canton ? ` — ${fiche.canton.name}` : ''}
                        </span>
                        <span>{fiche.download_count} téléch.</span>
                      </div>

                      <div className="flex items-center justify-between pt-2 border-t border-border">
                        {memberSession ? (
                          <span className="text-xs text-green-600 font-medium flex items-center gap-1">
                            <CheckCircle className="h-3 w-3" /> Gratuit
                          </span>
                        ) : (
                          <span className="text-sm font-bold text-foreground">
                            {fiche.price_non_member} FCFA
                          </span>
                        )}
                        <Button
                          size="sm"
                          className="gap-1.5 bg-primary hover:bg-primary/90"
                          onClick={() => handleDownload(fiche)}
                          disabled={downloading}
                        >
                          {memberSession ? (
                            <><Download className="h-3.5 w-3.5" /> Télécharger</>
                          ) : (
                            <><Lock className="h-3.5 w-3.5" /> Acheter</>
                          )}
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
            <PaginationBar page={page} pageSize={PAGE_SIZE} total={total} onPageChange={setPage} />
          </>
        )}
      </main>

      {/* Card login dialog */}
      <Dialog open={showCardLogin} onOpenChange={setShowCardLogin}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5 text-primary" />
              Accès membre
            </DialogTitle>
            <DialogDescription>
              Entrez votre numéro de carte membre pour accéder gratuitement à toutes les fiches techniques.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Numéro de carte</Label>
              <Input
                value={cardNumber}
                onChange={(e) => setCardNumber(e.target.value.toUpperCase())}
                placeholder="HAR-12345"
                className="font-mono text-center text-lg tracking-wider"
                onKeyDown={(e) => e.key === 'Enter' && handleCardLogin()}
              />
            </div>
            {cardError && (
              <p className="text-sm text-destructive text-center">{cardError}</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCardLogin(false)}>Annuler</Button>
            <Button
              className="bg-primary hover:bg-primary/90 gap-2"
              onClick={handleCardLogin}
              disabled={cardLoading || !cardNumber.trim()}
            >
              {cardLoading ? <Spinner className="h-4 w-4" /> : <CreditCard className="h-4 w-4" />}
              Vérifier
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Purchase dialog (non-member) */}
      <Dialog open={!!selectedFiche && !memberSession} onOpenChange={() => setSelectedFiche(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Acheter cette fiche</DialogTitle>
            <DialogDescription>
              {selectedFiche?.title}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="text-center space-y-2">
              <p className="text-3xl font-bold text-foreground">{selectedFiche?.price_non_member} FCFA</p>
              <p className="text-sm text-muted-foreground">Paiement unique — accès immédiat</p>
            </div>

            <div className="space-y-2 p-3 bg-secondary/30 rounded-lg">
              <p className="text-xs font-medium text-foreground">Moyens de paiement :</p>
              <div className="flex gap-2">
                <span className="px-2 py-1 bg-background border border-border rounded text-xs">TMoney</span>
                <span className="px-2 py-1 bg-background border border-border rounded text-xs">Flooz</span>
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                Paiement mobile bientôt disponible. Contactez votre coopérative pour un accès immédiat.
              </p>
            </div>

            <div className="text-center p-3 bg-green-50 border border-green-200 rounded-lg">
              <p className="text-sm text-green-800">
                <strong>Vous êtes membre ?</strong> Utilisez votre carte pour un accès gratuit.
              </p>
              <Button
                size="sm"
                variant="outline"
                className="mt-2 border-green-300 text-green-700"
                onClick={() => { setSelectedFiche(null); setShowCardLogin(true) }}
              >
                <CreditCard className="h-3.5 w-3.5 mr-1" />
                J'ai une carte membre
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
