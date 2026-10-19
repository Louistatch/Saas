import { AlertCircle } from 'lucide-react'

/**
 * Message d'erreur sous un champ de formulaire d'un compte d'exploitation
 * (formulaire admin et fenêtre « Nouvelle fiche » de la faîtière). L'`id` sert
 * d'`aria-describedby` au champ.
 */
export function FieldError({ id, text }: { id: string; text?: string | null }) {
  if (!text) return null
  return (
    <p id={id} className="flex items-start gap-1 text-xs font-medium text-destructive">
      <AlertCircle className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span>{text}</span>
    </p>
  )
}
