'use client'

/**
 * Justificatifs d'un dossier professionnel, pour l'instructeur (Opérateur
 * officier mandaté ou super_admin). Chargés à la demande : les URL signées
 * expirent après 10 min, on ne les prépare pas pour rien.
 */

import { Spinner } from '@/components/shared/loading'
import { Button } from '@/components/ui/button'
import { DOCUMENT_KIND_LABEL, type DocumentKind } from '@/lib/professionals/core'
import { FileText } from 'lucide-react'
import { useState } from 'react'

interface Doc {
  id: string
  kind: string
  original_name: string | null
  url: string | null
}

export function DossierDocuments({ profileId }: { profileId: string }) {
  const [docs, setDocs] = useState<Doc[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/professionals/${profileId}/documents`, { cache: 'no-store' })
      const data: { documents?: Doc[]; error?: string } = await res.json().catch(() => ({}))
      if (res.ok) setDocs(data.documents ?? [])
      else setError(data.error ?? 'Chargement impossible')
    } catch {
      setError('Erreur réseau')
    }
    setLoading(false)
  }

  if (docs === null) {
    return (
      <div className="space-y-1">
        <Button
          size="sm"
          variant="ghost"
          className="gap-1.5 px-2"
          disabled={loading}
          onClick={load}
        >
          {loading ? <Spinner className="h-3.5 w-3.5" /> : <FileText className="h-3.5 w-3.5" />}
          Voir les justificatifs
        </Button>
        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>
    )
  }

  if (docs.length === 0) {
    return <p className="text-xs text-muted-foreground">Aucun justificatif déposé.</p>
  }

  return (
    <ul className="space-y-1 text-xs">
      {docs.map((d) => (
        <li key={d.id} className="flex items-center gap-1.5">
          <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <span className="font-medium">
            {DOCUMENT_KIND_LABEL[d.kind as DocumentKind] ?? d.kind}
          </span>
          {d.url ? (
            <a
              href={d.url}
              target="_blank"
              rel="noopener noreferrer"
              className="truncate text-primary hover:underline"
            >
              {d.original_name ?? 'Ouvrir'}
            </a>
          ) : (
            <span className="text-muted-foreground">indisponible</span>
          )}
        </li>
      ))}
      <li className="text-muted-foreground">Liens valables 10 minutes.</li>
    </ul>
  )
}
