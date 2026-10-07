'use client'

/**
 * Dépôt des justificatifs par le titulaire (agronome, technicien, conseiller)
 * tant que son dossier n'est pas validé. Envoi multipart vers
 * /api/professionals/documents, qui range le fichier dans le bucket PRIVÉ.
 */

import { Spinner } from '@/components/shared/loading'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  DOCUMENT_KINDS,
  DOCUMENT_KIND_LABEL,
  DOCUMENT_MAX_BYTES,
  DOCUMENT_MIME_EXT,
  type DocumentKind,
  validateDocumentUpload,
} from '@/lib/professionals/core'
import { FileText, Trash2, Upload } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'

interface Doc {
  id: string
  kind: string
  original_name: string | null
  url: string | null
}

const SELECT_CLASS =
  'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm'

export function MyProfessionalDocuments() {
  const [docs, setDocs] = useState<Doc[]>([])
  const [canEdit, setCanEdit] = useState(false)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [kind, setKind] = useState<DocumentKind>('diplome')
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/professionals/documents', { cache: 'no-store' })
      const data: { documents?: Doc[]; can_edit?: boolean } = await res.json().catch(() => ({}))
      setDocs(data.documents ?? [])
      setCanEdit(data.can_edit === true)
    } catch {
      setDocs([])
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const upload = async () => {
    const file = fileRef.current?.files?.[0]
    if (!file) {
      setMessage({ ok: false, text: 'Choisissez un fichier.' })
      return
    }
    const check = validateDocumentUpload({ mime: file.type, size: file.size })
    if (!check.ok) {
      setMessage({ ok: false, text: check.error })
      return
    }
    setBusy(true)
    setMessage(null)
    const body = new FormData()
    body.append('file', file)
    body.append('kind', kind)
    try {
      const res = await fetch('/api/professionals/documents', { method: 'POST', body })
      const data: { error?: string } = await res.json().catch(() => ({}))
      if (res.ok) {
        setMessage({ ok: true, text: 'Justificatif déposé.' })
        if (fileRef.current) fileRef.current.value = ''
        await load()
      } else {
        setMessage({ ok: false, text: data.error ?? 'Dépôt impossible' })
      }
    } catch {
      setMessage({ ok: false, text: 'Erreur réseau' })
    }
    setBusy(false)
  }

  const remove = async (id: string) => {
    setBusy(true)
    await fetch(`/api/professionals/documents?id=${id}`, { method: 'DELETE' }).catch(() => null)
    await load()
    setBusy(false)
  }

  if (loading) {
    return (
      <div className="flex justify-center py-4">
        <Spinner className="h-5 w-5" />
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {docs.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Aucun justificatif. Déposez votre diplôme ou une attestation : l’opérateur officier de
          votre faîtière en a besoin pour valider votre dossier.
        </p>
      ) : (
        <ul className="space-y-1.5 text-sm">
          {docs.map((d) => (
            <li key={d.id} className="flex items-center gap-2">
              <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="font-medium">
                {DOCUMENT_KIND_LABEL[d.kind as DocumentKind] ?? d.kind}
              </span>
              {d.url ? (
                <a
                  href={d.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="min-w-0 truncate text-primary hover:underline"
                >
                  {d.original_name ?? 'Ouvrir'}
                </a>
              ) : null}
              {canEdit && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="ml-auto h-7 px-2 text-destructive"
                  disabled={busy}
                  onClick={() => remove(d.id)}
                  aria-label="Retirer ce justificatif"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      {canEdit ? (
        <div className="grid gap-2 sm:grid-cols-[160px_1fr_auto] sm:items-end">
          <div className="space-y-1">
            <Label htmlFor="doc-kind">Type de pièce</Label>
            <select
              id="doc-kind"
              className={SELECT_CLASS}
              value={kind}
              onChange={(e) => setKind(e.target.value as DocumentKind)}
            >
              {DOCUMENT_KINDS.map((k) => (
                <option key={k} value={k}>
                  {DOCUMENT_KIND_LABEL[k]}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="doc-file">
              Fichier (PDF, JPEG, PNG — {DOCUMENT_MAX_BYTES / 1024 / 1024} Mo max)
            </Label>
            <input
              id="doc-file"
              ref={fileRef}
              type="file"
              accept={Object.keys(DOCUMENT_MIME_EXT).join(',')}
              className="block w-full text-sm"
            />
          </div>
          <Button onClick={upload} disabled={busy} className="gap-1.5">
            {busy ? <Spinner className="h-4 w-4" /> : <Upload className="h-4 w-4" />}
            Déposer
          </Button>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          Dossier validé : les justificatifs ne sont plus modifiables.
        </p>
      )}
      {message && (
        <output className={`block text-sm ${message.ok ? 'text-primary' : 'text-destructive'}`}>
          {message.text}
        </output>
      )}
    </div>
  )
}
