'use client'

import { useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Download, CheckCircle, ArrowRight, Smartphone, Upload, Globe, Zap, Copy, ExternalLink, Play, FileSpreadsheet } from 'lucide-react'
import { useCooperative } from '@/app/context/cooperative-context'
import { useToast } from '@/hooks/use-toast'
import { PageHeader } from '@/components/shared/page-header'

const STEPS = [
  {
    number: 1,
    title: 'Téléchargez le formulaire XLSForm',
    subtitle: 'Le modèle d\'enquête pré-configuré pour FaîtiereHub',
    icon: Download,
    color: 'from-green-500 to-emerald-600',
    content: 'download',
  },
  {
    number: 2,
    title: 'Importez dans KoboToolbox',
    subtitle: 'Créez votre projet d\'enquête en ligne',
    icon: Upload,
    color: 'from-blue-500 to-indigo-600',
    content: 'import',
  },
  {
    number: 3,
    title: 'Configurez le webhook',
    subtitle: 'Connectez KoboToolbox à FaîtiereHub',
    icon: Zap,
    color: 'from-purple-500 to-violet-600',
    content: 'webhook',
  },
  {
    number: 4,
    title: 'Déployez sur les téléphones',
    subtitle: 'Installez KoboCollect sur les appareils terrain',
    icon: Smartphone,
    color: 'from-orange-500 to-red-500',
    content: 'deploy',
  },
  {
    number: 5,
    title: 'Collectez et synchronisez',
    subtitle: 'Les données arrivent automatiquement',
    icon: Globe,
    color: 'from-teal-500 to-cyan-600',
    content: 'collect',
  },
]

export default function KoboSetupPage() {
  const { currentCooperative } = useCooperative()
  const { toast } = useToast()
  const [activeStep, setActiveStep] = useState(0)
  const [copied, setCopied] = useState(false)

  const webhookUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/api/webhooks/kobo?cooperative_id=${currentCooperative?.id ?? 'VOTRE_ID'}`
    : ''

  const copyWebhook = () => {
    navigator.clipboard.writeText(webhookUrl)
    setCopied(true)
    toast({ title: 'URL copiée !' })
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="space-y-8 max-w-4xl mx-auto">
      <PageHeader
        title="Configuration KoboCollect"
        description="Connectez KoboCollect pour enregistrer vos membres directement depuis le terrain"
      />

      {/* Hero banner */}
      <div className="relative rounded-2xl overflow-hidden bg-gradient-to-br from-[#0B6B3A] to-[#0a2e1a] p-8 text-white">
        <div className="absolute top-0 right-0 w-64 h-64 bg-[#1ed760]/10 rounded-full -mr-32 -mt-32 blur-3xl" />
        <div className="relative z-10 flex items-center gap-6">
          <div className="hidden md:flex items-center justify-center w-20 h-20 rounded-2xl bg-white/10 backdrop-blur border border-white/20">
            <Smartphone className="h-10 w-10 text-[#1ed760]" />
          </div>
          <div className="flex-1">
            <h2 className="text-2xl font-bold">Pipeline terrain → plateforme</h2>
            <p className="text-white/70 mt-1 max-w-lg">
              Le technicien enquête le producteur avec KoboCollect. Les données arrivent automatiquement sur FaîtiereHub. Le membre est créé. Sa carte est prête.
            </p>
          </div>
          <div className="hidden lg:block text-right">
            <div className="text-4xl font-bold text-[#1ed760]">5 min</div>
            <p className="text-white/50 text-sm">de configuration</p>
          </div>
        </div>
      </div>

      {/* Steps navigation */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2">
        {STEPS.map((step, i) => (
          <button
            key={i}
            onClick={() => setActiveStep(i)}
            className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-all ${
              activeStep === i
                ? 'bg-primary text-primary-foreground shadow-lg scale-105'
                : 'bg-secondary/50 text-muted-foreground hover:bg-secondary'
            }`}
          >
            <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
              activeStep === i ? 'bg-white/20' : 'bg-muted'
            }`}>
              {i < activeStep ? <CheckCircle className="h-4 w-4" /> : step.number}
            </span>
            <span className="hidden sm:inline">{step.title.split(' ').slice(0, 2).join(' ')}</span>
          </button>
        ))}
      </div>

      {/* Active step content */}
      <Card className="border-border overflow-hidden">
        <div className={`h-2 bg-gradient-to-r ${STEPS[activeStep].color}`} />
        <CardContent className="p-8">
          <div className="flex items-start gap-4 mb-6">
            <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${STEPS[activeStep].color} flex items-center justify-center shrink-0`}>
              {(() => { const Icon = STEPS[activeStep].icon; return <Icon className="h-6 w-6 text-white" /> })()}
            </div>
            <div>
              <h3 className="text-xl font-bold text-foreground">{STEPS[activeStep].title}</h3>
              <p className="text-muted-foreground">{STEPS[activeStep].subtitle}</p>
            </div>
          </div>

          {/* Step 1: Download */}
          {activeStep === 0 && (
            <div className="space-y-6">
              <div className="bg-green-50 border border-green-200 rounded-xl p-6 space-y-4">
                <div className="flex items-center gap-3">
                  <FileSpreadsheet className="h-8 w-8 text-green-600" />
                  <div>
                    <p className="font-semibold text-green-900">Formulaire XLSForm — Enquête Membre</p>
                    <p className="text-sm text-green-700">Pré-configuré avec tous les champs nécessaires</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                  {['📋 Identification', '📍 Localisation', '🏢 Coopérative', '🌿 Exploitation'].map((field) => (
                    <div key={field} className="bg-white rounded-lg p-2 text-center text-green-800 border border-green-100">
                      {field}
                    </div>
                  ))}
                </div>
                <a href="/xlsform/faitierehub_enquete_membre.csv" download>
                  <Button className="w-full gap-2 bg-green-600 hover:bg-green-700 text-white">
                    <Download className="h-4 w-4" />
                    Télécharger le XLSForm (.csv)
                  </Button>
                </a>
                <p className="text-xs text-green-600 text-center">
                  💡 Vous pouvez personnaliser ce fichier dans Excel avant de l'importer dans KoboToolbox
                </p>
              </div>

              <div className="bg-secondary/30 rounded-xl p-4 space-y-2">
                <p className="font-medium text-foreground text-sm">📌 Champs inclus dans le formulaire :</p>
                <div className="grid grid-cols-2 gap-2 text-sm text-muted-foreground">
                  <span>• Prénom & Nom</span>
                  <span>• Photo d'identité</span>
                  <span>• Téléphone</span>
                  <span>• Sexe & Âge</span>
                  <span>• Région / Préfecture</span>
                  <span>• Canton / Village</span>
                  <span>• Nom de la coopérative</span>
                  <span>• Culture principale</span>
                  <span>• Superficie (ha)</span>
                  <span>• Type d'agriculture</span>
                </div>
              </div>
            </div>
          )}

          {/* Step 2: Import */}
          {activeStep === 1 && (
            <div className="space-y-6">
              <ol className="space-y-4">
                {[
                  { text: 'Allez sur', link: 'https://kf.kobotoolbox.org', linkText: 'kf.kobotoolbox.org', after: '(créez un compte gratuit si nécessaire)' },
                  { text: 'Cliquez sur', bold: 'NEW', after: '→ puis "Upload an XLSForm"' },
                  { text: 'Sélectionnez le fichier', bold: 'faitierehub_enquete_membre.csv', after: 'téléchargé à l\'étape 1' },
                  { text: 'Vérifiez l\'aperçu du formulaire, puis cliquez', bold: 'CREATE PROJECT', after: '' },
                  { text: 'Cliquez sur', bold: 'DEPLOY', after: 'pour activer le formulaire' },
                ].map((item, i) => (
                  <li key={i} className="flex gap-3">
                    <span className="w-7 h-7 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-sm font-bold shrink-0">
                      {i + 1}
                    </span>
                    <p className="text-foreground pt-0.5">
                      {item.text}{' '}
                      {item.link ? (
                        <a href={item.link} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline font-medium">
                          {item.linkText} <ExternalLink className="h-3 w-3 inline" />
                        </a>
                      ) : null}
                      {item.bold ? <strong className="bg-blue-50 px-1.5 py-0.5 rounded text-blue-800">{item.bold}</strong> : null}
                      {item.after ? <span className="text-muted-foreground"> {item.after}</span> : null}
                    </p>
                  </li>
                ))}
              </ol>
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                <p className="text-sm text-blue-800">
                  <strong>💡 Astuce :</strong> KoboToolbox est 100% gratuit pour les ONG et organisations agricoles. Pas besoin de carte bancaire.
                </p>
              </div>
            </div>
          )}

          {/* Step 3: Webhook */}
          {activeStep === 2 && (
            <div className="space-y-6">
              <ol className="space-y-4">
                {[
                  'Dans votre projet KoboToolbox, allez dans ⚙️ Settings',
                  'Cliquez sur l\'onglet "REST Services"',
                  'Cliquez "Register a new service"',
                  'Collez l\'URL webhook ci-dessous',
                  'Sélectionnez "JSON POST" comme format',
                  'Cliquez "Create"',
                ].map((text, i) => (
                  <li key={i} className="flex gap-3">
                    <span className="w-7 h-7 rounded-full bg-purple-100 text-purple-700 flex items-center justify-center text-sm font-bold shrink-0">
                      {i + 1}
                    </span>
                    <p className="text-foreground pt-0.5">{text}</p>
                  </li>
                ))}
              </ol>

              <div className="bg-purple-50 border border-purple-200 rounded-xl p-4 space-y-3">
                <p className="text-sm font-medium text-purple-900">🔗 Votre URL webhook :</p>
                <div className="flex gap-2">
                  <code className="flex-1 bg-white border border-purple-200 rounded-lg px-3 py-2 text-xs font-mono text-purple-800 break-all">
                    {webhookUrl}
                  </code>
                  <Button
                    size="sm"
                    variant="outline"
                    className="shrink-0 border-purple-300"
                    onClick={copyWebhook}
                  >
                    {copied ? <CheckCircle className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
                <p className="text-xs text-purple-600">
                  ⚠️ Cette URL est unique à votre coopérative. Ne la partagez pas publiquement.
                </p>
              </div>
            </div>
          )}

          {/* Step 4: Deploy */}
          {activeStep === 3 && (
            <div className="space-y-6">
              <div className="grid md:grid-cols-2 gap-4">
                <div className="bg-orange-50 border border-orange-200 rounded-xl p-5 space-y-3">
                  <div className="flex items-center gap-2">
                    <Play className="h-5 w-5 text-orange-600" />
                    <p className="font-semibold text-orange-900">Sur chaque téléphone :</p>
                  </div>
                  <ol className="space-y-2 text-sm text-orange-800">
                    <li>1. Installez <strong>KoboCollect</strong> depuis Play Store</li>
                    <li>2. Ouvrez l'app → ⚙️ Paramètres</li>
                    <li>3. URL du serveur : <code className="bg-white px-1 rounded">https://kc.kobotoolbox.org</code></li>
                    <li>4. Entrez votre identifiant KoboToolbox</li>
                    <li>5. Téléchargez le formulaire</li>
                  </ol>
                </div>
                <div className="bg-orange-50 border border-orange-200 rounded-xl p-5 space-y-3">
                  <div className="flex items-center gap-2">
                    <Smartphone className="h-5 w-5 text-orange-600" />
                    <p className="font-semibold text-orange-900">Configuration rapide :</p>
                  </div>
                  <div className="space-y-2 text-sm text-orange-800">
                    <p>Vous pouvez aussi générer un <strong>QR code de configuration</strong> depuis KoboToolbox pour configurer tous les téléphones en un scan.</p>
                    <p className="text-xs text-orange-600 mt-2">
                      KoboToolbox → Settings → Collect Settings → Generate QR Code
                    </p>
                  </div>
                </div>
              </div>
              <div className="bg-secondary/30 rounded-xl p-4">
                <p className="text-sm text-muted-foreground">
                  <strong>📱 Compatible avec :</strong> Android 5.0+ • Fonctionne hors-ligne • Synchronise quand le réseau revient
                </p>
              </div>
            </div>
          )}

          {/* Step 5: Collect */}
          {activeStep === 4 && (
            <div className="space-y-6">
              <div className="bg-gradient-to-br from-teal-50 to-cyan-50 border border-teal-200 rounded-xl p-6 space-y-4">
                <h4 className="font-bold text-teal-900 text-lg">🎉 C'est prêt !</h4>
                <p className="text-teal-800">Voici ce qui se passe automatiquement :</p>
                <div className="space-y-3">
                  {[
                    { emoji: '📱', text: 'Le technicien remplit le formulaire sur le terrain' },
                    { emoji: '📡', text: 'Les données sont envoyées à KoboToolbox (dès qu\'il y a du réseau)' },
                    { emoji: '⚡', text: 'KoboToolbox envoie les données à FaîtiereHub via le webhook' },
                    { emoji: '🧹', text: 'FaîtiereHub nettoie les données (format téléphone, majuscules, etc.)' },
                    { emoji: '👤', text: 'Le membre est créé automatiquement dans sa coopérative' },
                    { emoji: '🪪', text: 'Vous pouvez générer sa carte membre depuis le dashboard' },
                  ].map((item, i) => (
                    <div key={i} className="flex items-start gap-3 bg-white/60 rounded-lg p-3">
                      <span className="text-xl">{item.emoji}</span>
                      <p className="text-sm text-teal-900 pt-0.5">{item.text}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="text-center space-y-2">
                <p className="text-sm text-muted-foreground">
                  Les nouveaux membres apparaîtront dans <strong>Dashboard → Membres</strong>
                </p>
                <Button variant="outline" className="gap-2" onClick={() => window.location.href = '/dashboard/members'}>
                  Voir les membres <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}

          {/* Navigation */}
          <div className="flex justify-between mt-8 pt-6 border-t border-border">
            <Button
              variant="outline"
              onClick={() => setActiveStep(Math.max(0, activeStep - 1))}
              disabled={activeStep === 0}
            >
              ← Précédent
            </Button>
            <Button
              className="gap-2 bg-primary hover:bg-primary/90"
              onClick={() => setActiveStep(Math.min(STEPS.length - 1, activeStep + 1))}
              disabled={activeStep === STEPS.length - 1}
            >
              Suivant <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
