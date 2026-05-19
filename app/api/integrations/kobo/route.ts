import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { encryptSecret, isEncrypted } from '@/lib/utils/crypto'
import { createLogger } from '@/lib/utils/logger'
import { uuidSchema } from '@/lib/validators/schemas'

const log = createLogger('api:kobo')

const upsertSchema = z.object({
  cooperative_id: uuidSchema,
  api_key: z.string().min(10).optional(),
  form_id: z.string().min(1).max(120),
  auto_sync: z.boolean().optional(),
  auto_score: z.boolean().optional(),
  field_mapping: z
    .object({
      name: z.string().max(100).optional(),
      email: z.string().max(100).optional(),
      phone: z.string().max(100).optional(),
      member_id: z.string().max(100).optional(),
    })
    .optional(),
})

async function assertAccess(cooperativeId: string) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, status: 401 as const, supabase }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, cooperative_id')
    .eq('id', user.id)
    .single<{ role: string; cooperative_id: string | null }>()

  if (!profile) return { ok: false, status: 401 as const, supabase }
  const allowed =
    profile.role === 'super_admin' ||
    (profile.role === 'cooperative_admin' && profile.cooperative_id === cooperativeId)
  if (!allowed) return { ok: false, status: 403 as const, supabase }
  return { ok: true, status: 200 as const, supabase }
}

export async function POST(request: NextRequest) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  const parsed = upsertSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid input', issues: parsed.error.issues },
      { status: 400 },
    )
  }

  const access = await assertAccess(parsed.data.cooperative_id)
  if (!access.ok) {
    return NextResponse.json({ error: 'Forbidden' }, { status: access.status })
  }
  const { supabase } = access

  // Fetch existing config to preserve encrypted key when not rotating
  const { data: existing } = await supabase
    .from('integrations')
    .select('config')
    .eq('cooperative_id', parsed.data.cooperative_id)
    .eq('type', 'kobo')
    .maybeSingle<{ config: Record<string, unknown> | null }>()

  const existingKey =
    existing?.config && typeof existing.config === 'object'
      ? (existing.config as { api_key?: unknown }).api_key
      : undefined

  let apiKeyCipher: string | undefined
  if (parsed.data.api_key) {
    try {
      apiKeyCipher = encryptSecret(parsed.data.api_key)
    } catch (e) {
      log.error('Failed to encrypt secret', e)
      return NextResponse.json(
        { error: 'Server is missing encryption configuration' },
        { status: 500 },
      )
    }
  } else if (isEncrypted(existingKey)) {
    apiKeyCipher = existingKey
  }

  const { error } = await supabase.from('integrations').upsert(
    {
      cooperative_id: parsed.data.cooperative_id,
      type: 'kobo',
      status: apiKeyCipher ? 'connected' : 'disconnected',
      last_sync_at: apiKeyCipher ? new Date().toISOString() : null,
      config: {
        api_key: apiKeyCipher ?? null,
        form_id: parsed.data.form_id,
        auto_sync: parsed.data.auto_sync ?? true,
        auto_score: parsed.data.auto_score ?? true,
        field_mapping: parsed.data.field_mapping ?? {
          name: 'name',
          email: 'email',
          phone: 'phone',
          member_id: 'member_id',
        },
      },
    },
    { onConflict: 'cooperative_id,type' },
  )

  if (error) {
    log.error('Failed to upsert kobo integration', error)
    return NextResponse.json({ error: 'Failed to save integration' }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}

export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const cooperativeId = searchParams.get('cooperative_id')
  const parsed = uuidSchema.safeParse(cooperativeId)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid cooperative id' }, { status: 400 })
  }
  const access = await assertAccess(parsed.data)
  if (!access.ok) {
    return NextResponse.json({ error: 'Forbidden' }, { status: access.status })
  }
  const { supabase } = access
  const { error } = await supabase
    .from('integrations')
    .update({ status: 'disconnected', config: {} })
    .eq('cooperative_id', parsed.data)
    .eq('type', 'kobo')
  if (error) {
    return NextResponse.json({ error: 'Failed to disconnect' }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
