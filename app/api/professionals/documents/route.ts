// Justificatifs du titulaire connecté (famille AGRONOME : agronome,
// technicien, conseiller).
//
// GET              → mes justificatifs (URL signées 10 min).
// POST multipart   → file (PDF/JPEG/PNG, 5 Mo max) + kind ; tant que le
//                    dossier n'est pas VALIDE.
// DELETE ?id=<uuid> → retire un justificatif, tant que le dossier n'est pas VALIDE.
//
// Le fichier part dans le bucket PRIVÉ professional-documents sous
// <user_id>/… ; le chemin est construit ici, jamais fourni par le client.

import { randomBytes } from 'node:crypto'
import {
  DOCUMENT_BUCKET,
  canHolderEditDocuments,
  documentStoragePath,
  validateDocumentUpload,
} from '@/lib/professionals/core'
import { documentKindSchema } from '@/lib/professionals/schemas'
import { listDocumentsWithSignedUrls } from '@/lib/professionals/server'
import { assertAuthenticated } from '@/lib/security/assert-access'
import { createClient as createAdminClient } from '@/lib/supabase/admin'
import { clientKeyFromHeaders, rateLimit } from '@/lib/utils/rate-limit'
import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

const MAX_DOCUMENTS = 10

/** Signatures binaires : le type MIME déclaré par le navigateur ne suffit pas. */
function matchesMagic(mime: string, head: Uint8Array): boolean {
  if (mime === 'application/pdf') return head[0] === 0x25 && head[1] === 0x50 && head[2] === 0x44
  if (mime === 'image/png') return head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4e
  if (mime === 'image/jpeg') return head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff
  return false
}

async function ownDossier(admin: ReturnType<typeof createAdminClient>, userId: string) {
  const { data } = await admin
    .from('haroo_agronome_profiles')
    .select('id, statut_validation')
    .eq('user_id', userId)
    .maybeSingle<{ id: string; statut_validation: string | null }>()
  return data
}

export async function GET() {
  const auth = await assertAuthenticated()
  if (!auth.ok) return auth.response
  const admin = createAdminClient()
  const documents = await listDocumentsWithSignedUrls(admin, auth.ctx.userId)
  const dossier = await ownDossier(admin, auth.ctx.userId)
  return NextResponse.json(
    {
      documents,
      can_edit: !!dossier && canHolderEditDocuments(dossier.statut_validation),
    },
    { headers: { 'Cache-Control': 'private, no-store' } },
  )
}

export async function POST(request: NextRequest) {
  const limit = rateLimit(`pro-docs-upload:${clientKeyFromHeaders(request.headers)}`, 10, 600_000)
  if (!limit.ok) return NextResponse.json({ error: 'Trop de requêtes' }, { status: 429 })

  const auth = await assertAuthenticated()
  if (!auth.ok) return auth.response

  const admin = createAdminClient()
  const dossier = await ownDossier(admin, auth.ctx.userId)
  if (!dossier) {
    return NextResponse.json(
      { error: 'Aucun dossier professionnel sur ce compte' },
      { status: 404 },
    )
  }
  if (!canHolderEditDocuments(dossier.statut_validation)) {
    return NextResponse.json(
      { error: 'Dossier déjà validé : les justificatifs ne sont plus modifiables' },
      { status: 409 },
    )
  }

  const form = await request.formData().catch(() => null)
  const file = form?.get('file')
  const kind = documentKindSchema.safeParse(form?.get('kind'))
  if (!(file instanceof File) || !kind.success) {
    return NextResponse.json({ error: 'Fichier ou type de pièce manquant' }, { status: 400 })
  }
  const check = validateDocumentUpload({ mime: file.type, size: file.size })
  if (!check.ok) return NextResponse.json({ error: check.error }, { status: 400 })

  const bytes = new Uint8Array(await file.arrayBuffer())
  if (!matchesMagic(file.type, bytes.subarray(0, 4))) {
    return NextResponse.json({ error: 'Le contenu ne correspond pas au format' }, { status: 400 })
  }

  const { count } = await admin
    .from('professional_documents')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', auth.ctx.userId)
  if ((count ?? 0) >= MAX_DOCUMENTS) {
    return NextResponse.json({ error: `${MAX_DOCUMENTS} pièces maximum` }, { status: 409 })
  }

  const path = documentStoragePath(
    auth.ctx.userId,
    kind.data,
    check.ext,
    randomBytes(8).toString('hex'),
  )
  const { error: upError } = await admin.storage
    .from(DOCUMENT_BUCKET)
    .upload(path, bytes, { contentType: file.type, upsert: false })
  if (upError) return NextResponse.json({ error: 'Téléversement impossible' }, { status: 502 })

  const { data: row, error: insError } = await admin
    .from('professional_documents')
    .insert({
      user_id: auth.ctx.userId,
      profile_type: 'AGRONOME',
      kind: kind.data,
      storage_path: path,
      original_name: file.name.slice(0, 200) || null,
    })
    .select('id')
    .single<{ id: string }>()
  if (insError || !row) {
    await admin.storage.from(DOCUMENT_BUCKET).remove([path])
    return NextResponse.json({ error: 'Enregistrement impossible' }, { status: 502 })
  }
  return NextResponse.json({ success: true, id: row.id })
}

export async function DELETE(request: NextRequest) {
  const auth = await assertAuthenticated()
  if (!auth.ok) return auth.response

  const id = request.nextUrl.searchParams.get('id')
  if (!z.string().uuid().safeParse(id).success) {
    return NextResponse.json({ error: 'Identifiant invalide' }, { status: 400 })
  }

  const admin = createAdminClient()
  const dossier = await ownDossier(admin, auth.ctx.userId)
  if (!dossier || !canHolderEditDocuments(dossier.statut_validation)) {
    return NextResponse.json({ error: 'Justificatifs non modifiables' }, { status: 409 })
  }

  const { data: doc } = await admin
    .from('professional_documents')
    .select('id, storage_path')
    .eq('id', id as string)
    .eq('user_id', auth.ctx.userId)
    .maybeSingle<{ id: string; storage_path: string }>()
  if (!doc) return NextResponse.json({ error: 'Pièce introuvable' }, { status: 404 })

  await admin.storage.from(DOCUMENT_BUCKET).remove([doc.storage_path])
  await admin.from('professional_documents').delete().eq('id', doc.id)
  return NextResponse.json({ success: true })
}
