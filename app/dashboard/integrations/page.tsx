'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Zap, Check, ExternalLink, Lock } from 'lucide-react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { createClient } from '@/lib/supabase/client'
import { useCooperative } from '@/app/context/cooperative-context'
import { useToast } from '@/hooks/use-toast'
import { LoadingBlock, Spinner } from '@/components/shared/loading'
import { EmptyState } from '@/components/shared/empty-state'
import { PageHeader } from '@/components/shared/page-header'
import { errorMessage } from '@/lib/utils/errors'
import Link from 'next/link'

interface IntegrationDef {
  key: string
  name: string
  description: string
  icon: string
  setupHref: string | null
  available: boolean
}

const INTEGRATION_CATALOG: IntegrationDef[] = [
  {
    key: 'kobo',
    name: 'KoboToolbox',
    description: 'Sync member data and scoring from KoboToolbox surveys',
    icon: '📊',
    setupHref: '/dashboard/integrations/kobo',
    available: true,
  },
  {
    key: 'google_sheets',
    name: 'Google Sheets',
    description: 'Import and export member data from Google Sheets',
    icon: '📑',
    setupHref: null,
    available: false,
  },
  {
    key: 'email',
    name: 'Email Service',
    description: 'Send automated emails to members about updates and transactions',
    icon: '✉️',
    setupHref: null,
    available: false,
  },
  {
    key: 'payment',
    name: 'Payment Provider',
    description: 'Process payments for marketplace transactions',
    icon: '💳',
    setupHref: null,
    available: false,
  },
]

interface IntegrationStatus {
  status: string
  last_sync_at: string | null
}

export default function IntegrationsPage() {
  const { currentCooperative } = useCooperative()
  const { toast } = useToast()
  const supabase = useMemo(() => createClient(), [])
  const [statuses, setStatuses] = useState<Record<string, IntegrationStatus>>({})
  const [loading, setLoading] = useState(true)
  const [toggling, setToggling] = useState<string | null>(null)

  const loadStatuses = useCallback(async () => {
    if (!currentCooperative) return
    setLoading(true)
    const { data, error } = await supabase
      .from('integrations')
      .select('type, status, last_sync_at')
      .eq('cooperative_id', currentCooperative.id)
    if (error) {
      toast({ title: 'Error', description: errorMessage(error), variant: 'destructive' })
      setLoading(false)
      return
    }
    const map: Record<string, IntegrationStatus> = {}
    for (const row of data ?? []) {
      map[(row as { type: string }).type] = {
        status: (row as { status: string }).status,
        last_sync_at: (row as { last_sync_at: string | null }).last_sync_at,
      }
    }
    setStatuses(map)
    setLoading(false)
  }, [currentCooperative, supabase, toast])

  useEffect(() => {
    loadStatuses()
  }, [loadStatuses])

  const handleToggle = async (def: IntegrationDef, currentStatus: string) => {
    if (!currentCooperative) return
    if (def.key === 'kobo' && currentStatus !== 'connected') {
      // Force the user to set credentials via the dedicated page.
      window.location.href = '/dashboard/integrations/kobo'
      return
    }
    setToggling(def.key)
    const newStatus = currentStatus === 'connected' ? 'disconnected' : 'connected'
    const { error } = await supabase.from('integrations').upsert(
      {
        cooperative_id: currentCooperative.id,
        type: def.key,
        config: {},
        status: newStatus,
      },
      { onConflict: 'cooperative_id,type' },
    )
    setToggling(null)
    if (error) {
      toast({ title: 'Update failed', description: errorMessage(error), variant: 'destructive' })
      return
    }
    toast({ title: newStatus === 'connected' ? 'Connected' : 'Disconnected', description: def.name })
    await loadStatuses()
  }

  const connected = INTEGRATION_CATALOG.filter((i) => statuses[i.key]?.status === 'connected')

  const IntegrationCard = ({ integration }: { integration: IntegrationDef }) => {
    const status = statuses[integration.key]?.status ?? 'disconnected'
    const lastSync = statuses[integration.key]?.last_sync_at
    const isConnected = status === 'connected'

    return (
      <Card className={`border ${isConnected ? 'border-green-200 bg-green-50/50' : 'border-border'}`}>
        <CardContent className="pt-6">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="flex items-start gap-4 flex-1 min-w-0">
              <div className="text-3xl shrink-0" aria-hidden>{integration.icon}</div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-semibold text-foreground text-lg">{integration.name}</h3>
                  {isConnected ? <Check className="h-4 w-4 text-green-600" aria-hidden /> : null}
                  {!integration.available ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-secondary/40 text-muted-foreground">
                      <Lock className="h-3 w-3" />
                      Coming soon
                    </span>
                  ) : null}
                </div>
                <p className="text-muted-foreground text-sm mt-1">{integration.description}</p>
                {lastSync ? (
                  <p className="text-xs text-muted-foreground mt-1">
                    Last sync: {new Date(lastSync).toLocaleString()}
                  </p>
                ) : null}
              </div>
            </div>
            <div className="flex flex-col items-end gap-2 shrink-0">
              <span className={`text-xs font-medium ${isConnected ? 'text-green-600' : 'text-muted-foreground'}`}>
                {isConnected ? 'Connected' : 'Not Connected'}
              </span>
              <div className="flex gap-2">
                {integration.setupHref ? (
                  <Link href={integration.setupHref}>
                    <Button size="sm" variant="outline" className="border-border gap-1">
                      <ExternalLink className="h-3.5 w-3.5" />
                      Setup
                    </Button>
                  </Link>
                ) : null}
                <Button
                  size="sm"
                  variant={isConnected ? 'outline' : 'default'}
                  className={
                    isConnected
                      ? 'border-destructive/30 text-destructive hover:bg-destructive/10'
                      : 'bg-primary hover:bg-primary/90'
                  }
                  disabled={
                    toggling === integration.key || loading || !integration.available
                  }
                  onClick={() => handleToggle(integration, status)}
                >
                  {toggling === integration.key ? (
                    <Spinner className="h-3.5 w-3.5" />
                  ) : isConnected ? (
                    'Disconnect'
                  ) : (
                    'Connect'
                  )}
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title="Integrations"
        description="Connect external tools and services to enhance your cooperative"
      />

      <Tabs defaultValue="installed" className="w-full">
        <TabsList className="grid w-full max-w-sm grid-cols-2 border-b border-border bg-transparent">
          <TabsTrigger value="installed" className="border-b-2 border-transparent data-[state=active]:border-primary">
            Installed ({connected.length})
          </TabsTrigger>
          <TabsTrigger value="available" className="border-b-2 border-transparent data-[state=active]:border-primary">
            Available ({INTEGRATION_CATALOG.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="installed" className="space-y-4 mt-6">
          {loading ? (
            <LoadingBlock />
          ) : connected.length === 0 ? (
            <Card className="border-border">
              <CardContent className="py-12">
                <EmptyState
                  icon={Zap}
                  title="No integrations connected"
                  description="Browse the Available tab to connect your tools"
                />
              </CardContent>
            </Card>
          ) : (
            connected.map((i) => <IntegrationCard key={i.key} integration={i} />)
          )}
        </TabsContent>

        <TabsContent value="available" className="space-y-4 mt-6">
          {loading ? (
            <LoadingBlock />
          ) : (
            INTEGRATION_CATALOG.map((i) => <IntegrationCard key={i.key} integration={i} />)
          )}
        </TabsContent>
      </Tabs>

      <Card className="border-border bg-gradient-to-br from-primary/5 to-accent/5">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-foreground">
            <Zap className="h-5 w-5" />
            Custom Integrations
          </CardTitle>
          <CardDescription>Need something custom?</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground mb-4 text-sm">
            We support webhooks and API access for custom integrations. Use the widget API to embed
            your marketplace anywhere.
          </p>
          <div className="flex gap-3">
            <Link href="/widget">
              <Button variant="outline" className="border-border gap-2">
                <ExternalLink className="h-4 w-4" />
                Widget Setup
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
