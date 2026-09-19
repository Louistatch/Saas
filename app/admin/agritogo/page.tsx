'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  CheckCircle2, XCircle, RefreshCw, Plus, Trash2, Upload,
  Database, Cpu, ShoppingCart, Activity, Settings,
} from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { LoadingBlock, Spinner } from '@/components/shared/loading'
import { EmptyState } from '@/components/shared/empty-state'
import { PageHeader } from '@/components/shared/page-header'
import { errorMessage } from '@/lib/utils/errors'

// ─── Types ────────────────────────────────────────────────────────────────

interface Produit { id: string; nom: string; unite: string; categorie: string }
interface PrixRow { id: string; produit?: string; marche?: string; prix?: number; date?: string; [k: string]: unknown }
interface PrixList { items?: PrixRow[]; total?: number; page?: number }
interface KoboForm { uid: string; name?: string; title?: string; deployment_active?: boolean }
interface PipelineStatus { files: Record<string, boolean>; ready: number; total: number }
interface HealthData { status: string; version: string; agents: number; models: string[] }

// ─── Fetch helper ─────────────────────────────────────────────────────────

async function agri<T>(path: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(`/api/admin/agritogo/${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { error?: string }
    throw new Error(err.error ?? `HTTP ${res.status}`)
  }
  return res.json() as Promise<T>
}

// ─── Page ─────────────────────────────────────────────────────────────────

export default function AgriTogoAdminPage() {
  const { toast } = useToast()

  // ── Health ──────────────────────────────────────────────────────────────
  const [health, setHealth] = useState<HealthData | null>(null)
  const [healthLoading, setHealthLoading] = useState(false)

  const fetchHealth = useCallback(async () => {
    setHealthLoading(true)
    try { setHealth(await agri<HealthData>('health')) } catch { setHealth(null) }
    setHealthLoading(false)
  }, [])

  useEffect(() => { fetchHealth() }, [fetchHealth])

  // ── Produits ────────────────────────────────────────────────────────────
  const [produits, setProduits] = useState<Produit[]>([])
  const [produitsLoading, setProduitsLoading] = useState(false)
  const [newNom, setNewNom] = useState('')
  const [newUnite, setNewUnite] = useState('kg')
  const [newCat, setNewCat] = useState('cereale')
  const [busyProd, setBusyProd] = useState<string | null>(null)

  const fetchProduits = useCallback(async () => {
    setProduitsLoading(true)
    try { setProduits(await agri<Produit[]>('produits')) } catch { setProduits([]) }
    setProduitsLoading(false)
  }, [])

  const addProduit = useCallback(async () => {
    if (!newNom.trim()) return
    setBusyProd('new')
    try {
      await agri('cultures', { method: 'POST', body: JSON.stringify({ nom: newNom.trim(), unite: newUnite, categorie: newCat }) })
      toast({ title: 'Produit ajouté', description: newNom.trim() })
      setNewNom('')
      await fetchProduits()
    } catch (e) { toast({ title: 'Erreur', description: errorMessage(e), variant: 'destructive' }) }
    setBusyProd(null)
  }, [newNom, newUnite, newCat, fetchProduits, toast])

  const deleteProduit = useCallback(async (id: string, nom: string) => {
    setBusyProd(id)
    try {
      await agri(`cultures/${id}`, { method: 'DELETE' })
      toast({ title: 'Produit supprimé', description: nom })
      await fetchProduits()
    } catch (e) { toast({ title: 'Erreur', description: errorMessage(e), variant: 'destructive' }) }
    setBusyProd(null)
  }, [fetchProduits, toast])

  // ── Prix ────────────────────────────────────────────────────────────────
  const [prixData, setPrixData] = useState<PrixList>({})
  const [prixPage, setPrixPage] = useState(1)
  const [prixLoading, setPrixLoading] = useState(false)
  const [csvFile, setCsvFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)

  const fetchPrix = useCallback(async (page = 1) => {
    setPrixLoading(true)
    try { setPrixData(await agri<PrixList>(`prix-list?page=${page}`)) } catch { setPrixData({}) }
    setPrixLoading(false)
  }, [])

  const deletePrix = useCallback(async (id: string) => {
    try {
      await agri(`prix/${id}`, { method: 'DELETE' })
      toast({ title: 'Prix supprimé' })
      await fetchPrix(prixPage)
    } catch (e) { toast({ title: 'Erreur', description: errorMessage(e), variant: 'destructive' }) }
  }, [fetchPrix, prixPage, toast])

  const uploadCsv = useCallback(async () => {
    if (!csvFile) return
    setUploading(true)
    try {
      const text = await csvFile.text()
      const result = await agri<{ inserted?: number; errors?: number; error?: string }>('upload/prix', { method: 'POST', body: text, headers: { 'Content-Type': 'text/plain' } })
      toast({ title: 'Import CSV', description: `${result.inserted ?? 0} prix importés${result.errors ? ` (${result.errors} erreurs)` : ''}` })
      setCsvFile(null)
      await fetchPrix(1)
    } catch (e) { toast({ title: 'Erreur CSV', description: errorMessage(e), variant: 'destructive' }) }
    setUploading(false)
  }, [csvFile, fetchPrix, toast])

  // ── KoboCollect ─────────────────────────────────────────────────────────
  const [koboCfg, setKoboCfg] = useState<{ configured: boolean; base_url?: string; token_hint?: string } | null>(null)
  const [koboUrl, setKoboUrl] = useState('')
  const [koboToken, setKoboToken] = useState('')
  const [koboForms, setKoboForms] = useState<KoboForm[]>([])
  const [koboLoading, setKoboLoading] = useState(false)
  const [savingKobo, setSavingKobo] = useState(false)

  const fetchKobo = useCallback(async () => {
    setKoboLoading(true)
    try {
      const cfg = await agri<typeof koboCfg>('kobo/config')
      setKoboCfg(cfg)
      if (cfg?.configured) {
        const forms = await agri<KoboForm[]>('kobo/forms').catch(() => [])
        setKoboForms(forms)
      }
    } catch { setKoboCfg({ configured: false }) }
    setKoboLoading(false)
  }, [])

  const saveKobo = useCallback(async () => {
    setSavingKobo(true)
    try {
      const res = await agri<{ success: boolean; forms_found?: number; warning?: string }>('kobo/config', {
        method: 'POST',
        body: JSON.stringify({ base_url: koboUrl, token: koboToken }),
      })
      toast({ title: 'KoboCollect configuré', description: res.forms_found !== undefined ? `${res.forms_found} formulaire(s) trouvé(s)` : res.warning })
      await fetchKobo()
    } catch (e) { toast({ title: 'Erreur', description: errorMessage(e), variant: 'destructive' }) }
    setSavingKobo(false)
  }, [koboUrl, koboToken, fetchKobo, toast])

  // ── Pipeline ML ─────────────────────────────────────────────────────────
  const [pipeline, setPipeline] = useState<PipelineStatus | null>(null)
  const [pipelineLoading, setPipelineLoading] = useState(false)

  const fetchPipeline = useCallback(async () => {
    setPipelineLoading(true)
    try { setPipeline(await agri<PipelineStatus>('pipeline/status')) } catch { setPipeline(null) }
    setPipelineLoading(false)
  }, [])

  // ── Stats ────────────────────────────────────────────────────────────────
  const [dbStats, setDbStats] = useState<Record<string, unknown>>({})
  const fetchStats = useCallback(async () => {
    try { setDbStats(await agri<Record<string, unknown>>('stats')) } catch { /* silent */ }
  }, [])

  // Initial load
  useEffect(() => {
    fetchStats()
  }, [fetchStats])

  const prixItems = useMemo(() => prixData.items ?? [], [prixData])
  const prixTotal = prixData.total ?? 0

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <PageHeader
          title="AgriTogo — Administration"
          description="Gestion des données marché, produits, KoboCollect et pipeline ML"
        />
        <div className="flex items-center gap-2">
          {health ? (
            <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold ${health.status === 'ok' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
              <CheckCircle2 className="h-3.5 w-3.5" />
              {health.status === 'ok' ? `En ligne v${health.version}` : health.status}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-muted text-muted-foreground">
              <XCircle className="h-3.5 w-3.5" /> Hors ligne
            </span>
          )}
          <Button size="sm" variant="outline" onClick={fetchHealth} disabled={healthLoading} className="gap-2">
            <RefreshCw className={`h-4 w-4 ${healthLoading ? 'animate-spin' : ''}`} />
            Actualiser
          </Button>
        </div>
      </div>

      {/* Quick stats */}
      {Object.keys(dbStats).length > 0 && (
        <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-4">
          {Object.entries(dbStats).map(([k, v]) => (
            <Card key={k} className="border-border">
              <CardContent className="pt-4 pb-4">
                <p className="text-xs text-muted-foreground capitalize">{k.replace(/_/g, ' ')}</p>
                <p className="text-2xl font-bold text-foreground">{String(v)}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Tabs defaultValue="produits">
        <TabsList>
          <TabsTrigger value="produits" className="gap-2" onClick={fetchProduits}><ShoppingCart className="h-4 w-4" />Produits</TabsTrigger>
          <TabsTrigger value="prix" className="gap-2" onClick={() => fetchPrix(1)}><Activity className="h-4 w-4" />Prix marché</TabsTrigger>
          <TabsTrigger value="kobo" className="gap-2" onClick={fetchKobo}><Database className="h-4 w-4" />KoboCollect</TabsTrigger>
          <TabsTrigger value="pipeline" className="gap-2" onClick={fetchPipeline}><Cpu className="h-4 w-4" />Pipeline ML</TabsTrigger>
          <TabsTrigger value="settings" className="gap-2"><Settings className="h-4 w-4" />Config</TabsTrigger>
        </TabsList>

        {/* ── Produits ─────────────────────────────────────────────────── */}
        <TabsContent value="produits" className="mt-6 space-y-6">
          <Card className="border-border">
            <CardHeader>
              <CardTitle className="text-foreground">Ajouter un produit</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col sm:flex-row gap-3">
                <Input placeholder="Nom du produit (ex: Maïs)" value={newNom} onChange={(e) => setNewNom(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addProduit()} className="flex-1" />
                <Input placeholder="Unité (kg, tonne…)" value={newUnite} onChange={(e) => setNewUnite(e.target.value)} className="w-32" />
                <Input placeholder="Catégorie" value={newCat} onChange={(e) => setNewCat(e.target.value)} className="w-36" />
                <Button onClick={addProduit} disabled={!newNom.trim() || busyProd === 'new'} className="gap-2 shrink-0">
                  {busyProd === 'new' ? <Spinner className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                  Ajouter
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border">
            <CardHeader>
              <CardTitle className="text-foreground">Catalogue des produits</CardTitle>
              <CardDescription>{produits.length} produit(s) enregistré(s)</CardDescription>
            </CardHeader>
            <CardContent>
              {produitsLoading ? <LoadingBlock /> : produits.length === 0 ? (
                <EmptyState icon={ShoppingCart} title="Aucun produit" description="Ajoutez le premier produit ci-dessus" />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="text-left py-2 px-3 text-sm font-semibold text-foreground">Produit</th>
                        <th className="text-left py-2 px-3 text-sm font-semibold text-foreground">Catégorie</th>
                        <th className="text-left py-2 px-3 text-sm font-semibold text-foreground">Unité</th>
                        <th className="py-2 px-3" />
                      </tr>
                    </thead>
                    <tbody>
                      {produits.map((p) => (
                        <tr key={p.id} className="border-b border-border hover:bg-accent/5">
                          <td className="py-2 px-3 font-medium text-foreground">{p.nom}</td>
                          <td className="py-2 px-3"><span className="px-2 py-0.5 rounded-full text-xs bg-primary/10 text-primary">{p.categorie}</span></td>
                          <td className="py-2 px-3 text-muted-foreground text-sm">{p.unite}</td>
                          <td className="py-2 px-3 text-right">
                            <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive gap-1"
                              disabled={busyProd === p.id} onClick={() => deleteProduit(p.id, p.nom)}>
                              {busyProd === p.id ? <Spinner className="h-3.5 w-3.5" /> : <Trash2 className="h-3.5 w-3.5" />}
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Prix marché ───────────────────────────────────────────────── */}
        <TabsContent value="prix" className="mt-6 space-y-6">
          <Card className="border-border">
            <CardHeader>
              <CardTitle className="text-foreground">Import CSV de prix</CardTitle>
              <CardDescription>Colonnes attendues : produit, marche, prix, date (YYYY-MM-DD)</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex gap-3 items-center">
                <Input type="file" accept=".csv" onChange={(e) => setCsvFile(e.target.files?.[0] ?? null)} className="flex-1" />
                <Button onClick={uploadCsv} disabled={!csvFile || uploading} className="gap-2 shrink-0">
                  {uploading ? <Spinner className="h-4 w-4" /> : <Upload className="h-4 w-4" />}
                  Importer
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-foreground">Historique des prix</CardTitle>
                <CardDescription>{prixTotal} enregistrement(s)</CardDescription>
              </div>
              <Button size="sm" variant="outline" onClick={() => fetchPrix(prixPage)} disabled={prixLoading} className="gap-2">
                <RefreshCw className={`h-4 w-4 ${prixLoading ? 'animate-spin' : ''}`} />
              </Button>
            </CardHeader>
            <CardContent>
              {prixLoading ? <LoadingBlock /> : prixItems.length === 0 ? (
                <EmptyState icon={Activity} title="Aucun prix" description="Importez un CSV pour commencer" />
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-border">
                          <th className="text-left py-2 px-3 text-sm font-semibold text-foreground">Produit</th>
                          <th className="text-left py-2 px-3 text-sm font-semibold text-foreground">Marché</th>
                          <th className="text-right py-2 px-3 text-sm font-semibold text-foreground">Prix</th>
                          <th className="text-left py-2 px-3 text-sm font-semibold text-foreground">Date</th>
                          <th className="py-2 px-3" />
                        </tr>
                      </thead>
                      <tbody>
                        {prixItems.map((r) => (
                          <tr key={r.id} className="border-b border-border hover:bg-accent/5">
                            <td className="py-2 px-3 text-foreground">{String(r.produit ?? r.culture ?? '—')}</td>
                            <td className="py-2 px-3 text-muted-foreground">{String(r.marche ?? r.market_name ?? '—')}</td>
                            <td className="py-2 px-3 text-right font-medium text-foreground">{String(r.prix ?? r.price ?? '—')}</td>
                            <td className="py-2 px-3 text-muted-foreground text-sm">{String(r.date ?? r.created_at ?? '—').slice(0, 10)}</td>
                            <td className="py-2 px-3 text-right">
                              <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => deletePrix(r.id)}>
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="flex items-center justify-between mt-4">
                    <Button variant="outline" size="sm" disabled={prixPage <= 1} onClick={() => { const p = prixPage - 1; setPrixPage(p); fetchPrix(p) }}>Précédent</Button>
                    <span className="text-sm text-muted-foreground">Page {prixPage}</span>
                    <Button variant="outline" size="sm" disabled={prixItems.length < 50} onClick={() => { const p = prixPage + 1; setPrixPage(p); fetchPrix(p) }}>Suivant</Button>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── KoboCollect ───────────────────────────────────────────────── */}
        <TabsContent value="kobo" className="mt-6 space-y-6">
          <Card className="border-border">
            <CardHeader>
              <CardTitle className="text-foreground">Configuration KoboCollect</CardTitle>
              <CardDescription>Serveur KoboToolbox pour la collecte terrain</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {koboCfg?.configured && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-green-50 border border-green-200">
                  <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
                  <div className="text-sm">
                    <span className="font-medium text-green-700">Connecté : </span>
                    <span className="text-green-600">{koboCfg.base_url}</span>
                    <span className="text-green-500 ml-2 text-xs">Token : {koboCfg.token_hint}</span>
                  </div>
                </div>
              )}
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">URL du serveur</label>
                  <Input placeholder="https://kf.kobotoolbox.org" value={koboUrl} onChange={(e) => setKoboUrl(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Token API</label>
                  <Input type="password" placeholder="Token KoboToolbox" value={koboToken} onChange={(e) => setKoboToken(e.target.value)} />
                </div>
              </div>
              <Button onClick={saveKobo} disabled={!koboUrl || !koboToken || savingKobo} className="gap-2">
                {savingKobo ? <Spinner className="h-4 w-4" /> : <Settings className="h-4 w-4" />}
                Enregistrer &amp; tester
              </Button>
            </CardContent>
          </Card>

          <Card className="border-border">
            <CardHeader>
              <CardTitle className="text-foreground">Formulaires disponibles</CardTitle>
              <CardDescription>{koboForms.length} formulaire(s) KoboCollect</CardDescription>
            </CardHeader>
            <CardContent>
              {koboLoading ? <LoadingBlock /> : koboForms.length === 0 ? (
                <EmptyState icon={Database} title="Aucun formulaire" description="Configurez KoboCollect pour voir les formulaires" />
              ) : (
                <div className="space-y-2">
                  {koboForms.map((f) => (
                    <div key={f.uid} className="flex items-center justify-between p-3 border border-border rounded-lg">
                      <div>
                        <p className="font-medium text-foreground">{f.name ?? f.title ?? f.uid}</p>
                        <p className="text-xs text-muted-foreground">{f.uid}</p>
                      </div>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${f.deployment_active ? 'bg-green-100 text-green-700' : 'bg-muted text-muted-foreground'}`}>
                        {f.deployment_active ? 'Actif' : 'Inactif'}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Pipeline ML ───────────────────────────────────────────────── */}
        <TabsContent value="pipeline" className="mt-6 space-y-6">
          <Card className="border-border">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-foreground">Fichiers de données ML</CardTitle>
                <CardDescription>
                  {pipeline ? `${pipeline.ready}/${pipeline.total} fichiers présents` : 'Cliquez Actualiser pour vérifier'}
                </CardDescription>
              </div>
              <Button size="sm" variant="outline" onClick={fetchPipeline} disabled={pipelineLoading} className="gap-2">
                <RefreshCw className={`h-4 w-4 ${pipelineLoading ? 'animate-spin' : ''}`} />
                Actualiser
              </Button>
            </CardHeader>
            <CardContent>
              {pipelineLoading ? <LoadingBlock /> : !pipeline ? (
                <EmptyState icon={Cpu} title="Non vérifié" />
              ) : (
                <div className="space-y-2">
                  {Object.entries(pipeline.files).map(([name, present]) => (
                    <div key={name} className="flex items-center justify-between p-3 border border-border rounded-lg">
                      <div className="flex items-center gap-3">
                        {present ? <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" /> : <XCircle className="h-4 w-4 text-destructive shrink-0" />}
                        <div>
                          <p className="text-sm font-medium text-foreground">{name}</p>
                          <p className="text-xs text-muted-foreground">{present ? 'Présent' : 'Manquant — modèle dégradé'}</p>
                        </div>
                      </div>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${present ? 'bg-green-100 text-green-700' : 'bg-destructive/10 text-destructive'}`}>
                        {present ? 'OK' : 'ABSENT'}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-border">
            <CardHeader>
              <CardTitle className="text-foreground">Modèles IA actifs</CardTitle>
              <CardDescription>Agents Decision Intelligence Engine</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {[
                { name: 'GARCH Volatility', desc: 'Prévision de la volatilité des prix (séries temporelles)', file: 'Core_TimeSeries' },
                { name: 'Financial Risk', desc: 'Score de risque financier des exploitations', file: 'AgriRiskFin' },
                { name: 'Farmer Segmentation', desc: 'Segmentation K-Means des agriculteurs', file: 'yield_df' },
                { name: 'Crop Yield', desc: 'Prédiction des rendements par culture', file: 'yield_df' },
                { name: 'KPI Dashboard', desc: 'Indicateurs clés agrégés', file: null },
                { name: 'AgriSmart Irrigation', desc: 'Calcul FAO-56 des besoins en eau', file: null },
              ].map((m) => {
                const fileOk = !m.file || pipeline?.files[m.file]
                return (
                  <div key={m.name} className="flex items-center gap-3 p-3 border border-border rounded-lg">
                    <div className={`h-2 w-2 rounded-full shrink-0 ${fileOk ? 'bg-green-500' : 'bg-amber-500'}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground">{m.name}</p>
                      <p className="text-xs text-muted-foreground">{m.desc}</p>
                    </div>
                    <span className={`text-xs ${fileOk ? 'text-green-600' : 'text-amber-600'}`}>
                      {fileOk ? 'Prêt' : 'Dégradé'}
                    </span>
                  </div>
                )
              })}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Config ───────────────────────────────────────────────────── */}
        <TabsContent value="settings" className="mt-6">
          <Card className="border-border">
            <CardHeader>
              <CardTitle className="text-foreground">Informations AgriTogo</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {health ? (
                <div className="grid gap-3 md:grid-cols-2">
                  {[
                    { label: 'Statut', value: health.status === 'ok' ? '🟢 En ligne' : `🔴 ${health.status}` },
                    { label: 'Version', value: `v${health.version}` },
                    { label: 'Agents IA', value: String(health.agents) },
                    { label: 'Modèles LLM', value: health.models.join(', ') },
                  ].map((item) => (
                    <div key={item.label} className="flex justify-between p-3 border border-border rounded-lg">
                      <p className="text-sm text-muted-foreground">{item.label}</p>
                      <p className="text-sm font-medium text-foreground">{item.value}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Service non accessible. Vérifiez <code>AGRITOGO_API_URL</code>.</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
