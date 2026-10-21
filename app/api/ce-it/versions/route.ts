import { randomUUID } from 'node:crypto'
import { BUCKET, MAX_PDF_BYTES, versionSchema } from '@/lib/ce-it/schema'
import { digest, enabled, failure, json, unavailable } from '@/lib/ce-it/server'
import { assertAuthenticated } from '@/lib/security/assert-access'
import { createClient } from '@/lib/supabase/admin'
import { applyRateLimit } from '@/lib/utils/rate-limit-persistent'
import type { NextRequest } from 'next/server'
import { z } from 'zod'

export const runtime = 'nodejs'
export async function POST(request: NextRequest) {
  if (!enabled()) return unavailable()
  const guard = await assertAuthenticated()
  if (!guard.ok) return guard.response
  const limited = await applyRateLimit(request, 'verify')
  if (limited) return limited
  const length = Number(request.headers.get('content-length'))
  if (length > MAX_PDF_BYTES * 2 + 200000) return json({ error: 'Fichiers trop volumineux.' }, 413)
  const form = await request.formData().catch(() => null)
  if (!form) return json({ error: 'Formulaire invalide.' }, 400)
  const product = z.string().uuid().safeParse(form.get('product_id'))
  if (!product.success) return json({ error: 'Produit invalide.' }, 400)
  // RLS must make this product visible, then the service RPC independently checks actual write rights.
  const { data: doc } = await guard.ctx.supabase
    .from('ceit_products')
    .select('id,title')
    .eq('id', product.data)
    .maybeSingle<{ id: string; title: string }>()
  if (!doc) return json({ error: 'Produit non autorisé.' }, 403)
  // Check management/contribution before allocating PDF buffers or writing storage.
  const permission = await guard.ctx.supabase.rpc('ceit_can_edit', { product: doc.id })
  if (permission.error || permission.data !== true)
    return json({ error: 'Dépôt non autorisé.' }, 403)
  const keys: string[] = []
  const admin = createClient()
  try {
    const value = String(form.get('data') ?? '')
    if (value.length > 180000) return json({ error: 'Données trop volumineuses.' }, 413)
    const data = versionSchema.parse(JSON.parse(value))
    let ce: Uint8Array
    let it: Uint8Array
    const ceFile = form.get('ce')
    const itFile = form.get('it')
    if (ceFile || itFile) {
      const read = async (f: FormDataEntryValue | null) => {
        if (
          !(f instanceof File) ||
          f.size < 5 ||
          f.size > MAX_PDF_BYTES ||
          f.type !== 'application/pdf'
        )
          throw new Error('invalid PDF')
        const bytes = new Uint8Array(await f.arrayBuffer())
        if (new TextDecoder().decode(bytes.slice(0, 5)) !== '%PDF-') throw new Error('invalid PDF')
        return bytes
      }
      ;[ce, it] = await Promise.all([read(ceFile), read(itFile)])
    } else {
      const { generateDocuments } = await import('@/lib/ce-it/pdf')
      ;({ ce, it } = generateDocuments(doc.title, data))
    }
    const version = randomUUID()
    for (const [name, bytes] of [
      ['ce', ce],
      ['it', it],
    ] as const) {
      const key = `${doc.id}/${version}/${name}.pdf`
      const result = await admin.storage
        .from(BUCKET)
        .upload(key, bytes, { contentType: 'application/pdf', upsert: false })
      if (result.error) throw result.error
      keys.push(key)
    }
    const result = await admin.rpc('ceit_add_version', {
      actor: guard.ctx.userId,
      product: doc.id,
      version,
      body: data,
      ce_hash: digest(ce),
      it_hash: digest(it),
    })
    if (result.error) throw result.error
    return json({ version_id: version, state: 'draft' }, 201)
  } catch (e) {
    if (keys.length) await admin.storage.from(BUCKET).remove(keys)
    return failure(e)
  }
}
