'use client'

import { Button } from '@/components/ui/button'
import {
  KEEP_LINK_TEXT,
  purchasePath,
  purchaseUrl,
  whatsappShareUrl,
} from '@/lib/fiches/payment-tracking'
import { Check, Copy, MessageCircle } from 'lucide-react'
import { useEffect, useState } from 'react'

interface KeepLinkProps {
  purchaseId: string
  title: string
  /** Remplace la phrase d'en-tête (ex. suivi arrêté). */
  lead?: string
}

/**
 * « Gardez ce lien » : la page de l'achat est le seul moyen, sans compte, de
 * retélécharger un compte d'exploitation sur un autre appareil. Copier le lien
 * ou se l'envoyer sur WhatsApp, en un geste.
 */
export function KeepLink({ purchaseId, title, lead }: KeepLinkProps) {
  const [origin, setOrigin] = useState('')
  const [copied, setCopied] = useState<'ok' | 'failed' | null>(null)
  useEffect(() => setOrigin(window.location.origin), [])

  const path = purchasePath(purchaseId)
  const url = origin ? purchaseUrl(origin, purchaseId) : path

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url)
      setCopied('ok')
    } catch {
      setCopied('failed')
    }
    setTimeout(() => setCopied(null), 4000)
  }

  return (
    <div className="space-y-2.5 rounded-lg border border-border bg-muted/40 p-3">
      <p className="text-sm font-medium text-foreground">{lead ?? KEEP_LINK_TEXT}</p>
      <a href={path} className="block break-all text-xs text-primary underline underline-offset-2">
        {url}
      </a>
      <div className="flex flex-wrap gap-2 [&>*]:flex-auto">
        <Button type="button" variant="outline" size="sm" className="gap-2" onClick={copy}>
          {copied === 'ok' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          {copied === 'ok' ? 'Lien copié' : 'Copier le lien'}
        </Button>
        <Button asChild variant="outline" size="sm" className="gap-2">
          <a href={whatsappShareUrl(title, url)} target="_blank" rel="noopener noreferrer">
            <MessageCircle className="h-4 w-4" /> Partager sur WhatsApp
          </a>
        </Button>
      </div>
      {copied === 'failed' ? (
        <output className="block text-xs text-muted-foreground">
          Copie impossible sur ce navigateur : appuyez longuement sur le lien pour le copier.
        </output>
      ) : null}
    </div>
  )
}
