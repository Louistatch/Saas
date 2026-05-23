import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { decryptSecret } from '@/lib/utils/crypto'
import { createLogger } from '@/lib/utils/logger'
import { fetchKoboSubmissions, processKoboSubmissions, retryFailedSubmissions } from '@/lib/kobo/sync-service'
import { uuidSchema } from '@/lib/validators/schemas'

const log = createLogger('api:kobo:sync')

/**
 * POST /api/integrations/kobo/sync
 * 
 * Triggers a manual sync from KoboToolbox.
 * Pulls new submissions and processes them into the database.
 * Also retries any failed submissions from the queue.
 */
export async function POST(request: NextRequest) {
  let body: { cooperative_id?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = uuidSchema.safeParse(body.cooperative_id)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid cooperative_id' }, { status: 400 })
  }
  const cooperativeId = parsed.data

  // Auth check
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, cooperative_id')
    .eq('id', user.id)
    .single<{ role: string; cooperative_id: string | null }>()

  if (!profile) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const allowed =
    profile.role === 'super_admin' ||
    (profile.role === 'cooperative_admin' && profile.cooperative_id === cooperativeId)
  if (!allowed) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Get integration config
  const { data: integration } = await supabase
    .from('integrations')
    .select('config, status, last_sync_at')
    .eq('cooperative_id', cooperativeId)
    .eq('type', 'kobo')
    .single()

  if (!integration || integration.status !== 'connected') {
    return NextResponse.json({ error: 'KoboToolbox not connected' }, { status: 400 })
  }

  const config = integration.config as {
    api_key?: string
    form_id?: string
    field_mapping?: Record<string, string>
  }

  if (!config.api_key || !config.form_id) {
    return NextResponse.json({ error: 'Missing API key or form ID' }, { status: 400 })
  }

  try {
    // Decrypt API key
    const apiKey = decryptSecret(config.api_key)

    // Fetch new submissions since last sync
    const submissions = await fetchKoboSubmissions(
      apiKey,
      config.form_id,
      integration.last_sync_at ?? undefined,
    )

    log.info('Fetched Kobo submissions', { count: submissions.length, cooperativeId })

    // Process submissions
    const result = await processKoboSubmissions(
      cooperativeId,
      submissions,
      config.field_mapping ?? {},
    )

    // Retry failed from queue
    const retryResult = await retryFailedSubmissions(cooperativeId)

    // Update last_sync_at
    await supabase
      .from('integrations')
      .update({ last_sync_at: new Date().toISOString(), status: 'connected' })
      .eq('cooperative_id', cooperativeId)
      .eq('type', 'kobo')

    return NextResponse.json({
      success: true,
      sync: result,
      retries: retryResult,
      message: `Sync terminée: ${result.created} créés, ${result.updated} mis à jour, ${result.skipped} ignorés, ${result.failed} échoués`,
    })
  } catch (error: any) {
    log.error('Kobo sync failed', error)

    // Update status to error
    await supabase
      .from('integrations')
      .update({ status: 'error' })
      .eq('cooperative_id', cooperativeId)
      .eq('type', 'kobo')

    return NextResponse.json(
      { error: 'Sync failed', details: error?.message },
      { status: 500 },
    )
  }
}
