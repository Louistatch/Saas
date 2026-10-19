'use client'

import { SUPPORT_CONTACT, supportWhatsappUrl } from '@/lib/fiches/payment-tracking'
import { labelFileType } from '@/lib/fiches/types'
import { Download, FileWarning } from 'lucide-react'

export interface AccessFile {
  name: string
  type: string
  /** null : objet absent du stockage (le serveur l'a journalisé). */
  url: string | null
  error?: string
}

interface FicheFilesListProps {
  files: AccessFile[]
  /** Référence d'achat à citer au support quand un fichier manque. */
  reference?: string | null
  title?: string
}

/**
 * Fichiers d'un compte d'exploitation, liens signés valables une heure. Un
 * fichier manquant ne donne jamais de lien vide : il dit quoi faire.
 */
export function FicheFilesList({ files, reference, title }: FicheFilesListProps) {
  if (files.length === 0)
    return (
      <p className="rounded-lg border border-border p-3 text-sm text-muted-foreground">
        Aucun fichier n’est encore attaché à ce compte d’exploitation. Contactez-nous :{' '}
        {SUPPORT_CONTACT.email}.
      </p>
    )
  return (
    <ul className="space-y-2">
      {files.map((f) => (
        <li key={f.name}>
          {f.url ? (
            <a
              href={f.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex min-h-[48px] items-center justify-between gap-3 rounded-lg border border-border p-3 transition-colors hover:bg-accent/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="flex min-w-0 items-center gap-2">
                <Download className="h-4 w-4 shrink-0 text-primary" />
                <span className="truncate text-sm font-medium text-foreground">{f.name}</span>
              </span>
              <span className="shrink-0 text-xs text-muted-foreground">
                {labelFileType(f.type)}
              </span>
            </a>
          ) : (
            <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              <FileWarning className="mt-0.5 h-4 w-4 shrink-0" />
              <p className="min-w-0">
                <span className="block truncate font-medium">{f.name}</span>
                Fichier indisponible,{' '}
                {reference ? (
                  <>
                    <a
                      href={supportWhatsappUrl(reference, title)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline underline-offset-2"
                    >
                      contactez-nous
                    </a>{' '}
                    avec la référence <span className="font-mono">{reference}</span>.
                  </>
                ) : (
                  <>contactez-nous : {SUPPORT_CONTACT.email}.</>
                )}
              </p>
            </div>
          )}
        </li>
      ))}
      <li className="text-xs text-muted-foreground">
        Liens valables 1 h. Revenez sur cette page pour en obtenir de nouveaux.
      </li>
    </ul>
  )
}
