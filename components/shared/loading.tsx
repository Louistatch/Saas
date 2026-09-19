import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-md bg-muted', className)} />
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn('h-5 w-5 animate-spin text-primary', className)} />
}

export function LoadingBlock({
  message,
  className,
}: {
  message?: string
  className?: string
}) {
  return (
    <div
      className={cn('flex flex-col items-center justify-center gap-3 py-12', className)}
      // biome-ignore lint/a11y/useSemanticElements: <output> désignerait un résultat de calcul lié à un formulaire — ce conteneur annonce un état de chargement générique, exactement le cas d'usage documenté de role="status" sur un <div>
      role="status"
      aria-live="polite"
    >
      <Spinner className="h-8 w-8" />
      {message ? <p className="text-muted-foreground text-sm">{message}</p> : null}
    </div>
  )
}
