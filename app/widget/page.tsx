'use client'

import { useState, useEffect, useMemo } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Copy, Code, ExternalLink, Check } from 'lucide-react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useCooperative } from '@/app/context/cooperative-context'
import { useToast } from '@/hooks/use-toast'
import { LoadingBlock } from '@/components/shared/loading'
import { PageHeader } from '@/components/shared/page-header'
import { errorMessage } from '@/lib/utils/errors'

const PLATFORMS = [
  { name: 'WordPress', desc: 'Use the Custom HTML block or a code-snippets plugin' },
  { name: 'Shopify', desc: 'Add to your theme via the Liquid template editor' },
  { name: 'Wix', desc: 'Use the HTML iframe embed element' },
  { name: 'Squarespace', desc: 'Insert as a custom code block' },
  { name: 'Static HTML', desc: 'Paste directly into your HTML file' },
  { name: 'React / Next.js', desc: 'Wrap in an <iframe> component with the embed URL' },
]

export default function WidgetPage() {
  const { currentCooperative } = useCooperative()
  const { toast } = useToast()
  const [copiedKey, setCopiedKey] = useState<string | null>(null)
  const [previewLoading, setPreviewLoading] = useState(true)
  const [widgetConfig, setWidgetConfig] = useState({
    width: '100%',
    height: '600px',
    theme: 'light',
  })
  const [appUrl, setAppUrl] = useState('')

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setAppUrl(window.location.origin)
    }
  }, [])

  const cooperativeId = currentCooperative?.id ?? 'YOUR_COOPERATIVE_ID'
  const embedUrl = useMemo(
    () => `${appUrl}/embed?id=${cooperativeId}&theme=${widgetConfig.theme}`,
    [appUrl, cooperativeId, widgetConfig.theme],
  )

  const widgetCode = `<!-- FaîtiereHub Marketplace Widget -->
<div data-coop-widget data-coop-id="${cooperativeId}"></div>
<script>
  (function() {
    var container = document.querySelector('[data-coop-widget]');
    var id = container.getAttribute('data-coop-id');
    var iframe = document.createElement('iframe');
    iframe.src = '${appUrl}/embed?id=' + encodeURIComponent(id) + '&theme=${widgetConfig.theme}';
    iframe.style.cssText = 'width:${widgetConfig.width};height:${widgetConfig.height};border:none;border-radius:8px;';
    iframe.setAttribute('title', 'Cooperative marketplace');
    iframe.setAttribute('loading', 'lazy');
    container.appendChild(iframe);
  })();
</script>`

  const copy = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedKey(key)
      setTimeout(() => setCopiedKey(null), 1500)
    } catch (e) {
      toast({ title: 'Copy failed', description: errorMessage(e), variant: 'destructive' })
    }
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title="Embeddable Widget"
        description="Embed your cooperative marketplace on any website"
      />

      {currentCooperative ? (
        <div className="flex items-center gap-3 p-3 bg-primary/5 border border-primary/20 rounded-lg">
          <div className="h-3 w-3 rounded-full bg-primary" aria-hidden />
          <p className="text-sm text-foreground">
            Widget configured for <strong>{currentCooperative.name}</strong>
            <span className="ml-2 font-mono text-xs text-muted-foreground">({cooperativeId})</span>
          </p>
        </div>
      ) : null}

      <Tabs defaultValue="embed" className="w-full">
        <TabsList className="grid w-full max-w-md grid-cols-3 border-b border-border bg-transparent">
          <TabsTrigger value="embed" className="border-b-2 border-transparent data-[state=active]:border-primary">
            Embed
          </TabsTrigger>
          <TabsTrigger value="preview" className="border-b-2 border-transparent data-[state=active]:border-primary">
            Preview
          </TabsTrigger>
          <TabsTrigger value="customize" className="border-b-2 border-transparent data-[state=active]:border-primary">
            Customize
          </TabsTrigger>
        </TabsList>

        <TabsContent value="embed" className="space-y-6 mt-6">
          <Card className="border-border">
            <CardHeader>
              <CardTitle className="text-foreground">Widget Installation Code</CardTitle>
              <CardDescription>Copy and paste this into your website&apos;s HTML</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <pre className="bg-muted/50 border border-border rounded-lg p-4 overflow-x-auto text-xs text-foreground font-mono leading-relaxed whitespace-pre-wrap break-words">
                {widgetCode}
              </pre>
              <Button
                className="w-full gap-2 bg-primary hover:bg-primary/90"
                onClick={() => copy(widgetCode, 'code')}
              >
                {copiedKey === 'code' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                {copiedKey === 'code' ? 'Copied' : 'Copy Code'}
              </Button>
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <p className="text-sm text-blue-900">
                  Your cooperative ID is already embedded in the code above.
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border">
            <CardHeader>
              <CardTitle className="text-foreground">Direct Embed URL</CardTitle>
              <CardDescription>Use this URL directly in an iframe</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex gap-2">
                <Input
                  value={embedUrl}
                  readOnly
                  className="border-border bg-background text-foreground font-mono text-xs"
                  aria-label="Embed URL"
                />
                <Button
                  variant="outline"
                  className="border-border shrink-0"
                  onClick={() => copy(embedUrl, 'url')}
                  aria-label="Copy URL"
                >
                  {copiedKey === 'url' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </Button>
                <Button
                  variant="outline"
                  className="border-border shrink-0"
                  onClick={() => window.open(embedUrl, '_blank', 'noopener,noreferrer')}
                  aria-label="Open in new tab"
                >
                  <ExternalLink className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border">
            <CardHeader>
              <CardTitle className="text-foreground">Integration Guides</CardTitle>
              <CardDescription>Platform-specific installation instructions</CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2">
                {PLATFORMS.map((p) => (
                  <li
                    key={p.name}
                    className="flex items-start gap-3 p-3 border border-border rounded-lg hover:bg-accent/5 transition-colors"
                  >
                    <Code className="h-4 w-4 text-primary mt-0.5 shrink-0" aria-hidden />
                    <div>
                      <p className="font-medium text-foreground text-sm">{p.name}</p>
                      <p className="text-xs text-muted-foreground">{p.desc}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="preview" className="space-y-6 mt-6">
          <Card className="border-border">
            <CardHeader>
              <CardTitle className="text-foreground">Live Widget Preview</CardTitle>
              <CardDescription>
                Preview of your marketplace as it will appear embedded on external sites
              </CardDescription>
            </CardHeader>
            <CardContent>
              {!currentCooperative ? (
                <div className="flex items-center justify-center h-64 text-muted-foreground">
                  <p>No cooperative selected</p>
                </div>
              ) : (
                <div className="relative border border-border rounded-lg overflow-hidden" style={{ height: '500px' }}>
                  {previewLoading ? (
                    <div className="absolute inset-0 z-10 bg-background/80 flex items-center justify-center pointer-events-none">
                      <LoadingBlock />
                    </div>
                  ) : null}
                  <iframe
                    key={embedUrl}
                    src={embedUrl}
                    style={{ width: '100%', height: '100%', border: 'none' }}
                    title="Widget Preview"
                    onLoad={() => setPreviewLoading(false)}
                  />
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="customize" className="space-y-6 mt-6">
          <Card className="border-border">
            <CardHeader>
              <CardTitle className="text-foreground">Widget Customization</CardTitle>
              <CardDescription>Adjust the appearance to match your website</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="width">Width</Label>
                <Input
                  id="width"
                  value={widgetConfig.width}
                  onChange={(e) => setWidgetConfig((c) => ({ ...c, width: e.target.value }))}
                  placeholder="100% or 800px"
                />
                <p className="text-xs text-muted-foreground">Use percentages for responsive design.</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="height">Height</Label>
                <Input
                  id="height"
                  value={widgetConfig.height}
                  onChange={(e) => setWidgetConfig((c) => ({ ...c, height: e.target.value }))}
                  placeholder="600px or 100vh"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="theme">Theme</Label>
                <select
                  id="theme"
                  value={widgetConfig.theme}
                  onChange={(e) => setWidgetConfig((c) => ({ ...c, theme: e.target.value }))}
                  className="w-full border border-border rounded-md p-2 bg-background text-foreground text-sm"
                >
                  <option value="light">Light</option>
                  <option value="dark">Dark</option>
                </select>
              </div>
              <div className="p-3 bg-secondary/30 rounded-lg">
                <p className="text-xs text-muted-foreground">
                  The embed URL updates automatically. Switch to the Preview tab to see changes.
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border">
            <CardHeader>
              <CardTitle className="text-foreground">API Endpoint</CardTitle>
              <CardDescription>JSON data for custom integrations</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="bg-muted/50 border border-border rounded-lg p-3">
                <p className="text-xs text-muted-foreground mb-2">
                  Returns cooperative info + active exploitations:
                </p>
                <code className="text-xs font-mono text-foreground block break-all">
                  GET {appUrl}/api/widget?id={cooperativeId}
                </code>
              </div>
              <Button
                variant="outline"
                className="w-full border-border gap-2"
                onClick={() =>
                  window.open(`${appUrl}/api/widget?id=${cooperativeId}`, '_blank', 'noopener,noreferrer')
                }
              >
                <ExternalLink className="h-4 w-4" />
                Test API Response
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
