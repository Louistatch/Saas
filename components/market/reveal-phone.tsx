'use client'

/**
 * « Afficher le numéro » : le numéro n'est pas dans la liste des annonces, il se demande ici,
 * une annonce à la fois. Une fois affiché : appeler ou écrire sur WhatsApp.
 */
import { Button } from '@/components/ui/button'
import { revealPhone } from '@/lib/market/client'
import { formatPhone, whatsappLink } from '@/lib/market/work'
import { MessageCircle, Phone } from 'lucide-react'
import { useState } from 'react'

export function RevealPhone({
  announcementId,
  title,
  size = 'default',
}: {
  announcementId: string
  /** Titre de l'annonce, pour le premier message WhatsApp. */
  title: string
  size?: 'default' | 'sm'
}) {
  const [phone, setPhone] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const reveal = async () => {
    setLoading(true)
    setError(null)
    const result = await revealPhone(announcementId)
    setLoading(false)
    if ('phone' in result) setPhone(result.phone)
    else setError(result.error)
  }

  const height = size === 'sm' ? 'h-10' : 'h-11'

  if (!phone) {
    return (
      <div className="space-y-1">
        <Button
          type="button"
          variant="outline"
          className={`hover:bg-muted hover:text-foreground ${height} w-full gap-2`}
          onClick={reveal}
          disabled={loading}
        >
          <Phone aria-hidden="true" className="h-4 w-4" />
          {loading ? 'Un instant…' : 'Afficher le numéro'}
        </Button>
        {error && (
          <p role="alert" className="text-xs text-destructive">
            {error}
          </p>
        )}
      </div>
    )
  }

  return (
    <div className="grid grid-cols-2 gap-2">
      <Button
        asChild
        variant="outline"
        className={`hover:bg-muted hover:text-foreground ${height} gap-2`}
      >
        <a href={`tel:${phone.replace(/[^\d+]/g, '')}`}>
          <Phone aria-hidden="true" className="h-4 w-4" />
          <span className="tabular-nums">{formatPhone(phone)}</span>
        </a>
      </Button>
      <Button
        asChild
        variant="outline"
        className={`hover:bg-muted hover:text-foreground ${height} gap-2`}
      >
        <a
          href={whatsappLink(
            phone,
            `Bonjour, je vous contacte pour « ${title} » vu sur FaîtiereHub.`,
          )}
          target="_blank"
          rel="noopener noreferrer"
        >
          <MessageCircle aria-hidden="true" className="h-4 w-4" />
          WhatsApp
        </a>
      </Button>
    </div>
  )
}
